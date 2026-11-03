import type { FastifyInstance } from 'fastify';
import { createAuditLogger } from '../services/audit-logger.js';
import { createNotificationService } from '../services/notifications.js';
import { purgeEntry, restoreDocument } from '../services/recycle-bin.js';

// The recycle bin: deleted documents wait here for 30 days. Super admin only.
export async function recycleBinRoutes(app: FastifyInstance) {
  const auditLogger = createAuditLogger(app);
  const notifications = createNotificationService(app);
  const superAdminOnly = [app.authenticate, app.requireRole(['SUPER_ADMIN'])];

  app.get('/recycle-bin', { preHandler: superAdminOnly }, async (_request, reply) => {
    const entries = await app.prisma.recycledDocument.findMany({ orderBy: { deletedAt: 'desc' } });

    const [projects, users, requests] = await Promise.all([
      app.prisma.project.findMany({ where: { id: { in: [...new Set(entries.map((e) => e.projectId))] } }, select: { id: true, name: true } }),
      app.prisma.profile.findMany({ where: { id: { in: [...new Set(entries.map((e) => e.deletedById))] } }, select: { id: true, fullName: true } }),
      app.prisma.documentDeleteRequest.findMany({
        where: { id: { in: entries.map((e) => e.requestId).filter((x): x is string => !!x) } },
        select: { id: true, reason: true, requestedBy: { select: { fullName: true } } },
      }),
    ]);
    const now = Date.now();
    const items = entries.map((e) => {
      const snap = e.snapshot as any;
      const req = requests.find((r) => r.id === e.requestId);
      return {
        id: e.id,
        documentName: e.documentName,
        category: snap?.document?.category ?? null,
        mimeType: snap?.document?.mimeType ?? null,
        size: e.size,
        versions: snap?.versions?.length ?? 0,
        projectId: e.projectId,
        projectName: projects.find((p) => p.id === e.projectId)?.name ?? null, // null: the project was deleted too
        deletedBy: users.find((u) => u.id === e.deletedById)?.fullName ?? 'Unknown',
        requestedBy: req?.requestedBy.fullName ?? null,
        reason: req?.reason ?? null,
        deletedAt: e.deletedAt,
        purgeAt: e.purgeAt,
        daysLeft: Math.max(0, Math.ceil((e.purgeAt.getTime() - now) / 86400000)),
      };
    });
    return reply.send({ success: true, data: { items, total: items.length } });
  });

  app.post('/recycle-bin/:id/restore', { preHandler: superAdminOnly }, async (request, reply) => {
    const { id } = request.params as { id: string };
    // read this first: the entry disappears on restore
    const entryInfo = await app.prisma.recycledDocument.findUnique({ where: { id }, select: { requestId: true } });
    const result = await restoreDocument(app, id, request.userId!);
    if (!result.ok) {
      return reply.code(result.reason === 'NOT_FOUND' ? 404 : 409).send({ success: false, error: { code: result.reason, message: result.message } });
    }
    await auditLogger.logResource('UPDATE', request.userId!, 'document', result.documentId, { action: 'restored_from_recycle_bin', name: result.name }, request.ip, request.headers['user-agent']);

    // tell whoever asked for the deletion that it was undone
    const asked = entryInfo?.requestId
      ? await app.prisma.documentDeleteRequest.findUnique({ where: { id: entryInfo.requestId }, select: { requestedById: true } })
      : null;
    if (asked && asked.requestedById !== request.userId) {
      await notifications.create({
        userId: asked.requestedById, type: 'DOCUMENT_APPROVED', title: 'Document restored',
        message: `"${result.name}" was restored from the recycle bin by ${request.user!.fullName}`,
        resourceType: 'document', resourceId: result.documentId,
      });
    }
    return reply.send({ success: true, data: { documentId: result.documentId, projectId: result.projectId } });
  });

  // Delete for good, before the 30 days are up
  app.delete('/recycle-bin/:id', { preHandler: superAdminOnly }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const entry = await app.prisma.recycledDocument.findUnique({ where: { id }, select: { documentName: true, documentId: true } });
    if (!entry || !(await purgeEntry(app, id))) {
      return reply.code(404).send({ success: false, error: { code: 'NOT_FOUND', message: 'Not found in the recycle bin' } });
    }
    await auditLogger.logResource('DELETE', request.userId!, 'document', entry.documentId, { name: entry.documentName, action: 'purged_from_recycle_bin' }, request.ip, request.headers['user-agent']);
    return reply.send({ success: true, data: null });
  });
}
