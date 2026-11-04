import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { createAuditLogger } from '../services/audit-logger.js';
import { diffFields } from '../services/document-oversight.js';
import { getReminderSettings, runStalledCheck } from '../services/stalled.js';
import { getWorkSettings } from './work-sessions.js';
import { isOcrRunning, pendingPictures, runOcrBatch } from '../services/ocr.js';

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
  app.put('/admin/work-settings', { schema: { body: z.object({ requireScreenShare: z.boolean().optional(), ocrEnabled: z.boolean().optional() }) }, preHandler: admins }, async (request, reply) => {
    const data = request.body as { requireScreenShare?: boolean; ocrEnabled?: boolean };
    const before = await getWorkSettings(app);
    const settings = await app.prisma.workSettings.update({ where: { id: 'default' }, data });
    await auditLogger.logResource('UPDATE', request.userId!, 'work_settings', 'default', { changes: diffFields(before as Record<string, any>, data) }, request.ip, request.headers['user-agent']);
    return reply.send({ success: true, data: settings });
  });

  // Reads a batch of unread screenshots now (at night this happens by itself)
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
