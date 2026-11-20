import { createHash, randomBytes } from 'crypto';
import { mkdir, readFile, readdir, writeFile } from 'fs/promises';
import { join } from 'path';
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
