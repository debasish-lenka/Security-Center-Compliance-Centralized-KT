import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { createAuditLogger } from '../services/audit-logger.js';

const CreateTeamSchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().optional().nullable(),
  departmentId: z.string().uuid().optional().nullable(),
  memberIds: z.array(z.string().uuid()).default([]),
});

const UpdateTeamSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  description: z.string().optional().nullable(),
  departmentId: z.string().uuid().optional().nullable(),
});

const AddTeamMemberSchema = z.object({
  userId: z.string().uuid(),
  role: z.enum(['LEAD', 'MEMBER']).default('MEMBER'),
});

const CreateDepartmentSchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().optional().nullable(),
  parentId: z.string().uuid().optional().nullable(),
});

const UpdateDepartmentSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  description: z.string().optional().nullable(),
  parentId: z.string().uuid().optional().nullable(),
});

async function checkAdminAccess(userRole: string) {
  return ['SUPER_ADMIN', 'ADMIN', 'SECURITY_ADMIN'].includes(userRole);
}

export async function teamRoutes(app: FastifyInstance) {
  const auditLogger = createAuditLogger(app);

  // ===================== TEAMS =====================

  // List all teams
  app.get('/teams', {
    schema: {
      querystring: z.object({
        page: z.coerce.number().int().positive().default(1),
        limit: z.coerce.number().int().positive().max(100).default(20),
        search: z.string().optional(),
        departmentId: z.string().uuid().optional(),
      }),
    },
  }, async (request, reply) => {
    const userRole = request.user!.role;
    if (!await checkAdminAccess(userRole)) {
      return reply.code(403).send({ success: false, error: { code: 'FORBIDDEN', message: 'Admin access required' } });
    }

    const { page, limit, search, departmentId } = request.query as any;
    const where: any = {};
    if (search) {
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { description: { contains: search, mode: 'insensitive' } },
      ];
    }
    if (departmentId) where.departmentId = departmentId;

    const [teams, total] = await Promise.all([
      app.prisma.team.findMany({
        where,
        orderBy: { name: 'asc' },
        skip: (page - 1) * limit,
        take: limit,
        include: {
          creator: { select: { id: true, fullName: true, email: true } },
          department: { select: { id: true, name: true } },
          members: {
            include: {
              user: { select: { id: true, fullName: true, email: true, role: true } },
            },
          },
          _count: { select: { members: true } },
        },
      }),
      app.prisma.team.count({ where }),
    ]);

    return reply.send({
      success: true,
      data: { items: teams, total, page, limit, totalPages: Math.ceil(total / limit) },
    });
  });

  // Get single team
  app.get('/teams/:teamId', async (request, reply) => {
    const userRole = request.user!.role;
    if (!await checkAdminAccess(userRole)) {
      return reply.code(403).send({ success: false, error: { code: 'FORBIDDEN', message: 'Admin access required' } });
    }

    const { teamId } = request.params as { teamId: string };
    const team = await app.prisma.team.findUnique({
      where: { id: teamId },
      include: {
        creator: { select: { id: true, fullName: true, email: true } },
        department: { select: { id: true, name: true } },
        members: {
          include: {
            user: { select: { id: true, fullName: true, email: true, role: true, department: true } },
          },
        },
      },
    });

    if (!team) {
      return reply.code(404).send({ success: false, error: { code: 'NOT_FOUND', message: 'Team not found' } });
    }

    return reply.send({ success: true, data: team });
  });

  // Create team
  app.post('/teams', {
    schema: { body: CreateTeamSchema },
  }, async (request, reply) => {
    const userId = request.userId!;
    const userRole = request.user!.role;
    if (!await checkAdminAccess(userRole)) {
      return reply.code(403).send({ success: false, error: { code: 'FORBIDDEN', message: 'Admin access required' } });
    }

    const data = request.body as z.infer<typeof CreateTeamSchema>;

    // Verify department exists if provided
    if (data.departmentId) {
      const dept = await app.prisma.department.findUnique({ where: { id: data.departmentId } });
      if (!dept) {
        return reply.code(400).send({ success: false, error: { code: 'INVALID_DEPARTMENT', message: 'Department not found' } });
      }
    }

    // Verify members exist
    if (data.memberIds.length > 0) {
      const members = await app.prisma.profile.findMany({
        where: { id: { in: data.memberIds } },
      });
      if (members.length !== data.memberIds.length) {
        return reply.code(400).send({ success: false, error: { code: 'INVALID_MEMBERS', message: 'One or more members not found' } });
      }
    }

    const team = await app.prisma.$transaction(async (tx) => {
      const newTeam = await tx.team.create({
        data: {
          name: data.name,
          description: data.description,
          departmentId: data.departmentId,
          createdById: userId,
        },
      });

      // Add members
      for (const memberId of data.memberIds) {
        await tx.teamMember.create({
          data: {
            teamId: newTeam.id,
            userId: memberId,
            role: 'MEMBER',
          },
        });
      }

      return newTeam;
    });

    await auditLogger.logResource('CREATE', userId, 'team', team.id, { name: data.name }, request.ip, request.headers['user-agent']);

    return reply.code(201).send({ success: true, data: team });
  });

  // Update team
  app.patch('/teams/:teamId', {
    schema: { body: UpdateTeamSchema },
  }, async (request, reply) => {
    const userId = request.userId!;
    const userRole = request.user!.role;
    if (!await checkAdminAccess(userRole)) {
      return reply.code(403).send({ success: false, error: { code: 'FORBIDDEN', message: 'Admin access required' } });
    }

    const { teamId } = request.params as { teamId: string };
    const data = request.body as z.infer<typeof UpdateTeamSchema>;

    // Verify department exists if provided
    if (data.departmentId) {
      const dept = await app.prisma.department.findUnique({ where: { id: data.departmentId } });
      if (!dept) {
        return reply.code(400).send({ success: false, error: { code: 'INVALID_DEPARTMENT', message: 'Department not found' } });
      }
    }

    const team = await app.prisma.team.update({
      where: { id: teamId },
      data,
      include: {
        creator: { select: { id: true, fullName: true } },
        department: { select: { id: true, name: true } },
      },
    });

    await auditLogger.logResource('UPDATE', userId, 'team', teamId, data, request.ip, request.headers['user-agent']);

    return reply.send({ success: true, data: team });
  });

  // Delete team
  app.delete('/teams/:teamId', async (request, reply) => {
    const userId = request.userId!;
    const userRole = request.user!.role;
    if (!await checkAdminAccess(userRole)) {
      return reply.code(403).send({ success: false, error: { code: 'FORBIDDEN', message: 'Admin access required' } });
    }

    const { teamId } = request.params as { teamId: string };

    await app.prisma.team.delete({ where: { id: teamId } });

    await auditLogger.logResource('DELETE', userId, 'team', teamId, {}, request.ip, request.headers['user-agent']);

    return reply.send({ success: true, data: null });
  });

  // Team members
  app.get('/teams/:teamId/members', async (request, reply) => {
    const userRole = request.user!.role;
    if (!await checkAdminAccess(userRole)) {
      return reply.code(403).send({ success: false, error: { code: 'FORBIDDEN', message: 'Admin access required' } });
    }

    const { teamId } = request.params as { teamId: string };
    const members = await app.prisma.teamMember.findMany({
      where: { teamId },
      include: {
        user: { select: { id: true, fullName: true, email: true, role: true, department: true, status: true } },
      },
      orderBy: { joinedAt: 'asc' },
    });

    return reply.send({ success: true, data: members });
  });

  app.post('/teams/:teamId/members', {
    schema: { body: AddTeamMemberSchema },
  }, async (request, reply) => {
    const userId = request.userId!;
    const userRole = request.user!.role;
    if (!await checkAdminAccess(userRole)) {
      return reply.code(403).send({ success: false, error: { code: 'FORBIDDEN', message: 'Admin access required' } });
    }

    const { teamId } = request.params as { teamId: string };
    const { userId: newMemberId, role } = request.body as z.infer<typeof AddTeamMemberSchema>;

    const newMember = await app.prisma.profile.findUnique({ where: { id: newMemberId } });
    if (!newMember) {
      return reply.code(400).send({ success: false, error: { code: 'USER_NOT_FOUND', message: 'User not found' } });
    }

    const existing = await app.prisma.teamMember.findUnique({
      where: { teamId_userId: { teamId, userId: newMemberId } },
    });
    if (existing) {
      return reply.code(409).send({ success: false, error: { code: 'ALREADY_MEMBER', message: 'User is already a member of this team' } });
    }

    // Check for LEAD role conflict
    if (role === 'LEAD') {
      const existingLead = await app.prisma.teamMember.findFirst({
        where: { teamId, role: 'LEAD' },
      });
      if (existingLead) {
        return reply.code(409).send({ success: false, error: { code: 'LEAD_EXISTS', message: 'Team already has a lead' } });
      }
    }

    const member = await app.prisma.teamMember.create({
      data: { teamId, userId: newMemberId, role },
      include: { user: { select: { id: true, fullName: true, email: true } } },
    });

    await auditLogger.logResource('ASSIGN', userId, 'team_member', member.id, { userId: newMemberId, role }, request.ip, request.headers['user-agent']);

    return reply.code(201).send({ success: true, data: member });
  });

  app.patch('/teams/:teamId/members/:memberId', async (request, reply) => {
    const userId = request.userId!;
    const userRole = request.user!.role;
    if (!await checkAdminAccess(userRole)) {
      return reply.code(403).send({ success: false, error: { code: 'FORBIDDEN', message: 'Admin access required' } });
    }

    const { teamId, memberId } = request.params as { teamId: string; memberId: string };
    const { role } = request.body as { role: 'LEAD' | 'MEMBER' };

    if (role === 'LEAD') {
      const existingLead = await app.prisma.teamMember.findFirst({
        where: { teamId, role: 'LEAD', NOT: { id: memberId } },
      });
      if (existingLead) {
        return reply.code(409).send({ success: false, error: { code: 'LEAD_EXISTS', message: 'Team already has a lead' } });
      }
    }

    const member = await app.prisma.teamMember.update({
      where: { id: memberId },
      data: { role },
      include: { user: { select: { id: true, fullName: true, email: true } } },
    });

    await auditLogger.logResource('UPDATE', userId, 'team_member', memberId, { role }, request.ip, request.headers['user-agent']);

    return reply.send({ success: true, data: member });
  });

  app.delete('/teams/:teamId/members/:memberId', async (request, reply) => {
    const userId = request.userId!;
    const userRole = request.user!.role;
    if (!await checkAdminAccess(userRole)) {
      return reply.code(403).send({ success: false, error: { code: 'FORBIDDEN', message: 'Admin access required' } });
    }

    const { memberId } = request.params as { memberId: string };

    await app.prisma.teamMember.delete({ where: { id: memberId } });

    await auditLogger.logResource('UNASSIGN', userId, 'team_member', memberId, {}, request.ip, request.headers['user-agent']);

    return reply.send({ success: true, data: null });
  });

  // ===================== DEPARTMENTS =====================

  // List all departments
  app.get('/departments', {
    schema: {
      querystring: z.object({
        search: z.string().optional(),
        parentId: z.string().uuid().optional(),
      }),
    },
  }, async (request, reply) => {
    const userRole = request.user!.role;
    if (!await checkAdminAccess(userRole)) {
      return reply.code(403).send({ success: false, error: { code: 'FORBIDDEN', message: 'Admin access required' } });
    }

    const { search, parentId } = request.query as any;
    const where: any = {};
    if (search) {
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { description: { contains: search, mode: 'insensitive' } },
      ];
    }
    if (parentId) where.parentId = parentId;

    const departments = await app.prisma.department.findMany({
      where,
      orderBy: { name: 'asc' },
      include: {
        parent: { select: { id: true, name: true } },
        children: { select: { id: true, name: true } },
        _count: { select: { members: true, teams: true } },
      },
    });

    return reply.send({ success: true, data: departments });
  });

  // Get department tree (hierarchy)
  app.get('/departments/tree', async (request, reply) => {
    const userRole = request.user!.role;
    if (!await checkAdminAccess(userRole)) {
      return reply.code(403).send({ success: false, error: { code: 'FORBIDDEN', message: 'Admin access required' } });
    }

    const departments = await app.prisma.department.findMany({
      where: { parentId: null },
      orderBy: { name: 'asc' },
      include: {
        children: {
          include: {
            children: {
              include: { children: true }, // 3 levels deep
            },
          },
        },
        teams: { select: { id: true, name: true } },
        _count: { select: { members: true } },
      },
    });

    return reply.send({ success: true, data: departments });
  });

  // Get single department
  app.get('/departments/:deptId', async (request, reply) => {
    const userRole = request.user!.role;
    if (!await checkAdminAccess(userRole)) {
      return reply.code(403).send({ success: false, error: { code: 'FORBIDDEN', message: 'Admin access required' } });
    }

    const { deptId } = request.params as { deptId: string };
    const department = await app.prisma.department.findUnique({
      where: { id: deptId },
      include: {
        parent: { select: { id: true, name: true } },
        children: { select: { id: true, name: true } },
        teams: { select: { id: true, name: true, _count: { select: { members: true } } } },
        members: {
          select: { id: true, fullName: true, email: true, role: true, status: true },
        },
      },
    });

    if (!department) {
      return reply.code(404).send({ success: false, error: { code: 'NOT_FOUND', message: 'Department not found' } });
    }

    return reply.send({ success: true, data: department });
  });

  // Create department
  app.post('/departments', {
    schema: { body: CreateDepartmentSchema },
  }, async (request, reply) => {
    const userId = request.userId!;
    const userRole = request.user!.role;
    if (!await checkAdminAccess(userRole)) {
      return reply.code(403).send({ success: false, error: { code: 'FORBIDDEN', message: 'Admin access required' } });
    }

    const data = request.body as z.infer<typeof CreateDepartmentSchema>;

    if (data.parentId) {
      const parent = await app.prisma.department.findUnique({ where: { id: data.parentId } });
      if (!parent) {
        return reply.code(400).send({ success: false, error: { code: 'INVALID_PARENT', message: 'Parent department not found' } });
      }
    }

    const department = await app.prisma.department.create({
      data: {
        name: data.name,
        description: data.description,
        parentId: data.parentId,
      },
      include: { parent: { select: { id: true, name: true } } },
    });

    await auditLogger.logResource('CREATE', userId, 'department', department.id, { name: data.name }, request.ip, request.headers['user-agent']);

    return reply.code(201).send({ success: true, data: department });
  });

  // Update department
  app.patch('/departments/:deptId', {
    schema: { body: UpdateDepartmentSchema },
  }, async (request, reply) => {
    const userId = request.userId!;
    const userRole = request.user!.role;
    if (!await checkAdminAccess(userRole)) {
      return reply.code(403).send({ success: false, error: { code: 'FORBIDDEN', message: 'Admin access required' } });
    }

    const { deptId } = request.params as { deptId: string };
    const data = request.body as z.infer<typeof UpdateDepartmentSchema>;

    if (data.parentId) {
      const parent = await app.prisma.department.findUnique({ where: { id: data.parentId } });
      if (!parent) {
        return reply.code(400).send({ success: false, error: { code: 'INVALID_PARENT', message: 'Parent department not found' } });
      }
      // Prevent circular reference
      if (data.parentId === deptId) {
        return reply.code(400).send({ success: false, error: { code: 'CIRCULAR_REFERENCE', message: 'Department cannot be its own parent' } });
      }
    }

    const department = await app.prisma.department.update({
      where: { id: deptId },
      data,
      include: { parent: { select: { id: true, name: true } } },
    });

    await auditLogger.logResource('UPDATE', userId, 'department', deptId, data, request.ip, request.headers['user-agent']);

    return reply.send({ success: true, data: department });
  });

  // Delete department
  app.delete('/departments/:deptId', async (request, reply) => {
    const userId = request.userId!;
    const userRole = request.user!.role;
    if (!await checkAdminAccess(userRole)) {
      return reply.code(403).send({ success: false, error: { code: 'FORBIDDEN', message: 'Admin access required' } });
    }

    const { deptId } = request.params as { deptId: string };

    // Check for children
    const children = await app.prisma.department.findMany({ where: { parentId: deptId } });
    if (children.length > 0) {
      return reply.code(400).send({ success: false, error: { code: 'HAS_CHILDREN', message: 'Cannot delete department with child departments' } });
    }

    await app.prisma.department.delete({ where: { id: deptId } });

    await auditLogger.logResource('DELETE', userId, 'department', deptId, {}, request.ip, request.headers['user-agent']);

    return reply.send({ success: true, data: null });
  });
}