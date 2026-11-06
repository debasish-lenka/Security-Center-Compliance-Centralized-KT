import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { createAuditLogger } from '../services/audit-logger.js';
import { formatWhen } from '../services/watermark.js';
import { AuditAction } from '@prisma/client';
import { resolveLinks } from '../services/deeplinks.js';

const csvCell = (v: unknown) => {
  let t = v == null ? '' : typeof v === 'object' ? JSON.stringify(v) : String(v);
  // a cell starting with = + - @ would run as a formula when the CSV is opened in Excel
  if (/^[=+\-@\t\r]/.test(t)) t = `'${t}`;
  return `"${t.replace(/"/g, '""')}"`;
};

// Every filter can be combined with the others. action, resourceType, outcome and actorId take several values, separated by commas
// (action=CREATE,UPDATE). actorId may also contain the word "system" for entries that have no person.
const FilterSchema = z.object({
  action: z.string().max(400).optional(),
  resourceType: z.string().max(600).optional(),
  resourceId: z.string().trim().max(200).optional(),
  actorId: z.string().max(800).optional(),
  ip: z.string().trim().max(80).optional(),
  startDate: z.string().max(40).optional(),
  endDate: z.string().max(40).optional(),
  outcome: z.string().max(40).optional(),
  search: z.string().trim().max(200).optional(),
});

const list = (v?: string) => (v ?? '').split(',').map((x) => x.trim()).filter(Boolean).slice(0, 50);
const ACTIONS = new Set<string>(Object.values(AuditAction));
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// the people of this system work in India: a date means that day in IST, and a date-time without a zone is IST too
function parseWhen(v: string | undefined, end: boolean): Date | null {
  if (!v) return null;
  let t = v.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(t)) t = `${t}T${end ? '23:59:59.999' : '00:00:00.000'}+05:30`;
  else if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?$/.test(t)) t = `${t}+05:30`;
  const d = new Date(t);
  return isNaN(+d) ? null : d;
}

async function buildWhere(prisma: FastifyInstance['prisma'], q: z.infer<typeof FilterSchema>) {
  const and: any[] = [];
  const actions = list(q.action).filter((a) => ACTIONS.has(a));
  if (q.action && actions.length === 0) and.push({ id: '__none__' }); // asked for an action that does not exist: no rows
  if (actions.length) and.push({ action: { in: actions } });
  const types = list(q.resourceType);
  if (types.length) and.push({ resourceType: { in: types } });
  if (q.resourceId) and.push({ resourceId: q.resourceId });
  const outcomes = list(q.outcome).filter((o) => o === 'SUCCESS' || o === 'FAILURE');
  if (outcomes.length === 1) and.push({ outcome: outcomes[0] });
  const actors = list(q.actorId);
  if (actors.length) {
    const ids = actors.filter((a) => UUID.test(a));
    const orClauses: any[] = [];
    if (ids.length) orClauses.push({ actorId: { in: ids } });
    if (actors.includes('system')) orClauses.push({ actorId: null });
    and.push(orClauses.length ? { OR: orClauses } : { id: '__none__' });
  }
  if (q.ip) and.push({ ipAddress: { contains: q.ip, mode: 'insensitive' } });
  const from = parseWhen(q.startDate, false);
  const to = parseWhen(q.endDate, true);
  if (from) and.push({ createdAt: { gte: from } });
  if (to) and.push({ createdAt: { lte: to } });
  if (q.search) {
    const t = q.search;
    const like = `%${t.replace(/[\%_]/g, (c) => `\${c}`)}%`;
    const inDetails = (await prisma.$queryRaw<{ id: string }[]>`SELECT id FROM audit_logs WHERE details::text ILIKE ${like} LIMIT 5000`).map((r) => r.id);
    and.push({
      OR: [
        { resourceType: { contains: t, mode: 'insensitive' } },
        { resourceId: { contains: t, mode: 'insensitive' } },
        { ipAddress: { contains: t, mode: 'insensitive' } },
        { errorMessage: { contains: t, mode: 'insensitive' } },
        { actor: { fullName: { contains: t, mode: 'insensitive' } } },
        { actor: { email: { contains: t, mode: 'insensitive' } } },
        // anything written in the details (the name of the task, document or person, a reason, ...), whatever the capital letters
        ...(inDetails.length ? [{ id: { in: inDetails } }] : []),
      ],
    });
  }
  return and.length ? { AND: and } : {};
}

const detailName = (details: unknown): string => {
  const d = (details ?? {}) as Record<string, unknown>;
  const v = d.name ?? d.title ?? d.email;
  return typeof v === 'string' ? v : '';
};

const SORTABLE = ['createdAt', 'action', 'resourceType', 'resourceId', 'outcome', 'ipAddress'] as const;

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
    const where = await buildWhere(app.prisma, q);

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

    const links = await resolveLinks(app.prisma, logs.map((l) => ({ type: l.resourceType, id: l.resourceId })));
    const items = logs.map((l) => ({ ...l, itemName: detailName(l.details), link: links.link(l.resourceType, l.resourceId) }));

    return reply.send({
      success: true,
      data: { items, total, page, limit, totalPages: Math.ceil(total / limit) },
    });
  });

  // Numbers for the filter that is set now: how many, how many failed, who, what, and per day (IST)
  app.get('/summary', { schema: { querystring: FilterSchema }, preHandler: adminOnly }, async (request, reply) => {
    const where = await buildWhere(app.prisma, request.query as z.infer<typeof FilterSchema>);
    const [total, failed, byAction, byResource, byActor, times] = await Promise.all([
      app.prisma.auditLog.count({ where }),
      app.prisma.auditLog.count({ where: { AND: [where, { outcome: 'FAILURE' }] } }),
      app.prisma.auditLog.groupBy({ by: ['action'], where, _count: { _all: true }, orderBy: { _count: { action: 'desc' } }, take: 8 }),
      app.prisma.auditLog.groupBy({ by: ['resourceType'], where, _count: { _all: true }, orderBy: { _count: { resourceType: 'desc' } }, take: 8 }),
      app.prisma.auditLog.groupBy({ by: ['actorId'], where, _count: { _all: true } }),
      app.prisma.auditLog.findMany({ where, orderBy: { createdAt: 'desc' }, take: 20000, select: { createdAt: true, outcome: true } }),
    ]);
    const day = (d: Date) => new Date(d.getTime() + 5.5 * 3600_000).toISOString().slice(0, 10);
    const perDay = new Map<string, { date: string; count: number; failed: number }>();
    for (const t of times) {
      const k = day(t.createdAt);
      const row = perDay.get(k) ?? { date: k, count: 0, failed: 0 };
      row.count++; if (t.outcome === 'FAILURE') row.failed++;
      perDay.set(k, row);
    }
    return reply.send({
      success: true,
      data: {
        total, failed, succeeded: total - failed,
        people: byActor.filter((a) => a.actorId).length,
        systemEvents: byActor.find((a) => !a.actorId)?._count._all ?? 0,
        byAction: byAction.map((r) => ({ value: r.action, count: r._count._all })),
        byResource: byResource.map((r) => ({ value: r.resourceType, count: r._count._all })),
        perDay: [...perDay.values()].sort((a, b) => a.date.localeCompare(b.date)).slice(-31),
      },
    });
  });

  // Who appears in the log (for the "person" filter), with how many entries each
  app.get('/actors', { preHandler: adminOnly }, async (_request, reply) => {
    const rows = await app.prisma.auditLog.groupBy({ by: ['actorId'], _count: { _all: true } });
    const ids = rows.filter((r) => r.actorId).map((r) => r.actorId!);
    const people = ids.length ? await app.prisma.profile.findMany({ where: { id: { in: ids } }, select: { id: true, fullName: true, email: true } }) : [];
    const out = rows.map((r) => {
      const p = people.find((x) => x.id === r.actorId);
      return { value: r.actorId ?? 'system', label: r.actorId ? (p ? p.fullName : 'Deleted user') : 'System (no person)', email: p?.email ?? '', count: r._count._all };
    }).sort((a, b) => b.count - a.count);
    return reply.send({ success: true, data: out });
  });

  // Choices for the action and resource filters, with counts
  app.get('/facets', { preHandler: adminOnly }, async (_request, reply) => {
    const [a, r] = await Promise.all([
      app.prisma.auditLog.groupBy({ by: ['action'], _count: { _all: true }, orderBy: { action: 'asc' } }),
      app.prisma.auditLog.groupBy({ by: ['resourceType'], _count: { _all: true }, orderBy: { resourceType: 'asc' } }),
    ]);
    return reply.send({ success: true, data: { actions: a.map((x) => ({ value: x.action, count: x._count._all })), resourceTypes: r.map((x) => ({ value: x.resourceType, count: x._count._all })) } });
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
      where: await buildWhere(app.prisma, q),
      orderBy: { createdAt: 'desc' },
      take: 10000,
      include: { actor: { select: { fullName: true, email: true } } },
    });

    const header = ['Time (IST)', 'Actor', 'Email', 'Action', 'Resource type', 'Resource id', 'Outcome', 'IP address', 'Details', 'Error'];
    const lines = [header.map(csvCell).join(',')];
    for (const l of logs) {
      lines.push([formatWhen(l.createdAt), l.actor?.fullName ?? 'System', l.actor?.email ?? '', l.action, l.resourceType, l.resourceId ?? '', l.outcome, l.ipAddress ?? '', l.details ?? '', l.errorMessage ?? ''].map(csvCell).join(','));
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