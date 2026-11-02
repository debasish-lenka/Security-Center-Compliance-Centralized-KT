import type { FastifyInstance } from 'fastify';
import { z } from 'zod';

export async function auditLogRoutes(app: FastifyInstance) {
  // List audit logs (admin only)
  app.get('/', {
    schema: {
      querystring: z.object({
        page: z.coerce.number().int().positive().default(1),
        limit: z.coerce.number().int().positive().max(100).default(50),
        action: z.string().optional(),
        resourceType: z.string().optional(),
        resourceId: z.string().uuid().optional(),
        actorId: z.string().uuid().optional(),
        startDate: z.string().datetime().optional(),
        endDate: z.string().datetime().optional(),
        outcome: z.enum(['SUCCESS', 'FAILURE']).optional(),
      }),
    },
    preHandler: [app.authenticate, app.requireRole(['SUPER_ADMIN', 'ADMIN'])],
  }, async (request, reply) => {
    const userRole = request.user!.role;
    if (userRole !== 'SUPER_ADMIN' && userRole !== 'ADMIN') {
      return reply.code(403).send({ success: false, error: { code: 'FORBIDDEN', message: 'Admin access required' } });
    }

    const { page, limit, action, resourceType, resourceId, actorId, startDate, endDate, outcome } = request.query as any;

    const where: any = {};
    if (action) where.action = action;
    if (resourceType) where.resourceType = resourceType;
    if (resourceId) where.resourceId = resourceId;
    if (actorId) where.actorId = actorId;
    if (outcome) where.outcome = outcome;
    if (startDate || endDate) {
      where.createdAt = {};
      if (startDate) where.createdAt.gte = new Date(startDate);
      if (endDate) where.createdAt.lte = new Date(endDate);
    }

    const [logs, total] = await Promise.all([
      app.prisma.auditLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
        select: {
          id: true,
          actorId: true,
          action: true,
          resourceType: true,
          resourceId: true,
          details: true,
          ipAddress: true,
          userAgent: true,
          outcome: true,
          errorMessage: true,
          createdAt: true,
          actor: { select: { fullName: true, email: true } },
        },
      }),
      app.prisma.auditLog.count({ where }),
    ]);

    return reply.send({
      success: true,
      data: { items: logs, total, page, limit, totalPages: Math.ceil(total / limit) },
    });
  });

  // Get audit log statistics
  app.get('/stats', {
    preHandler: [app.authenticate, app.requireRole(['SUPER_ADMIN', 'ADMIN'])],
  }, async (request, reply) => {
    const userRole = request.user!.role;
    if (userRole !== 'SUPER_ADMIN' && userRole !== 'ADMIN') {
      return reply.code(403).send({ success: false, error: { code: 'FORBIDDEN', message: 'Admin access required' } });
    }

    const [totalLogs, failedLogs, actionStats, resourceStats, recentActivity] = await Promise.all([
      app.prisma.auditLog.count(),
      app.prisma.auditLog.count({ where: { outcome: 'FAILURE' } }),
      app.prisma.auditLog.groupBy({ by: ['action'], _count: { action: true }, orderBy: { _count: { action: 'desc' } }, take: 10 }),
      app.prisma.auditLog.groupBy({ by: ['resourceType'], _count: { resourceType: true }, orderBy: { _count: { resourceType: 'desc' } }, take: 10 }),
      app.prisma.auditLog.findMany({
        orderBy: { createdAt: 'desc' },
        take: 5,
        select: { action: true, resourceType: true, resourceId: true, createdAt: true, actor: { select: { fullName: true } } },
      }),
    ]);

    return reply.send({
      success: true,
      data: {
        totalLogs,
        failedLogs,
        successRate: totalLogs > 0 ? ((totalLogs - failedLogs) / totalLogs * 100).toFixed(2) : '100.00',
        topActions: actionStats.map(s => ({ action: s.action, count: s._count.action })),
        topResources: resourceStats.map(s => ({ resourceType: s.resourceType, count: s._count.resourceType })),
        recentActivity,
      },
    });
  });
}