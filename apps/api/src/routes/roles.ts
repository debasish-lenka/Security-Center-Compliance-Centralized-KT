import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { createAuditLogger } from '../services/audit-logger.js';

const CreateRoleSchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().optional().nullable(),
  permissionIds: z.array(z.string().uuid()).default([]),
});

const UpdateRoleSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  description: z.string().optional().nullable(),
  permissionIds: z.array(z.string().uuid()).optional(),
});

// Built-in roles the seed creates: they cannot be renamed or deleted
const SYSTEM_ROLES = ['Super Admin', 'Admin', 'Project Member'];
const isSystem = (name: string) => SYSTEM_ROLES.includes(name);

export async function roleRoutes(app: FastifyInstance) {
  const auditLogger = createAuditLogger(app);

  // List all roles with permissions
  app.get('/', async (request, reply) => {
    const userRole = request.user!.role;
    if (userRole !== 'SUPER_ADMIN') {
      return reply.code(403).send({ success: false, error: { code: 'FORBIDDEN', message: 'Super admin access required' } });
    }

    const roles = await app.prisma.role.findMany({
      orderBy: { name: 'asc' },
      include: {
        permissions: { select: { id: true, name: true, description: true } },
        _count: { select: { userRoles: true } },
      },
    });

    const items = roles.map(({ _count, ...r }) => ({ ...r, isSystem: isSystem(r.name), userCount: _count.userRoles }));
    return reply.send({ success: true, data: { items, total: items.length } });
  });

  // List all permissions
  app.get('/permissions', async (request, reply) => {
    const userRole = request.user!.role;
    if (userRole !== 'SUPER_ADMIN') {
      return reply.code(403).send({ success: false, error: { code: 'FORBIDDEN', message: 'Super admin access required' } });
    }

    const permissions = await app.prisma.permission.findMany({ orderBy: { name: 'asc' } });
    return reply.send({ success: true, data: permissions });
  });

  // Get single role
  app.get('/:roleId', async (request, reply) => {
    const userRole = request.user!.role;
    if (userRole !== 'SUPER_ADMIN') {
      return reply.code(403).send({ success: false, error: { code: 'FORBIDDEN', message: 'Super admin access required' } });
    }

    const { roleId } = request.params as { roleId: string };
    const role = await app.prisma.role.findUnique({
      where: { id: roleId },
      include: { permissions: { select: { id: true, name: true, description: true } } },
    });

    if (!role) {
      return reply.code(404).send({ success: false, error: { code: 'NOT_FOUND', message: 'Role not found' } });
    }

    return reply.send({ success: true, data: { ...role, isSystem: isSystem(role.name) } });
  });

  // Create role
  app.post('/', {
    schema: { body: CreateRoleSchema },
  }, async (request, reply) => {
    const userId = request.userId!;
    const userRole = request.user!.role;
    if (userRole !== 'SUPER_ADMIN') {
      return reply.code(403).send({ success: false, error: { code: 'FORBIDDEN', message: 'Super admin access required' } });
    }

    const data = request.body as z.infer<typeof CreateRoleSchema>;

    const role = await app.prisma.role.create({
      data: {
        name: data.name,
        description: data.description,
        permissions: { connect: data.permissionIds.map(id => ({ id })) },
      },
      include: { permissions: { select: { id: true, name: true } } },
    });

    await auditLogger.logResource('CREATE', userId, 'role', role.id, data, request.ip, request.headers['user-agent']);

    return reply.code(201).send({ success: true, data: role });
  });

  // Update role
  app.patch('/:roleId', {
    schema: { body: UpdateRoleSchema },
  }, async (request, reply) => {
    const userId = request.userId!;
    const userRole = request.user!.role;
    if (userRole !== 'SUPER_ADMIN') {
      return reply.code(403).send({ success: false, error: { code: 'FORBIDDEN', message: 'Super admin access required' } });
    }

    const { roleId } = request.params as { roleId: string };
    const data = request.body as z.infer<typeof UpdateRoleSchema>;

    const { permissionIds, ...rest } = data;

    const existing = await app.prisma.role.findUnique({ where: { id: roleId }, select: { name: true } });
    if (!existing) {
      return reply.code(404).send({ success: false, error: { code: 'NOT_FOUND', message: 'Role not found' } });
    }
    if (isSystem(existing.name) && rest.name && rest.name !== existing.name) {
      return reply.code(400).send({ success: false, error: { code: 'CANNOT_RENAME', message: 'Built-in roles cannot be renamed' } });
    }

    const role = await app.prisma.role.update({
      where: { id: roleId },
      data: {
        ...rest,
        ...(permissionIds ? { permissions: { set: permissionIds.map(id => ({ id })) } } : {}),
      },
      include: { permissions: { select: { id: true, name: true } } },
    });

    await auditLogger.logResource('UPDATE', userId, 'role', roleId, data, request.ip, request.headers['user-agent']);

    return reply.send({ success: true, data: role });
  });

  // Delete role
  app.delete('/:roleId', async (request, reply) => {
    const userId = request.userId!;
    const userRole = request.user!.role;
    if (userRole !== 'SUPER_ADMIN') {
      return reply.code(403).send({ success: false, error: { code: 'FORBIDDEN', message: 'Super admin access required' } });
    }

    const { roleId } = request.params as { roleId: string };

    // Prevent deleting system roles
    const role = await app.prisma.role.findUnique({ where: { id: roleId } });
    if (!role) {
      return reply.code(404).send({ success: false, error: { code: 'NOT_FOUND', message: 'Role not found' } });
    }
    if (isSystem(role.name)) {
      return reply.code(400).send({ success: false, error: { code: 'CANNOT_DELETE', message: 'Built-in roles cannot be deleted' } });
    }

    await app.prisma.role.delete({ where: { id: roleId } });

    await auditLogger.logResource('DELETE', userId, 'role', roleId, {}, request.ip, request.headers['user-agent']);

    return reply.send({ success: true, data: null });
  });

  // Assign role to user
  app.post('/assign', {
    schema: {
      body: z.object({
        userId: z.string().uuid(),
        roleId: z.string().uuid(),
      }),
    },
  }, async (request, reply) => {
    const userId = request.userId!;
    const userRole = request.user!.role;
    if (userRole !== 'SUPER_ADMIN') {
      return reply.code(403).send({ success: false, error: { code: 'FORBIDDEN', message: 'Super admin access required' } });
    }

    const { userId: targetUserId, roleId } = request.body as { userId: string; roleId: string };

    const assignment = await app.prisma.userRoleAssignment.upsert({
      where: { userId_roleId: { userId: targetUserId, roleId } },
      create: { userId: targetUserId, roleId, assignedBy: userId },
      update: { assignedBy: userId },
    });

    await auditLogger.logRoleChange(userId, targetUserId, [], [roleId], request.ip, request.headers['user-agent']);

    return reply.code(201).send({ success: true, data: assignment });
  });

  // Remove role from user
  app.delete('/assign', {
    schema: {
      body: z.object({
        userId: z.string().uuid(),
        roleId: z.string().uuid(),
      }),
    },
  }, async (request, reply) => {
    const userId = request.userId!;
    const userRole = request.user!.role;
    if (userRole !== 'SUPER_ADMIN') {
      return reply.code(403).send({ success: false, error: { code: 'FORBIDDEN', message: 'Super admin access required' } });
    }

    const { userId: targetUserId, roleId } = request.body as { userId: string; roleId: string };

    await app.prisma.userRoleAssignment.delete({
      where: { userId_roleId: { userId: targetUserId, roleId } },
    });

    await auditLogger.logRoleChange(userId, targetUserId, [roleId], [], request.ip, request.headers['user-agent']);

    return reply.send({ success: true, data: null });
  });
}