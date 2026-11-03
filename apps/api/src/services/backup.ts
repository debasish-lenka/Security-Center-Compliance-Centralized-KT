import type { FastifyInstance } from 'fastify';
import { spawn } from 'child_process';
import { createWriteStream } from 'fs';
import { mkdir, readdir, rm, stat, writeFile } from 'fs/promises';
import { basename, dirname, join, resolve } from 'path';
import { pipeline } from 'stream/promises';
import { createGzip } from 'zlib';
import { env } from '../utils/env.js';

// Same layout as ./backup.sh (backups/<date>/db.sql.gz, documents.tgz, OK), so ./restore.sh can restore these too
export const BACKUP_ROOT = resolve(env.BACKUP_DIR);
export const NAME_RE = /^\d{4}-\d{2}-\d{2}_\d{6}$/;
export const FILES = { db: 'db.sql.gz', documents: 'documents.tgz' } as const;

let running = false;
export const isBackupRunning = () => running;

const pad = (n: number) => String(n).padStart(2, '0');
const stampOf = (d: Date) =>
  `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}_${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}`;

async function dumpDatabase(target: string) {
  const u = new URL(env.DATABASE_URL);
  const args = ['--no-owner', '--host', u.hostname, '--port', u.port || '5432', '--username', decodeURIComponent(u.username), '--dbname', u.pathname.slice(1)];
  const child = spawn(env.PG_DUMP_PATH, args, { env: { ...process.env, PGPASSWORD: decodeURIComponent(u.password) }, stdio: ['ignore', 'pipe', 'pipe'] });
  let stderr = '';
  child.stderr.on('data', (c) => { stderr += c; });
  const exited = new Promise<number>((res, rej) => { child.on('error', rej); child.on('close', (code) => res(code ?? 1)); });
  await pipeline(child.stdout, createGzip(), createWriteStream(target));
  if ((await exited) !== 0) throw new Error(`pg_dump failed: ${stderr.trim().slice(0, 300)}`);
  if ((await stat(target)).size < 200) throw new Error('The database dump is empty');
}

async function tarDocuments(dest: string) {
  const dir = resolve(env.STORAGE_DIR);
  // relative output path (cwd = dest) so a Windows drive letter is never read as a remote host
  const child = spawn('tar', ['czf', FILES.documents, '-C', dirname(dir), basename(dir)], { cwd: dest, stdio: ['ignore', 'ignore', 'pipe'] });
  let stderr = '';
  child.stderr.on('data', (c) => { stderr += c; });
  const code = await new Promise<number>((res, rej) => { child.on('error', rej); child.on('close', (c) => res(c ?? 1)); });
  if (code !== 0) throw new Error(`tar failed: ${stderr.trim().slice(0, 300)}`);
}

export async function listBackups() {
  const names = (await readdir(BACKUP_ROOT).catch(() => [] as string[])).filter((n) => NAME_RE.test(n)).sort().reverse();
  const items = [];
  for (const name of names) {
    const dir = join(BACKUP_ROOT, name);
    const ok = await stat(join(dir, 'OK')).catch(() => null);
    if (!ok) continue; // unfinished or failed
    const size = async (f: string) => (await stat(join(dir, f)).catch(() => null))?.size ?? null;
    items.push({ name, createdAt: ok.mtime, dbSize: await size(FILES.db), documentsSize: await size(FILES.documents) });
  }
  return items;
}

async function prune(keep: number) {
  const items = await listBackups();
  for (const old of items.slice(keep)) await rm(join(BACKUP_ROOT, old.name), { recursive: true, force: true });
  return Math.max(0, items.length - keep);
}

export async function getSettings(app: FastifyInstance) {
  return app.prisma.backupSettings.upsert({ where: { id: 'default' }, create: { id: 'default' }, update: {} });
}

// Takes one backup now. Only one runs at a time.
export async function runBackup(app: FastifyInstance, trigger: 'manual' | 'schedule') {
  if (running) return { ok: false as const, message: 'A backup is already running' };
  running = true;
  const settings = await getSettings(app);
  const name = stampOf(new Date());
  const dest = join(BACKUP_ROOT, name);
  await app.prisma.backupSettings.update({ where: { id: 'default' }, data: { lastStatus: 'RUNNING', lastMessage: null } });
  try {
    await mkdir(dest, { recursive: true });
    await dumpDatabase(join(dest, FILES.db));
    if (settings.includeDocuments && (await stat(resolve(env.STORAGE_DIR)).catch(() => null))) await tarDocuments(dest);
    await writeFile(join(dest, 'OK'), `${trigger} ${new Date().toISOString()}\n`);
    const removed = await prune(settings.keep);
    await app.prisma.backupSettings.update({ where: { id: 'default' }, data: { lastRunAt: new Date(), lastStatus: 'OK', lastMessage: `${name}${removed ? `, ${removed} old backup(s) removed` : ''}` } });
    return { ok: true as const, name };
  } catch (e: any) {
    await rm(dest, { recursive: true, force: true }).catch(() => {});
    const message = String(e?.message ?? e).slice(0, 400);
    app.log.error({ err: e }, 'backup failed');
    await app.prisma.backupSettings.update({ where: { id: 'default' }, data: { lastRunAt: new Date(), lastStatus: 'FAILED', lastMessage: message } });
    return { ok: false as const, message };
  } finally {
    running = false;
  }
}

// The most recent moment the schedule says a backup should have run (UTC), or null when switched off
export function lastDueSlot(s: { enabled: boolean; frequency: string; timeUtc: string; weekday: number }, now = new Date()): Date | null {
  if (!s.enabled) return null;
  const [h, m] = s.timeUtc.split(':').map(Number);
  const slot = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), h, m));
  if (s.frequency === 'WEEKLY') {
    slot.setUTCDate(slot.getUTCDate() - ((slot.getUTCDay() - s.weekday + 7) % 7));
  }
  if (slot.getTime() > now.getTime()) slot.setUTCDate(slot.getUTCDate() - (s.frequency === 'WEEKLY' ? 7 : 1));
  return slot;
}

export function nextRun(s: { enabled: boolean; frequency: string; timeUtc: string; weekday: number }, now = new Date()): Date | null {
  const last = lastDueSlot(s, now);
  if (!last) return null;
  return new Date(last.getTime() + (s.frequency === 'WEEKLY' ? 7 : 1) * 24 * 3600 * 1000);
}

// Checks every minute; a backup missed while the server was down runs as soon as it is back
export function startBackupJob(app: FastifyInstance) {
  const tick = async () => {
    try {
      const s = await getSettings(app);
      const slot = lastDueSlot(s);
      if (!slot || running) return;
      if (!s.lastRunAt || s.lastRunAt.getTime() < slot.getTime()) {
        app.log.info('running the scheduled backup');
        await runBackup(app, 'schedule');
      }
    } catch (e) {
      app.log.warn({ err: e }, 'backup scheduler check failed');
    }
  };
  const timer = setInterval(tick, 60_000);
  timer.unref();
  setTimeout(tick, 15_000).unref();
}
