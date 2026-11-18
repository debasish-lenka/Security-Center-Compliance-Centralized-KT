import type { FastifyInstance, FastifyRequest } from 'fastify';
import { randomUUID } from 'crypto';
import { chmod } from 'fs/promises';
import { join } from 'path';
import { env } from '../utils/env.js';
import { z } from 'zod';
import { AuthService } from '../services/auth.js';
import { createAuditLogger } from '../services/audit-logger.js';
import { decryptSecret } from '../services/crypto.js';
import { verifyTotp } from '../services/mfa.js';
import { getStorageService } from '../services/storage.js';
import { VIRUS_SCAN_ENABLED, scanUpload } from '../services/virus-scan.js';
import { MAX_UPLOAD_BYTES, MAX_UPLOAD_MB } from '../services/upload-policy.js';
import { openSecret, openSecretFile, sealSecret, vaultEnabled } from '../services/vault-crypto.js';

// Secret Manager. Everyone signed in sees folder and secret NAMES (so they can ask for access);
// values are only returned by /reveal, and only to someone holding a VIEW grant, after a fresh password / 2FA check.
// Not even SUPER_ADMIN reads values without a grant, but admins can give themselves one - that is audited.
type Level = 'VIEW' | 'EDIT' | 'MANAGE';
const RANK: Record<Level, number> = { VIEW: 1, EDIT: 2, MANAGE: 3 };
const ADMINS = ['SUPER_ADMIN', 'ADMIN'];

const FolderSchema = z.object({ name: z.string().trim().min(1).max(100), description: z.string().trim().max(500).optional().nullable() });
const FolderPatch = FolderSchema.partial();
const Content = {
  username: z.string().max(500).optional().nullable(),
  url: z.string().max(1000).optional().nullable(),
  value: z.string().min(1).max(20000),
};
const SecretCreate = z.object({
  name: z.string().trim().min(1).max(150),
  type: z.enum(['LOGIN', 'API_KEY', 'NOTE']).default('LOGIN'),
  description: z.string().trim().max(500).optional().nullable(),
  expiresAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable(),
  ...Content,
});
// Every change to an existing secret must say why; super admins are told (see notifyChange)
const Reason = z.string({ required_error: 'Write why you are changing this' }).trim().min(5, 'Write why you are changing this (at least 5 characters)').max(300);
const ReasonQuery = z.object({ reason: Reason });
const SecretPatch = z.object({
  name: z.string().trim().min(1).max(150).optional(),
  description: z.string().trim().max(500).optional().nullable(),
  expiresAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable(),
  username: Content.username,
  url: Content.url,
  value: Content.value.optional(), // sending a value makes a new version
  reason: Reason,
});
const GrantSchema = z.object({
  userId: z.string().uuid(),
  level: z.enum(['VIEW', 'EDIT', 'MANAGE']),
  expiresAt: z.string().datetime().optional().nullable(),
});
const FileQuery = z.object({
  filename: z.string().trim().min(1).max(255),
  name: z.string().trim().min(1).max(150).optional(),
  description: z.string().trim().max(500).optional(),
  expiresAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  reason: z.string().trim().max(300).optional(),
});
const ReplaceQuery = FileQuery.extend({ reason: Reason });
const cleanName = (n: string) => n.split(/[\\/]/).pop()!.replace(/[\u0000-\u001f]/g, '').slice(0, 200) || 'file';
const StepUp = z.object({ password: z.string().max(200).optional(), code: z.string().max(20).optional() });

// failed re-checks per person: 5 in 10 minutes locks the reveal for the rest of the window
const fails = new Map<string, number[]>();
const WINDOW = 10 * 60_000;
const recentFails = (id: string) => {
  const t = (fails.get(id) ?? []).filter((x) => Date.now() - x < WINDOW);
  fails.set(id, t);
  return t;
};

export async function vaultRoutes(app: FastifyInstance) {
  const audit = createAuditLogger(app);
  const auth = new AuthService(app);
  const pre = [app.authenticate];
  const storage = getStorageService();
  // Tell every super admin (except the person who did it) what changed and why. Never throws: the change itself already happened.
  async function notifyChange(request: FastifyRequest, secretId: string, secretName: string, folderId: string, what: string, reason: string) {
    try {
      const [folder, admins] = await Promise.all([
        app.prisma.secretFolder.findUnique({ where: { id: folderId }, select: { name: true } }),
        app.prisma.profile.findMany({ where: { role: 'SUPER_ADMIN', status: 'ACTIVE', id: { not: request.userId! } }, select: { id: true } }),
      ]);
      if (!admins.length) return;
      const who = request.user!.fullName;
      await app.prisma.notification.createMany({
        data: admins.map((a) => ({
          userId: a.id, type: 'SECRET_CHANGED' as const, resourceType: 'secret', resourceId: secretId,
          title: `Secret changed: ${secretName}`,
          message: `${who} ${what} "${secretName}" in the folder "${folder?.name ?? ''}". Reason: ${reason}`,
        })),
      });
    } catch (e) { app.log.warn({ err: e }, 'could not send the secret-change alert'); }
  }
  // files arrive as the raw request body (not multipart); the secret's details travel in the query string
  app.addContentTypeParser('*', { parseAs: 'buffer', bodyLimit: MAX_UPLOAD_BYTES }, (_req, body, done) => done(null, body));

  const err = (reply: any, code: number, c: string, message: string) => reply.code(code).send({ success: false, error: { code: c, message } });
  const log = (r: FastifyRequest, action: any, type: string, id: string | null, details: Record<string, unknown>, ok = true, msg?: string) =>
    audit.log({ actorId: r.userId!, action, resourceType: type, resourceId: id, details, ipAddress: r.ip, userAgent: r.headers['user-agent'], outcome: ok ? 'SUCCESS' : 'FAILURE', errorMessage: msg });

  // the strongest unexpired grant the person holds on a folder
  async function levelOn(userId: string, folderId: string): Promise<Level | null> {
    const g = await app.prisma.secretGrant.findFirst({
      where: { folderId, userId, OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }] },
      select: { level: true },
    });
    return (g?.level as Level) ?? null;
  }
  const atLeast = (have: Level | null, need: Level) => !!have && RANK[have] >= RANK[need];

  // Every route except /status needs the master key to exist
  app.addHook('onRequest', async (request, reply) => {
    if (request.url.split('?')[0].endsWith('/status')) return;
    if (!vaultEnabled()) return err(reply, 503, 'VAULT_DISABLED', 'The Secret Manager is not switched on: VAULT_MASTER_KEY is not set on the server');
  });

  // stepUp tells the screen what to ask for before showing a value: the authenticator code, or the password
  app.get('/status', { preHandler: pre }, async (request, reply) => {
    const me = await app.prisma.profile.findUnique({ where: { id: request.userId! }, select: { totpEnabled: true, authProvider: true } });
    const stepUp = me?.totpEnabled ? 'code' : me?.authProvider === 'LOCAL' ? 'password' : 'none';
    return reply.send({ success: true, data: { enabled: vaultEnabled(), canCreateFolder: ADMINS.includes(request.user!.role), stepUp } });
  });

  // ---------- folders ----------
  app.get('/folders', { preHandler: pre }, async (request, reply) => {
    const userId = request.userId!;
    const [folders, grants] = await Promise.all([
      app.prisma.secretFolder.findMany({ where: { deletedAt: null }, orderBy: { name: 'asc' }, include: { _count: { select: { secrets: { where: { deletedAt: null } } } } } }),
      app.prisma.secretGrant.findMany({ where: { userId, OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }] } }),
    ]);
    const mine = new Map(grants.map((g) => [g.folderId, g]));
    return reply.send({
      success: true,
      data: folders.map((f) => ({ id: f.id, name: f.name, description: f.description, secretCount: f._count.secrets, myLevel: mine.get(f.id)?.level ?? null, myAccessExpiresAt: mine.get(f.id)?.expiresAt ?? null })),
    });
  });

  app.post('/folders', { preHandler: [...pre, app.requireRole(ADMINS)], schema: { body: FolderSchema } }, async (request, reply) => {
    const b = request.body as z.infer<typeof FolderSchema>;
    if (await app.prisma.secretFolder.findFirst({ where: { name: { equals: b.name, mode: 'insensitive' }, deletedAt: null } })) return err(reply, 409, 'EXISTS', 'A folder with this name already exists');
    const folder = await app.prisma.secretFolder.create({ data: { name: b.name, description: b.description || null, createdById: request.userId } }).catch(() => null);
    if (!folder) return err(reply, 409, 'EXISTS', 'A folder with this name already exists');
    // the creator manages it (and so can pass access on); this is a normal, visible grant
    await app.prisma.secretGrant.create({ data: { folderId: folder.id, userId: request.userId!, level: 'MANAGE', grantedById: request.userId } });
    await log(request, 'CREATE', 'secret_folder', folder.id, { name: folder.name });
    return reply.code(201).send({ success: true, data: folder });
  });

  app.patch('/folders/:id', { preHandler: pre, schema: { body: FolderPatch } }, async (request, reply) => {
    const { id } = request.params as { id: string };
    if (!atLeast(await levelOn(request.userId!, id), 'MANAGE')) return err(reply, 403, 'FORBIDDEN', 'You need Manage access to this folder');
    const b = request.body as z.infer<typeof FolderPatch>;
    const f = await app.prisma.secretFolder.update({ where: { id }, data: { ...(b.name ? { name: b.name } : {}), ...(b.description !== undefined ? { description: b.description || null } : {}) } }).catch(() => null);
    if (!f) return err(reply, 409, 'EXISTS', 'Could not save: the name may already be used');
    await log(request, 'UPDATE', 'secret_folder', id, b);
    return reply.send({ success: true, data: f });
  });

  // A folder can only be removed when it holds no secrets
  app.delete('/folders/:id', { preHandler: pre }, async (request, reply) => {
    const { id } = request.params as { id: string };
    if (!atLeast(await levelOn(request.userId!, id), 'MANAGE')) return err(reply, 403, 'FORBIDDEN', 'You need Manage access to this folder');
    if (await app.prisma.secret.count({ where: { folderId: id, deletedAt: null } })) return err(reply, 409, 'NOT_EMPTY', 'Remove the secrets in this folder first');
    await app.prisma.secretFolder.update({ where: { id }, data: { deletedAt: new Date() } });
    await log(request, 'DELETE', 'secret_folder', id, {});
    return reply.send({ success: true, data: null });
  });

  // ---------- secrets (names only) ----------
  app.get('/folders/:id/secrets', { preHandler: pre }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const folder = await app.prisma.secretFolder.findFirst({ where: { id, deletedAt: null } });
    if (!folder) return err(reply, 404, 'NOT_FOUND', 'Folder not found');
    const myLevel = await levelOn(request.userId!, id);
    const rows = await app.prisma.secret.findMany({
      where: { folderId: id, deletedAt: null }, orderBy: { name: 'asc' },
      select: { id: true, name: true, type: true, description: true, currentVersion: true, expiresAt: true, createdAt: true, createdById: true, updatedAt: true },
    });
    // the newest version of each secret is the current one: it tells the file size and who made the latest change
    const latest = await app.prisma.secretVersion.findMany({ where: { secretId: { in: rows.map((r) => r.id) } }, orderBy: { version: 'desc' }, distinct: ['secretId'], select: { secretId: true, fileSize: true, createdById: true, createdAt: true } });
    const ids = [...new Set([...rows.map((r) => r.createdById), ...latest.map((v) => v.createdById)].filter(Boolean) as string[])];
    const names = new Map((await app.prisma.profile.findMany({ where: { id: { in: ids } }, select: { id: true, fullName: true } })).map((p) => [p.id, p.fullName]));
    const nameOf = (id: string | null) => (id ? names.get(id) ?? null : null);
    const withInfo = rows.map(({ createdById, ...r }) => {
      const v = latest.find((x) => x.secretId === r.id);
      return { ...r, fileSize: v?.fileSize ?? null, createdBy: nameOf(createdById), changedBy: nameOf(v?.createdById ?? null), changedAt: v?.createdAt ?? r.updatedAt };
    });
    return reply.send({ success: true, data: { folder: { id: folder.id, name: folder.name, description: folder.description }, myLevel, secrets: withInfo } });
  });

  app.post('/folders/:id/secrets', { preHandler: pre, schema: { body: SecretCreate } }, async (request, reply) => {
    const { id } = request.params as { id: string };
    if (!atLeast(await levelOn(request.userId!, id), 'EDIT')) return err(reply, 403, 'FORBIDDEN', 'You need Edit access to this folder');
    const b = request.body as z.infer<typeof SecretCreate>;
    if (!(await app.prisma.secretFolder.findFirst({ where: { id, deletedAt: null } }))) return err(reply, 404, 'NOT_FOUND', 'Folder not found');
    const secret = await app.prisma.secret.create({
      data: { folderId: id, name: b.name, type: b.type, description: b.description || null, expiresAt: b.expiresAt ? new Date(b.expiresAt) : null, createdById: request.userId },
    });
    await app.prisma.secretVersion.create({
      data: { secretId: secret.id, version: 1, ...sealSecret({ username: b.username || undefined, url: b.url || undefined, value: b.value }, secret.id, 1), reason: 'Created', createdById: request.userId },
    });
    await log(request, 'CREATE', 'secret', secret.id, { name: secret.name, folderId: id, type: secret.type });
    return reply.code(201).send({ success: true, data: { id: secret.id, name: secret.name } });
  });

  app.patch('/secrets/:id', { preHandler: pre, schema: { body: SecretPatch } }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const s = await app.prisma.secret.findFirst({ where: { id, deletedAt: null } });
    if (!s) return err(reply, 404, 'NOT_FOUND', 'Secret not found');
    if (!atLeast(await levelOn(request.userId!, s.folderId), 'EDIT')) return err(reply, 403, 'FORBIDDEN', 'You need Edit access to this folder');
    const b = request.body as z.infer<typeof SecretPatch>;
    if (!(['name', 'description', 'expiresAt', 'username', 'url', 'value'] as const).some((k) => b[k] !== undefined)) return err(reply, 400, 'NOTHING', 'Nothing to change');
    if (s.type === 'FILE' && (b.value !== undefined || b.username !== undefined || b.url !== undefined)) return err(reply, 400, 'IS_FILE', 'This secret is a file. Use Replace file to change it.');
    let version = s.currentVersion;
    // A new value, username or URL always becomes a NEW version; the old one stays untouched
    if (b.value !== undefined || b.username !== undefined || b.url !== undefined) {
      const prev = await app.prisma.secretVersion.findUnique({ where: { secretId_version: { secretId: id, version: s.currentVersion } } });
      const before = prev ? openSecret(prev, id, prev.version) : { value: '' };
      const next = {
        username: (b.username === undefined ? before.username : b.username) || undefined,
        url: (b.url === undefined ? before.url : b.url) || undefined,
        value: b.value ?? before.value,
      };
      version = s.currentVersion + 1;
      await app.prisma.secretVersion.create({ data: { secretId: id, version, ...sealSecret(next, id, version), reason: b.reason, createdById: request.userId } });
    }
    await app.prisma.secret.update({
      where: { id },
      data: {
        currentVersion: version,
        ...(b.name ? { name: b.name } : {}),
        ...(b.description !== undefined ? { description: b.description || null } : {}),
        ...(b.expiresAt !== undefined ? { expiresAt: b.expiresAt ? new Date(b.expiresAt) : null } : {}),
      },
    });
    const what = b.value !== undefined ? 'changed the secret value of' : b.username !== undefined || b.url !== undefined ? 'changed the login details of' : 'changed the details (name, description or date) of';
    await notifyChange(request, id, b.name ?? s.name, s.folderId, what, b.reason);
    // never log values, only which fields changed
    await log(request, 'UPDATE', 'secret', id, { name: s.name, reason: b.reason, newVersion: version !== s.currentVersion ? version : undefined, fields: Object.keys(b).filter((k) => k !== 'reason') });
    return reply.send({ success: true, data: { id, version } });
  });

  // Soft delete: the row and every version stay in the database
  app.delete('/secrets/:id', { preHandler: pre, schema: { querystring: ReasonQuery } }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const s = await app.prisma.secret.findFirst({ where: { id, deletedAt: null } });
    if (!s) return err(reply, 404, 'NOT_FOUND', 'Secret not found');
    if (!atLeast(await levelOn(request.userId!, s.folderId), 'MANAGE')) return err(reply, 403, 'FORBIDDEN', 'You need Manage access to this folder');
    const { reason } = request.query as z.infer<typeof ReasonQuery>;
    await app.prisma.secret.update({ where: { id }, data: { deletedAt: new Date() } });
    await notifyChange(request, id, s.name, s.folderId, 'deleted', reason);
    await log(request, 'DELETE', 'secret', id, { name: s.name, reason });
    return reply.send({ success: true, data: null });
  });

  app.get('/secrets/:id/versions', { preHandler: pre }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const s = await app.prisma.secret.findFirst({ where: { id, deletedAt: null } });
    if (!s) return err(reply, 404, 'NOT_FOUND', 'Secret not found');
    if (!atLeast(await levelOn(request.userId!, s.folderId), 'EDIT')) return err(reply, 403, 'FORBIDDEN', 'You need Edit access to this folder');
    const v = await app.prisma.secretVersion.findMany({ where: { secretId: id }, orderBy: { version: 'desc' }, select: { version: true, reason: true, createdAt: true, createdById: true } });
    const ids = v.map((x) => x.createdById).filter(Boolean) as string[];
    const names = new Map((await app.prisma.profile.findMany({ where: { id: { in: ids } }, select: { id: true, fullName: true } })).map((p) => [p.id, p.fullName]));
    return reply.send({ success: true, data: v.map((x) => ({ version: x.version, reason: x.reason, createdAt: x.createdAt, by: x.createdById ? names.get(x.createdById) ?? null : null })) });
  });

  // ---------- reveal (there is no download: nothing can be taken out of the vault as a file) ----------
  // Shared by "show" and "download": a VIEW grant first, then a fresh check that it really is the account owner
  async function gate(request: FastifyRequest, reply: any, id: string, action: 'VIEW' | 'DOWNLOAD') {
    const userId = request.userId!;
    const s = await app.prisma.secret.findFirst({ where: { id, deletedAt: null }, include: { folder: { select: { name: true } } } });
    if (!s) { err(reply, 404, 'NOT_FOUND', 'Secret not found'); return null; }
    const detail = { name: s.name, folder: s.folder.name };
    if (!atLeast(await levelOn(userId, s.folderId), 'VIEW')) {
      await log(request, action, 'secret', id, detail, false, 'No access');
      err(reply, 403, 'FORBIDDEN', 'You do not have access to this secret. Request access first.');
      return null;
    }
    if (recentFails(userId).length >= 5) {
      await log(request, action, 'secret', id, detail, false, 'Locked after repeated failed checks');
      err(reply, 429, 'LOCKED', 'Too many wrong attempts. Try again in a few minutes.');
      return null;
    }
    // the authenticator code when 2FA is on, else the password
    const me = await app.prisma.profile.findUnique({ where: { id: userId }, select: { passwordHash: true, authProvider: true, totpEnabled: true, totpSecretEnc: true } });
    const { password, code } = (request.body ?? {}) as z.infer<typeof StepUp>;
    let ok = false;
    if (me?.totpEnabled && me.totpSecretEnc) ok = !!code && verifyTotp(decryptSecret(me.totpSecretEnc), code);
    else if (me?.authProvider === 'LOCAL') ok = !!password && (await auth.verifyPassword(password, me.passwordHash));
    else { err(reply, 403, 'NEEDS_2FA', 'Turn on two-factor authentication in Settings to open secrets'); return null; }
    if (!ok) {
      fails.set(userId, [...recentFails(userId), Date.now()]);
      await log(request, action, 'secret', id, detail, false, 'Re-check failed');
      err(reply, 401, 'STEP_UP_FAILED', me?.totpEnabled ? 'That authenticator code is not right' : 'That password is not right');
      return null;
    }
    fails.delete(userId);
    return { s, detail };
  }

  app.post('/secrets/:id/reveal', { preHandler: pre, schema: { body: StepUp }, config: { rateLimit: { max: 30, timeWindow: '1 minute' } } }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const g = await gate(request, reply, id, 'VIEW');
    if (!g) return;
    if (g.s.type === 'FILE') return err(reply, 400, 'IS_FILE', 'This secret is a file. Files cannot be downloaded from the Secret Manager.');
    const row = await app.prisma.secretVersion.findUnique({ where: { secretId_version: { secretId: id, version: g.s.currentVersion } } });
    if (!row) return err(reply, 500, 'MISSING', 'This secret has no stored value');
    let payload;
    try { payload = openSecret(row, id, row.version); }
    catch { return err(reply, 500, 'DECRYPT_FAILED', 'The value could not be decrypted. Is VAULT_MASTER_KEY the same key it was saved with?'); }
    await log(request, 'VIEW', 'secret', id, { ...g.detail, version: row.version });
    reply.header('Cache-Control', 'no-store');
    return reply.send({ success: true, data: { ...payload, version: row.version } });
  });

  // ---------- file secrets (upload) ----------
  // same checks as any upload: size, then ClamAV; if the scanner cannot answer the file is refused, never let through unscanned
  async function acceptFile(request: FastifyRequest, reply: any): Promise<Buffer | null> {
    const body = request.body;
    if (!Buffer.isBuffer(body) || body.length === 0) { err(reply, 400, 'EMPTY', 'The file is empty or could not be read'); return null; }
    if (body.length > MAX_UPLOAD_BYTES) { err(reply, 413, 'TOO_LARGE', `The file is larger than ${MAX_UPLOAD_MB} MB`); return null; }
    if (VIRUS_SCAN_ENABLED) {
      const scan = await scanUpload(body);
      if (scan.status === 'infected') {
        await log(request, 'UPLOAD', 'secret', null, { virus: scan.signature, size: body.length }, false, `Virus found: ${scan.signature}`);
        err(reply, 422, 'VIRUS_FOUND', `A virus was found in this file (${scan.signature}), so it was not saved. Tell your security team.`);
        return null;
      }
      if (scan.status === 'unavailable') { err(reply, 503, 'SCANNER_UNAVAILABLE', 'The file could not be checked for viruses right now, so it was not saved. Try again in a minute.'); return null; }
    }
    return body;
  }

  // writes the encrypted file, returns the version row to insert; the caller removes the file again if that insert fails
  async function sealFile(secretId: string, version: number, filename: string, bytes: Buffer, userId: string, reason: string) {
    const key = `_vault/${secretId}/${version}.bin`;
    const sealed = sealSecret({ value: '', file: { name: filename } }, secretId, version, bytes);
    await storage.upload(key, sealed.fileBlob!);
    // Readable by the host's backup job (it runs outside the container as another user). Safe: the file is AES-256-GCM
    // ciphertext and the key is never stored beside it. Access is still controlled by the vault's own routes.
    await chmod(join(env.STORAGE_DIR, key), 0o644).catch(() => {});
    return { key, row: { secretId, version, valueEnc: sealed.valueEnc, dekEnc: sealed.dekEnc, keyId: sealed.keyId, filePath: key, fileSize: bytes.length, reason, createdById: userId } };
  }

  app.put('/folders/:id/secrets/file', { preHandler: pre, schema: { querystring: FileQuery } }, async (request, reply) => {
    const { id } = request.params as { id: string };
    if (!atLeast(await levelOn(request.userId!, id), 'EDIT')) return err(reply, 403, 'FORBIDDEN', 'You need Edit access to this folder');
    if (!(await app.prisma.secretFolder.findFirst({ where: { id, deletedAt: null } }))) return err(reply, 404, 'NOT_FOUND', 'Folder not found');
    const q = request.query as z.infer<typeof FileQuery>;
    const bytes = await acceptFile(request, reply);
    if (!bytes) return;
    const filename = cleanName(q.filename);
    const secretId = randomUUID();
    const f = await sealFile(secretId, 1, filename, bytes, request.userId!, 'Uploaded');
    try {
      await app.prisma.$transaction([
        app.prisma.secret.create({ data: { id: secretId, folderId: id, name: q.name || filename, type: 'FILE', description: q.description || null, expiresAt: q.expiresAt ? new Date(q.expiresAt) : null, createdById: request.userId } }),
        app.prisma.secretVersion.create({ data: f.row }),
      ]);
    } catch (e) { await storage.delete(f.key).catch(() => {}); throw e; }
    await log(request, 'UPLOAD', 'secret', secretId, { name: q.name || filename, folderId: id, size: bytes.length });
    return reply.code(201).send({ success: true, data: { id: secretId, name: q.name || filename } });
  });

  // a new file for an existing file secret: a new version, the old file stays
  app.put('/secrets/:id/file', { preHandler: pre, schema: { querystring: ReplaceQuery } }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const s = await app.prisma.secret.findFirst({ where: { id, deletedAt: null } });
    if (!s) return err(reply, 404, 'NOT_FOUND', 'Secret not found');
    if (s.type !== 'FILE') return err(reply, 400, 'NOT_FILE', 'This secret is not a file');
    if (!atLeast(await levelOn(request.userId!, s.folderId), 'EDIT')) return err(reply, 403, 'FORBIDDEN', 'You need Edit access to this folder');
    const q = request.query as z.infer<typeof ReplaceQuery>;
    const bytes = await acceptFile(request, reply);
    if (!bytes) return;
    const version = s.currentVersion + 1;
    const f = await sealFile(id, version, cleanName(q.filename), bytes, request.userId!, q.reason);
    try {
      await app.prisma.$transaction([
        app.prisma.secretVersion.create({ data: f.row }),
        app.prisma.secret.update({ where: { id }, data: { currentVersion: version } }),
      ]);
    } catch (e) { await storage.delete(f.key).catch(() => {}); throw e; }
    await notifyChange(request, id, s.name, s.folderId, `replaced the file (now version ${version}) of`, q.reason);
    await log(request, 'UPLOAD', 'secret', id, { name: s.name, reason: q.reason, newVersion: version, size: bytes.length });
    return reply.send({ success: true, data: { id, version } });
  });

  // ---------- who has access ----------
  const canSeeGrants = async (request: FastifyRequest, folderId: string) =>
    ADMINS.includes(request.user!.role) || atLeast(await levelOn(request.userId!, folderId), 'MANAGE');

  app.get('/folders/:id/grants', { preHandler: pre }, async (request, reply) => {
    const { id } = request.params as { id: string };
    if (!(await canSeeGrants(request, id))) return err(reply, 403, 'FORBIDDEN', 'Only a folder manager or an admin can see who has access');
    const g = await app.prisma.secretGrant.findMany({ where: { folderId: id }, orderBy: { createdAt: 'asc' } });
    const people = new Map((await app.prisma.profile.findMany({ where: { id: { in: g.map((x) => x.userId) } }, select: { id: true, fullName: true, email: true, role: true } })).map((p) => [p.id, p]));
    return reply.send({ success: true, data: g.map((x) => ({ id: x.id, userId: x.userId, level: x.level, expiresAt: x.expiresAt, createdAt: x.createdAt, user: people.get(x.userId) ?? null, expired: !!x.expiresAt && x.expiresAt < new Date() })) });
  });

  app.put('/folders/:id/grants', { preHandler: pre, schema: { body: GrantSchema } }, async (request, reply) => {
    const { id } = request.params as { id: string };
    if (!(await canSeeGrants(request, id))) return err(reply, 403, 'FORBIDDEN', 'Only a folder manager or an admin can give access');
    const b = request.body as z.infer<typeof GrantSchema>;
    if (b.expiresAt && new Date(b.expiresAt) <= new Date()) return err(reply, 400, 'BAD_DATE', 'The end time must be in the future');
    if (!(await app.prisma.secretFolder.findFirst({ where: { id, deletedAt: null } }))) return err(reply, 404, 'NOT_FOUND', 'Folder not found');
    const user = await app.prisma.profile.findFirst({ where: { id: b.userId, status: 'ACTIVE' }, select: { id: true } });
    if (!user) return err(reply, 404, 'NOT_FOUND', 'User not found');
    const data = { level: b.level, expiresAt: b.expiresAt ? new Date(b.expiresAt) : null, grantedById: request.userId };
    await app.prisma.secretGrant.upsert({ where: { folderId_userId: { folderId: id, userId: b.userId } }, create: { folderId: id, userId: b.userId, ...data }, update: data });
    await log(request, 'SHARE', 'secret_folder', id, { userId: b.userId, level: b.level, expiresAt: b.expiresAt ?? null, self: b.userId === request.userId });
    return reply.send({ success: true, data: null });
  });

  app.delete('/folders/:id/grants/:userId', { preHandler: pre }, async (request, reply) => {
    const { id, userId } = request.params as { id: string; userId: string };
    if (!(await canSeeGrants(request, id))) return err(reply, 403, 'FORBIDDEN', 'Only a folder manager or an admin can take access away');
    const g = await app.prisma.secretGrant.findUnique({ where: { folderId_userId: { folderId: id, userId } } });
    if (!g) return err(reply, 404, 'NOT_FOUND', 'That person has no access');
    // never leave a folder nobody can manage
    if (g.level === 'MANAGE' && (await app.prisma.secretGrant.count({ where: { folderId: id, level: 'MANAGE', userId: { not: userId } } })) === 0)
      return err(reply, 409, 'LAST_MANAGER', 'A folder needs at least one manager. Give Manage to someone else first.');
    await app.prisma.secretGrant.delete({ where: { id: g.id } });
    await log(request, 'UNASSIGN', 'secret_folder', id, { userId });
    return reply.send({ success: true, data: null });
  });
}
