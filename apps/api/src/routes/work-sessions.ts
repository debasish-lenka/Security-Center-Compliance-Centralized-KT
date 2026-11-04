import type { FastifyInstance, FastifyRequest } from 'fastify';
import { createHash } from 'crypto';
import { z } from 'zod';
import { createAuditLogger } from '../services/audit-logger.js';
import { getStorageService } from '../services/storage.js';
import { tellSuperAdmins } from '../services/document-oversight.js';
import { formatWhen } from '../services/watermark.js';
import { evidenceOf, lengthOf, minutesBetween, workKtPdf } from '../services/work-kt.js';

export const getWorkSettings = (app: FastifyInstance) => app.prisma.workSettings.upsert({ where: { id: 'default' }, create: { id: 'default' }, update: {} });
const SURFACE = z.enum(['monitor', 'window', 'browser']);
const surfaceName = (s: string) => (s === 'monitor' ? 'the whole screen' : s === 'window' ? 'a window' : 'a browser tab');

// Work sessions: a person presses "Start work" on a project, writes notes and (with their permission) shares
// their screen; the system keeps the notes and a few screenshots, and "Generate KT" turns them into one
// versioned document in the vault.

const IDLE_MS = 10 * 60 * 1000; // no sign of life for this long: the session is closed as IDLE
const MAX_SHOT_BYTES = 800_000;
const MAX_SHOTS_PER_SESSION = 400;
const KEEP_PICTURES_DAYS = Number(process.env.WORK_SHOT_RETENTION_DAYS ?? 90);

const bad = (reply: any, code: number, c: string, message: string) => reply.code(code).send({ success: false, error: { code: c, message } });

export async function workSessionRoutes(app: FastifyInstance) {
  const storage = getStorageService();
  const auditLogger = createAuditLogger(app);

  const sees = (request: FastifyRequest, ownerId: string) =>
    ownerId === request.userId || ['SUPER_ADMIN', 'ADMIN'].includes(request.user!.role) || ['OWNER', 'LEAD'].includes(request.projectRole ?? '');

  // Sessions whose person went quiet are closed at the last sign of life
  const closeStale = async (projectId: string) => {
    const stale = await app.prisma.workSession.findMany({ where: { projectId, endedAt: null, lastSeenAt: { lt: new Date(Date.now() - IDLE_MS) } }, select: { id: true, lastSeenAt: true } });
    for (const s of stale) {
      await app.prisma.workSession.update({ where: { id: s.id }, data: { endedAt: s.lastSeenAt, endReason: 'IDLE' } });
      await app.prisma.workEntry.create({ data: { sessionId: s.id, kind: 'EVENT', text: 'Session ended: no sign of activity for a while', createdAt: s.lastSeenAt } });
    }
  };

  const mine = async (projectId: string, sessionId: string, userId: string) =>
    app.prisma.workSession.findFirst({ where: { id: sessionId, projectId, userId } });

  const counts = async (ids: string[]) => {
    const rows = ids.length ? await app.prisma.workEntry.groupBy({ by: ['sessionId', 'kind'], where: { sessionId: { in: ids } }, _count: true }) : [];
    const out = new Map<string, { notes: number; shots: number }>();
    for (const r of rows) {
      const c = out.get(r.sessionId) ?? { notes: 0, shots: 0 };
      if (r.kind === 'NOTE') c.notes = r._count; else if (r.kind === 'SHOT') c.shots = r._count;
      out.set(r.sessionId, c);
    }
    return out;
  };

  const shape = (s: { id: string; userId: string; linkLabel: string | null; linkUrl: string | null; startedAt: Date; endedAt: Date | null; endReason: string | null; lastSeenAt: Date; includedIn: string | null; shareStarts: number; shareStops: number; surface: string | null }, c?: { notes: number; shots: number }, name?: string) => ({
    shareStarts: s.shareStarts, shareStops: s.shareStops, surface: s.surface, evidence: evidenceOf(s, c?.shots ?? 0),
    id: s.id, userId: s.userId, userName: name, linkLabel: s.linkLabel, linkUrl: s.linkUrl, startedAt: s.startedAt, endedAt: s.endedAt, endReason: s.endReason,
    lastSeenAt: s.lastSeenAt, minutes: minutesBetween(s.startedAt, s.endedAt), notes: c?.notes ?? 0, shots: c?.shots ?? 0, inKt: !!s.includedIn,
  });

  // My work on this project: the running session, my latest ones and what is not in a KT yet
  app.get('/:projectId/work/state', async (request) => {
    const { projectId } = request.params as { projectId: string };
    const userId = request.userId!;
    await closeStale(projectId);
    const [project, sessions, pending, settings] = await Promise.all([
      app.prisma.project.findUnique({ where: { id: projectId }, select: { name: true, workLinks: true } }),
      app.prisma.workSession.findMany({ where: { projectId, userId }, orderBy: { startedAt: 'desc' }, take: 10 }),
      app.prisma.workSession.findMany({ where: { projectId, userId, includedIn: null }, select: { id: true, endedAt: true } }),
      getWorkSettings(app),
    ]);
    const c = await counts(sessions.map((s) => s.id));
    const pc = await counts(pending.map((s) => s.id));
    const active = sessions.find((s) => !s.endedAt) ?? null;
    let activeNotes: { id: string; text: string | null; createdAt: Date }[] = [];
    if (active) activeNotes = await app.prisma.workEntry.findMany({ where: { sessionId: active.id, kind: 'NOTE' }, orderBy: { createdAt: 'asc' }, select: { id: true, text: true, createdAt: true } });
    const notInKt = pending.filter((s) => s.endedAt);
    return {
      success: true,
      data: {
        requireShare: settings.requireScreenShare,
        links: (project?.workLinks as { label: string; url: string }[] | null) ?? [],
        active: active ? { ...shape(active, c.get(active.id)), notesList: activeNotes } : null,
        recent: sessions.map((s) => shape(s, c.get(s.id))),
        pending: { sessions: notInKt.length, notes: notInKt.reduce((n, s) => n + (pc.get(s.id)?.notes ?? 0), 0), shots: notInKt.reduce((n, s) => n + (pc.get(s.id)?.shots ?? 0), 0) },
      },
    };
  });

  app.post('/:projectId/work/start', {
    schema: { body: z.object({ linkUrl: z.string().max(500).optional().nullable(), linkLabel: z.string().max(60).optional().nullable(), surface: SURFACE.optional().nullable() }) },
  }, async (request, reply) => {
    const { projectId } = request.params as { projectId: string };
    const userId = request.userId!;
    const { linkUrl, linkLabel, surface } = request.body as { linkUrl?: string | null; linkLabel?: string | null; surface?: string | null };
    const settings = await getWorkSettings(app);
    if (settings.requireScreenShare && surface !== 'monitor') return bad(reply, 400, 'SHARE_REQUIRED', 'Share your whole screen to start work');
    await closeStale(projectId);
    const open = await app.prisma.workSession.findFirst({ where: { projectId, userId, endedAt: null } });
    if (open) return bad(reply, 409, 'ALREADY_RUNNING', 'You already have a work session running on this project');
    const session = await app.prisma.workSession.create({ data: { projectId, userId, linkUrl: linkUrl ?? null, linkLabel: linkLabel ?? null, surface: surface ?? null, shareStarts: surface ? 1 : 0 } });
    await app.prisma.workEntry.create({ data: { sessionId: session.id, kind: 'EVENT', text: linkUrl ? `Started work, opened ${linkLabel ? `${linkLabel} (${linkUrl})` : linkUrl}` : 'Started work' } });
    if (surface) await app.prisma.workEntry.create({ data: { sessionId: session.id, kind: 'EVENT', text: `Started sharing ${surfaceName(surface)}` } });
    await app.prisma.activityFeed.create({ data: { actorId: userId, action: 'CREATE', resourceType: 'work_session', projectId, details: { text: 'started a work session' }, ipAddress: request.ip, userAgent: request.headers['user-agent'] } });
    await auditLogger.logResource('CREATE', userId, 'work_session', session.id, { projectId, link: linkUrl ?? null }, request.ip, request.headers['user-agent']);
    return reply.code(201).send({ success: true, data: shape(session) });
  });

  app.post('/:projectId/work/:sessionId/heartbeat', async (request, reply) => {
    const { projectId, sessionId } = request.params as { projectId: string; sessionId: string };
    const s = await mine(projectId, sessionId, request.userId!);
    if (!s) return bad(reply, 404, 'NOT_FOUND', 'Work session not found');
    if (s.endedAt) return bad(reply, 409, 'ENDED', 'This work session has ended');
    await app.prisma.workSession.update({ where: { id: s.id }, data: { lastSeenAt: new Date() } });
    return { success: true, data: { ok: true } };
  });

  app.post('/:projectId/work/:sessionId/note', { schema: { body: z.object({ text: z.string().trim().min(1).max(5000) }) } }, async (request, reply) => {
    const { projectId, sessionId } = request.params as { projectId: string; sessionId: string };
    const s = await mine(projectId, sessionId, request.userId!);
    if (!s) return bad(reply, 404, 'NOT_FOUND', 'Work session not found');
    if (s.endedAt) return bad(reply, 409, 'ENDED', 'This work session has ended');
    const e = await app.prisma.workEntry.create({ data: { sessionId: s.id, kind: 'NOTE', text: (request.body as { text: string }).text } });
    await app.prisma.workSession.update({ where: { id: s.id }, data: { lastSeenAt: new Date() } });
    return reply.code(201).send({ success: true, data: { id: e.id, text: e.text, createdAt: e.createdAt } });
  });

  // Screen sharing started / stopped / refused: counted on the session and written down, so it cannot be hidden
  app.post('/:projectId/work/:sessionId/share', {
    schema: { body: z.object({ state: z.enum(['STARTED', 'STOPPED', 'DENIED', 'REJECTED']), surface: SURFACE.optional().nullable() }) },
  }, async (request, reply) => {
    const { projectId, sessionId } = request.params as { projectId: string; sessionId: string };
    const s = await mine(projectId, sessionId, request.userId!);
    if (!s) return bad(reply, 404, 'NOT_FOUND', 'Work session not found');
    if (s.endedAt) return bad(reply, 409, 'ENDED', 'This work session has ended');
    const { state, surface } = request.body as { state: 'STARTED' | 'STOPPED' | 'DENIED' | 'REJECTED'; surface?: string | null };
    const settings = await getWorkSettings(app);
    if (state === 'STARTED' && settings.requireScreenShare && surface !== 'monitor') return bad(reply, 400, 'SHARE_REQUIRED', 'Share your whole screen');
    const text = { STARTED: `Started sharing ${surfaceName(surface ?? 'monitor')}`, STOPPED: 'Stopped sharing the screen', DENIED: 'Screen sharing was not allowed', REJECTED: 'Shared a window or tab instead of the whole screen (not accepted)' }[state];
    await app.prisma.workEntry.create({ data: { sessionId: s.id, kind: 'EVENT', text } });
    await app.prisma.workSession.update({
      where: { id: s.id },
      data: state === 'STARTED'
        ? { shareStarts: { increment: 1 }, surface: s.surface && s.surface !== 'monitor' ? s.surface : (surface ?? s.surface), lastSeenAt: new Date() }
        : { shareStops: { increment: 1 }, lastSeenAt: new Date() },
    });
    return reply.code(201).send({ success: true, data: { ok: true } });
  });

  // Other events (a tool was opened)
  app.post('/:projectId/work/:sessionId/event', { schema: { body: z.object({ text: z.string().trim().min(1).max(200) }) } }, async (request, reply) => {
    const { projectId, sessionId } = request.params as { projectId: string; sessionId: string };
    const s = await mine(projectId, sessionId, request.userId!);
    if (!s) return bad(reply, 404, 'NOT_FOUND', 'Work session not found');
    if (s.endedAt) return bad(reply, 409, 'ENDED', 'This work session has ended');
    await app.prisma.workEntry.create({ data: { sessionId: s.id, kind: 'EVENT', text: (request.body as { text: string }).text } });
    await app.prisma.workSession.update({ where: { id: s.id }, data: { lastSeenAt: new Date() } });
    return reply.code(201).send({ success: true, data: { ok: true } });
  });

  // A screenshot (JPEG, sent as base64). The same picture twice in a row is not kept again.
  app.post('/:projectId/work/:sessionId/shot', {
    bodyLimit: 2 * 1024 * 1024,
    schema: { body: z.object({ image: z.string().min(100).max(1_300_000), reason: z.enum(['CHANGE', 'MANUAL', 'HEARTBEAT', 'NOTE', 'STOP']).default('CHANGE') }) },
  }, async (request, reply) => {
    const { projectId, sessionId } = request.params as { projectId: string; sessionId: string };
    const s = await mine(projectId, sessionId, request.userId!);
    if (!s) return bad(reply, 404, 'NOT_FOUND', 'Work session not found');
    if (s.endedAt) return bad(reply, 409, 'ENDED', 'This work session has ended');
    const { image, reason } = request.body as { image: string; reason: string };
    const buf = Buffer.from(image.replace(/^data:image\/jpeg;base64,/, ''), 'base64');
    if (buf.length > MAX_SHOT_BYTES) return bad(reply, 413, 'TOO_LARGE', 'The screenshot is too large');
    if (!(buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff)) return bad(reply, 400, 'NOT_JPEG', 'Screenshots must be JPEG pictures');
    const taken = await app.prisma.workEntry.count({ where: { sessionId: s.id, kind: 'SHOT' } });
    if (taken >= MAX_SHOTS_PER_SESSION) return bad(reply, 429, 'TOO_MANY', 'This session already holds the most screenshots it can');
    const hash = createHash('sha256').update(buf).digest('hex');
    const last = await app.prisma.workEntry.findFirst({ where: { sessionId: s.id, kind: 'SHOT' }, orderBy: { createdAt: 'desc' }, select: { hash: true } });
    await app.prisma.workSession.update({ where: { id: s.id }, data: { lastSeenAt: new Date() } });
    if (last?.hash === hash) return { success: true, data: { duplicate: true } };
    const key = `${projectId}/work/${s.id}/${Date.now()}.jpg`;
    await storage.upload(key, buf, 'image/jpeg');
    const e = await app.prisma.workEntry.create({ data: { sessionId: s.id, kind: 'SHOT', storageKey: key, size: buf.length, hash, reason } });
    return reply.code(201).send({ success: true, data: { id: e.id, duplicate: false, count: taken + 1 } });
  });

  app.post('/:projectId/work/:sessionId/stop', async (request, reply) => {
    const { projectId, sessionId } = request.params as { projectId: string; sessionId: string };
    const s = await mine(projectId, sessionId, request.userId!);
    if (!s) return bad(reply, 404, 'NOT_FOUND', 'Work session not found');
    if (s.endedAt) return { success: true, data: shape(s) };
    const ended = await app.prisma.workSession.update({ where: { id: s.id }, data: { endedAt: new Date(), endReason: 'STOPPED', lastSeenAt: new Date() } });
    await app.prisma.workEntry.create({ data: { sessionId: s.id, kind: 'EVENT', text: 'Stopped work' } });
    await auditLogger.logResource('UPDATE', request.userId!, 'work_session', s.id, { projectId, action: 'stopped' }, request.ip, request.headers['user-agent']);
    return { success: true, data: shape(ended) };
  });

  // Sessions on the project: everybody's for admins and the project owner / lead, only mine for the rest
  app.get('/:projectId/work/sessions', async (request) => {
    const { projectId } = request.params as { projectId: string };
    const { userId: who } = request.query as { userId?: string };
    await closeStale(projectId);
    const all = sees(request, '') ; // owner / lead / admin
    const sessions = await app.prisma.workSession.findMany({
      where: { projectId, ...(all ? (who ? { userId: who } : {}) : { userId: request.userId! }) },
      orderBy: { startedAt: 'desc' }, take: 200,
    });
    const c = await counts(sessions.map((s) => s.id));
    const users = await app.prisma.profile.findMany({ where: { id: { in: [...new Set(sessions.map((s) => s.userId))] } }, select: { id: true, fullName: true } });
    const name = new Map(users.map((u) => [u.id, u.fullName]));
    return { success: true, data: { items: sessions.map((s) => shape(s, c.get(s.id), name.get(s.userId))), canSeeAll: all } };
  });

  // One session in full: notes, events and screenshots (with short-lived picture links)
  app.get('/:projectId/work/sessions/:sessionId', async (request, reply) => {
    const { projectId, sessionId } = request.params as { projectId: string; sessionId: string };
    const s = await app.prisma.workSession.findFirst({ where: { id: sessionId, projectId } });
    if (!s || !sees(request, s.userId)) return bad(reply, 404, 'NOT_FOUND', 'Work session not found');
    const [entries, user] = await Promise.all([
      app.prisma.workEntry.findMany({ where: { sessionId }, orderBy: { createdAt: 'asc' }, take: 1000 }),
      app.prisma.profile.findUnique({ where: { id: s.userId }, select: { fullName: true } }),
    ]);
    const items = await Promise.all(entries.map(async (e) => ({
      id: e.id, kind: e.kind, text: e.text, reason: e.reason, createdAt: e.createdAt,
      previewUrl: e.storageKey && (await storage.exists(e.storageKey)) ? await storage.getPreviewUrl(e.storageKey, 600) : null,
    })));
    if (request.userId !== s.userId) await auditLogger.logResource('DOWNLOAD', request.userId!, 'work_session', s.id, { projectId, action: 'viewed', viewedPerson: user?.fullName }, request.ip, request.headers['user-agent']);
    return { success: true, data: { ...shape(s, undefined, user?.fullName), entries: items } };
  });

  // "Generate KT": everything of mine that is not in a KT yet becomes the next version of one document in the vault
  app.post('/:projectId/work/generate-kt', async (request, reply) => {
    const { projectId } = request.params as { projectId: string };
    const userId = request.userId!;
    await closeStale(projectId);
    if (await app.prisma.workSession.findFirst({ where: { projectId, userId, endedAt: null } })) {
      return bad(reply, 409, 'SESSION_RUNNING', 'Stop the running work session first, then generate the KT');
    }
    const [project, me, sessions] = await Promise.all([
      app.prisma.project.findUnique({ where: { id: projectId }, select: { name: true } }),
      app.prisma.profile.findUnique({ where: { id: userId }, select: { fullName: true, email: true } }),
      app.prisma.workSession.findMany({ where: { projectId, userId, includedIn: null, endedAt: { not: null } }, orderBy: { startedAt: 'asc' }, include: { entries: { orderBy: { createdAt: 'asc' } } } }),
    ]);
    if (!project || !me) return bad(reply, 404, 'NOT_FOUND', 'Project not found');
    if (sessions.length === 0) return bad(reply, 400, 'NOTHING_NEW', 'There is no new work to put in a KT yet. Start work, write notes, then stop.');

    const ktSessions = [];
    for (const s of sessions) {
      const entries = [];
      for (const e of s.entries) {
        let image: Buffer | null = null;
        if (e.kind === 'SHOT' && e.storageKey) {
          const chunks: Buffer[] = [];
          try { for await (const c of storage.openRead(e.storageKey)) chunks.push(c as Buffer); image = Buffer.concat(chunks); } catch { image = null; }
        }
        entries.push({ kind: e.kind, text: e.text, reason: e.reason, createdAt: e.createdAt, image });
      }
      ktSessions.push({ evidence: evidenceOf(s, s.entries.filter((e) => e.kind === 'SHOT').length), startedAt: s.startedAt, endedAt: s.endedAt, endReason: s.endReason, linkLabel: s.linkLabel, linkUrl: s.linkUrl, entries });
    }

    const name = `Work KT - ${project.name} - ${me.fullName}`;
    const existing = await app.prisma.projectDocument.findFirst({ where: { projectId, uploadedById: userId, tags: { has: 'work-kt' } } });
    const version = (existing?.version ?? 0) + 1;
    const buffer = await workKtPdf({ project: project.name, person: me.fullName, email: me.email, version, sessions: ktSessions });
    const fileName = `${name} - v${version}.pdf`;
    const storageKey = storage.generateVersionKey(fileName, projectId, version);
    await storage.upload(storageKey, buffer, 'application/pdf');
    const minutes = sessions.reduce((n, s) => n + minutesBetween(s.startedAt, s.endedAt), 0);
    const description = `Version ${version}, generated by ${me.fullName} on ${formatWhen(new Date())} from ${sessions.length} work session${sessions.length === 1 ? '' : 's'} (${lengthOf(minutes)})`;

    let docId: string;
    if (existing) {
      docId = existing.id;
      await app.prisma.documentVersion.updateMany({ where: { documentId: docId }, data: { isCurrent: false } });
      await app.prisma.projectDocument.update({ where: { id: docId }, data: { storageKey, size: buffer.length, version, originalName: fileName, metadata: { generated: true, workKt: true, description, generatedBy: me.fullName } } });
    } else {
      const doc = await app.prisma.projectDocument.create({
        data: {
          projectId, name, originalName: fileName, mimeType: 'application/pdf', size: buffer.length, category: 'KT_REPORT',
          uploadedById: userId, ownerId: userId, coAuthorIds: [], tags: ['work-kt', 'generated'], version,
          metadata: { generated: true, workKt: true, description, generatedBy: me.fullName },
          storageKey, visibility: 'PROJECT_MEMBERS', visibleToTeamIds: [], visibleToDeptIds: [], visibleToUserIds: [],
        },
      });
      docId = doc.id;
    }
    await app.prisma.documentVersion.create({ data: { documentId: docId, version, storageKey, size: buffer.length, mimeType: 'application/pdf', originalName: fileName, uploadedById: userId, changelog: description, isCurrent: true } });
    await app.prisma.workSession.updateMany({ where: { id: { in: sessions.map((s) => s.id) } }, data: { includedIn: `${docId}:v${version}` } });
    await app.prisma.documentAccessEvent.create({ data: { documentId: docId, userId, action: 'UPLOAD', ipAddress: request.ip, userAgent: request.headers['user-agent'] } });
    await app.prisma.activityFeed.create({ data: { actorId: userId, action: 'CREATE', resourceType: 'document', projectId, details: { text: `generated the work KT (version ${version})` }, ipAddress: request.ip, userAgent: request.headers['user-agent'] } });
    await auditLogger.logResource(existing ? 'UPDATE' : 'CREATE', userId, 'document', docId, { name, action: 'work_kt', version, sessions: sessions.length }, request.ip, request.headers['user-agent']);
    await tellSuperAdmins(app, { actorId: userId, kind: existing ? 'EDITED' : 'CREATED', docId, docName: name, projectId, detail: `work KT version ${version}` });
    return reply.code(201).send({ success: true, data: { id: docId, name, version, sessions: sessions.length, minutes } });
  });
}

// Screenshots are the bulky part: after a number of days they are deleted, the notes and the KT stay.
export function startWorkShotPurge(app: FastifyInstance) {
  const storage = getStorageService();
  const run = async () => {
    try {
      const old = await app.prisma.workEntry.findMany({ where: { kind: 'SHOT', storageKey: { not: null }, createdAt: { lt: new Date(Date.now() - KEEP_PICTURES_DAYS * 86_400_000) } }, take: 500, select: { id: true, storageKey: true } });
      for (const e of old) {
        if (e.storageKey) await storage.delete(e.storageKey).catch(() => undefined);
        await app.prisma.workEntry.update({ where: { id: e.id }, data: { storageKey: null, text: 'Picture deleted after the retention period' } });
      }
      if (old.length) app.log.info(`deleted ${old.length} old work screenshots`);
    } catch (e) {
      app.log.warn({ err: e }, 'could not purge old work screenshots');
    }
  };
  setTimeout(run, 60_000);
  setInterval(run, 6 * 3600_000);
}
