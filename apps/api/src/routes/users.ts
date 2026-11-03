import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { createAuditLogger } from '../services/audit-logger.js';
import { createAuthService } from '../services/auth.js';
import { randomBytes } from 'crypto';
import { inviteAndEmail } from '../services/invites.js';
import { getSsoSettings, isSsoReady } from '../services/sso.js';
import { getMailSettings, isMailConfigured } from '../services/mail.js';

const USER_ROLES = ['SUPER_ADMIN', 'ADMIN', 'SECURITY_ADMIN', 'SECURITY_ANALYST', 'COMPLIANCE_OFFICER', 'MANAGER', 'USER', 'VIEWER'] as const;
type AppUserRole = (typeof USER_ROLES)[number];

const CreateUserSchema = z.object({
  email: z.string().email().max(255),
  fullName: z.string().trim().min(2).max(255),
  // How the person signs in:
  //   PASSWORD  - admin sets a password now and hands it over
  //   INVITE    - emailed one-time link to choose a password
  //   MICROSOFT - their Microsoft 365 account (no password on this server)
  authType: z.enum(['PASSWORD', 'INVITE', 'MICROSOFT']).default('INVITE'),
  password: z.string().min(10).max(128).regex(/[A-Za-z]/, 'Needs a letter').regex(/\d/, 'Needs a digit').optional(),
  // Either a UserRole enum value or the id of a Role (what the Users page dropdown sends)
  role: z.string().min(1),
  department: z.string().trim().max(255).optional().nullable(),
});

const UpdateUserSchema = z.object({
  fullName: z.string().min(1).max(255).optional(),
  department: z.string().max(255).optional().nullable(),
  status: z.enum(['ACTIVE', 'INACTIVE', 'PENDING', 'SUSPENDED']).optional(),
  role: z.enum(['SUPER_ADMIN', 'ADMIN', 'SECURITY_ADMIN', 'SECURITY_ANALYST', 'COMPLIANCE_OFFICER', 'MANAGER', 'USER', 'VIEWER']).optional(),
});

// Only a super admin may see the raw link, and only when the email could not be sent
// (otherwise an admin could activate someone else's account themselves)
function inviteResult(invite: Awaited<ReturnType<typeof inviteAndEmail>>, actorRole: string) {
  return {
    emailed: invite.sent,
    expiresAt: invite.expiresAt,
    ...(invite.sent ? {} : { error: invite.error, url: actorRole === 'SUPER_ADMIN' ? invite.url : undefined }),
  };
}

export async function userRoutes(app: FastifyInstance) {
  const auditLogger = createAuditLogger(app);
  const authService = createAuthService(app);

  // List users (admin only)
  app.get('/', {
    schema: {
      querystring: z.object({
        page: z.coerce.number().int().positive().default(1),
        limit: z.coerce.number().int().positive().max(100).default(20),
        search: z.string().optional(),
        status: z.string().optional(),
        role: z.string().optional(),
      }),
    },
    preHandler: [app.authenticate, app.requireRole(['SUPER_ADMIN', 'ADMIN'])],
  }, async (request, reply) => {
    const userRole = request.user!.role;
    const { page, limit, search, status, role } = request.query as any;

    if (userRole !== 'SUPER_ADMIN' && userRole !== 'ADMIN') {
      return reply.code(403).send({ success: false, error: { code: 'FORBIDDEN', message: 'Super admin access required' } });
    }

    const where: any = {};
    if (search) {
      where.OR = [
        { email: { contains: search, mode: 'insensitive' } },
        { fullName: { contains: search, mode: 'insensitive' } },
      ];
    }
    if (status) where.status = status;
    if (role) where.role = role;

    const [users, total] = await Promise.all([
      app.prisma.profile.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
        select: {
          id: true,
          email: true,
          fullName: true,
          department: { select: { name: true } },
          role: true,
          status: true,
          createdAt: true,
          updatedAt: true,
          lastActivityAt: true,
          _count: { select: { projectMembers: true, ktReports: true, documents: true } },
        },
      }),
      app.prisma.profile.count({ where }),
    ]);

    return reply.send({ success: true, data: { items: users.map((u) => ({ ...u, department: u.department?.name ?? null })), total, page, limit, totalPages: Math.ceil(total / limit) } });
  });

  // Get user profile
  // Create user (admin only)
  app.post('/', {
    schema: { body: CreateUserSchema },
    preHandler: [app.authenticate, app.requireRole(['SUPER_ADMIN', 'ADMIN'])],
  }, async (request, reply) => {
    const actorId = request.userId!;
    const actorRole = request.user!.role;
    const data = request.body as z.infer<typeof CreateUserSchema>;

    // Resolve `role`: enum value, or a Role row whose name maps onto the enum
    let roleRow: { id: string; name: string } | null = null;
    let role: AppUserRole | undefined = USER_ROLES.find((r) => r === data.role);
    if (!role) {
      roleRow = await app.prisma.role.findUnique({ where: { id: data.role }, select: { id: true, name: true } }).catch(() => null);
      if (!roleRow) {
        return reply.code(400).send({ success: false, error: { code: 'INVALID_ROLE', message: 'Unknown role' } });
      }
      const normalized = roleRow.name.trim().toUpperCase().replace(/\s+/g, '_');
      role = USER_ROLES.find((r) => r === normalized) ?? 'USER';
    }

    // Only a super admin can mint admins
    if ((role === 'SUPER_ADMIN' || role === 'ADMIN') && actorRole !== 'SUPER_ADMIN') {
      return reply.code(403).send({ success: false, error: { code: 'FORBIDDEN', message: 'Only a super admin can create admin accounts' } });
    }

    if (data.authType === 'PASSWORD' && !data.password) {
      return reply.code(400).send({ success: false, error: { code: 'VALIDATION_ERROR', message: 'Enter a password (10+ characters, with a letter and a number)' } });
    }
    if (data.authType === 'MICROSOFT' && !isSsoReady(await getSsoSettings(app.prisma))) {
      return reply.code(400).send({ success: false, error: { code: 'SSO_NOT_ENABLED', message: 'Microsoft sign-in is not enabled. A super admin can set it up under Microsoft Sign-in.' } });
    }

    const email = data.email.toLowerCase();
    if (await app.prisma.profile.findUnique({ where: { email }, select: { id: true } })) {
      return reply.code(409).send({ success: false, error: { code: 'CONFLICT', message: 'A user with this email already exists' } });
    }

    // No password yet: the user chooses one via the emailed activation link
    const passwordHash = await authService.hashPassword(data.authType === 'PASSWORD' ? data.password! : randomBytes(32).toString('hex'));
    const departmentId = data.department
      ? (await app.prisma.department.upsert({ where: { name: data.department }, update: {}, create: { name: data.department } })).id
      : null;

    const user = await app.prisma.profile.create({
      data: {
        email,
        passwordHash,
        fullName: data.fullName,
        departmentId,
        role,
        status: data.authType === 'INVITE' ? 'PENDING' : 'ACTIVE',
        authProvider: data.authType === 'MICROSOFT' ? 'MICROSOFT' : 'LOCAL',
        ...(roleRow ? { userRoles: { create: { roleId: roleRow.id, assignedBy: actorId } } } : {}),
      },
      select: { id: true, email: true, fullName: true, role: true, status: true, createdAt: true, department: { select: { name: true } } },
    });

    await auditLogger.logResource('CREATE', actorId, 'user', user.id, { email, role, authType: data.authType }, request.ip, request.headers['user-agent']);

    const invite = data.authType === 'INVITE' ? inviteResult(await inviteAndEmail(app.prisma, user), actorRole) : undefined;
    return reply.code(201).send({
      success: true,
      data: { ...user, department: user.department?.name ?? null, invite },
    });
  });

  // Which sign-in methods the "Add User" form can offer right now
  app.get('/sign-in-options', {
    preHandler: [app.authenticate, app.requireRole(['SUPER_ADMIN', 'ADMIN'])],
  }, async (_request, reply) => {
    const [mail, sso] = await Promise.all([getMailSettings(app.prisma), getSsoSettings(app.prisma)]);
    return reply.send({ success: true, data: { password: true, invite: isMailConfigured(mail), microsoft: isSsoReady(sso) } });
  });

  // Admin sets a new password for a local account (no email needed). Admins cannot touch admin accounts.
  app.post('/:userId/set-password', {
    schema: { body: z.object({ password: z.string().min(10).max(128).regex(/[A-Za-z]/, 'Needs a letter').regex(/\d/, 'Needs a digit') }) },
    preHandler: [app.authenticate, app.requireRole(['SUPER_ADMIN', 'ADMIN'])],
  }, async (request, reply) => {
    const { userId } = request.params as { userId: string };
    const { password } = request.body as { password: string };
    const target = await app.prisma.profile.findUnique({ where: { id: userId } });
    if (!target) return reply.code(404).send({ success: false, error: { code: 'NOT_FOUND', message: 'User not found' } });
    if (target.authProvider !== 'LOCAL') {
      return reply.code(400).send({ success: false, error: { code: 'NOT_LOCAL', message: 'This account signs in with Microsoft and has no password here' } });
    }
    if (['SUPER_ADMIN', 'ADMIN'].includes(target.role) && request.user!.role !== 'SUPER_ADMIN') {
      return reply.code(403).send({ success: false, error: { code: 'FORBIDDEN', message: 'Only a super admin can change an admin password' } });
    }
    await app.prisma.$transaction([
      app.prisma.profile.update({
        where: { id: userId },
        data: { passwordHash: await authService.hashPassword(password), ...(target.status === 'PENDING' ? { status: 'ACTIVE' } : {}) },
      }),
      app.prisma.inviteToken.deleteMany({ where: { userId } }),
    ]);
    await auditLogger.logResource('UPDATE', request.userId!, 'user', userId, { action: 'set_password' }, request.ip, request.headers['user-agent']);
    return reply.send({ success: true, data: null });
  });

  // Resend the activation link (pending accounts only)
  app.post('/:userId/resend-invite', {
    preHandler: [app.authenticate, app.requireRole(['SUPER_ADMIN', 'ADMIN'])],
  }, async (request, reply) => {
    const { userId } = request.params as { userId: string };
    const user = await app.prisma.profile.findUnique({ where: { id: userId } });
    if (!user) return reply.code(404).send({ success: false, error: { code: 'NOT_FOUND', message: 'User not found' } });
    if (user.status !== 'PENDING') {
      return reply.code(400).send({ success: false, error: { code: 'NOT_PENDING', message: 'This account is already activated' } });
    }
    const invite = await inviteAndEmail(app.prisma, user);
    await auditLogger.logResource('UPDATE', request.userId!, 'user', userId, { action: 'resend_invite', emailed: invite.sent }, request.ip, request.headers['user-agent']);
    return reply.send({ success: true, data: inviteResult(invite, request.user!.role) });
  });

  // Lost phone: clear the authenticator so the admin enrolls again on next login
  app.post('/:userId/reset-mfa', {
    preHandler: [app.authenticate, app.requireRole(['SUPER_ADMIN'])],
  }, async (request, reply) => {
    const { userId } = request.params as { userId: string };
    const user = await app.prisma.profile.findUnique({ where: { id: userId }, select: { id: true } });
    if (!user) return reply.code(404).send({ success: false, error: { code: 'NOT_FOUND', message: 'User not found' } });
    await app.prisma.profile.update({ where: { id: userId }, data: { totpEnabled: false, totpSecretEnc: null, recoveryCodeHashes: [] } });
    await auditLogger.logResource('UPDATE', request.userId!, 'user', userId, { action: 'reset_mfa' }, request.ip, request.headers['user-agent']);
    return reply.send({ success: true, data: null });
  });

  app.get('/:userId', async (request, reply) => {
    const userId = request.userId!;
    const userRole = request.user!.role;
    const { userId: targetId } = request.params as { userId: string };

    // Users can view their own profile, admins can view any
    if (userRole !== 'SUPER_ADMIN' && userRole !== 'ADMIN' && userId !== targetId) {
      return reply.code(403).send({ success: false, error: { code: 'FORBIDDEN', message: 'Access denied' } });
    }

    const user = await app.prisma.profile.findUnique({
      where: { id: targetId },
      select: {
        id: true,
        email: true,
        fullName: true,
        department: { select: { name: true } },
        authProvider: true,
        totpEnabled: true,
        role: true,
        status: true,
        createdAt: true,
        updatedAt: true,
        lastActivityAt: true,
        userRoles: { select: { role: { select: { name: true, permissions: { select: { name: true } } } } } },
        projectMembers: { select: { projectId: true, role: true, project: { select: { name: true } } } },
      },
    });

    if (!user) {
      return reply.code(404).send({ success: false, error: { code: 'NOT_FOUND', message: 'User not found' } });
    }

    return reply.send({ success: true, data: { ...user, department: user.department?.name ?? null } });
  });

  // Update user (admin only)
  app.patch('/:userId', {
    schema: { body: UpdateUserSchema },
    preHandler: [app.authenticate, app.requireRole(['SUPER_ADMIN', 'ADMIN'])],
  }, async (request, reply) => {
    const userId = request.userId!;
    const userRole = request.user!.role;
    const { userId: targetId } = request.params as { userId: string };
    const data = request.body as z.infer<typeof UpdateUserSchema>;

    const target = await app.prisma.profile.findUnique({ where: { id: targetId }, select: { id: true, role: true, status: true } });
    if (!target) {
      return reply.code(404).send({ success: false, error: { code: 'NOT_FOUND', message: 'User not found' } });
    }

    const PRIVILEGED = ['SUPER_ADMIN', 'ADMIN'];
    if (userRole !== 'SUPER_ADMIN') {
      if (userId === targetId && (data.role || data.status)) {
        return reply.code(403).send({ success: false, error: { code: 'FORBIDDEN', message: 'Cannot modify own role/status' } });
      }
      // an admin must not be able to touch, or create, accounts as powerful as their own
      if (PRIVILEGED.includes(target.role)) {
        return reply.code(403).send({ success: false, error: { code: 'FORBIDDEN', message: 'Only a super admin can change an admin account' } });
      }
      if (data.role && PRIVILEGED.includes(data.role)) {
        return reply.code(403).send({ success: false, error: { code: 'FORBIDDEN', message: 'Only a super admin can grant admin roles' } });
      }
    }

    // never lock everyone out: the last active super admin cannot be demoted or deactivated
    const losingSuperAdmin =
      target.role === 'SUPER_ADMIN' &&
      ((data.role && data.role !== 'SUPER_ADMIN') || (data.status && data.status !== 'ACTIVE'));
    if (losingSuperAdmin) {
      const others = await app.prisma.profile.count({ where: { role: 'SUPER_ADMIN', status: 'ACTIVE', id: { not: targetId } } });
      if (others === 0) {
        return reply.code(400).send({ success: false, error: { code: 'LAST_SUPER_ADMIN', message: 'There must be at least one active super admin' } });
      }
    }

    const user = await authService.updateProfile(targetId, { fullName: data.fullName, department: data.department });

    if (data.status || data.role) {
      await app.prisma.profile.update({
        where: { id: targetId },
        data: { status: data.status, role: data.role },
      });
    }

    await auditLogger.logResource('UPDATE', userId, 'user', targetId, data, request.ip, request.headers['user-agent']);

    return reply.send({ success: true, data: user });
  });

  // Get user's assigned projects
  app.get('/:userId/projects', async (request, reply) => {
    const userId = request.userId!;
    const userRole = request.user!.role;
    const { userId: targetId } = request.params as { userId: string };

    if (userRole !== 'SUPER_ADMIN' && userRole !== 'ADMIN' && userId !== targetId) {
      return reply.code(403).send({ success: false, error: { code: 'FORBIDDEN', message: 'Access denied' } });
    }

    const memberships = await app.prisma.projectMember.findMany({
      where: { userId: targetId },
      select: {
        projectId: true,
        role: true,
        assignedAt: true,
        project: { select: { id: true, name: true, status: true, priority: true, progress: true } },
      },
    });

    return reply.send({ success: true, data: memberships });
  });

  // Search users for assignment (admin only)
  app.get('/search', {
    schema: {
      querystring: z.object({
        q: z.string().optional(),
        role: z.string().optional(),
        department: z.string().optional(),
        status: z.string().optional(),
        limit: z.coerce.number().int().positive().max(100).default(50),
        excludeProjectId: z.string().uuid().optional(),
      }),
    },
    preHandler: [app.authenticate, app.requireRole(['SUPER_ADMIN', 'ADMIN'])],
  }, async (request, reply) => {
    const { q, role, department, status, limit, excludeProjectId } = request.query as any;

    const where: any = {};
    if (q) {
      where.OR = [
        { email: { contains: q, mode: 'insensitive' } },
        { fullName: { contains: q, mode: 'insensitive' } },
      ];
    }
    if (role) where.role = role;
    if (department) where.department = { contains: department, mode: 'insensitive' };
    if (status) where.status = status;
    if (excludeProjectId) {
      where.NOT = {
        projectMembers: { some: { projectId: excludeProjectId } },
      };
    }

    const users = await app.prisma.profile.findMany({
      where,
      orderBy: { fullName: 'asc' },
      take: limit,
      select: {
        id: true,
        email: true,
        fullName: true,
        department: true,
        role: true,
        status: true,
        createdAt: true,
        projectMembers: { select: { projectId: true, role: true } },
      },
    });

    return reply.send({ success: true, data: users });
  });
}