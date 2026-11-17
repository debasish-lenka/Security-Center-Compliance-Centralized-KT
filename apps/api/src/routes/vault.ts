import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { AuthService } from '../services/auth.js';
import { createAuditLogger } from '../services/audit-logger.js';
import { decryptSecret } from '../services/crypto.js';
import { verifyTotp } from '../services/mfa.js';
import { openSecret, sealSecret, vaultEnabled } from '../services/vault-crypto.js';

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
const SecretPatch = z.object({
  name: z.string().trim().min(1).max(150).optional(),
  description: z.string().trim().max(500).optional().nullable(),
  expiresAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable(),
  username: Content.username,
  url: Content.url,
  value: Content.value.optional(), // sending a value makes a new version
  reason: z.string().trim().max(300).optional(),
});
const GrantSchema = z.object({
  userId: z.string().uuid(),
  level: z.enum(['VIEW', 'EDIT', 'MANAGE']),
  expiresAt: z.string().datetime().optional().nullable(),
});
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
      select: { id: true, name: true, type: true, description: true, currentVersion: true, expiresAt: true, updatedAt: true },
    });
    return reply.send({ success: true, data: { folder: { id: folder.id, name: folder.name, description: folder.description }, myLevel, secrets: rows } });
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
      await app.prisma.secretVersion.create({ data: { secretId: id, version, ...sealSecret(next, id, version), reason: b.reason || 'Changed', createdById: request.userId } });
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
    // never log values, only which fields changed
    await log(request, 'UPDATE', 'secret', id, { name: s.name, newVersion: version !== s.currentVersion ? version : undefined, fields: Object.keys(b).filter((k) => k !== 'reason') });
    return reply.send({ success: true, data: { id, version } });
  });

  // Soft delete: the row and every version stay in the database
  app.delete('/secrets/:id', { preHandler: pre }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const s = await app.prisma.secret.findFirst({ where: { id, deletedAt: null } });
    if (!s) return err(reply, 404, 'NOT_FOUND', 'Secret not found');
    if (!atLeast(await levelOn(request.userId!, s.folderId), 'MANAGE')) return err(reply, 403, 'FORBIDDEN', 'You need Manage access to this folder');
    await app.prisma.secret.update({ where: { id }, data: { deletedAt: new Date() } });
    await log(request, 'DELETE', 'secret', id, { name: s.name });
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

  // ---------- reveal ----------
  app.post('/secrets/:id/reveal', { preHandler: pre, schema: { body: StepUp }, config: { rateLimit: { max: 30, timeWindow: '1 minute' } } }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const userId = request.userId!;
    const s = await app.prisma.secret.findFirst({ where: { id, deletedAt: null }, include: { folder: { select: { name: true } } } });
    if (!s) return err(reply, 404, 'NOT_FOUND', 'Secret not found');
    const detail = { name: s.name, folder: s.folder.name };
    if (!atLeast(await levelOn(userId, s.folderId), 'VIEW')) {
      await log(request, 'VIEW', 'secret', id, detail, false, 'No access');
      return err(reply, 403, 'FORBIDDEN', 'You do not have access to this secret. Request access first.');
    }
    if (recentFails(userId).length >= 5) {
      await log(request, 'VIEW', 'secret', id, detail, false, 'Locked after repeated failed checks');
      return err(reply, 429, 'LOCKED', 'Too many wrong attempts. Try again in a few minutes.');
    }

    // fresh proof it is really the account owner: the authenticator code when 2FA is on, else the password
    const me = await app.prisma.profile.findUnique({ where: { id: userId }, select: { passwordHash: true, authProvider: true, totpEnabled: true, totpSecretEnc: true } });
    const { password, code } = request.body as z.infer<typeof StepUp>;
    let ok = false;
    if (me?.totpEnabled && me.totpSecretEnc) ok = !!code && verifyTotp(decryptSecret(me.totpSecretEnc), code);
    else if (me?.authProvider === 'LOCAL') ok = !!password && (await auth.verifyPassword(password, me.passwordHash));
    else return err(reply, 403, 'NEEDS_2FA', 'Turn on two-factor authentication in Settings to open secrets');
    if (!ok) {
      fails.set(userId, [...recentFails(userId), Date.now()]);
      await log(request, 'VIEW', 'secret', id, detail, false, 'Re-check failed');
      return err(reply, 401, 'STEP_UP_FAILED', me?.totpEnabled ? 'That authenticator code is not right' : 'That password is not right');
    }
    fails.delete(userId);

    const row = await app.prisma.secretVersion.findUnique({ where: { secretId_version: { secretId: id, version: s.currentVersion } } });
    if (!row) return err(reply, 500, 'MISSING', 'This secret has no stored value');
    let payload;
    try { payload = openSecret(row, id, row.version); }
    catch { return err(reply, 500, 'DECRYPT_FAILED', 'The value could not be decrypted. Is VAULT_MASTER_KEY the same key it was saved with?'); }
    await log(request, 'VIEW', 'secret', id, { ...detail, version: row.version });
    reply.header('Cache-Control', 'no-store');
    return reply.send({ success: true, data: { ...payload, version: row.version } });
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
