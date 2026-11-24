import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { createAuditLogger } from '../services/audit-logger.js';
import { diffFields } from '../services/document-oversight.js';
import { getReminderSettings, runStalledCheck } from '../services/stalled.js';
import { getWorkSettings } from './work-sessions.js';
import { isOcrRunning, pendingPictures, runOcrBatch } from '../services/ocr.js';
import { decideQuarantine } from '../services/work-quarantine.js';
import { openSecretFile, vaultEnabled } from '../services/vault-crypto.js';
import { getStorageService } from '../services/storage.js';

const days = z.number().int().min(1).max(90);
const SettingsSchema = z.object({
  enabled: z.boolean(),
  stalledAfterDays: days,
  notStartedAfterDays: days,
  escalateAfterDays: days,
});

// The admin decides after how many days quiet work is flagged. Default: 7.
export async function reminderRoutes(app: FastifyInstance) {
  const auditLogger = createAuditLogger(app);
  const admins = [app.authenticate, app.requireRole(['SUPER_ADMIN', 'ADMIN'])];

  app.get('/admin/reminders', { preHandler: admins }, async (_request, reply) => {
    return reply.send({ success: true, data: await getReminderSettings(app) });
  });

  app.put('/admin/reminders', { schema: { body: SettingsSchema }, preHandler: admins }, async (request, reply) => {
    const data = request.body as z.infer<typeof SettingsSchema>;
    const before = await getReminderSettings(app);
    const settings = await app.prisma.reminderSettings.update({ where: { id: 'default' }, data });
    await auditLogger.logResource('UPDATE', request.userId!, 'reminder_settings', 'default', { changes: diffFields(before as Record<string, any>, data) }, request.ip, request.headers['user-agent']);
    return reply.send({ success: true, data: settings });
  });

  // How strictly work is recorded: is sharing the whole screen needed to start work?
  app.get('/admin/work-settings', { preHandler: admins }, async (_request, reply) => reply.send({ success: true, data: { ...(await getWorkSettings(app)), ocrPending: await pendingPictures(app), ocrRunning: isOcrRunning() } }));
  app.put('/admin/work-settings', { schema: { body: z.object({ requireScreenShare: z.boolean().optional(), ocrEnabled: z.boolean().optional(), requireTaskEvidence: z.boolean().optional() }) }, preHandler: admins }, async (request, reply) => {
    const data = request.body as { requireScreenShare?: boolean; ocrEnabled?: boolean; requireTaskEvidence?: boolean };
    const before = await getWorkSettings(app);
    const settings = await app.prisma.workSettings.update({ where: { id: 'default' }, data });
    await auditLogger.logResource('UPDATE', request.userId!, 'work_settings', 'default', { changes: diffFields(before as Record<string, any>, data) }, request.ip, request.headers['user-agent']);
    return reply.send({ success: true, data: settings });
  });

  // Reads a batch of unread screenshots now (at night this happens by itself)
  // Screenshots kept for 48 hours because they did not show the tool. Admins see them here and decide.
  app.get('/admin/work-quarantine', { preHandler: admins }, async (request, reply) => {
    const rows = await app.prisma.workQuarantine.findMany({ where: { status: 'HELD' }, orderBy: { createdAt: 'desc' }, take: 200 });
    const sessions = await app.prisma.workSession.findMany({ where: { id: { in: [...new Set(rows.map((r) => r.sessionId))] } }, select: { id: true, projectId: true, linkLabel: true, userId: true, project: { select: { name: true } } } });
    const people = await app.prisma.profile.findMany({ where: { id: { in: [...new Set(sessions.map((s) => s.userId))] } }, select: { id: true, fullName: true } });
    const sBy = new Map(sessions.map((s) => [s.id, s]));
    const pBy = new Map(people.map((p) => [p.id, p.fullName]));
    return reply.send({ success: true, data: rows.map((r) => {
      const s = sBy.get(r.sessionId);
      return { id: r.id, createdAt: r.createdAt, expiresAt: r.expiresAt, size: r.size, reason: r.reason, project: s?.project.name ?? '', person: s ? pBy.get(s.userId) ?? '' : '', tool: s?.linkLabel ?? null };
    }) });
  });

  // The picture itself, decrypted for this one request. Never cached, and every look is audited.
  app.get('/admin/work-quarantine/:id/picture', { preHandler: admins }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const q = await app.prisma.workQuarantine.findUnique({ where: { id } });
    if (!q || q.status !== 'HELD' || !q.storageKey || !vaultEnabled()) return reply.code(404).send({ success: false, error: { code: 'NOT_FOUND', message: 'That picture is not held any more' } });
    const chunks: Buffer[] = [];
    for await (const c of getStorageService().openRead(q.storageKey)) chunks.push(c as Buffer);
    const bytes = openSecretFile({ dekEnc: q.dekEnc }, Buffer.concat(chunks), id, 1);
    await auditLogger.logResource('DOWNLOAD', request.userId!, 'work_quarantine', id, { sessionId: q.sessionId, viewedBy: 'admin' }, request.ip, request.headers['user-agent']);
    reply.header('Cache-Control', 'no-store');
    return reply.type('image/jpeg').send(bytes);
  });

  // Decide: restore it into the work log (a person checked the tool is on it), or refuse and delete it now
  app.post('/admin/work-quarantine/:id/decide', { preHandler: admins, schema: { body: z.object({ restore: z.boolean(), note: z.string().trim().max(300).optional() }) } }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const b = request.body as { restore: boolean; note?: string };
    if (!b.restore && (b.note ?? '').length < 5) return reply.code(400).send({ success: false, error: { code: 'NOTE_REQUIRED', message: 'Write why you are refusing it (at least 5 characters)' } });
    const r = await decideQuarantine(app, id, request.userId!, b.restore, b.note);
    if (r === 'NOT_FOUND') return reply.code(404).send({ success: false, error: { code: 'NOT_FOUND', message: 'Not found' } });
    if (r === 'NOT_HELD') return reply.code(409).send({ success: false, error: { code: 'NOT_HELD', message: 'Already decided or expired' } });
    return reply.send({ success: true, data: { status: r } });
  });

  app.post('/admin/work-ocr/run', { preHandler: admins }, async (request, reply) => {
    if (isOcrRunning()) return reply.code(409).send({ success: false, error: { code: 'RUNNING', message: 'The screenshot check is already running' } });
    await auditLogger.logResource('CREATE', request.userId!, 'work_ocr_run', 'manual', {}, request.ip, request.headers['user-agent']);
    // returns at once; the page watches "running" and the last summary
    void (async () => {
      try {
        const r = await runOcrBatch(app, 60);
        await app.prisma.workSettings.update({ where: { id: 'default' }, data: { ocrLastRunAt: new Date(), ocrLastSummary: `${r.read} screenshot(s) read, the tool was seen on ${r.seen}${r.left ? `, ${r.left} still waiting` : ''}` } });
      } catch (e) {
        app.log.error({ err: e }, 'screenshot check failed');
        await app.prisma.workSettings.update({ where: { id: 'default' }, data: { ocrLastRunAt: new Date(), ocrLastSummary: `The check failed: ${String((e as Error)?.message ?? e).slice(0, 200)}` } }).catch(() => undefined);
      }
    })();
    return reply.code(202).send({ success: true, data: { started: true } });
  });

  // Runs the check now (also when the daily check is switched off), so an admin can see what it would do
  app.post('/admin/reminders/run', { preHandler: admins }, async (request, reply) => {
    const summary = await runStalledCheck(app, 'manual');
    await auditLogger.logResource('CREATE', request.userId!, 'reminder_run', 'manual', { ...summary }, request.ip, request.headers['user-agent']);
    return reply.send({ success: true, data: { summary, settings: await getReminderSettings(app) } });
  });
}
