import type { FastifyInstance } from 'fastify';
import type { Prisma, ProjectStatus } from '@prisma/client';
import { resolveLinks } from '../services/deeplinks.js';
import { z } from 'zod';
import { TEAM_ROLES, latestUpdates, startInfo } from '../services/project-progress.js';

// Roles that see the executive dashboard. Managers only see the projects they belong to.
const LEADERSHIP = ['SUPER_ADMIN', 'ADMIN', 'SECURITY_ADMIN', 'COMPLIANCE_OFFICER', 'MANAGER'];

// 0-100 health per project, from its status and progress (there is no stored health score)
function projectHealth(p: { status: ProjectStatus; progress: number }): number {
  switch (p.status) {
    case 'COMPLETED': return 100;
    case 'ONGOING': return Math.min(100, Math.round(60 + p.progress * 0.4));
    case 'NOT_STARTED': return 70;
    case 'ON_HOLD': return 55;
    case 'AT_RISK': return 45;
    case 'OVERDUE': return 30;
  }
}

const pct = (part: number, whole: number) => (whole > 0 ? Math.round((part / whole) * 100) : 0);

const ACTION_LABELS: Record<string, string> = {
  CREATE: 'Created', UPDATE: 'Updated', DELETE: 'Deleted', APPROVE: 'Approved', REJECT: 'Rejected',
  UPLOAD: 'Uploaded', DOWNLOAD: 'Downloaded', ASSIGN: 'Assigned', UNASSIGN: 'Unassigned',
  SHARE: 'Shared', EXPORT: 'Exported', SUBMIT_REVIEW: 'Submitted for review', ROLLBACK_VERSION: 'Rolled back',
  GENERATE_KB: 'Generated', TRANSFER_OWNERSHIP: 'Transferred', BULK_ASSIGN: 'Assigned',
};
// Sign-ins and views would drown out the useful entries
const NOISE = ['LOGIN', 'LOGOUT', 'VIEW', 'CONFIG_CHANGE'];

const resourceLabel = (t: string) =>
  t.split('_').map((w) => (w.length <= 2 ? w.toUpperCase() : w[0].toUpperCase() + w.slice(1))).join(' ');

const detailName = (details: unknown): string => {
  const d = (details ?? {}) as Record<string, unknown>;
  const v = d.name ?? d.title ?? d.email;
  return typeof v === 'string' ? v : '';
};

export async function overviewRoutes(app: FastifyInstance) {
  // ---------- Executive dashboard ----------
  app.get('/executive/dashboard/metrics', {
    preHandler: [app.authenticate, app.requireRole(LEADERSHIP)],
  }, async (request, reply) => {
    const userId = request.userId!;
    const orgWide = request.user!.role !== 'MANAGER';

    const projectWhere: Prisma.ProjectWhereInput = orgWide ? {} : { members: { some: { userId } } };
    const controlWhere: Prisma.ComplianceControlWhereInput = orgWide ? {} : { OR: [{ projectId: null }, { project: projectWhere }] };

    const [projects, controls, tasks, pendingKt, activeUsers, audit] = await Promise.all([
      app.prisma.project.findMany({
        where: projectWhere,
        select: {
          id: true, name: true, status: true, priority: true, progress: true, expectedCompletionDate: true, updatedAt: true,
          members: { select: { userId: true, role: true } },
        },
      }),
      app.prisma.complianceControl.findMany({ where: controlWhere, select: { id: true, category: true, status: true } }),
      app.prisma.task.findMany({
        where: { project: projectWhere },
        select: { projectId: true, assigneeId: true, status: true, createdAt: true, completedAt: true },
      }),
      app.prisma.dailyKTReport.count({ where: { status: 'SUBMITTED', project: projectWhere } }),
      app.prisma.profile.count({ where: { status: 'ACTIVE' } }),
      app.prisma.auditLog.findMany({
        where: { action: { notIn: NOISE as any }, NOT: { resourceType: 'file', outcome: 'SUCCESS' }, ...(orgWide ? {} : { actorId: userId }) },
        orderBy: { createdAt: 'desc' },
        take: 8,
        include: { actor: { select: { fullName: true } } },
      }),
    ]);

    // where a click on each activity should go (the thing itself), and which project it belongs to
    const links = await resolveLinks(app.prisma, audit.map((a) => ({ type: a.resourceType, id: a.resourceId })));

    const byStatus = (s: ProjectStatus) => projects.filter((p) => p.status === s).length;
    const healths = projects.map(projectHealth);
    const avgHealth = healths.length ? Math.round(healths.reduce((a, b) => a + b, 0) / healths.length) : 0;

    // Compliance controls stand in for "risks": anything not completed is open
    const openControls = controls.filter((c) => c.status !== 'COMPLETED');
    const criticalRisks = controls.filter((c) => c.status === 'OVERDUE').length;
    const highRisks = controls.filter((c) => c.status === 'AT_RISK').length;

    // Share of active people working on at least one ongoing project
    const busy = new Set(projects.filter((p) => p.status === 'ONGOING').flatMap((p) => p.members.map((m) => m.userId)));

    // Task completion rate at the end of each of the last 6 months
    const now = new Date();
    const healthTrend = Array.from({ length: 6 }, (_, i) => {
      const end = new Date(now.getFullYear(), now.getMonth() - (5 - i) + 1, 0, 23, 59, 59);
      const created = tasks.filter((t) => t.createdAt <= end);
      const done = created.filter((t) => t.completedAt && t.completedAt <= end);
      return { month: end.toLocaleString('en', { month: 'short' }), score: pct(done.length, created.length) };
    });

    const categories = [...new Set(controls.map((c) => c.category))].sort();
    const riskHeatmap = categories.map((category) => {
      const own = controls.filter((c) => c.category === category);
      const n = (s: string) => own.filter((c) => c.status === s).length;
      return { category, critical: n('OVERDUE'), high: n('AT_RISK'), medium: n('IN_PROGRESS'), low: n('NOT_STARTED') };
    });
    const compliancePosture = categories.map((framework) => {
      const own = controls.filter((c) => c.category === framework);
      const n = (...s: string[]) => own.filter((c) => s.includes(c.status)).length;
      return { framework, compliant: n('COMPLETED'), partial: n('IN_PROGRESS'), nonCompliant: n('OVERDUE', 'AT_RISK'), trend: '' };
    });

    const openTasks = tasks.filter((t) => t.status !== 'DONE');
    const resourceAllocation = projects
      .filter((p) => p.status === 'ONGOING')
      .sort((a, b) => b.members.length - a.members.length)
      .slice(0, 6)
      .map((p) => ({
        projectId: p.id,
        project: p.name,
        allocated: p.members.length,
        utilized: new Set(openTasks.filter((t) => t.projectId === p.id && t.assigneeId).map((t) => t.assigneeId)).size,
        teamSize: p.members.length,
      }));

    const alerts: { id: string; type: 'CRITICAL' | 'WARNING' | 'INFO'; title: string; message: string; projectId: string | null; timestamp: string }[] = [];
    const stamp = now.toISOString();
    for (const p of projects.filter((p) => p.status === 'OVERDUE')) {
      alerts.push({ id: `overdue-${p.id}`, type: 'CRITICAL', title: `${p.name} is overdue`, message: p.expectedCompletionDate ? `Was due ${p.expectedCompletionDate.toISOString().slice(0, 10)}` : 'Past its deadline', projectId: p.id, timestamp: stamp });
    }
    if (criticalRisks > 0) {
      alerts.push({ id: 'controls-overdue', type: 'CRITICAL', title: `${criticalRisks} compliance control${criticalRisks > 1 ? 's' : ''} overdue`, message: 'Review the Compliance Tracking page', projectId: null, timestamp: stamp });
    }
    for (const p of projects.filter((p) => p.status === 'AT_RISK')) {
      alerts.push({ id: `risk-${p.id}`, type: 'WARNING', title: `${p.name} is at risk`, message: `${p.progress}% complete`, projectId: p.id, timestamp: stamp });
    }
    const blocked = tasks.filter((t) => t.status === 'BLOCKED').length;
    if (blocked > 0) {
      alerts.push({ id: 'tasks-blocked', type: 'WARNING', title: `${blocked} blocked task${blocked > 1 ? 's' : ''}`, message: 'Work is waiting on a dependency', projectId: null, timestamp: stamp });
    }
    if (pendingKt > 0) {
      alerts.push({ id: 'kt-pending', type: 'INFO', title: `${pendingKt} KT report${pendingKt > 1 ? 's' : ''} awaiting approval`, message: 'Submitted and not yet reviewed', projectId: null, timestamp: stamp });
    }

    const topProjects = [...projects].sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime()).slice(0, 8);
    const [startMap, updateMap] = await Promise.all([startInfo(app, topProjects.map((p) => p.id), userId), latestUpdates(app, topProjects.map((p) => p.id))]);
    const myProjectRows = topProjects.map((p) => ({ id: p.id, name: p.name, status: p.status, priority: p.priority, progress: p.progress, myRole: p.members.find((m) => m.userId === userId)?.role ?? null, startInfo: startMap.get(p.id) ?? null, lastUpdate: updateMap.get(p.id) ?? null }));
    const upcomingDeadlines = projects
      .filter((p) => p.status !== 'COMPLETED' && p.expectedCompletionDate)
      .sort((a, b) => a.expectedCompletionDate!.getTime() - b.expectedCompletionDate!.getTime())
      .slice(0, 6)
      .map((p) => ({ id: p.id, name: p.name, expectedCompletionDate: p.expectedCompletionDate, priority: p.priority, health: projectHealth(p) }));

    return reply.send({
      success: true,
      data: {
        metrics: {
          organizationHealthScore: avgHealth,
          totalProjects: projects.length,
          activeProjects: byStatus('ONGOING'),
          completedProjects: byStatus('COMPLETED'),
          onHoldProjects: byStatus('ON_HOLD'),
          overdueProjects: byStatus('OVERDUE'),
          complianceScore: pct(controls.filter((c) => c.status === 'COMPLETED').length, controls.length),
          openRisks: openControls.length,
          criticalRisks,
          highRisks,
          pendingKTReports: pendingKt,
          teamUtilization: pct(busy.size, activeUsers),
          budgetUtilization: 0, // no budget data is stored
          avgProjectHealth: avgHealth,
        },
        charts: { healthTrend, riskHeatmap, compliancePosture, resourceAllocation, budgetTracking: [] },
        alerts,
        upcomingDeadlines,
        // every project in scope (a manager's own ones), newest activity first, whether or not it has a deadline
        myProjects: myProjectRows,
        recentActivity: audit.map((a) => {
          const pid = links.projectOf(a.resourceType, a.resourceId);
          return {
            id: a.id,
            action: ACTION_LABELS[a.action] ?? a.action,
            resourceType: resourceLabel(a.resourceType),
            actor: { fullName: a.actor?.fullName ?? 'System' },
            itemName: detailName(a.details),        // the task, document or project the entry is about
            projectId: pid,
            projectName: pid ? projects.find((p) => p.id === pid)?.name ?? '' : '',   // the project it belongs to
            link: links.link(a.resourceType, a.resourceId),
            timestamp: a.createdAt,
          };
        }),
      },
    });
  });

  // ---------- My assignments (always the signed-in user's own work) ----------
  const list = <T>(items: T[]) => ({ success: true, data: { items, total: items.length, page: 1, pageSize: items.length } });

  app.get('/assignments/tasks', {
    schema: { querystring: z.object({ status: z.string().optional(), priority: z.string().optional() }) },
  }, async (request, reply) => {
    const { status, priority } = request.query as { status?: string; priority?: string };
    const recentlyDone = new Date(Date.now() - 14 * 86400000);
    const tasks = await app.prisma.task.findMany({
      where: {
        assigneeId: request.userId!,
        // finished tasks only stay on the board for two weeks
        OR: [{ status: { not: 'DONE' } }, { completedAt: { gte: recentlyDone } }],
        ...(status ? { status: status as any } : {}),
        ...(priority ? { priority: priority as any } : {}),
      },
      orderBy: [{ dueDate: 'asc' }, { createdAt: 'desc' }],
      take: 200,
      include: { project: { select: { id: true, name: true } }, assignee: { select: { fullName: true } } },
    });
    return reply.send(list(tasks.map((t) => ({
      id: t.id, title: t.title, projectId: t.projectId, projectName: t.project.name,
      status: t.status, priority: t.priority, dueDate: t.dueDate, assignee: t.assignee?.fullName ?? '',
      blockedBy: t.status === 'BLOCKED' ? 'Marked as blocked' : null,
    }))));
  });

  app.get('/assignments/projects', async (request, reply) => {
    const memberships = await app.prisma.projectMember.findMany({
      where: { userId: request.userId! },
      include: { project: { select: { id: true, name: true, status: true, progress: true, priority: true, expectedCompletionDate: true } } },
    });
    const ids = memberships.map((m) => m.projectId);
    const [starts, updates] = await Promise.all([startInfo(app, ids, request.userId!), latestUpdates(app, ids)]);
    return reply.send(list(memberships.map((m) => ({
      ...m.project,
      role: m.role.charAt(0) + m.role.slice(1).toLowerCase(),
      startInfo: starts.get(m.projectId) ?? null,
      lastUpdate: updates.get(m.projectId) ?? null,
      mustStart: (TEAM_ROLES as readonly string[]).includes(m.role) && !m.acceptedAt,
    }))));
  });

  app.get('/assignments/kt-reports', async (request, reply) => {
    const reports = await app.prisma.dailyKTReport.findMany({
      where: { userId: request.userId!, status: { in: ['DRAFT', 'REJECTED'] } },
      orderBy: { reportDate: 'desc' },
      take: 50,
      include: { project: { select: { id: true, name: true } } },
    });
    return reply.send(list(reports.map((r) => ({
      id: r.id, title: `KT report ${r.reportDate.toISOString().slice(0, 10)}`, projectId: r.projectId, projectName: r.project.name,
      status: r.status, dueDate: r.reportDate, lastUpdated: r.updatedAt,
    }))));
  });

  app.get('/assignments/document-reviews', async (request, reply) => {
    const docs = await app.prisma.projectDocument.findMany({
      where: { reviewerId: request.userId!, OR: [{ reviewStatus: 'PENDING' }, { status: 'PENDING_REVIEW' }] },
      orderBy: { updatedAt: 'desc' },
      take: 50,
      include: { project: { select: { name: true } }, uploader: { select: { fullName: true } } },
    });
    return reply.send(list(docs.map((d) => ({
      id: d.id, name: d.name, projectId: d.projectId, projectName: d.project.name,
      status: d.reviewStatus ?? 'PENDING', requestedBy: d.uploader.fullName, requestedAt: d.updatedAt, dueDate: null,
    }))));
  });

  app.get('/assignments/compliance-actions', async (request, reply) => {
    const tasks = await app.prisma.remediationTask.findMany({
      where: { assigneeId: request.userId!, status: { not: 'COMPLETED' } },
      orderBy: { dueDate: 'asc' },
      take: 50,
      include: { control: { select: { id: true, title: true, category: true } } },
    });
    return reply.send(list(tasks.map((t) => ({
      id: t.id, controlId: t.control.id, controlName: t.control.title, framework: t.control.category,
      action: t.title, status: t.status, dueDate: t.dueDate,
    }))));
  });

  app.get('/assignments/activity', {
    schema: { querystring: z.object({ limit: z.coerce.number().int().min(1).max(50).default(10) }) },
  }, async (request, reply) => {
    const { limit } = request.query as { limit: number };
    const logs = await app.prisma.auditLog.findMany({
      where: { actorId: request.userId!, action: { notIn: NOISE as any } },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
    return reply.send(list(logs.map((l) => ({
      id: l.id, action: ACTION_LABELS[l.action] ?? l.action, resourceType: resourceLabel(l.resourceType),
      resourceName: detailName(l.details), projectName: '', timestamp: l.createdAt,
    }))));
  });
}
