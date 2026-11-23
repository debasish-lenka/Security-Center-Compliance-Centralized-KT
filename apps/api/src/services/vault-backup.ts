import { createHash, randomBytes } from 'crypto';
import { mkdir, readFile, readdir, writeFile } from 'fs/promises';
import { join } from 'path';
import type { FastifyInstance } from 'fastify';
import { env } from '../utils/env.js';

// Secret Manager backups. Every version of every secret (a new secret, a new value, a new file) is written to its own
// JSON file the moment it is saved. A file is NEVER overwritten or deleted: a second save creates a second file.
// The files hold the same encrypted data as the database (no plain values, no master key), with a checksum each.
// They live under STORAGE_DIR/_vault/_backups, so the host's backup.sh (which archives Documents) includes them.

export interface VersionRow {
  secretId: string;
  version: number;
  valueEnc: string;
  dekEnc: string;
  keyId: string;
  filePath: string | null;
  fileSize: number | null;
  reason: string | null;
  createdById: string | null;
  createdAt: Date;
  blobSha256: string | null;
}

export interface SavedBackup { file: string; secretId: string; valid: boolean; data: VersionRow | null }

export const backupRoot = () => join(env.STORAGE_DIR, '_vault', '_backups');
const sha = (s: string | Buffer) => createHash('sha256').update(s).digest('hex');

// fixed field order, so the checksum is the same every time it is computed
const payloadOf = (r: VersionRow) => ({
  secretId: r.secretId,
  version: r.version,
  valueEnc: r.valueEnc,
  dekEnc: r.dekEnc,
  keyId: r.keyId,
  filePath: r.filePath,
  fileSize: r.fileSize,
  reason: r.reason,
  createdById: r.createdById,
  createdAt: r.createdAt.toISOString(),
  blobSha256: r.blobSha256,
});

export function sameVersion(a: VersionRow, b: VersionRow) {
  return a.secretId === b.secretId && a.version === b.version && a.valueEnc === b.valueEnc && a.dekEnc === b.dekEnc && a.blobSha256 === b.blobSha256;
}

// Writes the backup of one saved version. Fails (and the caller must say so) if the file cannot be written.
export async function keepBackup(row: VersionRow): Promise<string> {
  const payload = payloadOf(row);
  const body = JSON.stringify({ payload, checksum: sha(JSON.stringify(payload)), savedAt: new Date().toISOString() }, null, 2);
  const dir = join(backupRoot(), row.secretId);
  await mkdir(dir, { recursive: true });
  const name = `${new Date().toISOString().replace(/[:.]/g, '-')}-v${row.version}-${randomBytes(3).toString('hex')}.json`;
  // flag 'wx': create only, never replace an existing backup
  await writeFile(join(dir, name), body, { flag: 'wx', mode: 0o644 });
  return name;
}

// Every backup file on disk, with whether it still matches its checksum
export async function readBackups(): Promise<SavedBackup[]> {
  const out: SavedBackup[] = [];
  const root = backupRoot();
  const folders = await readdir(root, { withFileTypes: true }).catch(() => []);
  for (const f of folders) {
    if (!f.isDirectory()) continue;
    const files = await readdir(join(root, f.name)).catch(() => [] as string[]);
    for (const name of files) {
      if (!name.endsWith('.json')) continue;
      const rel = `${f.name}/${name}`;
      try {
        const j = JSON.parse(await readFile(join(root, rel), 'utf8')) as { payload: any; checksum: string };
        const valid = sha(JSON.stringify(j.payload)) === j.checksum;
        const p = j.payload;
        const data: VersionRow = { ...p, createdAt: new Date(p.createdAt) };
        out.push({ file: rel, secretId: f.name, valid, data: valid ? data : null });
      } catch {
        out.push({ file: rel, secretId: f.name, valid: false, data: null });
      }
    }
  }
  return out;
}

export const blobHash = (blob: Buffer) => sha(blob);

const versionRowsOf = (app: FastifyInstance) => app.prisma.secretVersion.findMany({ orderBy: [{ secretId: 'asc' }, { version: 'asc' }] });
const keyOf = (x: { secretId: string; version: number }) => `${x.secretId}:${x.version}`;
export async function blobProblem(r: { filePath: string | null; blobSha256: string | null }): Promise<string | null> {
  if (!r.filePath) return null;
  try {
    const h = blobHash(await readFile(join(env.STORAGE_DIR, r.filePath)));
    return r.blobSha256 && h !== r.blobSha256 ? 'the file does not match its saved checksum' : null;
  } catch { return 'the encrypted file is missing on the server'; }
}

// Compares the database with the backup files, for the screen and for the daily check
export async function vaultBackupReport(app: FastifyInstance) {
  const [rows, saved] = await Promise.all([versionRowsOf(app), readBackups()]);
  const valid = saved.filter((s) => s.valid && s.data).map((s) => s.data!);
  const unbacked = rows.filter((r) => !valid.some((v) => sameVersion(v, r)));
  const missingInDb = valid.filter((v) => !rows.some((r) => keyOf(r) === keyOf(v)));
  const fileProblems: { secretId: string; version: number; problem: string }[] = [];
  for (const r of rows) {
    const p = await blobProblem(r);
    if (p) fileProblems.push({ secretId: r.secretId, version: r.version, problem: p });
  }
  return {
    versions: rows.length,
    backupFiles: saved.length,
    unbacked: unbacked.map((r) => ({ secretId: r.secretId, version: r.version })),
    missingInDb: missingInDb.map((v) => ({ secretId: v.secretId, version: v.version })),
    badBackupFiles: saved.filter((s) => !s.valid).map((s) => s.file),
    fileProblems,
  };
}

const hourIST = () => Number(new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Kolkata', hour: '2-digit', hour12: false }).format(new Date()));
const dayIST = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date());

// Once a day, between 03:00 and 04:00 IST: check every version's backup. If anything is wrong, every super admin is told.
// Nothing is fixed automatically: a person decides on the Secret Manager screen.
export function startVaultBackupCheck(app: FastifyInstance) {
  let lastDay = '';
  const tick = async () => {
    try {
      if (hourIST() !== 3 || lastDay === dayIST()) return;
      if (!env.VAULT_MASTER_KEY) return;
      lastDay = dayIST();
      const r = await vaultBackupReport(app);
      const problems = r.unbacked.length + r.missingInDb.length + r.badBackupFiles.length + r.fileProblems.length;
      if (problems === 0) { app.log.info({ versions: r.versions, backupFiles: r.backupFiles }, 'secret backup check: all good'); return; }
      const admins = await app.prisma.profile.findMany({ where: { role: 'SUPER_ADMIN', status: 'ACTIVE' }, select: { id: true } });
      const message = [
        r.unbacked.length && `${r.unbacked.length} version(s) have no valid backup`,
        r.missingInDb.length && `${r.missingInDb.length} version(s) are in a backup but missing from the database`,
        r.badBackupFiles.length && `${r.badBackupFiles.length} backup file(s) changed after they were written`,
        r.fileProblems.length && `${r.fileProblems.length} encrypted file(s) have a problem`,
      ].filter(Boolean).join('; ') + '. Open Secret Manager and press "Check backups".';
      if (admins.length) await app.prisma.notification.createMany({ data: admins.map((a) => ({ userId: a.id, type: 'SECRET_BACKUP_PROBLEM' as const, resourceType: 'secret', resourceId: null, title: 'Secret backups need attention', message })) });
      app.log.warn({ problems }, 'secret backup check found problems');
    } catch (e) {
      app.log.warn({ err: e }, 'secret backup check failed');
    }
  };
  setInterval(tick, 10 * 60_000).unref();
}
