import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { createAuditLogger } from '../services/audit-logger.js';
import { diffFields } from '../services/document-oversight.js';
import { createNotificationService } from '../services/notifications.js';
import { syncProjectProgress } from '../services/project-progress.js';
import { evidenceOf, minutesBetween } from '../services/work-kt.js';
import { getWorkSettings } from './work-sessions.js';
import type { FastifyRequest } from 'fastify';

const CreateTaskSchema = z.object({
  title: z.string().min(1).max(255),
  description: z.string().optional().nullable(),
  priority: z.enum(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']).default('MEDIUM'),
  assigneeId: z.string().uuid().optional().nullable(),
  dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable(),
});

const UpdateTaskSchema = z.object({
  title: z.string().min(1).max(255).optional(),
  description: z.string().optional().nullable(),
  status: z.enum(['TODO', 'IN_PROGRESS', 'REVIEW', 'DONE', 'BLOCKED']).optional(),
  priority: z.enum(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']).optional(),
  assigneeId: z.string().uuid().optional().nullable(),
  dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable(),
});

async function checkProjectAccess(app: FastifyInstance, userId: string, userRole: string, projectId: string) {
  if (userRole === 'SUPER_ADMIN' || userRole === 'ADMIN') return true;
  const membership = await app.prisma.projectMember.findUnique({
    where: { projectId_userId: { projectId, userId } },
  });
  return !!membership;
}

const isAdminRole = (r: string) => r === 'SUPER_ADMIN' || r === 'ADMIN';
const isLeadRole = (r?: string) => r === 'OWNER' || r === 'LEAD';

// What the caller may do with a task: done, verified and blocked are separate steps with their own rules
function canDo(request: FastifyRequest, t: { status: string; assigneeId: string | null }) {
  const me = request.userId!;
  const admin = isAdminRole(request.user!.role);
  const lead = admin || isLeadRole(request.projectRole);
  const mine = t.assigneeId === me;
  const open = t.status === 'TODO' || t.status === 'IN_PROGRESS';
  return {
    submit: mine && open,
    verify: t.status === 'REVIEW' && lead && (!mine || request.user!.role === 'SUPER_ADMIN'),
    block: open && (mine || lead),
    unblock: t.status === 'BLOCKED' && (mine || lead),
    move: open && (mine || lead), // To do <-> In progress
  };
}

export async function taskRoutes(app: FastifyInstance) {
  const auditLogger = createAuditLogger(app);
  const notify = createNotificationService(app);

  // The owner / leads of a project (who verify), without the people named in `except`
  const leadsOf = async (projectId: string, except: string[] = []) => {
    const [project, members] = await Promise.all([
      app.prisma.project.findUnique({ where: { id: projectId }, select: { ownerId: true, name: true } }),
      app.prisma.projectMember.findMany({ where: { projectId, role: { in: ['OWNER', 'LEAD'] }, user: { status: 'ACTIVE' } }, select: { userId: true } }),
    ]);
    const ids = new Set<string>([...(project ? [project.ownerId] : []), ...members.map((m) => m.userId)]);
    for (const x of except) ids.delete(x);
    return { ids: [...ids], projectName: project?.name ?? '' };
  };
  const actorName = async (id: string) => (await app.prisma.profile.findUnique({ where: { id }, select: { fullName: true } }))?.fullName ?? 'Someone';
  const note = async (projectId: string, actorId: string, text: string, request: FastifyRequest) =>
    app.prisma.activityFeed.create({ data: { actorId, action: 'UPDATE', resourceType: 'task', projectId, details: { text }, ipAddress: request.ip, userAgent: request.headers['user-agent'] } });

  const withContext = async (request: FastifyRequest, rows: any[]) => {
    const ids = rows.map((r) => r.id);
    const reviews = ids.length ? await app.prisma.taskReview.findMany({ where: { taskId: { in: ids } }, orderBy: { createdAt: 'desc' }, select: { taskId: true, kind: true, note: true, actorId: true, createdAt: true } }) : [];
    const latest = new Map<string, (typeof reviews)[number]>();
    for (const r of reviews) if (!latest.has(r.taskId)) latest.set(r.taskId, r);
    const names = new Map((await app.prisma.profile.findMany({ where: { id: { in: [...new Set([...latest.values()].map((r) => r.actorId))] } }, select: { id: true, fullName: true } })).map((p) => [p.id, p.fullName]));
    return rows.map((t) => {
      const r = latest.get(t.id);
      return { ...t, can: canDo(request, { status: t.status, assigneeId: t.assignee?.id ?? null }), latestReview: r ? { kind: r.kind, note: r.note, by: names.get(r.actorId) ?? '', at: r.createdAt } : null };
    });
  };

  // List tasks for a project
  app.get('/:projectId/tasks', {
    schema: {
      querystring: z.object({
        page: z.coerce.number().int().positive().default(1),
        limit: z.coerce.number().int().positive().max(100).default(20),
        status: z.string().optional(),
        priority: z.string().optional(),
        assigneeId: z.string().uuid().optional(),
      }),
    },
  }, async (request, reply) => {
    const userId = request.userId!;
    const userRole = request.user!.role;
    const { projectId } = request.params as { projectId: string };
    const { page, limit, status, priority, assigneeId } = request.query as any;

    const hasAccess = await checkProjectAccess(app, userId, userRole, projectId);
    if (!hasAccess) {
      return reply.code(403).send({ success: false, error: { code: 'FORBIDDEN', message: 'Access denied' } });
    }

    const where: any = { projectId };
    if (status) where.status = status;
    if (priority) where.priority = priority;
    if (assigneeId) where.assigneeId = assigneeId;
    if (userRole !== 'SUPER_ADMIN' && userRole !== 'ADMIN' && !isLeadRole(request.projectRole)) {
      where.OR = [{ assigneeId: userId }, { reporterId: userId }]; // the owner / leads see every task: they verify them
    }

    const [tasks, total] = await Promise.all([
      app.prisma.task.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
        select: {
          id: true,
          title: true,
          description: true,
          status: true,
          priority: true,
          dueDate: true,
          completedAt: true,
          blockedReason: true,
          submittedAt: true,
          verifiedAt: true,
          createdAt: true,
          updatedAt: true,
          assignee: { select: { id: true, fullName: true } },
          reporter: { select: { id: true, fullName: true } },
        },
      }),
      app.prisma.task.count({ where }),
    ]);

    return reply.send({
      success: true,
      data: { items: await withContext(request, tasks), total, page, limit, totalPages: Math.ceil(total / limit) },
    });
  });

  // Get single task
  app.get('/:projectId/tasks/:taskId', async (request, reply) => {
    const userId = request.userId!;
    const userRole = request.user!.role;
    const { projectId, taskId } = request.params as { projectId: string; taskId: string };

    const hasAccess = await checkProjectAccess(app, userId, userRole, projectId);
    if (!hasAccess) {
      return reply.code(403).send({ success: false, error: { code: 'FORBIDDEN', message: 'Access denied' } });
    }

    const task = await app.prisma.task.findFirst({
      where: { id: taskId, projectId },
      select: {
        id: true,
        title: true,
        description: true,
        status: true,
        priority: true,
        dueDate: true,
        completedAt: true,
        blockedReason: true,
        submittedAt: true,
        verifiedAt: true,
        createdAt: true,
        updatedAt: true,
        assignee: { select: { id: true, fullName: true, email: true } },
        reporter: { select: { id: true, fullName: true } },
      },
    });

    if (!task) {
      return reply.code(404).send({ success: false, error: { code: 'NOT_FOUND', message: 'Task not found' } });
    }

    return reply.send({ success: true, data: (await withContext(request, [task]))[0] });
  });

  // Create task
  app.post('/:projectId/tasks', {
    schema: { body: CreateTaskSchema },
  }, async (request, reply) => {
    const userId = request.userId!;
    const userRole = request.user!.role;
    const { projectId } = request.params as { projectId: string };
    const data = request.body as z.infer<typeof CreateTaskSchema>;

    const hasAccess = await checkProjectAccess(app, userId, userRole, projectId);
    if (!hasAccess) {
      return reply.code(403).send({ success: false, error: { code: 'FORBIDDEN', message: 'Access denied' } });
    }

    // Verify assignee is a project member
    if (data.assigneeId) {
      const membership = await app.prisma.projectMember.findUnique({
        where: { projectId_userId: { projectId, userId: data.assigneeId } },
      });
      if (!membership) {
        return reply.code(400).send({ success: false, error: { code: 'INVALID_ASSIGNEE', message: 'Assignee is not a project member' } });
      }
    }

    const task = await app.prisma.task.create({
      data: {
        projectId,
        title: data.title,
        description: data.description,
        priority: data.priority,
        assigneeId: data.assigneeId,
        reporterId: userId,
        dueDate: data.dueDate ? new Date(data.dueDate) : null,
      },
    });

    await auditLogger.logResource('CREATE', userId, 'task', task.id, { title: data.title }, request.ip, request.headers['user-agent']);

    // Notify assignee
    if (data.assigneeId && data.assigneeId !== userId) {
      const notificationService = createNotificationService(app);
      const project = await app.prisma.project.findUnique({ where: { id: projectId } });
      await notificationService.create({
        userId: data.assigneeId,
        type: 'COMMENT_ADDED',
        title: 'New Task Assigned',
        message: `You have been assigned to task "${data.title}" in project "${project?.name}"`,
        resourceType: 'task',
        resourceId: task.id,
      });
    }

    return reply.code(201).send({ success: true, data: task });
  });

  // Update task
  app.patch('/:projectId/tasks/:taskId', {
    schema: { body: UpdateTaskSchema },
  }, async (request, reply) => {
    const userId = request.userId!;
    const userRole = request.user!.role;
    const { projectId, taskId } = request.params as { projectId: string; taskId: string };
    const data = request.body as z.infer<typeof UpdateTaskSchema>;

    const hasAccess = await checkProjectAccess(app, userId, userRole, projectId);
    if (!hasAccess) {
      return reply.code(403).send({ success: false, error: { code: 'FORBIDDEN', message: 'Access denied' } });
    }

    const existingTask = await app.prisma.task.findFirst({ where: { id: taskId, projectId } });
    if (!existingTask) {
      return reply.code(404).send({ success: false, error: { code: 'NOT_FOUND', message: 'Task not found' } });
    }

    // Verify assignee is a project member
    if (data.assigneeId) {
      const membership = await app.prisma.projectMember.findUnique({
        where: { projectId_userId: { projectId, userId: data.assigneeId } },
      });
      if (!membership) {
        return reply.code(400).send({ success: false, error: { code: 'INVALID_ASSIGNEE', message: 'Assignee is not a project member' } });
      }
    }

    // Done and In review are reached only through Submit and Verify; Blocked only with a reason
    if (data.status && data.status !== existingTask.status) {
      const moving = (s: string) => s === 'TODO' || s === 'IN_PROGRESS';
      if (!(moving(existingTask.status) && moving(data.status))) {
        return reply.code(409).send({ success: false, error: { code: 'USE_SUBMIT_VERIFY', message: data.status === 'BLOCKED' ? 'Use the Blocked button and say why' : 'A task is finished by submitting it for review and having it verified' } });
      }
    }

    const updateData: any = { ...data };
    if (data.dueDate) updateData.dueDate = new Date(data.dueDate);
    if (data.status === 'DONE' && existingTask.status !== 'DONE') {
      updateData.completedAt = new Date();
    } else if (data.status && data.status !== 'DONE') {
      updateData.completedAt = null;
    }

    const task = await app.prisma.task.update({
      where: { id: taskId },
      data: updateData,
    });

    // what changed, from -> to, so the log tells the whole story
    const { completedAt: _c, ...fields } = updateData;
    await auditLogger.logResource('UPDATE', userId, 'task', taskId, { title: existingTask.title, changes: diffFields(existingTask as Record<string, any>, fields) }, request.ip, request.headers['user-agent']);

    return reply.send({ success: true, data: task });
  });

  // Delete task
  app.delete('/:projectId/tasks/:taskId', async (request, reply) => {
    const userId = request.userId!;
    const userRole = request.user!.role;
    const { projectId, taskId } = request.params as { projectId: string; taskId: string };

    const hasAccess = await checkProjectAccess(app, userId, userRole, projectId);
    if (!hasAccess) {
      return reply.code(403).send({ success: false, error: { code: 'FORBIDDEN', message: 'Access denied' } });
    }

    await app.prisma.task.delete({ where: { id: taskId } });

    await auditLogger.logResource('DELETE', userId, 'task', taskId, {}, request.ip, request.headers['user-agent']);

    return reply.send({ success: true, data: null });
  });

  // ---- Submit for verification, verify, blocked ----

  // What the caller can point to as proof: their finished work sessions and their uploads in this project
  app.get('/:projectId/tasks/evidence-options', async (request, reply) => {
    const { projectId } = request.params as { projectId: string };
    const me = request.userId!;
    const [sessions, documents] = await Promise.all([
      app.prisma.workSession.findMany({ where: { projectId, userId: me, endedAt: { not: null } }, orderBy: { startedAt: 'desc' }, take: 30, include: { _count: { select: { entries: { where: { kind: 'SHOT' } } } } } }),
      app.prisma.projectDocument.findMany({ where: { projectId, uploadedById: me }, orderBy: { createdAt: 'desc' }, take: 50, select: { id: true, name: true, mimeType: true, createdAt: true } }),
    ]);
    return reply.send({
      success: true,
      data: {
        sessions: sessions.map((s) => ({ id: s.id, startedAt: s.startedAt, endedAt: s.endedAt, minutes: minutesBetween(s.startedAt, s.endedAt), linkLabel: s.linkLabel, evidence: evidenceOf(s, s._count.entries), toolCheck: s.toolCheck, shots: s._count.entries })),
        documents,
      },
    });
  });

  app.post('/:projectId/tasks/:taskId/submit', {
    schema: { body: z.object({ summary: z.string().trim().min(10, 'Say what you did (at least 10 characters)').max(3000), evidence: z.array(z.object({ type: z.enum(['SESSION', 'DOCUMENT']), id: z.string().uuid() })).max(20).default([]) }) },
  }, async (request, reply) => {
    const { projectId, taskId } = request.params as { projectId: string; taskId: string };
    const me = request.userId!;
    const { summary, evidence } = request.body as { summary: string; evidence: { type: 'SESSION' | 'DOCUMENT'; id: string }[] };
    const task = await app.prisma.task.findFirst({ where: { id: taskId, projectId } });
    if (!task) return reply.code(404).send({ success: false, error: { code: 'NOT_FOUND', message: 'Task not found' } });
    if (task.assigneeId !== me) return reply.code(403).send({ success: false, error: { code: 'FORBIDDEN', message: 'Only the person the task is assigned to can submit it' } });
    if (task.status !== 'TODO' && task.status !== 'IN_PROGRESS') return reply.code(409).send({ success: false, error: { code: 'BAD_STATE', message: task.status === 'REVIEW' ? 'This task is already waiting for verification' : 'This task cannot be submitted now' } });

    const sessionIds = [...new Set(evidence.filter((e) => e.type === 'SESSION').map((e) => e.id))];
    const docIds = [...new Set(evidence.filter((e) => e.type === 'DOCUMENT').map((e) => e.id))];
    const [sessions, docs] = await Promise.all([
      sessionIds.length ? app.prisma.workSession.findMany({ where: { id: { in: sessionIds }, projectId, userId: me, endedAt: { not: null } }, include: { _count: { select: { entries: { where: { kind: 'SHOT' } } } } } }) : [],
      docIds.length ? app.prisma.projectDocument.findMany({ where: { id: { in: docIds }, projectId, uploadedById: me }, select: { id: true, name: true, createdAt: true } }) : [],
    ]);
    if (sessions.length !== sessionIds.length || docs.length !== docIds.length) {
      return reply.code(400).send({ success: false, error: { code: 'INVALID_EVIDENCE', message: 'Evidence must be your own finished work sessions or your own uploads in this project' } });
    }
    const settings = await getWorkSettings(app);
    if (settings.requireTaskEvidence && sessions.length + docs.length === 0) {
      return reply.code(400).send({ success: false, error: { code: 'EVIDENCE_REQUIRED', message: 'Add at least one proof: a finished work session or a document you uploaded' } });
    }
    const snapshot = [
      ...sessions.map((s) => ({ type: 'SESSION', id: s.id, startedAt: s.startedAt, endedAt: s.endedAt, minutes: minutesBetween(s.startedAt, s.endedAt), linkLabel: s.linkLabel, evidence: evidenceOf(s, s._count.entries), toolCheck: s.toolCheck, shots: s._count.entries })),
      ...docs.map((d) => ({ type: 'DOCUMENT', id: d.id, name: d.name, createdAt: d.createdAt })),
    ];

    await app.prisma.task.update({ where: { id: taskId }, data: { status: 'REVIEW', submittedAt: new Date(), completedAt: null, blockedReason: null } });
    await app.prisma.taskReview.create({ data: { taskId, kind: 'SUBMITTED', actorId: me, note: summary, evidence: snapshot as any } });
    const who = await actorName(me);
    const { ids, projectName } = await leadsOf(projectId, [me]);
    for (const lead of ids) {
      await notify.create({ userId: lead, type: 'TASK_SUBMITTED', title: 'Task waiting for your verification', message: `${who} submitted "${task.title}" in ${projectName} for verification.`.slice(0, 500), resourceType: 'project', resourceId: projectId });
    }
    await note(projectId, me, `submitted "${task.title}" for verification`, request);
    await auditLogger.logResource('UPDATE', me, 'task', taskId, { title: task.title, action: 'submitted', evidence: snapshot.length }, request.ip, request.headers['user-agent']);
    return reply.code(201).send({ success: true, data: { status: 'REVIEW' } });
  });

  app.post('/:projectId/tasks/:taskId/verify', {
    schema: { body: z.object({ decision: z.enum(['APPROVE', 'REJECT']), note: z.string().trim().max(2000).optional() }) },
  }, async (request, reply) => {
    const { projectId, taskId } = request.params as { projectId: string; taskId: string };
    const me = request.userId!;
    const { decision, note: text } = request.body as { decision: 'APPROVE' | 'REJECT'; note?: string };
    const task = await app.prisma.task.findFirst({ where: { id: taskId, projectId } });
    if (!task) return reply.code(404).send({ success: false, error: { code: 'NOT_FOUND', message: 'Task not found' } });
    if (task.status !== 'REVIEW') return reply.code(409).send({ success: false, error: { code: 'BAD_STATE', message: 'This task is not waiting for verification' } });
    const can = canDo(request, { status: task.status, assigneeId: task.assigneeId });
    if (!can.verify) {
      const mine = task.assigneeId === me;
      return reply.code(403).send({ success: false, error: { code: 'FORBIDDEN', message: mine ? 'You cannot verify your own task. Another lead or an admin must do it.' : 'Only the project owner, a lead or an admin can verify' } });
    }
    if (decision === 'REJECT' && (text ?? '').length < 5) return reply.code(400).send({ success: false, error: { code: 'REASON_REQUIRED', message: 'Say what has to be changed (at least 5 characters)' } });

    const approved = decision === 'APPROVE';
    const self = task.assigneeId === me;
    await app.prisma.task.update({
      where: { id: taskId },
      data: approved ? { status: 'DONE', completedAt: new Date(), verifiedAt: new Date(), verifiedById: me } : { status: 'IN_PROGRESS', completedAt: null, verifiedAt: null, verifiedById: null },
    });
    await app.prisma.taskReview.create({ data: { taskId, kind: approved ? 'APPROVED' : 'CHANGES_REQUESTED', actorId: me, note: text || null, selfVerified: approved && self } });
    await syncProjectProgress(app, projectId); // the project's percentage counts only verified tasks
    const who = await actorName(me);
    if (task.assigneeId && task.assigneeId !== me) {
      await notify.create({ userId: task.assigneeId, type: approved ? 'TASK_VERIFIED' : 'TASK_REJECTED', title: approved ? 'Task verified' : 'Task sent back', message: (approved ? `${who} verified "${task.title}". It is done.` : `${who} sent "${task.title}" back: ${text}`).slice(0, 500), resourceType: 'project', resourceId: projectId });
    }
    await note(projectId, me, approved ? `verified "${task.title}"${self ? ' (their own task)' : ''}` : `sent "${task.title}" back for changes`, request);
    await auditLogger.logResource(approved ? 'APPROVE' : 'REJECT', me, 'task', taskId, { title: task.title, note: text ?? null, selfVerified: approved && self }, request.ip, request.headers['user-agent']);
    return reply.send({ success: true, data: { status: approved ? 'DONE' : 'IN_PROGRESS' } });
  });

  app.post('/:projectId/tasks/:taskId/block', { schema: { body: z.object({ reason: z.string().trim().min(5, 'Say why (at least 5 characters)').max(1000) }) } }, async (request, reply) => {
    const { projectId, taskId } = request.params as { projectId: string; taskId: string };
    const me = request.userId!;
    const { reason } = request.body as { reason: string };
    const task = await app.prisma.task.findFirst({ where: { id: taskId, projectId } });
    if (!task) return reply.code(404).send({ success: false, error: { code: 'NOT_FOUND', message: 'Task not found' } });
    if (!canDo(request, { status: task.status, assigneeId: task.assigneeId }).block) return reply.code(403).send({ success: false, error: { code: 'FORBIDDEN', message: 'You cannot mark this task as blocked now' } });
    await app.prisma.task.update({ where: { id: taskId }, data: { status: 'BLOCKED', blockedReason: reason } });
    await app.prisma.taskReview.create({ data: { taskId, kind: 'BLOCKED', actorId: me, note: reason } });
    const who = await actorName(me);
    const { ids, projectName } = await leadsOf(projectId, [me]);
    for (const lead of ids) await notify.create({ userId: lead, type: 'TASK_BLOCKED', title: 'A task is blocked', message: `${who} is blocked on "${task.title}" in ${projectName}: ${reason}`.slice(0, 500), resourceType: 'project', resourceId: projectId });
    await note(projectId, me, `marked "${task.title}" as blocked`, request);
    await auditLogger.logResource('UPDATE', me, 'task', taskId, { title: task.title, action: 'blocked', reason }, request.ip, request.headers['user-agent']);
    return reply.code(201).send({ success: true, data: { status: 'BLOCKED' } });
  });

  app.post('/:projectId/tasks/:taskId/unblock', { schema: { body: z.object({ note: z.string().trim().max(1000).optional() }) } }, async (request, reply) => {
    const { projectId, taskId } = request.params as { projectId: string; taskId: string };
    const me = request.userId!;
    const task = await app.prisma.task.findFirst({ where: { id: taskId, projectId } });
    if (!task) return reply.code(404).send({ success: false, error: { code: 'NOT_FOUND', message: 'Task not found' } });
    if (!canDo(request, { status: task.status, assigneeId: task.assigneeId }).unblock) return reply.code(403).send({ success: false, error: { code: 'FORBIDDEN', message: 'You cannot unblock this task' } });
    await app.prisma.task.update({ where: { id: taskId }, data: { status: 'IN_PROGRESS', blockedReason: null } });
    await app.prisma.taskReview.create({ data: { taskId, kind: 'UNBLOCKED', actorId: me, note: (request.body as { note?: string } | undefined)?.note || null } });
    await note(projectId, me, `unblocked "${task.title}"`, request);
    await auditLogger.logResource('UPDATE', me, 'task', taskId, { title: task.title, action: 'unblocked' }, request.ip, request.headers['user-agent']);
    return reply.send({ success: true, data: { status: 'IN_PROGRESS' } });
  });

  // The whole story of a task, oldest first
  app.get('/:projectId/tasks/:taskId/reviews', async (request, reply) => {
    const { projectId, taskId } = request.params as { projectId: string; taskId: string };
    const task = await app.prisma.task.findFirst({ where: { id: taskId, projectId }, select: { assigneeId: true, reporterId: true } });
    if (!task) return reply.code(404).send({ success: false, error: { code: 'NOT_FOUND', message: 'Task not found' } });
    const me = request.userId!;
    const seen = isAdminRole(request.user!.role) || isLeadRole(request.projectRole) || task.assigneeId === me || task.reporterId === me;
    if (!seen) return reply.code(403).send({ success: false, error: { code: 'FORBIDDEN', message: 'Access denied' } });
    const rows = await app.prisma.taskReview.findMany({ where: { taskId }, orderBy: { createdAt: 'asc' } });
    const names = new Map((await app.prisma.profile.findMany({ where: { id: { in: [...new Set(rows.map((r) => r.actorId))] } }, select: { id: true, fullName: true } })).map((p) => [p.id, p.fullName]));
    return reply.send({ success: true, data: { items: rows.map((r) => ({ id: r.id, kind: r.kind, note: r.note, evidence: r.evidence ?? [], selfVerified: r.selfVerified, createdAt: r.createdAt, by: names.get(r.actorId) ?? 'Unknown' })) } });
  });
}