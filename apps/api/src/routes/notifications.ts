import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { createAuditLogger } from '../services/audit-logger.js';

export async function notificationRoutes(app: FastifyInstance) {
  const auditLogger = createAuditLogger(app);

  // List notifications for current user
  app.get('/', {
    schema: {
      querystring: z.object({
        page: z.coerce.number().int().positive().default(1),
        limit: z.coerce.number().int().positive().max(100).default(20),
        isRead: z.boolean().optional(),
        type: z.string().optional(),
      }),
    },
  }, async (request, reply) => {
    const userId = request.userId!;
    const { page, limit, isRead, type } = request.query as any;

    const where: any = { userId };
    if (isRead !== undefined) where.isRead = isRead;
    if (type) where.type = type;

    const [notifications, total, unreadCount] = await Promise.all([
      app.prisma.notification.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
        select: {
          id: true,
          type: true,
          title: true,
          message: true,
          resourceType: true,
          resourceId: true,
          isRead: true,
          createdAt: true,
        },
      }),
      app.prisma.notification.count({ where }),
      app.prisma.notification.count({ where: { userId, isRead: false } }),
    ]);

    return reply.send({
      success: true,
      data: { items: notifications, total, page, limit, totalPages: Math.ceil(total / limit), unreadCount },
    });
  });

  // Get unread count
  app.get('/unread-count', async (request, reply) => {
    const userId = request.userId!;
    const count = await app.prisma.notification.count({ where: { userId, isRead: false } });
    return reply.send({ success: true, data: { count } });
  });

  // Mark as read
  app.patch('/:notificationId/read', async (request, reply) => {
    const userId = request.userId!;
    const { notificationId } = request.params as { notificationId: string };

    await app.prisma.notification.updateMany({
      where: { id: notificationId, userId },
      data: { isRead: true },
    });

    return reply.send({ success: true, data: null });
  });

  // Mark all as read
  app.post('/mark-all-read', async (request, reply) => {
    const userId = request.userId!;

    await app.prisma.notification.updateMany({
      where: { userId, isRead: false },
      data: { isRead: true },
    });

    return reply.send({ success: true, data: null });
  });

  // Delete notification
  app.delete('/:notificationId', async (request, reply) => {
    const userId = request.userId!;
    const { notificationId } = request.params as { notificationId: string };

    await app.prisma.notification.deleteMany({
      where: { id: notificationId, userId },
    });

    return reply.send({ success: true, data: null });
  });
}