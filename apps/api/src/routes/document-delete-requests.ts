import type { FastifyInstance } from 'fastify';
import type { Prisma } from '@prisma/client';
import { z } from 'zod';
import { createAuditLogger } from '../services/audit-logger.js';
import { createNotificationService } from '../services/notifications.js';
import { RECYCLE_DAYS, recycleDocument } from '../services/recycle-bin.js';

// Deleting a document needs approval:
//   1. a member files a request with a reason (the document shows "delete pending"),
//   2. the project's manager (its Owner or Lead) approves or rejects it,
//   3. an approval moves the document to the recycle bin for 30 days.
// If the requester is the project's own manager (or the project has no other manager) nobody on the
// project may decide: the request is escalated to a super admin.

const MANAGER_ROLES = ['OWNER', 'LEAD'] as const;

const ReasonSchema = z.object({
  reason: z.string().trim().min(5, 'Please explain why (at least 5 characters)').max(1000),
  // Super admins may delete on the spot; the request is recorded and approved in one step
  immediate: z.boolean().optional(),
});
const DecisionSchema = z.object({ note: z.string().trim().max(1000).optional() });
const RejectSchema = z.object({ note: z.string().trim().min(3, 'Tell the requester why').max(1000) });

export async function documentDeleteRequestRoutes(app: FastifyInstance) {
  const auditLogger = createAuditLogger(app);
  const notifications = createNotificationService(app);

  // Active people holding the Owner / Lead role on a project
  async function managersOf(projectId: string) {
    const members = await app.prisma.projectMember.findMany({
      where: { projectId, role: { in: [...MANAGER_ROLES] }, user: { status: 'ACTIVE' } },
      select: { userId: true, user: { select: { fullName: true } } },
    });
    return members.map((m) => ({ id: m.userId, name: m.user.fullName }));
  }

  const superAdmins = (exceptId: string) =>
    app.prisma.profile.findMany({ where: { role: 'SUPER_ADMIN', status: 'ACTIVE', id: { not: exceptId } }, select: { id: true } });

  // Who may decide this request. A requester never decides their own.
  async function canDecide(userId: string, role: string, req: { requestedById: string; projectId: string; escalated: boolean }) {
    if (req.requestedById === userId) return false;
    if (role === 'SUPER_ADMIN') return true;
    if (req.escalated) return false;
    return (await managersOf(req.projectId)).some((m) => m.id === userId);
  }

  const forbidden = (reply: any, message: string) =>
    reply.code(403).send({ success: false, error: { code: 'FORBIDDEN', message } });
  const notFound = (reply: any) =>
    reply.code(404).send({ success: false, error: { code: 'NOT_FOUND', message: 'Request not found' } });
  const decided = (reply: any, status: string) =>
    reply.code(409).send({ success: false, error: { code: 'ALREADY_DECIDED', message: `This request was already ${status.toLowerCase()}` } });

  // ---- File a delete request (any project member who can write) ----
  app.post('/projects/:projectId/documents/:documentId/delete-request', {
    schema: { body: ReasonSchema },
  }, async (request, reply) => {
    const userId = request.userId!;
    const role = request.user!.role;
    const { projectId, documentId } = request.params as { projectId: string; documentId: string };
    const { reason, immediate } = request.body as z.infer<typeof ReasonSchema>;

    const document = await app.prisma.projectDocument.findFirst({
      where: { id: documentId, projectId },
      select: { id: true, name: true, project: { select: { name: true } } },
    });
    if (!document) {
      return reply.code(404).send({ success: false, error: { code: 'NOT_FOUND', message: 'Document not found' } });
    }
    // (the project-scope hook has already checked membership and blocked read-only viewers)

    const pending = await app.prisma.documentDeleteRequest.findFirst({ where: { documentId, status: 'PENDING' }, select: { id: true } });
    if (pending) {
      return reply.code(409).send({ success: false, error: { code: 'ALREADY_REQUESTED', message: 'A delete request for this document is already waiting for approval' } });
    }

    if (immediate) {
      if (role !== 'SUPER_ADMIN') return forbidden(reply, 'Only a super admin can delete a document without approval');
      const record = await app.prisma.documentDeleteRequest.create({
        data: {
          documentId, projectId, documentName: document.name, reason, status: 'APPROVED',
          requestedById: userId, decidedById: userId, decidedAt: new Date(), decisionNote: 'Deleted directly by a super admin',
        },
      });
      await recycleDocument(app, documentId, userId, record.id);
      await auditLogger.logResource('DELETE', userId, 'document', documentId, { name: document.name, reason, requestId: record.id, direct: true }, request.ip, request.headers['user-agent']);
      return reply.send({ success: true, data: { id: record.id, status: 'APPROVED', deleted: true } });
    }

    const managers = (await managersOf(projectId)).filter((m) => m.id !== userId);
    const requesterIsManager = !!(await app.prisma.projectMember.findFirst({
      where: { projectId, userId, role: { in: [...MANAGER_ROLES] } }, select: { id: true },
    }));
    const escalated = requesterIsManager || managers.length === 0;

    const created = await app.prisma.documentDeleteRequest.create({
      data: { documentId, projectId, documentName: document.name, reason, requestedById: userId, escalated },
    });

    const recipients = escalated ? (await superAdmins(userId)).map((u) => u.id) : managers.map((m) => m.id);
    const requester = request.user!.fullName;
    await notifications.createBulk(
      recipients.map((id) => ({
        userId: id,
        type: 'DOCUMENT_DELETE_REQUESTED' as const,
        title: escalated ? 'Delete request needs a super admin' : 'Document delete request',
        message: `${requester} asked to delete "${document.name}" in ${document.project.name}. Reason: ${reason}`,
        resourceType: 'document_delete_request',
        resourceId: created.id,
      }))
    );

    await auditLogger.logResource('UPDATE', userId, 'document', documentId, { action: 'delete_requested', reason, requestId: created.id, escalated }, request.ip, request.headers['user-agent']);
    return reply.code(201).send({ success: true, data: { id: created.id, status: created.status, escalated } });
  });

  // ---- List: what I must decide (scope=approver) or what I asked for (scope=mine) ----
  app.get('/delete-requests', {
    schema: {
      querystring: z.object({
        scope: z.enum(['approver', 'mine']).default('approver'),
        status: z.enum(['PENDING', 'APPROVED', 'REJECTED', 'CANCELLED']).optional(),
        limit: z.coerce.number().int().min(1).max(100).default(50),
      }),
    },
  }, async (request, reply) => {
    const userId = request.userId!;
    const role = request.user!.role;
    const { scope, status, limit } = request.query as { scope: 'approver' | 'mine'; status?: string; limit: number };

    const where: Prisma.DocumentDeleteRequestWhereInput = {};
    if (status) where.status = status as any;
    if (scope === 'mine') {
      where.requestedById = userId;
    } else {
      where.requestedById = { not: userId }; // you never decide your own request
      where.status = (status as any) ?? 'PENDING';
      // a super admin oversees every pending request; a project manager sees the ones on their projects
      if (role !== 'SUPER_ADMIN') {
        where.escalated = false;
        where.project = { members: { some: { userId, role: { in: [...MANAGER_ROLES] } } } };
      }
    }

    const rows = await app.prisma.documentDeleteRequest.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: limit,
      include: {
        project: { select: { id: true, name: true } },
        requestedBy: { select: { id: true, fullName: true, email: true } },
        decidedBy: { select: { id: true, fullName: true } },
      },
    });

    // who each pending request is waiting for
    const projectIds = [...new Set(rows.filter((r) => r.status === 'PENDING' && !r.escalated).map((r) => r.projectId))];
    const leads = projectIds.length
      ? await app.prisma.projectMember.findMany({
          where: { projectId: { in: projectIds }, role: { in: [...MANAGER_ROLES] }, user: { status: 'ACTIVE' } },
          select: { projectId: true, userId: true, user: { select: { fullName: true } } },
        })
      : [];
    const items = rows.map((r) => ({
      ...r,
      pendingWith:
        r.status !== 'PENDING'
          ? []
          : r.escalated
            ? ['Super Admin']
            : leads.filter((l) => l.projectId === r.projectId && l.userId !== r.requestedById).map((l) => l.user.fullName),
    }));
    return reply.send({ success: true, data: { items, total: items.length } });
  });

  const loadRequest = (id: string) =>
    app.prisma.documentDeleteRequest.findUnique({ where: { id }, include: { requestedBy: { select: { id: true, fullName: true } } } });

  // ---- Approve: the document moves to the recycle bin ----
  app.post('/delete-requests/:id/approve', { schema: { body: DecisionSchema } }, async (request, reply) => {
    const userId = request.userId!;
    const { id } = request.params as { id: string };
    const { note } = request.body as z.infer<typeof DecisionSchema>;

    const req = await loadRequest(id);
    if (!req) return notFound(reply);
    if (req.status !== 'PENDING') return decided(reply, req.status);
    if (req.requestedById === userId) return forbidden(reply, 'You cannot approve your own request');
    if (!(await canDecide(userId, request.user!.role, req))) {
      return forbidden(reply, req.escalated ? 'This request needs a super admin' : 'Only a manager (Owner or Lead) of this project can approve');
    }

    await app.prisma.documentDeleteRequest.update({
      where: { id },
      data: { status: 'APPROVED', decidedById: userId, decidedAt: new Date(), decisionNote: note || null },
    });
    if (req.documentId) await recycleDocument(app, req.documentId, userId, id);

    await notifications.create({
      userId: req.requestedById,
      type: 'DOCUMENT_DELETE_APPROVED',
      title: 'Delete request approved',
      message: `"${req.documentName}" was deleted and is kept in the recycle bin for ${RECYCLE_DAYS} days. Approved by ${request.user!.fullName}${note ? `: ${note}` : ''}`,
      resourceType: 'document_delete_request',
      resourceId: id,
    });
    await auditLogger.logResource('DELETE', userId, 'document', req.documentId ?? id, { name: req.documentName, reason: req.reason, requestId: id, requestedBy: req.requestedBy.fullName }, request.ip, request.headers['user-agent']);
    return reply.send({ success: true, data: { id, status: 'APPROVED' } });
  });

  // ---- Reject: the document stays ----
  app.post('/delete-requests/:id/reject', { schema: { body: RejectSchema } }, async (request, reply) => {
    const userId = request.userId!;
    const { id } = request.params as { id: string };
    const { note } = request.body as z.infer<typeof RejectSchema>;

    const req = await loadRequest(id);
    if (!req) return notFound(reply);
    if (req.status !== 'PENDING') return decided(reply, req.status);
    if (req.requestedById === userId) return forbidden(reply, 'You cannot decide your own request');
    if (!(await canDecide(userId, request.user!.role, req))) {
      return forbidden(reply, req.escalated ? 'This request needs a super admin' : 'Only a manager (Owner or Lead) of this project can reject');
    }

    await app.prisma.documentDeleteRequest.update({
      where: { id },
      data: { status: 'REJECTED', decidedById: userId, decidedAt: new Date(), decisionNote: note },
    });
    await notifications.create({
      userId: req.requestedById,
      type: 'DOCUMENT_DELETE_REJECTED',
      title: 'Delete request rejected',
      message: `"${req.documentName}" will be kept. ${request.user!.fullName}: ${note}`,
      resourceType: 'document_delete_request',
      resourceId: id,
    });
    await auditLogger.logResource('REJECT', userId, 'document', req.documentId ?? id, { name: req.documentName, requestId: id, note }, request.ip, request.headers['user-agent']);
    return reply.send({ success: true, data: { id, status: 'REJECTED' } });
  });

  // ---- The requester can withdraw a pending request ----
  app.post('/delete-requests/:id/cancel', async (request, reply) => {
    const userId = request.userId!;
    const { id } = request.params as { id: string };
    const req = await loadRequest(id);
    if (!req) return notFound(reply);
    if (req.requestedById !== userId) return forbidden(reply, 'Only the requester can cancel this request');
    if (req.status !== 'PENDING') return decided(reply, req.status);
    await app.prisma.documentDeleteRequest.update({ where: { id }, data: { status: 'CANCELLED', decidedAt: new Date() } });
    return reply.send({ success: true, data: { id, status: 'CANCELLED' } });
  });
}
