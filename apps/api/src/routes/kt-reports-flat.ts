import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { createAuditLogger } from '../services/audit-logger.js';

// The UI works with flat /kt-reports URLs; the real rules live in the project-scoped routes
// (/projects/:projectId/kt-reports). These routes find the project and call those routes internally,
// so permissions, notifications and audit logging stay in one place.

const isAdmin = (role: string) => role === 'SUPER_ADMIN' || role === 'ADMIN';

const day = (d: Date) => d.toISOString().slice(0, 10);

// Adds the display fields the pages use on top of the stored report
function shape(r: any, project?: { id: string; name: string } | null) {
  return {
    ...r,
    title: `KT report ${day(new Date(r.reportDate))}`,
    type: 'DAILY_KT',
    author: r.user ?? null,
    project: project ?? r.project ?? undefined,
  };
}

export async function ktReportFlatRoutes(app: FastifyInstance) {
  const auditLogger = createAuditLogger(app);

  async function forward(
    request: FastifyRequest,
    reply: any,
    method: 'GET' | 'POST' | 'PATCH',
    url: string,
    payload?: unknown
  ) {
    const res = await app.inject({
      method,
      url,
      payload: payload as any,
      headers: {
        ...(request.headers.authorization ? { authorization: request.headers.authorization } : {}),
        ...(request.headers.cookie ? { cookie: request.headers.cookie } : {}),
        ...(payload !== undefined ? { 'content-type': 'application/json' } : {}),
      },
    });
    return reply.code(res.statusCode).send(res.json());
  }

  const notFound = (reply: any) =>
    reply.code(404).send({ success: false, error: { code: 'NOT_FOUND', message: 'KT report not found' } });

  // List: admins see every report, everyone else only their own (same rule as the project routes)
  app.get('/', {
    schema: {
      querystring: z.object({
        page: z.coerce.number().int().positive().default(1),
        limit: z.coerce.number().int().positive().max(100).default(20),
        status: z.string().optional(),
        projectId: z.string().uuid().optional(),
        search: z.string().trim().max(200).optional(),
      }),
    },
  }, async (request, reply) => {
    const userId = request.userId!;
    const { page, limit, status, projectId, search } = request.query as {
      page: number; limit: number; status?: string; projectId?: string; search?: string;
    };

    const where: any = {};
    if (!isAdmin(request.user!.role)) where.userId = userId;
    if (status && status !== 'ALL') where.status = status;
    if (projectId) where.projectId = projectId;
    if (search) {
      where.OR = ['workCompleted', 'detailedWork', 'challenges', 'nextDayPlan'].map((f) => ({
        [f]: { contains: search, mode: 'insensitive' },
      }));
    }

    const [reports, total] = await Promise.all([
      app.prisma.dailyKTReport.findMany({
        where,
        orderBy: { reportDate: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
        include: {
          project: { select: { id: true, name: true } },
          user: { select: { id: true, fullName: true, email: true } },
        },
      }),
      app.prisma.dailyKTReport.count({ where }),
    ]);

    return reply.send({
      success: true,
      data: { items: reports.map((r) => shape(r)), total, page, limit, totalPages: Math.ceil(total / limit) },
    });
  });

  app.get('/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    const report = await app.prisma.dailyKTReport.findUnique({
      where: { id },
      select: { projectId: true, project: { select: { id: true, name: true } } },
    });
    if (!report) return notFound(reply);

    const res = await app.inject({
      method: 'GET',
      url: `/api/v1/projects/${report.projectId}/kt-reports/${id}`,
      headers: {
        ...(request.headers.authorization ? { authorization: request.headers.authorization } : {}),
        ...(request.headers.cookie ? { cookie: request.headers.cookie } : {}),
      },
    });
    const body = res.json();
    if (res.statusCode !== 200) return reply.code(res.statusCode).send(body);
    return reply.send({ success: true, data: shape(body.data, report.project) });
  });

  // Create or update today's (or a chosen date's) report for a project
  app.post('/', async (request, reply) => {
    const { projectId, ...rest } = (request.body ?? {}) as { projectId?: string };
    if (!projectId) {
      return reply.code(400).send({ success: false, error: { code: 'VALIDATION_ERROR', message: 'Choose a project' } });
    }
    return forward(request, reply, 'POST', `/api/v1/projects/${projectId}/kt-reports`, rest);
  });

  app.patch('/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    const report = await app.prisma.dailyKTReport.findUnique({ where: { id }, select: { projectId: true } });
    if (!report) return notFound(reply);
    return forward(request, reply, 'PATCH', `/api/v1/projects/${report.projectId}/kt-reports/${id}`, request.body ?? {});
  });

  app.post('/:id/approve', async (request, reply) => {
    const { id } = request.params as { id: string };
    const report = await app.prisma.dailyKTReport.findUnique({ where: { id }, select: { projectId: true } });
    if (!report) return notFound(reply);
    return forward(request, reply, 'POST', `/api/v1/projects/${report.projectId}/kt-reports/${id}/approve`, request.body ?? {});
  });

  // Only the author may delete a draft; admins may delete any report
  app.delete('/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    const userId = request.userId!;
    const report = await app.prisma.dailyKTReport.findUnique({ where: { id } });
    if (!report) return notFound(reply);

    const allowed = isAdmin(request.user!.role) || (report.userId === userId && report.status === 'DRAFT');
    if (!allowed) {
      return reply.code(403).send({ success: false, error: { code: 'FORBIDDEN', message: 'Only the author can delete a draft report' } });
    }
    await app.prisma.dailyKTReport.delete({ where: { id } });
    await auditLogger.logResource('DELETE', userId, 'kt_report', id, { reportDate: day(report.reportDate) }, request.ip, request.headers['user-agent']);
    return reply.send({ success: true, data: null });
  });
}
