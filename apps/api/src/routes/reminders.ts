import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { createAuditLogger } from '../services/audit-logger.js';
import { diffFields } from '../services/document-oversight.js';
import { getReminderSettings, runStalledCheck } from '../services/stalled.js';

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

  // Runs the check now (also when the daily check is switched off), so an admin can see what it would do
  app.post('/admin/reminders/run', { preHandler: admins }, async (request, reply) => {
    const summary = await runStalledCheck(app, 'manual');
    await auditLogger.logResource('CREATE', request.userId!, 'reminder_run', 'manual', { ...summary }, request.ip, request.headers['user-agent']);
    return reply.send({ success: true, data: { summary, settings: await getReminderSettings(app) } });
  });
}
