import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { createAuditLogger } from '../services/audit-logger.js';
import { createAuthService } from '../services/auth.js';

const UpdateUserSchema = z.object({
  fullName: z.string().min(1).max(255).optional(),
  department: z.string().max(255).optional().nullable(),
  status: z.enum(['ACTIVE', 'INACTIVE', 'PENDING', 'SUSPENDED']).optional(),
  role: z.enum(['SUPER_ADMIN', 'ADMIN', 'COMPLIANCE_OFFICER', 'MANAGER', 'USER']).optional(),
});

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

    if (userRole !== 'SUPER_ADMIN') {
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
          department: true,
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

    return reply.send({ success: true, data: { items: users, total, page, limit, totalPages: Math.ceil(total / limit) } });
  });

  // Get user profile
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
        department: true,
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

    return reply.send({ success: true, data: user });
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

    if (userRole !== 'SUPER_ADMIN' && userId === targetId) {
      return reply.code(403).send({ success: false, error: { code: 'FORBIDDEN', message: 'Cannot modify own role/status' } });
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