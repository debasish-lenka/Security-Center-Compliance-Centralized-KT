import type { FastifyInstance } from 'fastify';
import { extname } from 'path';
import { getStorageService } from '../services/storage.js';

const MAX_UPLOAD = 50 * 1024 * 1024;

const SAFE_INLINE: Record<string, string> = {
  '.pdf': 'application/pdf',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.txt': 'text/plain',
};

// Serves/accepts files for signed links created by StorageService. The signed token is the credential.
export async function fileRoutes(app: FastifyInstance) {
  const storage = getStorageService();

  // Uploads arrive as raw bytes whatever their type. Drop the built-in JSON/text parsers (they would
  // turn a .txt or .json file into a string) so the catch-all below handles every content type here.
  app.removeContentTypeParser(['application/json', 'text/plain']);
  app.addContentTypeParser('*', { parseAs: 'buffer', bodyLimit: MAX_UPLOAD }, (_req, body, done) => done(null, body));

  app.get('/:token', async (request, reply) => {
    const payload = storage.verifyToken((request.params as { token: string }).token);
    if (!payload || payload.m === 'upload') {
      return reply.code(403).send({ success: false, error: { code: 'FORBIDDEN', message: 'Invalid or expired link' } });
    }
    if (!(await storage.exists(payload.k))) {
      return reply.code(404).send({ success: false, error: { code: 'NOT_FOUND', message: 'File not found' } });
    }
    const name = payload.n ?? payload.k.split('/').pop()!;
    // Inline only for safe types; everything else is forced to download (prevents stored XSS via html/svg)
    const mime = SAFE_INLINE[extname(payload.k).toLowerCase()];
    const inline = payload.m === 'inline' && !!mime;
    reply.header('Content-Type', inline ? mime : 'application/octet-stream');
    reply.header('Content-Disposition', `${inline ? 'inline' : 'attachment'}; filename*=UTF-8''${encodeURIComponent(name)}`);
    reply.header('X-Content-Type-Options', 'nosniff');
    reply.header('Cache-Control', 'private, no-store');
    return reply.send(storage.openRead(payload.k));
  });

  app.put('/:token', { bodyLimit: MAX_UPLOAD }, async (request, reply) => {
    const payload = storage.verifyToken((request.params as { token: string }).token);
    if (!payload || payload.m !== 'upload') {
      return reply.code(403).send({ success: false, error: { code: 'FORBIDDEN', message: 'Invalid or expired link' } });
    }
    if (!Buffer.isBuffer(request.body)) {
      return reply.code(400).send({ success: false, error: { code: 'BAD_REQUEST', message: 'Expected file body' } });
    }
    await storage.upload(payload.k, request.body);
    return reply.send({ success: true });
  });
}
