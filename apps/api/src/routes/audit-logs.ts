import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { createAuditLogger } from '../services/audit-logger.js';

const csvCell = (v: unknown) => {
  let t = v == null ? '' : typeof v === 'object' ? JSON.stringify(v) : String(v);
  // a cell starting with = + - @ would run as a formula when the CSV is opened in Excel
  if (/^[=+\-@\t\r]/.test(t)) t = `'${t}`;
  return `"${t.replace(/"/g, '""')}"`;
};

const FilterSchema = z.object({
  action: z.string().optional(),
  resourceType: z.string().optional(),
  resourceId: z.string().optional(),
  actorId: z.string().uuid().optional(),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
  outcome: z.enum(['SUCCESS', 'FAILURE']).optional(),
  search: z.string().trim().max(200).optional(),
});

function buildWhere(q: z.infer<typeof FilterSchema>) {
  const where: any = {};
  if (q.action) where.action = q.action;
  if (q.resourceType) where.resourceType = q.resourceType;
  if (q.resourceId) where.resourceId = q.resourceId;
  if (q.actorId) where.actorId = q.actorId;
  if (q.outcome) where.outcome = q.outcome;
  const from = q.startDate ? new Date(q.startDate) : null;
  const to = q.endDate ? new Date(q.endDate) : null;
  if (from && !isNaN(+from)) where.createdAt = { ...where.createdAt, gte: from };
  if (to && !isNaN(+to)) {
    // a plain date means "through the end of that day"
    if (/^\d{4}-\d{2}-\d{2}$/.test(q.endDate!)) to.setUTCHours(23, 59, 59, 999);
    where.createdAt = { ...where.createdAt, lte: to };
  }
  if (q.search) {
    where.OR = [
      { resourceType: { contains: q.search, mode: 'insensitive' } },
      { resourceId: { contains: q.search, mode: 'insensitive' } },
      { ipAddress: { contains: q.search, mode: 'insensitive' } },
      { actor: { fullName: { contains: q.search, mode: 'insensitive' } } },
      { actor: { email: { contains: q.search, mode: 'insensitive' } } },
    ];
  }
  return where;
}

const SORTABLE = ['createdAt', 'action', 'resourceType', 'outcome'] as const;

export async function auditLogRoutes(app: FastifyInstance) {
  const auditLogger = createAuditLogger(app);
  const adminOnly = [app.authenticate, app.requireRole(['SUPER_ADMIN', 'ADMIN'])];

  // List audit logs (admin only)
  app.get('/', {
    schema: {
      querystring: FilterSchema.extend({
        page: z.coerce.number().int().positive().default(1),
        limit: z.coerce.number().int().positive().max(100).default(50),
        sortBy: z.enum(SORTABLE).default('createdAt'),
        sortOrder: z.enum(['asc', 'desc']).default('desc'),
      }),
    },
    preHandler: adminOnly,
  }, async (request, reply) => {
    const q = request.query as z.infer<typeof FilterSchema> & { page: number; limit: number; sortBy: (typeof SORTABLE)[number]; sortOrder: 'asc' | 'desc' };
    const { page, limit, sortBy, sortOrder } = q;
    const where = buildWhere(q);

    const [logs, total] = await Promise.all([
      app.prisma.auditLog.findMany({
        where,
        orderBy: [{ [sortBy]: sortOrder }, { id: 'asc' }],
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

  // Values for the filter drop-downs: only what actually exists in the log
  app.get('/actions', { preHandler: adminOnly }, async (_request, reply) => {
    const rows = await app.prisma.auditLog.groupBy({ by: ['action'], _count: { action: true }, orderBy: { action: 'asc' } });
    return reply.send({ success: true, data: rows.map((r) => r.action) });
  });

  app.get('/resource-types', { preHandler: adminOnly }, async (_request, reply) => {
    const rows = await app.prisma.auditLog.groupBy({ by: ['resourceType'], _count: { resourceType: true }, orderBy: { resourceType: 'asc' } });
    return reply.send({ success: true, data: rows.map((r) => r.resourceType) });
  });

  // CSV download of the current filter (the export itself is written to the log)
  app.get('/export', {
    schema: { querystring: FilterSchema },
    preHandler: adminOnly,
  }, async (request, reply) => {
    const q = request.query as z.infer<typeof FilterSchema>;
    const logs = await app.prisma.auditLog.findMany({
      where: buildWhere(q),
      orderBy: { createdAt: 'desc' },
      take: 10000,
      include: { actor: { select: { fullName: true, email: true } } },
    });

    const header = ['Time (UTC)', 'Actor', 'Email', 'Action', 'Resource type', 'Resource id', 'Outcome', 'IP address', 'Details', 'Error'];
    const lines = [header.map(csvCell).join(',')];
    for (const l of logs) {
      lines.push([l.createdAt.toISOString(), l.actor?.fullName ?? 'System', l.actor?.email ?? '', l.action, l.resourceType, l.resourceId ?? '', l.outcome, l.ipAddress ?? '', l.details ?? '', l.errorMessage ?? ''].map(csvCell).join(','));
    }

    await auditLogger.logResource('EXPORT', request.userId!, 'audit_log', 'export', { rows: logs.length, filters: q }, request.ip, request.headers['user-agent']);
    reply.header('Content-Type', 'text/csv; charset=utf-8');
    reply.header('Content-Disposition', `attachment; filename="audit-logs-${new Date().toISOString().slice(0, 10)}.csv"`);
    reply.header('Cache-Control', 'no-store');
    return reply.send('\uFEFF' + lines.join('\r\n'));
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