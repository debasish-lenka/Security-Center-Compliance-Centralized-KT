import type { FastifyInstance } from 'fastify';
import type { Prisma } from '@prisma/client';
import { getStorageService } from './storage.js';

export const RECYCLE_DAYS = 30;
const DAY = 24 * 3600 * 1000;

// Moves a document to the recycle bin: its rows are removed from the live tables and kept as a
// snapshot; the files on disk are left alone until the bin entry is purged.
export async function recycleDocument(app: FastifyInstance, documentId: string, deletedById: string, requestId?: string) {
  const doc = await app.prisma.projectDocument.findUnique({ where: { id: documentId }, include: { versions: true } });
  if (!doc) return null;

  const { versions, ...row } = doc;
  const entry = await app.prisma.recycledDocument.create({
    data: {
      documentId: doc.id,
      projectId: doc.projectId,
      documentName: doc.name,
      snapshot: JSON.parse(JSON.stringify({ document: row, versions })) as Prisma.InputJsonValue,
      size: doc.size,
      deletedById,
      requestId: requestId ?? null,
      purgeAt: new Date(Date.now() + RECYCLE_DAYS * DAY),
    },
  });
  await app.prisma.projectDocument.delete({ where: { id: documentId } });
  return entry;
}

interface Snapshot {
  document: Record<string, any>;
  versions: Record<string, any>[];
}

const asDate = (v: unknown) => (v ? new Date(v as string) : null);

// Puts a recycled document back exactly as it was (same id, versions and files)
export async function restoreDocument(app: FastifyInstance, entryId: string, restoredById: string) {
  const entry = await app.prisma.recycledDocument.findUnique({ where: { id: entryId } });
  if (!entry) return { ok: false as const, reason: 'NOT_FOUND', message: 'Not found in the recycle bin' };

  const project = await app.prisma.project.findUnique({ where: { id: entry.projectId }, select: { id: true } });
  if (!project) return { ok: false as const, reason: 'PROJECT_GONE', message: 'The project of this document no longer exists' };

  const { document: d, versions } = entry.snapshot as unknown as Snapshot;

  // people may have left since; fall back to whoever restores it
  const existing = new Set(
    (await app.prisma.profile.findMany({ where: { id: { in: [d.uploadedById, d.ownerId, d.reviewerId].filter(Boolean) } }, select: { id: true } })).map((u) => u.id)
  );
  const orFallback = (id?: string | null) => (id && existing.has(id) ? id : restoredById);

  await app.prisma.$transaction(async (tx) => {
    await tx.projectDocument.create({
      data: {
        ...(d as any),
        uploadedById: orFallback(d.uploadedById),
        ownerId: orFallback(d.ownerId),
        reviewerId: d.reviewerId && existing.has(d.reviewerId) ? d.reviewerId : null,
        ktReportId: null,
        createdAt: asDate(d.createdAt) ?? new Date(),
        updatedAt: new Date(),
        reviewedAt: asDate(d.reviewedAt),
        watermarkConfig: d.watermarkConfig ?? undefined,
        metadata: d.metadata ?? undefined,
      },
    });
    for (const v of versions) {
      await tx.documentVersion.create({
        data: { ...(v as any), uploadedById: orFallback(v.uploadedById), createdAt: asDate(v.createdAt) ?? new Date() },
      });
    }
    await tx.recycledDocument.delete({ where: { id: entryId } });
  });
  return { ok: true as const, documentId: d.id as string, projectId: entry.projectId, name: entry.documentName };
}

// Removes the files and the bin entry for good
export async function purgeEntry(app: FastifyInstance, entryId: string) {
  const entry = await app.prisma.recycledDocument.findUnique({ where: { id: entryId } });
  if (!entry) return false;
  const { document: d, versions } = entry.snapshot as unknown as Snapshot;
  const storage = getStorageService();
  const keys = new Set<string>([d.storageKey, ...versions.map((v) => v.storageKey)].filter(Boolean));
  for (const key of keys) await storage.delete(key).catch(() => {});
  await app.prisma.recycledDocument.delete({ where: { id: entryId } });
  return true;
}

// Anything older than 30 days goes for good. Runs at start-up and every few hours.
export async function purgeExpired(app: FastifyInstance) {
  const due = await app.prisma.recycledDocument.findMany({ where: { purgeAt: { lt: new Date() } }, select: { id: true } });
  for (const { id } of due) await purgeEntry(app, id);
  return due.length;
}

export function startPurgeJob(app: FastifyInstance) {
  const run = () => purgeExpired(app).then((n) => n && app.log.info(`Recycle bin: purged ${n} expired document(s)`)).catch((e) => app.log.error(e));
  run();
  const timer = setInterval(run, 6 * 3600 * 1000);
  timer.unref();
}
