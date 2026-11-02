import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { Prisma } from '@prisma/client';
import { createAuditLogger } from '../services/audit-logger.js';

export async function activityFeedRoutes(app: FastifyInstance) {
  const auditLogger = createAuditLogger(app);

  // List activity feed
  app.get('/', {
    schema: {
      querystring: z.object({
        page: z.coerce.number().int().positive().default(1),
        limit: z.coerce.number().int().positive().max(100).default(50),
        projectId: z.string().uuid().optional(),
        actorId: z.string().uuid().optional(),
        action: z.string().optional(),
        resourceType: z.string().optional(),
        startDate: z.string().datetime().optional(),
        endDate: z.string().datetime().optional(),
      }),
    },
  }, async (request, reply) => {
    const userId = request.userId!;
    const userRole = request.user!.role;
    const { page, limit, projectId, actorId, action, resourceType, startDate, endDate } = request.query as any;

    // Build where clause based on user's access
    const where: any = {};

    // SUPER_ADMIN sees all
    if (userRole !== 'SUPER_ADMIN') {
      // Get user's project memberships
      const memberships = await app.prisma.projectMember.findMany({
        where: { userId },
        select: { projectId: true },
      });
      const projectIds = memberships.map(m => m.projectId);

      if (projectId) {
        // Check if user has access to this project
        if (!projectIds.includes(projectId)) {
          return reply.code(403).send({ success: false, error: { code: 'FORBIDDEN', message: 'Access denied to this project' } });
        }
        where.projectId = projectId;
      } else {
        // Show activities from user's projects
        where.projectId = { in: projectIds };
      }
    } else if (projectId) {
      where.projectId = projectId;
    }

    if (actorId) where.actorId = actorId;
    if (action) where.action = action;
    if (resourceType) where.resourceType = resourceType;
    if (startDate || endDate) {
      where.createdAt = {};
      if (startDate) where.createdAt.gte = new Date(startDate);
      if (endDate) where.createdAt.lte = new Date(endDate);
    }

    const [activities, total] = await Promise.all([
      app.prisma.activityFeed.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
        include: {
          actor: { select: { id: true, fullName: true, email: true, role: true } },
          project: { select: { id: true, name: true } },
        },
      }),
      app.prisma.activityFeed.count({ where }),
    ]);

    return reply.send({
      success: true,
      data: { items: activities, total, page, limit, totalPages: Math.ceil(total / limit) },
    });
  });

  // Get activity feed for a specific resource
  app.get('/resource/:resourceType/:resourceId', {
    schema: {
      querystring: z.object({
        page: z.coerce.number().int().positive().default(1),
        limit: z.coerce.number().int().positive().max(100).default(50),
      }),
    },
  }, async (request, reply) => {
    const userId = request.userId!;
    const userRole = request.user!.role;
    const { resourceType, resourceId } = request.params as { resourceType: string; resourceId: string };
    const { page, limit } = request.query as any;

    // Check access based on resource type
    if (userRole !== 'SUPER_ADMIN') {
      let hasAccess = false;

      if (resourceType === 'project') {
        const membership = await app.prisma.projectMember.findUnique({
          where: { projectId_userId: { projectId: resourceId, userId } },
        });
        hasAccess = !!membership;
      } else if (resourceType === 'document') {
        const doc = await app.prisma.projectDocument.findUnique({
          where: { id: resourceId },
          select: { projectId: true },
        });
        if (doc) {
          const membership = await app.prisma.projectMember.findUnique({
            where: { projectId_userId: { projectId: doc.projectId, userId } },
          });
          hasAccess = !!membership;
        }
      } else if (resourceType === 'kt_report') {
        const report = await app.prisma.dailyKTReport.findUnique({
          where: { id: resourceId },
          select: { projectId: true },
        });
        if (report) {
          const membership = await app.prisma.projectMember.findUnique({
            where: { projectId_userId: { projectId: report.projectId, userId } },
          });
          hasAccess = !!membership;
        }
      } else if (resourceType === 'compliance') {
        const control = await app.prisma.complianceControl.findUnique({
          where: { id: resourceId },
          select: { projectId: true },
        });
        if (control?.projectId) {
          const membership = await app.prisma.projectMember.findUnique({
            where: { projectId_userId: { projectId: control.projectId, userId } },
          });
          hasAccess = !!membership;
        }
      }

      if (!hasAccess) {
        return reply.code(403).send({ success: false, error: { code: 'FORBIDDEN', message: 'Access denied' } });
      }
    }

    const [activities, total] = await Promise.all([
      app.prisma.activityFeed.findMany({
        where: { resourceType, resourceId },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
        include: {
          actor: { select: { id: true, fullName: true, email: true, role: true } },
          project: { select: { id: true, name: true } },
        },
      }),
      app.prisma.activityFeed.count({ where: { resourceType, resourceId } }),
    ]);

    return reply.send({
      success: true,
      data: { items: activities, total, page, limit, totalPages: Math.ceil(total / limit) },
    });
  });

  // Get user's recent activity
  app.get('/my-activity', {
    schema: {
      querystring: z.object({
        page: z.coerce.number().int().positive().default(1),
        limit: z.coerce.number().int().positive().max(100).default(20),
      }),
    },
  }, async (request, reply) => {
    const userId = request.userId!;
    const { page, limit } = request.query as any;

    const [activities, total] = await Promise.all([
      app.prisma.activityFeed.findMany({
        where: { actorId: userId },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
        include: {
          project: { select: { id: true, name: true } },
        },
      }),
      app.prisma.activityFeed.count({ where: { actorId: userId } }),
    ]);

    return reply.send({
      success: true,
      data: { items: activities, total, page, limit, totalPages: Math.ceil(total / limit) },
    });
  });

  // Get activity stats for dashboard
  app.get('/stats', async (request, reply) => {
    const userId = request.userId!;
    const userRole = request.user!.role;
    const { projectId } = request.query as { projectId?: string };

    let where: any = {};

    if (userRole !== 'SUPER_ADMIN') {
      const memberships = await app.prisma.projectMember.findMany({
        where: { userId },
        select: { projectId: true },
      });
      const projectIds = memberships.map(m => m.projectId);

      if (projectId) {
        if (!projectIds.includes(projectId)) {
          return reply.code(403).send({ success: false, error: { code: 'FORBIDDEN', message: 'Access denied' } });
        }
        where.projectId = projectId;
      } else {
        where.projectId = { in: projectIds };
      }
    } else if (projectId) {
      where.projectId = projectId;
    }

    // Get stats for last 7 days
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    where.createdAt = { gte: sevenDaysAgo };

    const [totalActivities, actionCounts, actorCounts, dailyCounts] = await Promise.all([
      app.prisma.activityFeed.count({ where }),
      app.prisma.activityFeed.groupBy({
        by: ['action'],
        where,
        _count: true,
      }),
      app.prisma.activityFeed.groupBy({
        by: ['actorId'],
        where,
        _count: true,
        take: 10,
        orderBy: { _count: { actorId: 'desc' } },
      }),
      // Use Prisma's typed query instead of raw SQL for type safety
      app.prisma.$queryRaw<{ date: Date; count: bigint }[]>`
        SELECT DATE("createdAt") as date, COUNT(*) as count
        FROM "activity_feed"
        WHERE "createdAt" >= ${sevenDaysAgo}
        ${where.projectId ? Prisma.sql`AND "projectId" = ${where.projectId}` : Prisma.empty}
        GROUP BY DATE("createdAt")
        ORDER BY date ASC
      `,
    ]);

    // Get top actors details
    const topActorIds = actorCounts.map(a => a.actorId);
    const topActors = await app.prisma.profile.findMany({
      where: { id: { in: topActorIds } },
      select: { id: true, fullName: true, email: true, role: true },
    });

    return reply.send({
      success: true,
      data: {
        totalActivities,
        actionCounts: actionCounts.map(a => ({ action: a.action, count: a._count })),
        topActors: actorCounts.map(a => ({
          ...topActors.find(u => u.id === a.actorId),
          count: a._count,
        })),
        dailyCounts: dailyCounts.map(d => ({ date: d.date, count: Number(d.count) })),
      },
    });
  });

  // Internal helper to log activity (used by other services)
  app.decorate('logActivity', async (input: {
    actorId: string;
    action: string;
    resourceType: string;
    resourceId?: string;
    projectId?: string;
    details?: Record<string, unknown>;
    ipAddress?: string;
    userAgent?: string;
  }) => {
    await app.prisma.activityFeed.create({
      data: {
        actorId: input.actorId,
        action: input.action,
        resourceType: input.resourceType,
        resourceId: input.resourceId,
        projectId: input.projectId,
        details: input.details as any,
        ipAddress: input.ipAddress,
        userAgent: input.userAgent,
      },
    });
  });
}