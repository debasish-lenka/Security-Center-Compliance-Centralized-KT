import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { createAuditLogger } from '../services/audit-logger.js';

const CreatePermissionOverrideSchema = z.object({
  userId: z.string().uuid(),
  permissionId: z.string().uuid(),
  effect: z.enum(['ALLOW', 'DENY']).default('ALLOW'),
  resourceType: z.string().optional(),
  resourceId: z.string().uuid().optional(),
  reason: z.string().optional(),
  expiresAt: z.string().datetime().optional(),
});

const UpdatePermissionOverrideSchema = z.object({
  effect: z.enum(['ALLOW', 'DENY']).optional(),
  resourceType: z.string().optional().nullable(),
  resourceId: z.string().uuid().optional().nullable(),
  reason: z.string().optional().nullable(),
  expiresAt: z.string().datetime().optional().nullable(),
});

async function checkSuperAdmin(userRole: string) {
  return userRole === 'SUPER_ADMIN';
}

export async function permissionOverrideRoutes(app: FastifyInstance) {
  const auditLogger = createAuditLogger(app);

  // List all permission overrides
  app.get('/permission-overrides', {
    schema: {
      querystring: z.object({
        page: z.coerce.number().int().positive().default(1),
        limit: z.coerce.number().int().positive().max(100).default(20),
        userId: z.string().uuid().optional(),
        permissionId: z.string().uuid().optional(),
        resourceType: z.string().optional(),
        activeOnly: z.coerce.boolean().default(true),
      }),
    },
  }, async (request, reply) => {
    const userRole = request.user!.role;
    if (!await checkSuperAdmin(userRole)) {
      return reply.code(403).send({ success: false, error: { code: 'FORBIDDEN', message: 'Super admin access required' } });
    }

    const { page, limit, userId, permissionId, resourceType, activeOnly } = request.query as any;
    const where: any = {};

    if (userId) where.userId = userId;
    if (permissionId) where.permissionId = permissionId;
    if (resourceType) where.resourceType = resourceType;
    if (activeOnly) {
      where.OR = [
        { expiresAt: null },
        { expiresAt: { gte: new Date() } },
      ];
    }

    const [overrides, total] = await Promise.all([
      app.prisma.permissionOverride.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
        include: {
          user: { select: { id: true, fullName: true, email: true, role: true } },
          permission: { select: { id: true, name: true, resource: true, action: true, scope: true } },
          grantor: { select: { id: true, fullName: true, email: true } },
        },
      }),
      app.prisma.permissionOverride.count({ where }),
    ]);

    return reply.send({
      success: true,
      data: { items: overrides, total, page, limit, totalPages: Math.ceil(total / limit) },
    });
  });

  // Get single permission override
  app.get('/permission-overrides/:overrideId', async (request, reply) => {
    const userRole = request.user!.role;
    if (!await checkSuperAdmin(userRole)) {
      return reply.code(403).send({ success: false, error: { code: 'FORBIDDEN', message: 'Super admin access required' } });
    }

    const { overrideId } = request.params as { overrideId: string };
    const override = await app.prisma.permissionOverride.findUnique({
      where: { id: overrideId },
      include: {
        user: { select: { id: true, fullName: true, email: true, role: true } },
        permission: { select: { id: true, name: true, resource: true, action: true, scope: true } },
        grantor: { select: { id: true, fullName: true, email: true } },
      },
    });

    if (!override) {
      return reply.code(404).send({ success: false, error: { code: 'NOT_FOUND', message: 'Permission override not found' } });
    }

    return reply.send({ success: true, data: override });
  });

  // Create permission override
  app.post('/permission-overrides', {
    schema: { body: CreatePermissionOverrideSchema },
  }, async (request, reply) => {
    const userId = request.userId!;
    const userRole = request.user!.role;
    if (!await checkSuperAdmin(userRole)) {
      return reply.code(403).send({ success: false, error: { code: 'FORBIDDEN', message: 'Super admin access required' } });
    }

    const data = request.body as z.infer<typeof CreatePermissionOverrideSchema>;

    // Verify user exists
    const targetUser = await app.prisma.profile.findUnique({ where: { id: data.userId } });
    if (!targetUser) {
      return reply.code(400).send({ success: false, error: { code: 'USER_NOT_FOUND', message: 'Target user not found' } });
    }

    // Verify permission exists
    const permission = await app.prisma.permission.findUnique({ where: { id: data.permissionId } });
    if (!permission) {
      return reply.code(400).send({ success: false, error: { code: 'PERMISSION_NOT_FOUND', message: 'Permission not found' } });
    }

    // Check for existing override
    const existing = await app.prisma.permissionOverride.findFirst({
      where: {
        userId: data.userId,
        permissionId: data.permissionId,
        resourceType: data.resourceType || null,
        resourceId: data.resourceId || null,
      },
    });

    if (existing) {
      return reply.code(409).send({ success: false, error: { code: 'OVERRIDE_EXISTS', message: 'Permission override already exists for this user and permission' } });
    }

    const override = await app.prisma.permissionOverride.create({
      data: {
        userId: data.userId,
        permissionId: data.permissionId,
        effect: data.effect,
        resourceType: data.resourceType,
        resourceId: data.resourceId,
        reason: data.reason,
        grantedBy: userId,
        expiresAt: data.expiresAt ? new Date(data.expiresAt) : null,
      },
      include: {
        user: { select: { id: true, fullName: true, email: true } },
        permission: { select: { id: true, name: true, resource: true, action: true, scope: true } },
        grantor: { select: { id: true, fullName: true, email: true } },
      },
    });

    await auditLogger.logPermissionChange(
      userId,
      data.userId,
      [],
      [`${permission.resource}:${permission.action}:${permission.scope}:${data.effect}`],
      request.ip,
      request.headers['user-agent']
    );

    // Notify user of permission change
    const notificationService = (await import('../services/notifications.js')).createNotificationService(app);
    await notificationService.notifyPermissionChanged(data.userId);

    return reply.code(201).send({ success: true, data: override });
  });

  // Update permission override
  app.patch('/permission-overrides/:overrideId', {
    schema: { body: UpdatePermissionOverrideSchema },
  }, async (request, reply) => {
    const userId = request.userId!;
    const userRole = request.user!.role;
    if (!await checkSuperAdmin(userRole)) {
      return reply.code(403).send({ success: false, error: { code: 'FORBIDDEN', message: 'Super admin access required' } });
    }

    const { overrideId } = request.params as { overrideId: string };
    const data = request.body as z.infer<typeof UpdatePermissionOverrideSchema>;

    const override = await app.prisma.permissionOverride.update({
      where: { id: overrideId },
      data: {
        ...data,
        expiresAt: data.expiresAt ? new Date(data.expiresAt) : undefined,
      },
      include: {
        user: { select: { id: true, fullName: true, email: true } },
        permission: { select: { id: true, name: true, resource: true, action: true, scope: true } },
        grantor: { select: { id: true, fullName: true, email: true } },
      },
    });

    await auditLogger.logResource('UPDATE', userId, 'permission_override', overrideId, data, request.ip, request.headers['user-agent']);

    return reply.send({ success: true, data: override });
  });

  // Delete permission override
  app.delete('/permission-overrides/:overrideId', async (request, reply) => {
    const userId = request.userId!;
    const userRole = request.user!.role;
    if (!await checkSuperAdmin(userRole)) {
      return reply.code(403).send({ success: false, error: { code: 'FORBIDDEN', message: 'Super admin access required' } });
    }

    const { overrideId } = request.params as { overrideId: string };

    const existing = await app.prisma.permissionOverride.findUnique({ where: { id: overrideId } });
    if (!existing) {
      return reply.code(404).send({ success: false, error: { code: 'NOT_FOUND', message: 'Permission override not found' } });
    }

    await app.prisma.permissionOverride.delete({ where: { id: overrideId } });

    await auditLogger.logResource('DELETE', userId, 'permission_override', overrideId, {}, request.ip, request.headers['user-agent']);

    // Notify user of permission change
    const notificationService = (await import('../services/notifications.js')).createNotificationService(app);
    await notificationService.notifyPermissionChanged(existing.userId);

    return reply.send({ success: true, data: null });
  });

  // Get effective permissions for a user (including overrides)
  app.get('/users/:userId/effective-permissions', async (request, reply) => {
    const userId = request.userId!;
    const userRole = request.user!.role;
    const { userId: targetUserId } = request.params as { userId: string };

    // Users can only view their own effective permissions unless admin
    if (userRole !== 'SUPER_ADMIN' && userId !== targetUserId) {
      return reply.code(403).send({ success: false, error: { code: 'FORBIDDEN', message: 'Access denied' } });
    }

    // Get user's roles
    const userRoles = await app.prisma.userRoleAssignment.findMany({
      where: { userId: targetUserId },
      include: { role: { include: { permissions: true } } },
    });

    // Get all permissions from roles
    const rolePermissions = new Map<string, { resource: string; action: string; scope: string; allowed: boolean }>();

    for (const ur of userRoles) {
      for (const perm of ur.role.permissions) {
        const key = `${perm.resource}:${perm.action}:${perm.scope}`;
        rolePermissions.set(key, {
          resource: perm.resource,
          action: perm.action,
          scope: perm.scope,
          allowed: true
        });
      }
    }

    // Apply overrides
    const overrides = await app.prisma.permissionOverride.findMany({
      where: {
        userId: targetUserId,
        OR: [
          { expiresAt: null },
          { expiresAt: { gte: new Date() } },
        ],
      },
      include: { permission: true },
    });

    for (const override of overrides) {
      const key = `${override.permission.resource}:${override.permission.action}:${override.permission.scope}`;
      if (override.resourceType && override.resourceId) {
        // Resource-specific override
        const specificKey = `${key}:${override.resourceType}:${override.resourceId}`;
        rolePermissions.set(specificKey, {
          resource: override.permission.resource,
          action: override.permission.action,
          scope: override.permission.scope,
          allowed: override.effect === 'ALLOW',
        });
      } else {
        // Global override for this permission
        rolePermissions.set(key, {
          resource: override.permission.resource,
          action: override.permission.action,
          scope: override.permission.scope,
          allowed: override.effect === 'ALLOW',
        });
      }
    }

    const effectivePermissions = Array.from(rolePermissions.values());

    return reply.send({
      success: true,
      data: {
        userId: targetUserId,
        permissions: effectivePermissions,
      },
    });
  });

  // Check if user has specific permission
  app.post('/check-permission', {
    schema: {
      body: z.object({
        userId: z.string().uuid(),
        resource: z.string(),
        action: z.string(),
        scope: z.enum(['GLOBAL', 'PROJECT', 'TEAM', 'DEPARTMENT', 'OWN']).default('PROJECT'),
        resourceType: z.string().optional(),
        resourceId: z.string().uuid().optional(),
      }),
    },
  }, async (request, reply) => {
    const userId = request.userId!;
    const userRole = request.user!.role;
    const { userId: targetUserId, resource, action, scope, resourceType, resourceId } = request.body as any;

    // Only SUPER_ADMIN or the user themselves can check
    if (userRole !== 'SUPER_ADMIN' && userId !== targetUserId) {
      return reply.code(403).send({ success: false, error: { code: 'FORBIDDEN', message: 'Access denied' } });
    }

    // Get user's roles
    const userRoles = await app.prisma.userRoleAssignment.findMany({
      where: { userId: targetUserId },
      include: { role: { include: { permissions: true } } },
    });

    // Check base role permissions
    let hasPermission = false;
    for (const ur of userRoles) {
      for (const perm of ur.role.permissions) {
        if (perm.resource === resource && perm.action === action && perm.scope === scope) {
          hasPermission = true;
          break;
        }
      }
      if (hasPermission) break;
    }

    // Check overrides
    const overrides = await app.prisma.permissionOverride.findMany({
      where: {
        userId: targetUserId,
        OR: [
          { expiresAt: null },
          { expiresAt: { gte: new Date() } },
        ],
      },
      include: { permission: true },
    });

    for (const override of overrides) {
      if (override.permission.resource === resource &&
          override.permission.action === action &&
          override.permission.scope === scope) {
        // Check if it's a global override or resource-specific
        if (!override.resourceType && !override.resourceId) {
          // Global override
          hasPermission = override.effect === 'ALLOW';
        } else if (override.resourceType === resourceType && override.resourceId === resourceId) {
          // Specific resource override
          hasPermission = override.effect === 'ALLOW';
        }
      }
    }

    // DENY overrides take precedence
    const denyOverrides = overrides.filter(o =>
      o.permission.resource === resource &&
      o.permission.action === action &&
      o.permission.scope === scope &&
      o.effect === 'DENY' &&
      (!o.resourceType && !o.resourceId || (o.resourceType === resourceType && o.resourceId === resourceId))
    );

    if (denyOverrides.length > 0) {
      hasPermission = false;
    }

    return reply.send({
      success: true,
      data: { hasPermission },
    });
  });
}