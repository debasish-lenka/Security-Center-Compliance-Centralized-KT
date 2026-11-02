import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { createAuditLogger } from '../services/audit-logger.js';
import { createNotificationService } from '../services/notifications.js';

const CreateKTReportSchema = z.object({
  reportDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  workCompleted: z.string().optional().nullable(),
  detailedWork: z.string().optional().nullable(),
  completedTasks: z.string().optional().nullable(),
  pendingTasks: z.string().optional().nullable(),
  challenges: z.string().optional().nullable(),
  nextDayPlan: z.string().optional().nullable(),
  status: z.enum(['DRAFT', 'SUBMITTED']).default('DRAFT'),
});

const UpdateKTReportSchema = z.object({
  workCompleted: z.string().optional().nullable(),
  detailedWork: z.string().optional().nullable(),
  completedTasks: z.string().optional().nullable(),
  pendingTasks: z.string().optional().nullable(),
  challenges: z.string().optional().nullable(),
  nextDayPlan: z.string().optional().nullable(),
  status: z.enum(['DRAFT', 'SUBMITTED']).optional(),
});

async function checkProjectAccess(app: FastifyInstance, userId: string, userRole: string, projectId: string) {
  if (userRole === 'SUPER_ADMIN') return true;
  const membership = await app.prisma.projectMember.findUnique({
    where: { projectId_userId: { projectId, userId } },
  });
  return !!membership;
}

export async function ktReportRoutes(app: FastifyInstance) {
  const auditLogger = createAuditLogger(app);

  // List KT reports for a project
  app.get('/:projectId/kt-reports', {
    schema: {
      querystring: z.object({
        page: z.coerce.number().int().positive().default(1),
        limit: z.coerce.number().int().positive().max(100).default(20),
        userId: z.string().uuid().optional(),
        status: z.string().optional(),
        startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
        endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
      }),
    },
  }, async (request, reply) => {
    const userId = request.userId!;
    const userRole = request.user!.role;
    const { projectId } = request.params as { projectId: string };
    const { page, limit, userId: filterUserId, status, startDate, endDate } = request.query as any;

    const hasAccess = await checkProjectAccess(app, userId, userRole, projectId);
    if (!hasAccess) {
      return reply.code(403).send({ success: false, error: { code: 'FORBIDDEN', message: 'Access denied' } });
    }

    const where: any = { projectId };
    if (userRole !== 'SUPER_ADMIN' && userRole !== 'ADMIN') {
      where.userId = userId; // Users can only see their own reports
    } else if (filterUserId) {
      where.userId = filterUserId;
    }
    if (status) where.status = status;
    if (startDate) where.reportDate = { ...where.reportDate, gte: new Date(startDate) };
    if (endDate) where.reportDate = { ...where.reportDate, lte: new Date(endDate) };

    const [reports, total] = await Promise.all([
      app.prisma.dailyKTReport.findMany({
        where,
        orderBy: { reportDate: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
        select: {
          id: true,
          projectId: true,
          userId: true,
          reportDate: true,
          workCompleted: true,
          detailedWork: true,
          completedTasks: true,
          pendingTasks: true,
          challenges: true,
          nextDayPlan: true,
          status: true,
          submittedAt: true,
          approvedAt: true,
          approvedById: true,
          createdAt: true,
          updatedAt: true,
          user: { select: { fullName: true, email: true } },
          approver: { select: { fullName: true } },
          documents: { select: { id: true, name: true, originalName: true } },
        },
      }),
      app.prisma.dailyKTReport.count({ where }),
    ]);

    return reply.send({
      success: true,
      data: { items: reports, total, page, limit, totalPages: Math.ceil(total / limit) },
    });
  });

  // Get single KT report
  app.get('/:projectId/kt-reports/:reportId', async (request, reply) => {
    const userId = request.userId!;
    const userRole = request.user!.role;
    const { projectId, reportId } = request.params as { projectId: string; reportId: string };

    const hasAccess = await checkProjectAccess(app, userId, userRole, projectId);
    if (!hasAccess) {
      return reply.code(403).send({ success: false, error: { code: 'FORBIDDEN', message: 'Access denied' } });
    }

    const report = await app.prisma.dailyKTReport.findFirst({
      where: { id: reportId, projectId },
      select: {
        id: true,
        projectId: true,
        userId: true,
        reportDate: true,
        workCompleted: true,
        detailedWork: true,
        completedTasks: true,
        pendingTasks: true,
        challenges: true,
        nextDayPlan: true,
        status: true,
        submittedAt: true,
        approvedAt: true,
        approvedById: true,
        createdAt: true,
        updatedAt: true,
        user: { select: { id: true, fullName: true, email: true } },
        approver: { select: { fullName: true } },
        documents: { select: { id: true, name: true, originalName: true, category: true, size: true, createdAt: true } },
      },
    });

    if (!report) {
      return reply.code(404).send({ success: false, error: { code: 'NOT_FOUND', message: 'KT report not found' } });
    }

    // Check if user can view this report
    if (userRole !== 'SUPER_ADMIN' && userRole !== 'ADMIN' && report.userId !== userId) {
      return reply.code(403).send({ success: false, error: { code: 'FORBIDDEN', message: 'Access denied' } });
    }

    return reply.send({ success: true, data: report });
  });

  // Create or update KT report (upsert by user+project+date)
  app.post('/:projectId/kt-reports', {
    schema: { body: CreateKTReportSchema },
  }, async (request, reply) => {
    const userId = request.userId!;
    const userRole = request.user!.role;
    const { projectId } = request.params as { projectId: string };
    const data = request.body as z.infer<typeof CreateKTReportSchema>;

    const hasAccess = await checkProjectAccess(app, userId, userRole, projectId);
    if (!hasAccess) {
      return reply.code(403).send({ success: false, error: { code: 'FORBIDDEN', message: 'Access denied' } });
    }

    const reportDate = new Date(data.reportDate);
    const submittedAt = data.status === 'SUBMITTED' ? new Date() : null;

    const report = await app.prisma.dailyKTReport.upsert({
      where: { projectId_userId_reportDate: { projectId, userId, reportDate } },
      update: {
        workCompleted: data.workCompleted,
        detailedWork: data.detailedWork,
        completedTasks: data.completedTasks,
        pendingTasks: data.pendingTasks,
        challenges: data.challenges,
        nextDayPlan: data.nextDayPlan,
        status: data.status,
        submittedAt,
      },
      create: {
        projectId,
        userId,
        reportDate,
        workCompleted: data.workCompleted,
        detailedWork: data.detailedWork,
        completedTasks: data.completedTasks,
        pendingTasks: data.pendingTasks,
        challenges: data.challenges,
        nextDayPlan: data.nextDayPlan,
        status: data.status,
        submittedAt,
      },
    });

    await auditLogger.logResource(data.status === 'SUBMITTED' ? 'CREATE' : 'UPDATE', userId, 'kt_report', report.id, { status: data.status }, request.ip, request.headers['user-agent']);

    // Notify project leads/admins if submitted
    if (data.status === 'SUBMITTED') {
      const notificationService = createNotificationService(app);
      const members = await app.prisma.projectMember.findMany({
        where: { projectId, role: { in: ['OWNER', 'LEAD'] } },
        select: { userId: true },
      });
      for (const member of members) {
        if (member.userId !== userId) {
          await notificationService.create({
            userId: member.userId,
            type: 'COMMENT_ADDED',
            title: 'KT Report Submitted',
            message: `A KT report for project has been submitted by ${request.user!.fullName}`,
            resourceType: 'kt_report',
            resourceId: report.id,
          });
        }
      }
    }

    return reply.code(201).send({ success: true, data: report });
  });

  // Update KT report
  app.patch('/:projectId/kt-reports/:reportId', {
    schema: { body: UpdateKTReportSchema },
  }, async (request, reply) => {
    const userId = request.userId!;
    const userRole = request.user!.role;
    const { projectId, reportId } = request.params as { projectId: string; reportId: string };
    const data = request.body as z.infer<typeof UpdateKTReportSchema>;

    const hasAccess = await checkProjectAccess(app, userId, userRole, projectId);
    if (!hasAccess) {
      return reply.code(403).send({ success: false, error: { code: 'FORBIDDEN', message: 'Access denied' } });
    }

    const existing = await app.prisma.dailyKTReport.findFirst({ where: { id: reportId, projectId } });
    if (!existing) {
      return reply.code(404).send({ success: false, error: { code: 'NOT_FOUND', message: 'KT report not found' } });
    }

    // Only author or admin can update
    if (userRole !== 'SUPER_ADMIN' && userRole !== 'ADMIN' && existing.userId !== userId) {
      return reply.code(403).send({ success: false, error: { code: 'FORBIDDEN', message: 'Access denied' } });
    }

    const updateData: any = { ...data };
    if (data.status === 'SUBMITTED' && existing.status !== 'SUBMITTED') {
      updateData.submittedAt = new Date();
    }

    const report = await app.prisma.dailyKTReport.update({
      where: { id: reportId },
      data: updateData,
    });

    await auditLogger.logResource('UPDATE', userId, 'kt_report', reportId, data, request.ip, request.headers['user-agent']);

    return reply.send({ success: true, data: report });
  });

  // Approve/reject KT report (admin only)
  app.post('/:projectId/kt-reports/:reportId/approve', async (request, reply) => {
    const userId = request.userId!;
    const userRole = request.user!.role;
    const { projectId, reportId } = request.params as { projectId: string; reportId: string };
    const { action } = request.body as { action: 'APPROVE' | 'REJECT' };

    if (userRole !== 'SUPER_ADMIN' && userRole !== 'ADMIN') {
      return reply.code(403).send({ success: false, error: { code: 'FORBIDDEN', message: 'Admin access required' } });
    }

    const report = await app.prisma.dailyKTReport.findFirst({ where: { id: reportId, projectId } });
    if (!report) {
      return reply.code(404).send({ success: false, error: { code: 'NOT_FOUND', message: 'KT report not found' } });
    }

    const updateData = {
      status: action === 'APPROVE' ? ('APPROVED' as const) : ('REJECTED' as const),
      approvedAt: new Date(),
      approvedById: userId,
    };

    const updated = await app.prisma.dailyKTReport.update({
      where: { id: reportId },
      data: updateData,
    });

    await auditLogger.logResource(action, userId, 'kt_report', reportId, { action }, request.ip, request.headers['user-agent']);

    // Notify report author
    const notificationService = createNotificationService(app);
    await notificationService.create({
      userId: report.userId,
      type: 'COMMENT_ADDED',
      title: `KT Report ${action === 'APPROVE' ? 'Approved' : 'Rejected'}`,
      message: `Your KT report for ${report.reportDate.toISOString().split('T')[0]} has been ${action.toLowerCase()}`,
      resourceType: 'kt_report',
      resourceId: reportId,
    });

    return reply.send({ success: true, data: updated });
  });

  // Get missing KT reports (for admin dashboard)
  app.get('/:projectId/kt-reports/missing', async (request, reply) => {
    const userId = request.userId!;
    const userRole = request.user!.role;
    const { projectId } = request.params as { projectId: string };

    if (userRole !== 'SUPER_ADMIN' && userRole !== 'ADMIN') {
      return reply.code(403).send({ success: false, error: { code: 'FORBIDDEN', message: 'Admin access required' } });
    }

    const project = await app.prisma.project.findUnique({ where: { id: projectId } });
    if (!project) {
      return reply.code(404).send({ success: false, error: { code: 'NOT_FOUND', message: 'Project not found' } });
    }

    const members = await app.prisma.projectMember.findMany({
      where: { projectId },
      select: { userId: true },
    });

    const startDate = project.startDate || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const endDate = new Date();

    // Get working days (exclude weekends)
    const workingDays: Date[] = [];
    const current = new Date(startDate);
    while (current <= endDate) {
      if (current.getDay() !== 0 && current.getDay() !== 6) {
        workingDays.push(new Date(current));
      }
      current.setDate(current.getDate() + 1);
    }

    const existingReports = await app.prisma.dailyKTReport.findMany({
      where: {
        projectId,
        reportDate: { in: workingDays },
      },
      select: { userId: true, reportDate: true },
    });

    const reportMap = new Map<string, Set<string>>();
    for (const r of existingReports) {
      const key = r.userId;
      if (!reportMap.has(key)) reportMap.set(key, new Set());
      reportMap.get(key)!.add(r.reportDate.toISOString().split('T')[0]);
    }

    const missing = [];
    for (const member of members) {
      const userReports = reportMap.get(member.userId) || new Set();
      for (const day of workingDays) {
        const dayStr = day.toISOString().split('T')[0];
        if (!userReports.has(dayStr)) {
          missing.push({ userId: member.userId, date: dayStr });
        }
      }
    }

    return reply.send({ success: true, data: missing });
  });
}