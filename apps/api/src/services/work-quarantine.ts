import { randomUUID } from 'crypto';
import type { FastifyInstance } from 'fastify';
import { createAuditLogger } from './audit-logger.js';
import { getStorageService } from './storage.js';
import { openSecretFile, sealSecret, vaultEnabled } from './vault-crypto.js';

// A screenshot that did not show the tool is not part of the work log. Instead of being thrown away at once it is kept
// for QUARANTINE_HOURS, encrypted, where nobody in the work log can see it. An admin can restore it, or it is deleted
// by itself when the time is up. Every step is in the audit log.
export const QUARANTINE_HOURS = 48;
const storage = getStorageService();

// Keep a refused picture. Returns its id, or null when the Secret Manager key is not set (then nothing is kept).
export async function quarantineShot(app: FastifyInstance, sessionId: string, userId: string, buf: Buffer, reason: string): Promise<string | null> {
  if (!vaultEnabled()) return null;
  const id = randomUUID();
  const sealed = sealSecret({ value: '' }, id, 1, buf);
  const storageKey = `_quarantine/${id}.bin`;
  await storage.upload(storageKey, sealed.fileBlob!);
  await app.prisma.workQuarantine.create({
    data: { id, sessionId, userId, storageKey, dekEnc: sealed.dekEnc, valueEnc: sealed.valueEnc, keyId: sealed.keyId, size: buf.length, reason, expiresAt: new Date(Date.now() + QUARANTINE_HOURS * 3600_000) },
  });
  await createAuditLogger(app).logResource('CREATE', userId, 'work_quarantine', id, { sessionId, size: buf.length, expiresInHours: QUARANTINE_HOURS, reason: 'the tool was not on the picture' });
  return id;
}

// Delete the pictures whose time is up (written to the audit log, one entry each)
export async function purgeQuarantine(app: FastifyInstance): Promise<number> {
  const due = await app.prisma.workQuarantine.findMany({ where: { expiresAt: { lt: new Date() }, status: 'HELD' } });
  const audit = createAuditLogger(app);
  for (const q of due) {
    if (q.storageKey) await storage.delete(q.storageKey).catch(() => undefined);
    await app.prisma.workQuarantine.update({ where: { id: q.id }, data: { status: 'DELETED', decidedAt: new Date(), storageKey: null } });
    await audit.logResource('DELETE', q.userId, 'work_quarantine', q.id, { sessionId: q.sessionId, reason: 'time is up, not restored' });
  }
  return due.length;
}

// Admin decision: restore into the session's work log (verified by a person), or throw it away now
export async function decideQuarantine(app: FastifyInstance, id: string, adminId: string, restore: boolean, note?: string): Promise<'RESTORED' | 'DELETED' | 'NOT_HELD' | 'NOT_FOUND'> {
  const q = await app.prisma.workQuarantine.findUnique({ where: { id } });
  if (!q) return 'NOT_FOUND';
  if (q.status !== 'HELD' || !q.storageKey) return 'NOT_HELD';
  const audit = createAuditLogger(app);
  if (!restore) {
    await storage.delete(q.storageKey).catch(() => undefined);
    await app.prisma.workQuarantine.update({ where: { id }, data: { status: 'DELETED', decidedById: adminId, decidedAt: new Date(), storageKey: null, decisionNote: note ?? null } });
    await audit.logResource('DELETE', adminId, 'work_quarantine', id, { sessionId: q.sessionId, reason: 'refused by an admin', note: note ?? null });
    return 'DELETED';
  }
  const blob = Buffer.concat(await collect(storage.openRead(q.storageKey)));
  const bytes = openSecretFile({ dekEnc: q.dekEnc }, blob, id, 1);
  const project = (await app.prisma.workSession.findUnique({ where: { id: q.sessionId }, select: { projectId: true } }))!;
  const key = `${project.projectId}/work/${q.sessionId}/${Date.now()}-restored.jpg`;
  await storage.upload(key, bytes, 'image/jpeg');
  await app.prisma.$transaction([
    app.prisma.workEntry.create({ data: { sessionId: q.sessionId, kind: 'SHOT', storageKey: key, size: bytes.length, reason: 'RESTORED', toolSeen: true, ocrAt: new Date() } }),
    app.prisma.workQuarantine.update({ where: { id }, data: { status: 'RESTORED', decidedById: adminId, decidedAt: new Date(), storageKey: null, decisionNote: note ?? null } }),
  ]);
  await storage.delete(q.storageKey).catch(() => undefined);
  await audit.logResource('UPDATE', adminId, 'work_quarantine', id, { sessionId: q.sessionId, restored: true, note: note ?? null });
  return 'RESTORED';
}

async function collect(stream: AsyncIterable<unknown>): Promise<Buffer[]> {
  const out: Buffer[] = [];
  for await (const c of stream) out.push(c as Buffer);
  return out;
}

export function startQuarantinePurge(app: FastifyInstance) {
  const tick = () => purgeQuarantine(app).then((n) => { if (n) app.log.info({ deleted: n }, 'work quarantine: expired pictures deleted'); }).catch((e) => app.log.warn({ err: e }, 'work quarantine purge failed'));
  setInterval(tick, 60 * 60_000).unref();
  setTimeout(tick, 5 * 60_000).unref();
}
