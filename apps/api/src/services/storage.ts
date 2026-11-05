import { createHmac, randomUUID, timingSafeEqual } from 'crypto';
import { createReadStream } from 'fs';
import { mkdir, writeFile, stat, unlink, readdir } from 'fs/promises';
import { dirname, resolve, sep, join } from 'path';
import type { Readable } from 'stream';
import { env } from '../utils/env.js';

export type FileTokenMode = 'download' | 'inline' | 'upload';

interface FileTokenPayload {
  k: string; // storage key
  m: FileTokenMode;
  n?: string; // download file name
  w?: string; // watermark text stamped on PDFs when the link is opened
  u?: string; // who made the document and when, printed under it
  e: number; // expiry (epoch ms)
}

const safeExt = (name: string) => name.split('.').pop()?.toLowerCase().replace(/[^a-z0-9]/g, '') || 'bin';

/**
 * Local-disk storage. Files live under STORAGE_DIR; "URLs" are short-lived signed
 * links served by routes/files.ts, so callers keep the presigned-URL flow.
 */
export class StorageService {
  private root = resolve(env.STORAGE_DIR);

  // Resolve a key to an absolute path, refusing anything that escapes the storage root
  private pathFor(key: string): string {
    const full = resolve(this.root, key);
    if (full !== this.root && !full.startsWith(this.root + sep)) {
      throw new Error('Invalid storage key');
    }
    return full;
  }

  private sign(data: string): string {
    return createHmac('sha256', env.SESSION_SECRET).update(data).digest('base64url');
  }

  private makeUrl(key: string, mode: FileTokenMode, expiresIn: number, name?: string, watermark?: string, note?: string): string {
    const payload: FileTokenPayload = { k: key, m: mode, n: name, w: watermark, u: note, e: Date.now() + expiresIn * 1000 };
    const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
    return `/api/v1/files/${body}.${this.sign(body)}${name ? `/${encodeURIComponent(name)}` : ''}`; // the name is only for the browser's tab title; the token is the credential
  }

  verifyToken(token: string): FileTokenPayload | null {
    const [body, sig] = token.split('.');
    if (!body || !sig) return null;
    const expected = this.sign(body);
    if (sig.length !== expected.length || !timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null;
    try {
      const payload = JSON.parse(Buffer.from(body, 'base64url').toString()) as FileTokenPayload;
      return payload.e > Date.now() ? payload : null;
    } catch {
      return null;
    }
  }

  generateKey(originalName: string, projectId: string): string {
    return `${projectId}/${Date.now()}-${randomUUID().slice(0, 8)}.${safeExt(originalName)}`;
  }

  generateVersionKey(originalName: string, projectId: string, version: number): string {
    return `${projectId}/versions/v${version}-${Date.now()}-${randomUUID().slice(0, 8)}.${safeExt(originalName)}`;
  }

  async upload(key: string, body: Buffer | Readable | ReadableStream, _contentType?: string): Promise<void> {
    const path = this.pathFor(key);
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, body as Buffer);
  }

  getDownloadUrl(key: string, fileName: string, expiresIn = 300, watermark?: string, note?: string): Promise<string> {
    return Promise.resolve(this.makeUrl(key, 'download', expiresIn, fileName, watermark, note));
  }

  getPreviewUrl(key: string, expiresIn = 300, watermark?: string, note?: string, name?: string): Promise<string> {
    return Promise.resolve(this.makeUrl(key, 'inline', expiresIn, name, watermark, note));
  }

  getUploadUrl(key: string, expiresIn = 3600): Promise<string> {
    return Promise.resolve(this.makeUrl(key, 'upload', expiresIn));
  }

  openRead(key: string, range?: { start: number; end: number }): Readable {
    return createReadStream(this.pathFor(key), range);
  }

  async getMetadata(key: string): Promise<{ size: number; contentType: string; lastModified: Date } | null> {
    try {
      const s = await stat(this.pathFor(key));
      return { size: s.size, contentType: 'application/octet-stream', lastModified: s.mtime };
    } catch {
      return null;
    }
  }

  async delete(key: string): Promise<void> {
    await unlink(this.pathFor(key)).catch((e) => {
      if (e.code !== 'ENOENT') throw e;
    });
  }

  async listFiles(projectId: string): Promise<Array<{ key: string; size: number; lastModified: Date }>> {
    const out: Array<{ key: string; size: number; lastModified: Date }> = [];
    const walk = async (dir: string) => {
      for (const e of await readdir(dir, { withFileTypes: true }).catch(() => [])) {
        const full = join(dir, e.name);
        if (e.isDirectory()) await walk(full);
        else {
          const s = await stat(full);
          out.push({ key: full.slice(this.root.length + 1).split(sep).join('/'), size: s.size, lastModified: s.mtime });
        }
      }
    };
    await walk(this.pathFor(projectId));
    return out;
  }

  async exists(key: string): Promise<boolean> {
    return (await this.getMetadata(key)) !== null;
  }
}

let storageInstance: StorageService | null = null;

export function getStorageService(): StorageService {
  return (storageInstance ??= new StorageService());
}
