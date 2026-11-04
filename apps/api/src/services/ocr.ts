import type { FastifyInstance } from 'fastify';
import { resolve } from 'path';
import { createWorker, type Worker } from 'tesseract.js';
import { getStorageService } from './storage.js';

// Checks that the person was really in the tool: the text on each screenshot is read (OCR, offline, the language
// file is shipped in assets/tessdata) and compared with the tool's name and address. Only "the tool was seen: yes / no"
// is kept for each picture; the text itself is never stored, because a screen can show anything.

const LANG_DIR = resolve(process.cwd(), 'assets', 'tessdata');
const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');
// words that appear on many screens and prove nothing, and the ends of web addresses
const COMMON = new Set(['dashboard', 'portal', 'console', 'server', 'panel', 'login', 'system', 'admin', 'manager', 'center', 'centre', 'tool', 'test', 'www', 'http', 'https', 'com', 'net', 'org', 'local', 'html', 'index', 'home', 'main', 'page', 'app', 'web']);

export interface LinkLike { label?: string | null; url?: string | null }

// What would show on screen if the person is in this tool
export function toolTerms(links: LinkLike[]): string[] {
  const out = new Set<string>();
  for (const l of links) {
    for (const w of (l.label ?? '').split(/[^A-Za-z0-9]+/)) if (w.length >= 4 && !COMMON.has(w.toLowerCase())) out.add(norm(w));
    try {
      const host = new URL(l.url ?? '').hostname.replace(/^www\./, '');
      for (const part of host.split('.')) if (part.length >= 4 && !COMMON.has(part.toLowerCase())) out.add(norm(part));
      if (/^[\d.]+$/.test(host)) out.add(norm(host)); // an address like 10.0.0.5
    } catch { /* not an address */ }
  }
  return [...out].filter((t) => t.length >= 4 || /\d/.test(t));
}

export function shows(text: string, terms: string[]): boolean {
  const n = norm(text);
  return terms.some((t) => n.includes(t));
}

export function toolVerdict(checked: number, seen: number, anyRead: boolean): 'SEEN' | 'LOW' | 'NOT_SEEN' | 'NO_LINK' | null {
  if (checked === 0) return anyRead ? 'NO_LINK' : null;
  if (seen / checked >= 0.25) return 'SEEN';
  if (seen > 0) return 'LOW';
  return checked >= 2 ? 'NOT_SEEN' : 'LOW';
}

let running = false;
export const isOcrRunning = () => running;

export async function pendingPictures(app: FastifyInstance) {
  return app.prisma.workEntry.count({ where: { kind: 'SHOT', storageKey: { not: null }, ocrAt: null } });
}

export async function runOcrBatch(app: FastifyInstance, limit: number): Promise<{ read: number; seen: number; sessions: number; left: number }> {
  if (running) return { read: 0, seen: 0, sessions: 0, left: await pendingPictures(app) };
  running = true;
  const storage = getStorageService();
  let worker: Worker | null = null;
  const touched = new Set<string>();
  let read = 0, seen = 0;
  try {
    const shots = await app.prisma.workEntry.findMany({
      where: { kind: 'SHOT', storageKey: { not: null }, ocrAt: null },
      orderBy: { createdAt: 'asc' }, take: limit,
      select: { id: true, storageKey: true, sessionId: true, session: { select: { projectId: true, linkLabel: true, linkUrl: true } } },
    });
    if (shots.length === 0) return { read: 0, seen: 0, sessions: 0, left: 0 };
    const projectLinks = new Map<string, LinkLike[]>();
    const termsOf = async (s: (typeof shots)[number]['session']) => {
      if (s.linkLabel || s.linkUrl) return toolTerms([{ label: s.linkLabel, url: s.linkUrl }]);
      if (!projectLinks.has(s.projectId)) {
        const p = await app.prisma.project.findUnique({ where: { id: s.projectId }, select: { workLinks: true } });
        projectLinks.set(s.projectId, (p?.workLinks as LinkLike[] | null) ?? []);
      }
      return toolTerms(projectLinks.get(s.projectId)!);
    };
    worker = await createWorker('eng', 1, { langPath: LANG_DIR, gzip: false, cachePath: LANG_DIR });
    for (const shot of shots) {
      const terms = await termsOf(shot.session);
      let toolSeen: boolean | null = null;
      if (terms.length > 0) {
        try {
          const chunks: Buffer[] = [];
          for await (const c of storage.openRead(shot.storageKey!)) chunks.push(c as Buffer);
          const { data } = await worker.recognize(Buffer.concat(chunks));
          toolSeen = shows(data.text, terms);
        } catch {
          continue; // the picture cannot be read now; it stays unread and is tried again later
        }
      }
      await app.prisma.workEntry.update({ where: { id: shot.id }, data: { ocrAt: new Date(), toolSeen } });
      touched.add(shot.sessionId);
      read++;
      if (toolSeen) seen++;
    }
    for (const sid of touched) {
      const [checked, hit, anyRead] = await Promise.all([
        app.prisma.workEntry.count({ where: { sessionId: sid, kind: 'SHOT', toolSeen: { not: null } } }),
        app.prisma.workEntry.count({ where: { sessionId: sid, kind: 'SHOT', toolSeen: true } }),
        app.prisma.workEntry.count({ where: { sessionId: sid, kind: 'SHOT', ocrAt: { not: null } } }),
      ]);
      await app.prisma.workSession.update({ where: { id: sid }, data: { ocrChecked: checked, ocrSeen: hit, toolCheck: toolVerdict(checked, hit, anyRead > 0) } });
    }
    return { read, seen, sessions: touched.size, left: await pendingPictures(app) };
  } finally {
    await worker?.terminate().catch(() => undefined);
    running = false;
  }
}

const hourIST = () => Number(new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Kolkata', hour: '2-digit', hour12: false }).format(new Date()));

// At night (22:00 - 06:00 IST) the unread screenshots are read, a batch at a time
export function startOcrJob(app: FastifyInstance) {
  const tick = async () => {
    try {
      const s = await app.prisma.workSettings.upsert({ where: { id: 'default' }, create: { id: 'default' }, update: {} });
      const h = hourIST();
      if (!s.ocrEnabled || running || !(h >= 22 || h < 6)) return;
      const t0 = Date.now();
      let total = { read: 0, seen: 0 };
      while (Date.now() - t0 < 25 * 60_000) {
        const r = await runOcrBatch(app, 30);
        total = { read: total.read + r.read, seen: total.seen + r.seen };
        if (r.left === 0 || r.read === 0) break;
      }
      if (total.read > 0) {
        await app.prisma.workSettings.update({ where: { id: 'default' }, data: { ocrLastRunAt: new Date(), ocrLastSummary: `${total.read} screenshot(s) read, the tool was seen on ${total.seen}` } });
        app.log.info(total, 'screenshot check done');
      }
    } catch (e) {
      app.log.warn({ err: e }, 'screenshot check failed');
    }
  };
  setInterval(tick, 10 * 60_000).unref();
  setTimeout(tick, 3 * 60_000).unref();
}
