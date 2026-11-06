import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { extname } from 'path';
import { getStorageService } from '../services/storage.js';
import { watermarkPdf } from '../services/watermark.js';
import { createAuditLogger } from '../services/audit-logger.js';
import { VIRUS_SCAN_ENABLED, scanUpload } from '../services/virus-scan.js';
import { MAX_UPLOAD_BYTES as MAX_UPLOAD, checkContent, checkName, checkSize, extensionOf } from '../services/upload-policy.js';

const SAFE_INLINE: Record<string, string> = {
  '.pdf': 'application/pdf',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.txt': 'text/plain',
};

// Serves/accepts files for signed links created by StorageService. The signed token is the credential.
export async function fileRoutes(app: FastifyInstance) {
  const storage = getStorageService();
  const audit = createAuditLogger(app);

  // Uploads arrive as raw bytes whatever their type. Drop the built-in JSON/text parsers (they would
  // turn a .txt or .json file into a string) so the catch-all below handles every content type here.
  app.removeContentTypeParser(['application/json', 'text/plain']);
  app.addContentTypeParser('*', { parseAs: 'buffer', bodyLimit: MAX_UPLOAD }, (_req, body, done) => done(null, body));

  const serve = async (request: FastifyRequest, reply: FastifyReply) => {
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

    // A link made for a person carries their stamp; PDFs are marked before they leave the server
    if (payload.w && extname(payload.k).toLowerCase() === '.pdf') {
      try {
        const chunks: Buffer[] = [];
        for await (const c of storage.openRead(payload.k)) chunks.push(c as Buffer);
        const marked = await watermarkPdf(Buffer.concat(chunks), payload.w, payload.u);
        reply.header('Content-Length', marked.length);
        return reply.send(marked);
      } catch {
        // never fall back to the unmarked original
        reply.removeHeader('Content-Disposition');
        reply.type('application/json; charset=utf-8');
        return reply.code(422).send({ success: false, error: { code: 'WATERMARK_FAILED', message: 'This PDF could not be watermarked, so it was not served' } });
      }
    }
    return reply.send(storage.openRead(payload.k));
  };
  app.get('/:token', serve);
  app.get('/:token/:name', serve);

  app.put('/:token', { bodyLimit: MAX_UPLOAD }, async (request, reply) => {
    const payload = storage.verifyToken((request.params as { token: string }).token);
    if (!payload || payload.m !== 'upload') {
      return reply.code(403).send({ success: false, error: { code: 'FORBIDDEN', message: 'Invalid or expired link' } });
    }
    if (!Buffer.isBuffer(request.body)) {
      return reply.code(400).send({ success: false, error: { code: 'BAD_REQUEST', message: 'The file is empty or could not be read.' } });
    }
    // refuse what is not allowed before anything is written to disk
    const refused = checkName(payload.k) ?? checkSize(request.body.length) ?? checkContent(extensionOf(payload.k), request.body.subarray(0, 8192), request.body.length);
    if (refused) {
      const tooBig = request.body.length > MAX_UPLOAD;
      return reply.code(tooBig ? 413 : 415).send({ success: false, error: { code: tooBig ? 'TOO_LARGE' : 'UNSUPPORTED_TYPE', message: refused } });
    }
    // virus scan (ClamAV) before anything is kept; if the scanner cannot answer the file is refused, never let through unscanned
    if (VIRUS_SCAN_ENABLED) {
      const scan = await scanUpload(request.body);
      if (scan.status === 'infected') {
        await audit.log({ action: 'UPLOAD', resourceType: 'file', resourceId: payload.k, details: { virus: scan.signature, size: request.body.length }, ipAddress: request.ip, userAgent: request.headers['user-agent'], outcome: 'FAILURE', errorMessage: `Virus found: ${scan.signature}` });
        request.log.warn({ key: payload.k, virus: scan.signature }, 'upload refused: virus found');
        return reply.code(422).send({ success: false, error: { code: 'VIRUS_FOUND', message: `A virus was found in this file (${scan.signature}), so it was not saved. Tell your security team.` } });
      }
      if (scan.status === 'unavailable') {
        request.log.error({ key: payload.k, reason: scan.reason }, 'upload refused: virus scanner unavailable');
        return reply.code(503).send({ success: false, error: { code: 'SCANNER_UNAVAILABLE', message: 'The file could not be checked for viruses right now (the scanner is starting or stopped), so it was not saved. Try again in a minute.' } });
      }
    }
    await storage.upload(payload.k, request.body);
    return reply.send({ success: true });
  });
}
