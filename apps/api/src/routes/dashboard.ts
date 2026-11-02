import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { createAuditLogger } from '../services/audit-logger.js';

const DashboardFiltersSchema = z.object({
  startDate: z.string().datetime().optional(),
  endDate: z.string().datetime().optional(),
  projectId: z.string().uuid().optional(),
  userId: z.string().uuid().optional(),
});

export async function dashboardRoutes(app: FastifyInstance) {
  const auditLogger = createAuditLogger(app);

  // Get dashboard metrics
  app.get('/metrics', {
    schema: {
      querystring: DashboardFiltersSchema,
    },
  }, async (request, reply) => {
    const userId = request.userId!;
    const userRole = request.user!.role;
    const { startDate, endDate, projectId } = request.query as z.infer<typeof DashboardFiltersSchema>;

    // Build base where clause for project access
    const projectWhere: any = {};
    if (userRole !== 'SUPER_ADMIN' && userRole !== 'ADMIN') {
      projectWhere.members = { some: { userId } };
    }
    if (projectId) projectWhere.id = projectId;

    // Date range
    const dateWhere: any = {};
    if (startDate) dateWhere.gte = new Date(startDate);
    if (endDate) dateWhere.lte = new Date(endDate);

    // Parallel queries for metrics
    const [
      totalProjects,
      ongoingProjects,
      completedProjects,
      notStartedProjects,
      onHoldProjects,
      overdueProjects,
      atRiskProjects,
      activeMembers,
      pendingKTReports,
      totalDocuments,
    ] = await Promise.all([
      app.prisma.project.count({ where: projectWhere }),
      app.prisma.project.count({ where: { ...projectWhere, status: 'ONGOING' } }),
      app.prisma.project.count({ where: { ...projectWhere, status: 'COMPLETED' } }),
      app.prisma.project.count({ where: { ...projectWhere, status: 'NOT_STARTED' } }),
      app.prisma.project.count({ where: { ...projectWhere, status: 'ON_HOLD' } }),
      app.prisma.project.count({ where: { ...projectWhere, status: 'OVERDUE' } }),
      app.prisma.project.count({ where: { ...projectWhere, status: 'AT_RISK' } }),
      app.prisma.projectMember.findMany({
        where: { project: projectWhere, user: { status: 'ACTIVE' } },
        distinct: ['userId'],
        select: { userId: true },
      }).then((rows) => rows.length),
      app.prisma.dailyKTReport.count({
        where: {
          status: 'DRAFT',
          project: projectWhere,
          userId: userRole === 'SUPER_ADMIN' || userRole === 'ADMIN' ? undefined : userId,
        },
      }),
      app.prisma.projectDocument.count({
        where: { project: projectWhere },
      }),
    ]);

    // Project status distribution
    const statusDistribution = await app.prisma.project.groupBy({
      by: ['status'],
      where: projectWhere,
      _count: { status: true },
    });

    // Project completion trends (last 30 days)
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const completionTrends = await app.prisma.project.groupBy({
      by: ['actualCompletionDate'],
      where: {
        ...projectWhere,
        actualCompletionDate: { gte: thirtyDaysAgo },
        status: 'COMPLETED',
      },
      _count: { id: true },
    });

    // Team workload
    const teamWorkload = await app.prisma.projectMember.groupBy({
      by: ['userId'],
      where: { project: projectWhere, user: { status: 'ACTIVE' } },
      _count: { userId: true },
    });

    const userIds = teamWorkload.map(w => w.userId);
    const users = await app.prisma.profile.findMany({
      where: { id: { in: userIds } },
      select: { id: true, fullName: true, email: true },
    });

    const workloadWithNames = teamWorkload.map(w => {
      const user = users.find(u => u.id === w.userId);
      return {
        userId: w.userId,
        userName: user?.fullName || 'Unknown',
        userEmail: user?.email || '',
        projectCount: w._count.userId,
      };
    });

    // KT submission rates (last 30 days)
    const ktSubmissions = await app.prisma.dailyKTReport.groupBy({
      by: ['reportDate'],
      where: {
        ...projectWhere,
        reportDate: { gte: thirtyDaysAgo },
      },
      _count: { id: true },
    });

    // Upcoming deadlines
    const upcomingDeadlines = await app.prisma.project.findMany({
      where: {
        ...projectWhere,
        expectedCompletionDate: { gte: new Date(), lte: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000) },
        status: { in: ['ONGOING', 'AT_RISK', 'NOT_STARTED'] },
      },
      orderBy: { expectedCompletionDate: 'asc' },
      take: 10,
      select: {
        id: true,
        name: true,
        expectedCompletionDate: true,
        priority: true,
        status: true,
        owner: { select: { fullName: true } },
      },
    });

    // Overdue projects
    const overdueProjectsList = await app.prisma.project.findMany({
      where: {
        ...projectWhere,
        expectedCompletionDate: { lt: new Date() },
        status: { in: ['ONGOING', 'AT_RISK', 'NOT_STARTED'] },
      },
      orderBy: { expectedCompletionDate: 'asc' },
      take: 10,
      select: {
        id: true,
        name: true,
        expectedCompletionDate: true,
        priority: true,
        status: true,
        owner: { select: { fullName: true } },
      },
    });

    // Recent activity (audit logs)
    const recentActivity = await app.prisma.auditLog.findMany({
      where: {
        resourceType: { in: ['project', 'task', 'document', 'kt_report'] },
        ...(userRole !== 'SUPER_ADMIN' && userRole !== 'ADMIN' ? {
          OR: [
            { actorId: userId },
            { resourceType: 'project', resourceId: { in: (await app.prisma.projectMember.findMany({ where: { userId }, select: { projectId: true } })).map(m => m.projectId) } },
          ],
        } : {}),
      },
      orderBy: { createdAt: 'desc' },
      take: 20,
      select: {
        id: true,
        action: true,
        resourceType: true,
        resourceId: true,
        createdAt: true,
        actor: { select: { fullName: true } },
      },
    });

    // Recently uploaded documents
    const recentDocuments = await app.prisma.projectDocument.findMany({
      where: { project: projectWhere },
      orderBy: { createdAt: 'desc' },
      take: 10,
      select: {
        id: true,
        name: true,
        originalName: true,
        category: true,
        size: true,
        createdAt: true,
        uploader: { select: { fullName: true } },
        project: { select: { name: true } },
      },
    });

    return reply.send({
      success: true,
      data: {
        metrics: {
          totalProjects,
          ongoingProjects,
          completedProjects,
          notStartedProjects,
          onHoldProjects,
          overdueProjects,
          atRiskProjects,
          activeMembers,
          pendingKTReports,
          totalDocuments,
        },
        charts: {
          statusDistribution: statusDistribution.map(s => ({ status: s.status, count: s._count.status })),
          completionTrends: completionTrends.map(t => ({ date: t.actualCompletionDate, count: t._count.id })),
          teamWorkload: workloadWithNames,
          ktSubmissionRates: ktSubmissions.map(k => ({ date: k.reportDate, count: k._count.id })),
        },
        alerts: {
          upcomingDeadlines,
          overdueProjects: overdueProjectsList,
        },
        recentActivity,
        recentDocuments,
      },
    });
  });

  // Get project list for dashboard table
  app.get('/projects', {
    schema: {
      querystring: z.object({
        page: z.coerce.number().int().positive().default(1),
        limit: z.coerce.number().int().positive().max(100).default(20),
        search: z.string().optional(),
        status: z.string().optional(),
        priority: z.string().optional(),
        ownerId: z.string().uuid().optional(),
        memberId: z.string().uuid().optional(),
        sortBy: z.string().optional(),
        sortOrder: z.enum(['asc', 'desc']).default('desc'),
      }),
    },
  }, async (request, reply) => {
    const userId = request.userId!;
    const userRole = request.user!.role;
    const { page, limit, search, status, priority, ownerId, memberId, sortBy, sortOrder } = request.query as any;

    const projectWhere: any = {};
    if (userRole !== 'SUPER_ADMIN' && userRole !== 'ADMIN') {
      projectWhere.members = { some: { userId } };
    }
    if (search) {
      projectWhere.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { description: { contains: search, mode: 'insensitive' } },
      ];
    }
    if (status) projectWhere.status = status;
    if (priority) projectWhere.priority = priority;
    if (ownerId) projectWhere.ownerId = ownerId;
    if (memberId) projectWhere.members = { some: { userId: memberId } };

    const [projects, total] = await Promise.all([
      app.prisma.project.findMany({
        where: projectWhere,
        orderBy: sortBy ? { [sortBy]: sortOrder } : { updatedAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
        select: {
          id: true,
          name: true,
          description: true,
          category: true,
          priority: true,
          status: true,
          progress: true,
          startDate: true,
          expectedCompletionDate: true,
          actualCompletionDate: true,
          createdAt: true,
          updatedAt: true,
          creator: { select: { id: true, fullName: true } },
          owner: { select: { id: true, fullName: true } },
          members: {
            select: { userId: true, role: true, user: { select: { fullName: true, email: true } } },
          },
          _count: { select: { tasks: true, documents: true, ktReports: true } },
        },
      }),
      app.prisma.project.count({ where: projectWhere }),
    ]);

    const projectsWithMembers = projects.map(p => ({
      ...p,
      assignedMembers: p.members.map(m => ({
        userId: m.userId,
        role: m.role,
        fullName: m.user.fullName,
        email: m.user.email,
      })),
      memberCount: p.members.length,
      taskCount: p._count.tasks,
      documentCount: p._count.documents,
      ktReportCount: p._count.ktReports,
    }));

    return reply.send({
      success: true,
      data: {
        items: projectsWithMembers,
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    });
  });
}