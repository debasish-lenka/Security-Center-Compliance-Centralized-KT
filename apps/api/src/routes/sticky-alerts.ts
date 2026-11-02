import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { createAuditLogger } from '../services/audit-logger.js';

const CreateAlertSchema = z.object({
  userId: z.string().uuid(),
  type: z.enum([
    'PERMISSION_CHANGE',
    'DOCUMENT_DELETE',
    'DOCUMENT_APPROVE',
    'DOCUMENT_REJECT',
    'USER_ROLE_CHANGE',
    'PROJECT_DELETE',
    'COMPLIANCE_OVERDUE',
    'SECURITY_INCIDENT',
    'SYSTEM_CONFIG_CHANGE',
    'DATA_EXPORT',
    'BULK_OPERATION'
  ]),
  title: z.string().min(1).max(500),
  message: z.string(),
  resourceType: z.string().optional(),
  resourceId: z.string().uuid().optional(),
  metadata: z.record(z.unknown()).optional(),
});

const UpdateAlertSchema = z.object({
  isRead: z.boolean().optional(),
  isDismissed: z.boolean().optional(),
});

async function checkAdminAccess(userRole: string) {
  return ['SUPER_ADMIN', 'ADMIN', 'SECURITY_ADMIN'].includes(userRole);
}

export async function stickyAlertRoutes(app: FastifyInstance) {
  const auditLogger = createAuditLogger(app);

  // List alerts for current user
  app.get('/', {
    schema: {
      querystring: z.object({
        page: z.coerce.number().int().positive().default(1),
        limit: z.coerce.number().int().positive().max(100).default(20),
        isRead: z.coerce.boolean().optional(),
        isDismissed: z.coerce.boolean().optional(),
        type: z.string().optional(),
      }),
    },
  }, async (request, reply) => {
    const userId = request.userId!;
    const { page, limit, isRead, isDismissed, type } = request.query as any;

    const where: any = { userId };
    if (isRead !== undefined) where.isRead = isRead;
    if (isDismissed !== undefined) where.isDismissed = isDismissed;
    if (type) where.type = type;

    const [alerts, total, unreadCount] = await Promise.all([
      app.prisma.stickyCriticalAlert.findMany({
        where,
        orderBy: [
          { isDismissed: 'asc' },
          { isRead: 'asc' },
          { createdAt: 'desc' },
        ],
        skip: (page - 1) * limit,
        take: limit,
      }),
      app.prisma.stickyCriticalAlert.count({ where }),
      app.prisma.stickyCriticalAlert.count({ where: { userId, isRead: false, isDismissed: false } }),
    ]);

    return reply.send({
      success: true,
      data: {
        items: alerts,
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
        unreadCount,
      },
    });
  });

  // Get single alert
  app.get('/:alertId', async (request, reply) => {
    const userId = request.userId!;
    const userRole = request.user!.role;
    const { alertId } = request.params as { alertId: string };

    const where: any = { id: alertId };
    // Non-admin users can only see their own alerts
    if (!await checkAdminAccess(userRole)) {
      where.userId = userId;
    }

    const alert = await app.prisma.stickyCriticalAlert.findFirst({ where });

    if (!alert) {
      return reply.code(404).send({ success: false, error: { code: 'NOT_FOUND', message: 'Alert not found' } });
    }

    return reply.send({ success: true, data: alert });
  });

  // Mark alert as read
  app.patch('/:alertId/read', async (request, reply) => {
    const userId = request.userId!;
    const userRole = request.user!.role;
    const { alertId } = request.params as { alertId: string };

    const where: any = { id: alertId };
    if (!await checkAdminAccess(userRole)) {
      where.userId = userId;
    }

    const alert = await app.prisma.stickyCriticalAlert.update({
      where,
      data: {
        isRead: true,
        acknowledgedAt: new Date(),
      },
    });

    await auditLogger.logResource('UPDATE', userId, 'sticky_alert', alertId, { action: 'mark_read' }, request.ip, request.headers['user-agent']);

    return reply.send({ success: true, data: alert });
  });

  // Mark alert as dismissed
  app.patch('/:alertId/dismiss', async (request, reply) => {
    const userId = request.userId!;
    const userRole = request.user!.role;
    const { alertId } = request.params as { alertId: string };

    const where: any = { id: alertId };
    if (!await checkAdminAccess(userRole)) {
      where.userId = userId;
    }

    const alert = await app.prisma.stickyCriticalAlert.update({
      where,
      data: { isDismissed: true },
    });

    await auditLogger.logResource('UPDATE', userId, 'sticky_alert', alertId, { action: 'dismiss' }, request.ip, request.headers['user-agent']);

    return reply.send({ success: true, data: alert });
  });

  // Mark all alerts as read
  app.post('/mark-all-read', async (request, reply) => {
    const userId = request.userId!;
    const { type } = request.body as { type?: string };

    const where: any = { userId, isRead: false, isDismissed: false };
    if (type) where.type = type;

    const result = await app.prisma.stickyCriticalAlert.updateMany({
      where,
      data: {
        isRead: true,
        acknowledgedAt: new Date(),
      },
    });

    return reply.send({ success: true, data: { updatedCount: result.count } });
  });

  // Dismiss all alerts
  app.post('/dismiss-all', async (request, reply) => {
    const userId = request.userId!;
    const { type } = request.body as { type?: string };

    const where: any = { userId, isDismissed: false };
    if (type) where.type = type;

    const result = await app.prisma.stickyCriticalAlert.updateMany({
      where,
      data: { isDismissed: true },
    });

    return reply.send({ success: true, data: { updatedCount: result.count } });
  });

  // Admin: Create alert for user(s)
  app.post('/', {
    schema: { body: CreateAlertSchema },
  }, async (request, reply) => {
    const userId = request.userId!;
    const userRole = request.user!.role;
    if (!await checkAdminAccess(userRole)) {
      return reply.code(403).send({ success: false, error: { code: 'FORBIDDEN', message: 'Admin access required' } });
    }

    const data = request.body as z.infer<typeof CreateAlertSchema>;

    // Verify target user exists
    const targetUser = await app.prisma.profile.findUnique({ where: { id: data.userId } });
    if (!targetUser) {
      return reply.code(400).send({ success: false, error: { code: 'USER_NOT_FOUND', message: 'Target user not found' } });
    }

    const alert = await app.prisma.stickyCriticalAlert.create({
      data: {
        userId: data.userId,
        type: data.type,
        title: data.title,
        message: data.message,
        resourceType: data.resourceType,
        resourceId: data.resourceId,
        metadata: data.metadata as any,
      },
    });

    await auditLogger.logResource('CREATE', userId, 'sticky_alert', alert.id, {
      targetUserId: data.userId,
      type: data.type
    }, request.ip, request.headers['user-agent']);

    // Also create a regular notification
    const notificationService = (await import('../services/notifications.js')).createNotificationService(app);
    await notificationService.create({
      userId: data.userId,
      type: 'CRITICAL_ALERT',
      title: data.title,
      message: data.message,
      resourceType: data.resourceType,
      resourceId: data.resourceId,
    });

    return reply.code(201).send({ success: true, data: alert });
  });

  // Admin: Create bulk alerts
  app.post('/bulk', {
    schema: {
      body: z.object({
        userIds: z.array(z.string().uuid()).min(1),
        type: z.enum([
          'PERMISSION_CHANGE',
          'DOCUMENT_DELETE',
          'DOCUMENT_APPROVE',
          'DOCUMENT_REJECT',
          'USER_ROLE_CHANGE',
          'PROJECT_DELETE',
          'COMPLIANCE_OVERDUE',
          'SECURITY_INCIDENT',
          'SYSTEM_CONFIG_CHANGE',
          'DATA_EXPORT',
          'BULK_OPERATION'
        ]),
        title: z.string().min(1).max(500),
        message: z.string(),
        resourceType: z.string().optional(),
        resourceId: z.string().uuid().optional(),
        metadata: z.record(z.unknown()).optional(),
      }),
    },
  }, async (request, reply) => {
    const userId = request.userId!;
    const userRole = request.user!.role;
    if (!await checkAdminAccess(userRole)) {
      return reply.code(403).send({ success: false, error: { code: 'FORBIDDEN', message: 'Admin access required' } });
    }

    const { userIds, type, title, message, resourceType, resourceId, metadata } = request.body as any;

    // Verify all users exist
    const users = await app.prisma.profile.findMany({
      where: { id: { in: userIds } },
      select: { id: true },
    });
    if (users.length !== userIds.length) {
      return reply.code(400).send({ success: false, error: { code: 'INVALID_USERS', message: 'One or more users not found' } });
    }

    const alerts = await app.prisma.$transaction(async (tx) => {
      const created = [];
      for (const targetUserId of userIds) {
        const alert = await tx.stickyCriticalAlert.create({
          data: {
            userId: targetUserId,
            type,
            title,
            message,
            resourceType,
            resourceId,
            metadata: metadata as any,
          },
        });
        created.push(alert);
      }
      return created;
    });

    await auditLogger.logResource('UPDATE', userId, 'sticky_alert', 'bulk', {
      count: alerts.length,
      type
    }, request.ip, request.headers['user-agent']);

    // Create notifications for all users
    const notificationService = (await import('../services/notifications.js')).createNotificationService(app);
    for (const alert of alerts) {
      await notificationService.create({
        userId: alert.userId,
        type: 'CRITICAL_ALERT',
        title,
        message,
        resourceType,
        resourceId,
      });
    }

    return reply.code(201).send({ success: true, data: { created: alerts.length } });
  });

  // Admin: Get all alerts (for monitoring)
  app.get('/admin/all', {
    schema: {
      querystring: z.object({
        page: z.coerce.number().int().positive().default(1),
        limit: z.coerce.number().int().positive().max(100).default(50),
        userId: z.string().uuid().optional(),
        type: z.string().optional(),
        isRead: z.coerce.boolean().optional(),
        isDismissed: z.coerce.boolean().optional(),
        startDate: z.string().datetime().optional(),
        endDate: z.string().datetime().optional(),
      }),
    },
  }, async (request, reply) => {
    const userRole = request.user!.role;
    if (!await checkAdminAccess(userRole)) {
      return reply.code(403).send({ success: false, error: { code: 'FORBIDDEN', message: 'Admin access required' } });
    }

    const { page, limit, userId, type, isRead, isDismissed, startDate, endDate } = request.query as any;
    const where: any = {};

    if (userId) where.userId = userId;
    if (type) where.type = type;
    if (isRead !== undefined) where.isRead = isRead;
    if (isDismissed !== undefined) where.isDismissed = isDismissed;
    if (startDate || endDate) {
      where.createdAt = {};
      if (startDate) where.createdAt.gte = new Date(startDate);
      if (endDate) where.createdAt.lte = new Date(endDate);
    }

    const [alerts, total] = await Promise.all([
      app.prisma.stickyCriticalAlert.findMany({
        where,
        orderBy: [
          { isDismissed: 'asc' },
          { isRead: 'asc' },
          { createdAt: 'desc' },
        ],
        skip: (page - 1) * limit,
        take: limit,
        include: {
          user: { select: { id: true, fullName: true, email: true, role: true } },
        },
      }),
      app.prisma.stickyCriticalAlert.count({ where }),
    ]);

    // Get stats
    const stats = await app.prisma.stickyCriticalAlert.groupBy({
      by: ['type'],
      where: { isDismissed: false },
      _count: true,
    });

    return reply.send({
      success: true,
      data: {
        items: alerts,
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
        stats: stats.map(s => ({ type: s.type, count: s._count })),
      },
    });
  });

  // Internal helper to create critical alert (used by other services)
  app.decorate('createCriticalAlert', async (input: {
    userId: string;
    type: string;
    title: string;
    message: string;
    resourceType?: string;
    resourceId?: string;
    metadata?: Record<string, unknown>;
  }) => {
    const alert = await app.prisma.stickyCriticalAlert.create({
      data: {
        userId: input.userId,
        type: input.type as any,
        title: input.title,
        message: input.message,
        resourceType: input.resourceType,
        resourceId: input.resourceId,
        metadata: input.metadata as any,
      },
    });

    // Also create a regular notification
    const notificationService = (await import('../services/notifications.js')).createNotificationService(app);
    await notificationService.create({
      userId: input.userId,
      type: 'CRITICAL_ALERT',
      title: input.title,
      message: input.message,
      resourceType: input.resourceType,
      resourceId: input.resourceId,
    });

    return alert;
  });
}