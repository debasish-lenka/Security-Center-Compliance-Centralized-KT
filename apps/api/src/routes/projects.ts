import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { createAuditLogger } from '../services/audit-logger.js';
import { getStorageService } from '../services/storage.js';

const CreateProjectSchema = z.object({
  name: z.string().min(1).max(255),
  description: z.string().optional().nullable(),
  category: z.string().max(100).optional().nullable(),
  ownerId: z.string().uuid(),
  managerId: z.string().uuid().optional().nullable(), // the project shows on this person's dashboard too
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable(),
  expectedCompletionDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable(),
  priority: z.enum(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']).default('MEDIUM'),
  memberIds: z.array(z.string().uuid()).default([]),
});

const UpdateProjectSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  description: z.string().optional().nullable(),
  category: z.string().max(100).optional().nullable(),
  ownerId: z.string().uuid().optional(),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable(),
  expectedCompletionDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable(),
  actualCompletionDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable(),
  priority: z.enum(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']).optional(),
  status: z.enum(['NOT_STARTED', 'ONGOING', 'ON_HOLD', 'COMPLETED', 'OVERDUE', 'AT_RISK']).optional(),
  progress: z.number().int().min(0).max(100).optional(),
});

const AddMemberSchema = z.object({
  userId: z.string().uuid(),
  role: z.enum(['OWNER', 'LEAD', 'CONTRIBUTOR', 'REVIEWER', 'VIEWER']).default('VIEWER'),
});

export async function projectRoutes(app: FastifyInstance) {
  const auditLogger = createAuditLogger(app);

  // Helper to check project access
  async function checkProjectAccess(userId: string, userRole: string, projectId: string, requiredPermission?: string) {
    if (userRole === 'SUPER_ADMIN' || userRole === 'ADMIN') return true;

    const membership = await app.prisma.projectMember.findUnique({
      where: { projectId_userId: { projectId, userId } },
    });

    if (!membership) return false;

    if (requiredPermission === 'edit' && !['OWNER', 'LEAD'].includes(membership.role)) {
      return false;
    }

    return true;
  }

  // List projects
  app.get('/', {
    schema: {
      querystring: z.object({
        page: z.coerce.number().int().positive().default(1),
        limit: z.coerce.number().int().positive().max(100).default(20),
        search: z.string().optional(),
        status: z.string().optional(),
        priority: z.string().optional(),
        ownerId: z.string().uuid().optional(),
        memberId: z.string().uuid().optional(),
        sortBy: z.string().optional(),
        sortOrder: z.enum(['asc', 'desc']).default('desc'),
      }),
    },
  }, async (request, reply) => {
    const userId = request.userId!;
    const userRole = request.user!.role;
    const { page, limit, search, status, priority, ownerId, memberId, sortBy, sortOrder } = request.query as any;

    const where: any = {};
    if (userRole !== 'SUPER_ADMIN' && userRole !== 'ADMIN') {
      where.members = { some: { userId } };
    }
    if (search) {
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { description: { contains: search, mode: 'insensitive' } },
      ];
    }
    if (status) where.status = status;
    if (priority) where.priority = priority;
    if (ownerId) where.ownerId = ownerId;
    if (memberId) where.members = { some: { userId: memberId } };

    const [projects, total] = await Promise.all([
      app.prisma.project.findMany({
        where,
        orderBy: sortBy ? { [sortBy]: sortOrder } : { updatedAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
        select: {
          id: true,
          name: true,
          description: true,
          category: true,
          priority: true,
          status: true,
          progress: true,
          startDate: true,
          expectedCompletionDate: true,
          actualCompletionDate: true,
          createdAt: true,
          updatedAt: true,
          creator: { select: { id: true, fullName: true } },
          owner: { select: { id: true, fullName: true } },
          members: {
            select: { userId: true, role: true, user: { select: { fullName: true, email: true } } },
          },
          _count: { select: { tasks: true, documents: true, ktReports: true } },
        },
      }),
      app.prisma.project.count({ where }),
    ]);

    const projectsWithMembers = projects.map(p => ({
      ...p,
      assignedMembers: p.members.map(m => ({
        userId: m.userId,
        role: m.role,
        fullName: m.user.fullName,
        email: m.user.email,
      })),
      memberCount: p.members.length,
      taskCount: p._count.tasks,
      documentCount: p._count.documents,
      ktReportCount: p._count.ktReports,
    }));

    return reply.send({
      success: true,
      data: {
        items: projectsWithMembers,
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    });
  });

  // Get single project
  app.get('/:projectId', async (request, reply) => {
    const userId = request.userId!;
    const userRole = request.user!.role;
    const { projectId } = request.params as { projectId: string };

    const hasAccess = await checkProjectAccess(userId, userRole, projectId);
    if (!hasAccess) {
      return reply.code(403).send({
        success: false,
        error: { code: 'FORBIDDEN', message: 'Access denied to this project' },
      });
    }

    const project = await app.prisma.project.findUnique({
      where: { id: projectId },
      select: {
        id: true,
        name: true,
        description: true,
        category: true,
        priority: true,
        status: true,
        progress: true,
        startDate: true,
        expectedCompletionDate: true,
        actualCompletionDate: true,
        createdAt: true,
        updatedAt: true,
        creator: { select: { id: true, fullName: true, email: true } },
        owner: { select: { id: true, fullName: true, email: true } },
        members: {
          select: {
            userId: true,
            role: true,
            assignedAt: true,
            user: { select: { fullName: true, email: true, department: true, status: true } }
          },
        },
        _count: { select: { tasks: true, milestones: true, documents: true, ktReports: true } },
      },
    });

    if (!project) {
      return reply.code(404).send({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Project not found' },
      });
    }

    return reply.send({ success: true, data: project });
  });

  // Create project
  app.post('/', {
    schema: { body: CreateProjectSchema },
  }, async (request, reply) => {
    const userId = request.userId!;
    const userRole = request.user!.role;
    const data = request.body as z.infer<typeof CreateProjectSchema>;

    // Anyone may start a project; viewers are read-only accounts and may not
    if (userRole === 'VIEWER') {
      return reply.code(403).send({
        success: false,
        error: { code: 'FORBIDDEN', message: 'Read-only accounts cannot create projects' },
      });
    }

    // Verify owner exists
    const owner = await app.prisma.profile.findUnique({ where: { id: data.ownerId } });
    if (!owner) {
      return reply.code(400).send({
        success: false,
        error: { code: 'INVALID_OWNER', message: 'Owner not found' },
      });
    }

    // Verify members (and the manager) exist
    const wanted = [...new Set([...data.memberIds, ...(data.managerId ? [data.managerId] : [])])];
    if (wanted.length > 0) {
      const members = await app.prisma.profile.findMany({
        where: { id: { in: wanted } },
      });
      if (members.length !== wanted.length) {
        return reply.code(400).send({
          success: false,
          error: { code: 'INVALID_MEMBERS', message: 'One or more members not found' },
        });
      }
    }

    // Create project with members in transaction
    const project = await app.prisma.$transaction(async (tx) => {
      const newProject = await tx.project.create({
        data: {
          name: data.name,
          description: data.description,
          category: data.category,
          createdById: userId,
          ownerId: data.ownerId,
          startDate: data.startDate ? new Date(data.startDate) : null,
          expectedCompletionDate: data.expectedCompletionDate ? new Date(data.expectedCompletionDate) : null,
          priority: data.priority,
          status: 'NOT_STARTED',
        },
      });

      // One membership per person; the strongest role wins: owner (the project lead) > manager / creator > contributor
      const roles = new Map<string, 'OWNER' | 'LEAD' | 'CONTRIBUTOR'>();
      for (const id of data.memberIds) roles.set(id, 'CONTRIBUTOR');
      // the creator stays on the project as lead when someone else is named owner
      if (userId !== data.ownerId) roles.set(userId, 'LEAD');
      if (data.managerId) roles.set(data.managerId, 'LEAD');
      roles.set(data.ownerId, 'OWNER');
      for (const [memberId, role] of roles) {
        await tx.projectMember.create({ data: { projectId: newProject.id, userId: memberId, role, assignedBy: userId } });
      }

      return newProject;
    });

    await auditLogger.logResource('CREATE', userId, 'project', project.id, { name: data.name }, request.ip, request.headers['user-agent']);

    // Notify assigned members
    const notificationService = (await import('../services/notifications.js')).createNotificationService(app);
    const allMemberIds = [...new Set([data.ownerId, ...(data.managerId ? [data.managerId] : []), ...data.memberIds])];
    for (const memberId of allMemberIds) {
      if (memberId !== userId) {
        await notificationService.notifyProjectAssigned(memberId, project.id, data.name);
      }
    }

    return reply.code(201).send({ success: true, data: project });
  });

  // Update project
  app.patch('/:projectId', {
    schema: { body: UpdateProjectSchema },
  }, async (request, reply) => {
    const userId = request.userId!;
    const userRole = request.user!.role;
    const { projectId } = request.params as { projectId: string };
    const data = request.body as z.infer<typeof UpdateProjectSchema>;

    const hasAccess = await checkProjectAccess(userId, userRole, projectId, 'edit');
    if (!hasAccess) {
      return reply.code(403).send({
        success: false,
        error: { code: 'FORBIDDEN', message: 'Insufficient permissions to edit this project' },
      });
    }

    // Prisma wants Date objects, not "YYYY-MM-DD" strings
    const { startDate, expectedCompletionDate, actualCompletionDate, ...rest } = data;
    const toDate = (v: string | null | undefined) => (v === undefined ? undefined : v === null ? null : new Date(v));
    const project = await app.prisma.project.update({
      where: { id: projectId },
      data: {
        ...rest,
        startDate: toDate(startDate),
        expectedCompletionDate: toDate(expectedCompletionDate),
        actualCompletionDate: toDate(actualCompletionDate),
      },
    });

    await auditLogger.logResource('UPDATE', userId, 'project', projectId, data, request.ip, request.headers['user-agent']);

    return reply.send({ success: true, data: project });
  });

  // Delete project
  app.delete('/:projectId', async (request, reply) => {
    const userId = request.userId!;
    const userRole = request.user!.role;
    const { projectId } = request.params as { projectId: string };

    if (userRole !== 'SUPER_ADMIN') {
      return reply.code(403).send({
        success: false,
        error: { code: 'FORBIDDEN', message: 'Only super admins can delete projects' },
      });
    }

    await app.prisma.project.delete({ where: { id: projectId } });

    await auditLogger.logResource('DELETE', userId, 'project', projectId, {}, request.ip, request.headers['user-agent']);

    return reply.send({ success: true, data: null });
  });

  // Project members
  app.get('/:projectId/members', async (request, reply) => {
    const userId = request.userId!;
    const userRole = request.user!.role;
    const { projectId } = request.params as { projectId: string };

    const hasAccess = await checkProjectAccess(userId, userRole, projectId);
    if (!hasAccess) {
      return reply.code(403).send({
        success: false,
        error: { code: 'FORBIDDEN', message: 'Access denied' },
      });
    }

    const members = await app.prisma.projectMember.findMany({
      where: { projectId },
      select: {
        id: true,
        userId: true,
        role: true,
        assignedAt: true,
        assignedBy: true,
        user: { select: { id: true, fullName: true, email: true, department: true, status: true, role: true } },
        assigner: { select: { fullName: true } },
      },
    });

    return reply.send({ success: true, data: members.map((m) => ({ ...m, user: { ...m.user, department: (m.user.department as any)?.name ?? null } })) });
  });

  app.post('/:projectId/members', {
    schema: { body: AddMemberSchema },
  }, async (request, reply) => {
    const userId = request.userId!;
    const userRole = request.user!.role;
    const { projectId } = request.params as { projectId: string };
    const { userId: newMemberId, role } = request.body as z.infer<typeof AddMemberSchema>;

    const hasAccess = await checkProjectAccess(userId, userRole, projectId, 'edit');
    if (!hasAccess) {
      return reply.code(403).send({
        success: false,
        error: { code: 'FORBIDDEN', message: 'Insufficient permissions to add members' },
      });
    }

    // Check if user exists
    const newMember = await app.prisma.profile.findUnique({ where: { id: newMemberId } });
    if (!newMember) {
      return reply.code(400).send({
        success: false,
        error: { code: 'USER_NOT_FOUND', message: 'User not found' },
      });
    }

    // Check if already a member
    const existing = await app.prisma.projectMember.findUnique({
      where: { projectId_userId: { projectId, userId: newMemberId } },
    });
    if (existing) {
      return reply.code(409).send({
        success: false,
        error: { code: 'ALREADY_MEMBER', message: 'User is already a member of this project' },
      });
    }

    const member = await app.prisma.projectMember.create({
      data: {
        projectId,
        userId: newMemberId,
        role,
        assignedBy: userId,
      },
    });

    await auditLogger.logResource('ASSIGN', userId, 'project_member', member.id, { userId: newMemberId, role }, request.ip, request.headers['user-agent']);

    // Notify new member
    const project = await app.prisma.project.findUnique({ where: { id: projectId } });
    const notificationService = (await import('../services/notifications.js')).createNotificationService(app);
    await notificationService.notifyProjectAssigned(newMemberId, projectId, project!.name);

    return reply.code(201).send({ success: true, data: member });
  });

  const MEMBER_ROLES = ['OWNER', 'LEAD', 'CONTRIBUTOR', 'REVIEWER', 'VIEWER'] as const;

  // A project always keeps at least one Owner
  async function isLastOwner(projectId: string, memberId: string) {
    const owners = await app.prisma.projectMember.findMany({ where: { projectId, role: 'OWNER' }, select: { id: true } });
    return owners.length === 1 && owners[0].id === memberId;
  }

  app.patch('/:projectId/members/:memberId', {
    schema: { body: z.object({ role: z.enum(MEMBER_ROLES) }) },
  }, async (request, reply) => {
    const userId = request.userId!;
    const userRole = request.user!.role;
    const { projectId, memberId } = request.params as { projectId: string; memberId: string };
    const { role } = request.body as { role: (typeof MEMBER_ROLES)[number] };

    const hasAccess = await checkProjectAccess(userId, userRole, projectId, 'edit');
    if (!hasAccess) {
      return reply.code(403).send({ success: false, error: { code: 'FORBIDDEN', message: 'Insufficient permissions' } });
    }

    // the member must belong to THIS project
    const member = await app.prisma.projectMember.findFirst({ where: { id: memberId, projectId } });
    if (!member) {
      return reply.code(404).send({ success: false, error: { code: 'NOT_FOUND', message: 'Member not found in this project' } });
    }
    const myMembership = await app.prisma.projectMember.findUnique({ where: { projectId_userId: { projectId, userId } }, select: { role: true } });
    const isOwnerOrAdmin = userRole === 'SUPER_ADMIN' || userRole === 'ADMIN' || myMembership?.role === 'OWNER';
    if ((role === 'OWNER' || member.role === 'OWNER') && !isOwnerOrAdmin) {
      return reply.code(403).send({ success: false, error: { code: 'FORBIDDEN', message: 'Only an owner can change owners' } });
    }
    if (member.role === 'OWNER' && role !== 'OWNER' && (await isLastOwner(projectId, memberId))) {
      return reply.code(400).send({ success: false, error: { code: 'LAST_OWNER', message: 'The project needs at least one owner. Make someone else an owner first.' } });
    }

    const updated = await app.prisma.projectMember.update({ where: { id: memberId }, data: { role } });
    await auditLogger.logResource('UPDATE', userId, 'project_member', memberId, { role, from: member.role, projectId }, request.ip, request.headers['user-agent']);
    return reply.send({ success: true, data: updated });
  });

  app.delete('/:projectId/members/:memberId', async (request, reply) => {
    const userId = request.userId!;
    const userRole = request.user!.role;
    const { projectId, memberId } = request.params as { projectId: string; memberId: string };

    const hasAccess = await checkProjectAccess(userId, userRole, projectId, 'edit');
    if (!hasAccess) {
      return reply.code(403).send({ success: false, error: { code: 'FORBIDDEN', message: 'Insufficient permissions' } });
    }

    const member = await app.prisma.projectMember.findFirst({ where: { id: memberId, projectId } });
    if (!member) {
      return reply.code(404).send({ success: false, error: { code: 'NOT_FOUND', message: 'Member not found in this project' } });
    }
    if (member.role === 'OWNER') {
      const myMembership = await app.prisma.projectMember.findUnique({ where: { projectId_userId: { projectId, userId } }, select: { role: true } });
      if (!(userRole === 'SUPER_ADMIN' || userRole === 'ADMIN' || myMembership?.role === 'OWNER')) {
        return reply.code(403).send({ success: false, error: { code: 'FORBIDDEN', message: 'Only an owner can remove an owner' } });
      }
      if (await isLastOwner(projectId, memberId)) {
        return reply.code(400).send({ success: false, error: { code: 'LAST_OWNER', message: 'The project needs at least one owner' } });
      }
    }

    await app.prisma.projectMember.delete({ where: { id: memberId } });
    await auditLogger.logResource('UNASSIGN', userId, 'project_member', memberId, { projectId, userId: member.userId, role: member.role }, request.ip, request.headers['user-agent']);
    return reply.send({ success: true, data: null });
  });

  // Bulk assign members to project
  const BulkAssignSchema = z.object({
    assignments: z.array(z.object({
      userId: z.string().uuid(),
      role: z.enum(['OWNER', 'LEAD', 'CONTRIBUTOR', 'REVIEWER', 'VIEWER']),
    })).min(1),
  });

  app.post('/:projectId/members/bulk', {
    schema: { body: BulkAssignSchema },
  }, async (request, reply) => {
    const userId = request.userId!;
    const userRole = request.user!.role;
    const { projectId } = request.params as { projectId: string };
    const { assignments } = request.body as z.infer<typeof BulkAssignSchema>;

    const hasAccess = await checkProjectAccess(userId, userRole, projectId, 'edit');
    if (!hasAccess) {
      return reply.code(403).send({
        success: false,
        error: { code: 'FORBIDDEN', message: 'Insufficient permissions to add members' },
      });
    }

    // Check for conflicts and validate users
    const results: { userId: string; role: (typeof assignments)[number]['role'] }[] = [];
    const conflicts: Record<string, unknown>[] = [];
    const project = await app.prisma.project.findUnique({ where: { id: projectId } });
    const notificationService = (await import('../services/notifications.js')).createNotificationService(app);

    for (const assignment of assignments) {
      const { userId: newMemberId, role } = assignment;

      // Check if user exists
      const newMember = await app.prisma.profile.findUnique({ where: { id: newMemberId } });
      if (!newMember) {
        conflicts.push({ userId: newMemberId, reason: 'USER_NOT_FOUND' });
        continue;
      }

      // Check if already a member
      const existing = await app.prisma.projectMember.findUnique({
        where: { projectId_userId: { projectId, userId: newMemberId } },
      });
      if (existing) {
        conflicts.push({ userId: newMemberId, reason: 'ALREADY_MEMBER', currentRole: existing.role });
        continue;
      }

      // Check for role conflicts (e.g., multiple OWNERs)
      if (role === 'OWNER') {
        const existingOwner = await app.prisma.projectMember.findFirst({
          where: { projectId, role: 'OWNER' },
        });
        if (existingOwner) {
          conflicts.push({ userId: newMemberId, reason: 'OWNER_EXISTS', currentOwnerId: existingOwner.userId });
          continue;
        }
      }

      results.push({ userId: newMemberId, role });
    }

    // Create members in transaction
    const createdMembers = await app.prisma.$transaction(async (tx) => {
      const members = [];
      for (const result of results) {
        const member = await tx.projectMember.create({
          data: {
            projectId,
            userId: result.userId,
            role: result.role,
            assignedBy: userId,
          },
        });
        members.push(member);
      }
      return members;
    });

    // Audit log and notifications
    for (const member of createdMembers) {
      await auditLogger.logResource('ASSIGN', userId, 'project_member', member.id,
        { userId: member.userId, role: member.role }, request.ip, request.headers['user-agent']);

      if (member.userId !== userId) {
        await notificationService.notifyProjectAssigned(member.userId, projectId, project!.name);
      }
    }

    return reply.code(201).send({
      success: true,
      data: { created: createdMembers, conflicts }
    });
  });

  // Get available users for assignment (not already in project)
  app.get('/:projectId/members/available', async (request, reply) => {
    const userId = request.userId!;
    const userRole = request.user!.role;
    const { projectId } = request.params as { projectId: string };

    const hasAccess = await checkProjectAccess(userId, userRole, projectId, 'edit');
    if (!hasAccess) {
      return reply.code(403).send({ success: false, error: { code: 'FORBIDDEN', message: 'Insufficient permissions' } });
    }

    const users = await app.prisma.profile.findMany({
      where: {
        status: 'ACTIVE',
        NOT: {
          projectMembers: { some: { projectId } },
        },
      },
      orderBy: { fullName: 'asc' },
      select: {
        id: true,
        email: true,
        fullName: true,
        department: true,
        role: true,
        status: true,
      },
    });

    return reply.send({ success: true, data: users.map((u) => ({ ...u, department: (u.department as any)?.name ?? null })) });
  });
}