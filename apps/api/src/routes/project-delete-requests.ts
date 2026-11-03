import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { createAuditLogger } from '../services/audit-logger.js';
import { createNotificationService } from '../services/notifications.js';
import { runBackup } from '../services/backup.js';

const ReasonSchema = z.object({ reason: z.string().trim().min(5, 'Please write at least 5 characters').max(1000) });
const NoteSchema = z.object({ note: z.string().trim().max(1000).optional() });
const RejectSchema = z.object({ note: z.string().trim().min(3, 'Say why the project is being kept').max(1000) });

// A project is never deleted on the spot. The requester says why, a super admin decides, and before the
// project is removed the server takes a full backup (a project delete cannot be undone from the recycle bin).
export async function projectDeleteRoutes(app: FastifyInstance) {
  const auditLogger = createAuditLogger(app);
  const notifications = createNotificationService(app);

  const activeSuperAdmins = (exceptId?: string) =>
    app.prisma.profile.findMany({
      where: { role: 'SUPER_ADMIN', status: 'ACTIVE', ...(exceptId ? { id: { not: exceptId } } : {}) },
      select: { id: true, fullName: true },
    });

  const err = (reply: any, code: number, errCode: string, message: string) =>
    reply.code(code).send({ success: false, error: { code: errCode, message } });

  // Backup first; if it fails the project stays. Other waiting requests for the same project are closed.
  async function eraseProject(projectId: string, exceptRequestId?: string) {
    const backup = await runBackup(app, 'manual');
    if (!backup.ok) return { ok: false as const, message: `The safety backup failed, so the project was not deleted: ${backup.message}` };
    await app.prisma.project.delete({ where: { id: projectId } });
    await app.prisma.projectDeleteRequest.updateMany({
      where: { projectId, status: 'PENDING', ...(exceptRequestId ? { id: { not: exceptRequestId } } : {}) },
      data: { status: 'CANCELLED', decidedAt: new Date(), decisionNote: 'The project was deleted' },
    });
    return { ok: true as const, backup: backup.name };
  }

  // ---- Ask to delete a project (or, as a super admin, delete it after giving a reason) ----
  app.post('/projects/:projectId/delete-request', { schema: { body: ReasonSchema } }, async (request, reply) => {
    const userId = request.userId!;
    const role = request.user!.role;
    const { projectId } = request.params as { projectId: string };
    const { reason } = request.body as z.infer<typeof ReasonSchema>;

    const project = await app.prisma.project.findUnique({ where: { id: projectId }, select: { id: true, name: true } });
    if (!project) return err(reply, 404, 'NOT_FOUND', 'Project not found');

    if (role !== 'SUPER_ADMIN' && role !== 'ADMIN') {
      const m = await app.prisma.projectMember.findUnique({ where: { projectId_userId: { projectId, userId } }, select: { role: true } });
      if (!m || !['OWNER', 'LEAD'].includes(m.role)) return err(reply, 403, 'FORBIDDEN', 'Only an owner or lead of the project, or an admin, can ask to delete it');
    }

    const pending = await app.prisma.projectDeleteRequest.findFirst({ where: { projectId, status: 'PENDING' }, select: { id: true } });
    if (pending) return err(reply, 409, 'ALREADY_REQUESTED', 'A delete request for this project is already waiting for a super admin');

    if (role === 'SUPER_ADMIN') {
      const rec = await app.prisma.projectDeleteRequest.create({
        data: { projectId, projectName: project.name, reason, status: 'APPROVED', requestedById: userId, decidedById: userId, decidedAt: new Date(), decisionNote: 'Deleted directly by a super admin' },
      });
      const done = await eraseProject(projectId, rec.id);
      if (!done.ok) {
        await app.prisma.projectDeleteRequest.update({ where: { id: rec.id }, data: { status: 'CANCELLED', decisionNote: done.message } });
        return err(reply, 503, 'BACKUP_FAILED', done.message);
      }
      await auditLogger.logResource('DELETE', userId, 'project', projectId, { name: project.name, reason, direct: true, backup: done.backup }, request.ip, request.headers['user-agent']);
      return reply.send({ success: true, data: { id: rec.id, status: 'APPROVED', deleted: true } });
    }

    const created = await app.prisma.projectDeleteRequest.create({
      data: { projectId, projectName: project.name, reason, requestedById: userId },
    });
    const admins = await activeSuperAdmins(userId);
    await notifications.createBulk(
      admins.map((a) => ({
        userId: a.id,
        type: 'PROJECT_DELETE_REQUESTED' as const,
        title: 'Project delete request',
        message: `${request.user!.fullName} asked to delete the project "${project.name}". Reason: ${reason}`,
        resourceType: 'project_delete_request',
        resourceId: created.id,
      }))
    );
    await auditLogger.logResource('UPDATE', userId, 'project', projectId, { action: 'delete_requested', reason, requestId: created.id }, request.ip, request.headers['user-agent']);
    return reply.code(201).send({ success: true, data: { id: created.id, status: 'PENDING', pendingWith: admins.map((a) => a.fullName) } });
  });

  // ---- List: what I must decide (super admins) or what I asked for ----
  app.get('/project-delete-requests', {
    schema: {
      querystring: z.object({
        scope: z.enum(['approver', 'mine']).default('approver'),
        status: z.enum(['PENDING', 'APPROVED', 'REJECTED', 'CANCELLED']).optional(),
      }),
    },
  }, async (request, reply) => {
    const userId = request.userId!;
    const { scope, status } = request.query as { scope: 'approver' | 'mine'; status?: string };
    if (scope === 'approver' && request.user!.role !== 'SUPER_ADMIN') return reply.send({ success: true, data: { items: [] } });

    const rows = await app.prisma.projectDeleteRequest.findMany({
      where: { ...(scope === 'mine' ? { requestedById: userId } : {}), ...(status ? { status } : {}) },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
    const people = await app.prisma.profile.findMany({ where: { id: { in: [...new Set(rows.map((r) => r.requestedById))] } }, select: { id: true, fullName: true } });
    const pendingWith = (await activeSuperAdmins()).map((a) => a.fullName);
    return reply.send({
      success: true,
      data: {
        items: rows.map((r) => ({
          ...r,
          requestedBy: { id: r.requestedById, fullName: people.find((p) => p.id === r.requestedById)?.fullName ?? 'Unknown' },
          pendingWith: r.status === 'PENDING' ? pendingWith : [],
        })),
      },
    });
  });

  const load = async (id: string) => app.prisma.projectDeleteRequest.findUnique({ where: { id } });

  app.post('/project-delete-requests/:id/approve', { schema: { body: NoteSchema }, preHandler: [app.authenticate, app.requireRole(['SUPER_ADMIN'])] }, async (request, reply) => {
    const userId = request.userId!;
    const { id } = request.params as { id: string };
    const { note } = request.body as z.infer<typeof NoteSchema>;
    const req = await load(id);
    if (!req) return err(reply, 404, 'NOT_FOUND', 'Request not found');
    if (req.status !== 'PENDING') return err(reply, 409, 'ALREADY_DECIDED', `This request was already ${req.status.toLowerCase()}`);

    const done = await eraseProject(req.projectId, id);
    if (!done.ok) return err(reply, 503, 'BACKUP_FAILED', done.message);
    await app.prisma.projectDeleteRequest.update({ where: { id }, data: { status: 'APPROVED', decidedById: userId, decidedAt: new Date(), decisionNote: note || null } });
    await notifications.create({
      userId: req.requestedById,
      type: 'PROJECT_DELETE_DECIDED',
      title: 'Project delete approved',
      message: `The project "${req.projectName}" was deleted. Approved by ${request.user!.fullName}${note ? `: ${note}` : ''}`,
    });
    await auditLogger.logResource('DELETE', userId, 'project', req.projectId, { name: req.projectName, reason: req.reason, requestId: id, backup: done.backup }, request.ip, request.headers['user-agent']);
    return reply.send({ success: true, data: { id, status: 'APPROVED' } });
  });

  app.post('/project-delete-requests/:id/reject', { schema: { body: RejectSchema }, preHandler: [app.authenticate, app.requireRole(['SUPER_ADMIN'])] }, async (request, reply) => {
    const userId = request.userId!;
    const { id } = request.params as { id: string };
    const { note } = request.body as z.infer<typeof RejectSchema>;
    const req = await load(id);
    if (!req) return err(reply, 404, 'NOT_FOUND', 'Request not found');
    if (req.status !== 'PENDING') return err(reply, 409, 'ALREADY_DECIDED', `This request was already ${req.status.toLowerCase()}`);
    await app.prisma.projectDeleteRequest.update({ where: { id }, data: { status: 'REJECTED', decidedById: userId, decidedAt: new Date(), decisionNote: note } });
    await notifications.create({
      userId: req.requestedById,
      type: 'PROJECT_DELETE_DECIDED',
      title: 'Project delete rejected',
      message: `"${req.projectName}" was kept. ${request.user!.fullName}: ${note}`,
      resourceType: 'project',
      resourceId: req.projectId,
    });
    await auditLogger.logResource('REJECT', userId, 'project', req.projectId, { action: 'delete_rejected', requestId: id, note }, request.ip, request.headers['user-agent']);
    return reply.send({ success: true, data: { id, status: 'REJECTED' } });
  });

  app.post('/project-delete-requests/:id/cancel', async (request, reply) => {
    const userId = request.userId!;
    const { id } = request.params as { id: string };
    const req = await load(id);
    if (!req) return err(reply, 404, 'NOT_FOUND', 'Request not found');
    if (req.requestedById !== userId) return err(reply, 403, 'FORBIDDEN', 'Only the person who asked can withdraw it');
    if (req.status !== 'PENDING') return err(reply, 409, 'ALREADY_DECIDED', `This request was already ${req.status.toLowerCase()}`);
    await app.prisma.projectDeleteRequest.update({ where: { id }, data: { status: 'CANCELLED', decidedAt: new Date(), decisionNote: 'Withdrawn by the requester' } });
    return reply.send({ success: true, data: { id, status: 'CANCELLED' } });
  });
}
