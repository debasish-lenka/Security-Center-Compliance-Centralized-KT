import type { FastifyInstance } from 'fastify';
import { createReadStream } from 'fs';
import { rm, stat } from 'fs/promises';
import { join } from 'path';
import { z } from 'zod';
import { createAuditLogger } from '../services/audit-logger.js';
import { BACKUP_ROOT, FILES, NAME_RE, getSettings, isBackupRunning, listBackups, nextRun, runBackup } from '../services/backup.js';

const SettingsSchema = z.object({
  enabled: z.boolean(),
  frequency: z.enum(['DAILY', 'WEEKLY']),
  timeUtc: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Use HH:mm'),
  weekday: z.number().int().min(0).max(6),
  keep: z.number().int().min(1).max(90),
  includeDocuments: z.boolean(),
});

// Backups hold every password hash and all documents, so only a super admin may see or take them.
export async function backupRoutes(app: FastifyInstance) {
  const auditLogger = createAuditLogger(app);
  const superAdminOnly = [app.authenticate, app.requireRole(['SUPER_ADMIN'])];

  app.get('/backups', { preHandler: superAdminOnly }, async (_request, reply) => {
    const settings = await getSettings(app);
    const items = await listBackups();
    return reply.send({
      success: true,
      data: { settings, items, running: isBackupRunning(), nextRunAt: nextRun(settings) },
    });
  });

  app.put('/backups/settings', { schema: { body: SettingsSchema }, preHandler: superAdminOnly }, async (request, reply) => {
    const data = request.body as z.infer<typeof SettingsSchema>;
    const settings = await app.prisma.backupSettings.upsert({ where: { id: 'default' }, create: { id: 'default', ...data }, update: data });
    await auditLogger.logResource('UPDATE', request.userId!, 'backup_settings', 'default', data, request.ip, request.headers['user-agent']);
    return reply.send({ success: true, data: { settings, nextRunAt: nextRun(settings) } });
  });

  // Starts a backup and returns at once; the page polls the list until it finishes
  app.post('/backups/run', { preHandler: superAdminOnly }, async (request, reply) => {
    if (isBackupRunning()) {
      return reply.code(409).send({ success: false, error: { code: 'BACKUP_RUNNING', message: 'A backup is already running' } });
    }
    await auditLogger.logResource('CREATE', request.userId!, 'backup', 'manual', {}, request.ip, request.headers['user-agent']);
    void runBackup(app, 'manual');
    return reply.code(202).send({ success: true, data: { started: true } });
  });

  app.get('/backups/:name/:file', { preHandler: superAdminOnly }, async (request, reply) => {
    const { name, file } = request.params as { name: string; file: 'db' | 'documents' };
    if (!NAME_RE.test(name) || !(file in FILES)) {
      return reply.code(404).send({ success: false, error: { code: 'NOT_FOUND', message: 'Backup not found' } });
    }
    const path = join(BACKUP_ROOT, name, FILES[file]);
    const info = await stat(path).catch(() => null);
    if (!info || !(await stat(join(BACKUP_ROOT, name, 'OK')).catch(() => null))) {
      return reply.code(404).send({ success: false, error: { code: 'NOT_FOUND', message: 'Backup file not found' } });
    }
    await auditLogger.logResource('DOWNLOAD', request.userId!, 'backup', name, { file: FILES[file] }, request.ip, request.headers['user-agent']);
    reply.header('Content-Type', 'application/octet-stream');
    reply.header('Content-Length', info.size);
    reply.header('Content-Disposition', `attachment; filename="dbi-${name}-${FILES[file]}"`);
    reply.header('Cache-Control', 'private, no-store');
    return reply.send(createReadStream(path));
  });

  app.delete('/backups/:name', { preHandler: superAdminOnly }, async (request, reply) => {
    const { name } = request.params as { name: string };
    if (!NAME_RE.test(name) || !(await stat(join(BACKUP_ROOT, name, 'OK')).catch(() => null))) {
      return reply.code(404).send({ success: false, error: { code: 'NOT_FOUND', message: 'Backup not found' } });
    }
    await rm(join(BACKUP_ROOT, name), { recursive: true, force: true });
    await auditLogger.logResource('DELETE', request.userId!, 'backup', name, {}, request.ip, request.headers['user-agent']);
    return reply.send({ success: true, data: null });
  });
}
