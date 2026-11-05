import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { createAuditLogger } from '../services/audit-logger.js';
import { attentionFor } from '../services/attention.js';

const NudgeSchema = z.object({ userId: z.string().uuid(), projectId: z.string().uuid(), taskId: z.string().uuid().optional().nullable() });

export async function attentionRoutes(app: FastifyInstance) {
  const auditLogger = createAuditLogger(app);

  // What the caller, as a project lead or admin, has to look at
  app.get('/attention', { preHandler: [app.authenticate] }, async (request, reply) => {
    const data = await attentionFor(app, { id: request.userId!, role: request.user!.role });
    return reply.send({ success: true, data });
  });

  // A reminder from a lead to one person about one task (or about starting a project): once a day at most per subject
  app.post('/attention/nudge', { schema: { body: NudgeSchema }, preHandler: [app.authenticate] }, async (request, reply) => {
    const me = request.userId!;
    const { userId, projectId, taskId } = request.body as z.infer<typeof NudgeSchema>;
    const admin = request.user!.role === 'SUPER_ADMIN' || request.user!.role === 'ADMIN';
    const [project, myMembership, target, task, actor] = await Promise.all([
      app.prisma.project.findUnique({ where: { id: projectId }, select: { name: true, ownerId: true } }),
      app.prisma.projectMember.findUnique({ where: { projectId_userId: { projectId, userId: me } }, select: { role: true } }),
      app.prisma.projectMember.findUnique({ where: { projectId_userId: { projectId, userId } }, select: { user: { select: { status: true } } } }),
      taskId ? app.prisma.task.findFirst({ where: { id: taskId, projectId }, select: { title: true, assigneeId: true, status: true } }) : Promise.resolve(null),
      app.prisma.profile.findUnique({ where: { id: me }, select: { fullName: true } }),
    ]);
    if (!project) return reply.code(404).send({ success: false, error: { code: 'NOT_FOUND', message: 'Project not found' } });
    const lead = admin || project.ownerId === me || myMembership?.role === 'OWNER' || myMembership?.role === 'LEAD';
    if (!lead) return reply.code(403).send({ success: false, error: { code: 'FORBIDDEN', message: 'Only the project owner, a lead or an admin can send a reminder' } });
    if (userId === me) return reply.code(400).send({ success: false, error: { code: 'SELF', message: 'You cannot send a reminder to yourself' } });
    if (!target || target.user.status !== 'ACTIVE') return reply.code(400).send({ success: false, error: { code: 'NOT_MEMBER', message: 'That person is not an active member of this project' } });
    if (taskId && (!task || task.assigneeId !== userId || !['TODO', 'IN_PROGRESS'].includes(task.status))) {
      return reply.code(400).send({ success: false, error: { code: 'BAD_TASK', message: 'That task is not an open task of this person' } });
    }

    const title = task ? `Reminder: "${task.title}"` : `Reminder: start "${project.name}"`;
    const recent = await app.prisma.notification.findFirst({ where: { userId, type: 'WORK_NUDGE', title, createdAt: { gte: new Date(Date.now() - 24 * 3600_000) } }, select: { id: true } });
    if (recent) return reply.code(429).send({ success: false, error: { code: 'ALREADY_SENT', message: 'A reminder about this was already sent in the last 24 hours' } });

    const who = actor?.fullName ?? 'Your project lead';
    const message = task
      ? `${who} is asking about "${task.title}" in ${project.name}. Please update it, or mark it blocked and say why.`
      : `${who} asks you to start "${project.name}". Open My Assignments and press Start project.`;
    await app.prisma.notification.create({ data: { userId, type: 'WORK_NUDGE', title, message: message.slice(0, 500), resourceType: 'project', resourceId: projectId } });
    await auditLogger.logResource('CREATE', me, 'nudge', userId, { projectId, taskId: taskId ?? null }, request.ip, request.headers['user-agent']);
    return reply.code(201).send({ success: true, data: { sent: true } });
  });
}
