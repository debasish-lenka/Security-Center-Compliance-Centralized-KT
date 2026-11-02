import type { FastifyInstance } from 'fastify';
import { randomBytes } from 'crypto';
import { z } from 'zod';
import { env } from '../utils/env.js';
import { createAuditLogger } from '../services/audit-logger.js';
import { createAuthService } from '../services/auth.js';
import { encryptSecret } from '../services/crypto.js';
import {
  authorizeUrl, completeSignIn, getSsoSettings, isGuid, isSsoReady, newAuthRequest, ssoRedirectUri,
} from '../services/sso.js';

const STATE_COOKIE = 'sso_state';
const usedCodes = new Map<string, number>(); // jti -> expiry (ms); one-time use of the hand-off code

const frontend = (path: string) => `${env.FRONTEND_URL.replace(/\/$/, '')}${path}`;
const loginError = (code: string) => frontend(`/login?sso_error=${encodeURIComponent(code)}`);

// Public endpoints under /api/v1/auth/microsoft
export async function ssoAuthRoutes(app: FastifyInstance) {
  const auditLogger = createAuditLogger(app);
  const authService = createAuthService(app);

  // The login page asks this to decide whether to show the "Sign in with Microsoft" button
  app.get('/status', async (_request, reply) => {
    return reply.send({ success: true, data: { enabled: isSsoReady(await getSsoSettings(app.prisma)) } });
  });

  // Step 1: send the browser to Microsoft
  app.get('/login', { config: { rateLimit: { max: 20, timeWindow: '1 minute' } } }, async (_request, reply) => {
    const settings = await getSsoSettings(app.prisma);
    if (!isSsoReady(settings)) return reply.redirect(loginError('not_enabled'));

    const req = newAuthRequest();
    // Short-lived signed cookie carries what we need to validate the callback
    const stateToken = app.jwt.sign({ purpose: 'sso-state', state: req.state, nonce: req.nonce, verifier: req.verifier }, { expiresIn: '10m' });
    reply.setCookie(STATE_COOKIE, stateToken, { httpOnly: true, secure: env.COOKIE_SECURE, sameSite: 'lax', path: '/api/v1/auth/microsoft', maxAge: 600 });
    return reply.redirect(authorizeUrl(settings, req));
  });

  // Step 2: Microsoft sends the browser back here with a code
  app.get('/callback', async (request, reply) => {
    const q = request.query as { code?: string; state?: string; error?: string };
    const cookie = request.cookies?.[STATE_COOKIE];
    reply.clearCookie(STATE_COOKIE, { path: '/api/v1/auth/microsoft' });

    if (q.error) return reply.redirect(loginError('cancelled'));
    const settings = await getSsoSettings(app.prisma);
    if (!isSsoReady(settings) || !q.code || !q.state || !cookie) return reply.redirect(loginError('invalid_request'));

    let saved: { purpose?: string; state: string; nonce: string; verifier: string };
    try {
      saved = app.jwt.verify(cookie);
    } catch {
      return reply.redirect(loginError('expired'));
    }
    if (saved.purpose !== 'sso-state' || saved.state !== q.state) return reply.redirect(loginError('invalid_request'));

    let identity;
    try {
      identity = await completeSignIn(settings, q.code, saved.verifier, saved.nonce);
    } catch (err) {
      request.log.warn({ err }, 'Microsoft sign-in failed');
      return reply.redirect(loginError('microsoft_rejected'));
    }

    // Only accounts an admin created for Microsoft sign-in may enter: no automatic sign-up
    const user = await app.prisma.profile.findUnique({ where: { email: identity.email } });
    if (!user || user.authProvider !== 'MICROSOFT' || user.status !== 'ACTIVE') {
      await auditLogger.logAuth('LOGIN', user?.id ?? null, request.ip, request.headers['user-agent'], false, `Microsoft sign-in not allowed: ${identity.email}`);
      return reply.redirect(loginError('not_registered'));
    }

    // Bind to the Microsoft account on first use; afterwards the object id must match
    if (user.externalId && user.externalId !== identity.oid) {
      await auditLogger.logAuth('LOGIN', user.id, request.ip, request.headers['user-agent'], false, 'Microsoft object id mismatch');
      return reply.redirect(loginError('not_registered'));
    }
    if (!user.externalId) {
      const taken = await app.prisma.profile.findFirst({ where: { externalId: identity.oid }, select: { id: true } });
      if (taken) return reply.redirect(loginError('not_registered'));
      await app.prisma.profile.update({ where: { id: user.id }, data: { externalId: identity.oid } });
    }

    // Hand the SPA a one-time code (60s) instead of putting a session token in the URL
    const jti = randomBytes(12).toString('hex');
    const handoff = app.jwt.sign({ sub: user.id, purpose: 'sso', jti }, { expiresIn: '60s' });
    return reply.redirect(frontend(`/login?sso=${encodeURIComponent(handoff)}`));
  });

  // Step 3: the SPA trades the one-time code for a normal session
  app.post('/exchange', { config: { rateLimit: { max: 10, timeWindow: '1 minute' } }, schema: { body: z.object({ code: z.string().min(20) }) } }, async (request, reply) => {
    const { code } = request.body as { code: string };
    let payload: { sub: string; purpose?: string; jti?: string };
    try {
      payload = app.jwt.verify(code);
    } catch {
      return reply.code(401).send({ success: false, error: { code: 'SSO_EXPIRED', message: 'Sign-in expired. Please try again.' } });
    }
    const now = Date.now();
    for (const [k, exp] of usedCodes) if (exp < now) usedCodes.delete(k);
    if (payload.purpose !== 'sso' || !payload.jti || usedCodes.has(payload.jti)) {
      return reply.code(401).send({ success: false, error: { code: 'SSO_EXPIRED', message: 'Sign-in expired. Please try again.' } });
    }
    usedCodes.set(payload.jti, now + 120_000);

    const session = await authService.issueSession(payload.sub, request.ip, request.headers['user-agent']);
    reply.setCookie('auth_token', session.token, { httpOnly: true, secure: env.COOKIE_SECURE, sameSite: 'lax', path: '/', maxAge: 7 * 24 * 60 * 60 });
    return reply.send({ success: true, data: session });
  });
}

const SettingsSchema = z.object({
  enabled: z.boolean(),
  tenantId: z.string().trim().refine(isGuid, 'Tenant ID must be a GUID'),
  clientId: z.string().trim().refine(isGuid, 'Client ID must be a GUID'),
  clientSecret: z.preprocess((v) => (typeof v === 'string' && v.trim() === '' ? undefined : v), z.string().max(500).optional()),
});

// Super admin configuration under /api/v1/admin
export async function ssoSettingsRoutes(app: FastifyInstance) {
  const auditLogger = createAuditLogger(app);
  const superAdminOnly = [app.authenticate, app.requireRole(['SUPER_ADMIN'])];

  app.get('/sso-settings', { preHandler: superAdminOnly }, async (_request, reply) => {
    const s = await getSsoSettings(app.prisma);
    return reply.send({
      success: true,
      data: {
        enabled: s?.enabled ?? false,
        tenantId: s?.tenantId ?? '',
        clientId: s?.clientId ?? '',
        hasClientSecret: !!s?.clientSecretEnc,
        redirectUri: ssoRedirectUri(), // paste this into the Entra ID app registration
      },
    });
  });

  app.put('/sso-settings', { preHandler: superAdminOnly, schema: { body: SettingsSchema } }, async (request, reply) => {
    const b = request.body as z.infer<typeof SettingsSchema>;
    const existing = await getSsoSettings(app.prisma);
    if (b.enabled && !(b.clientSecret || existing?.clientSecretEnc)) {
      return reply.code(400).send({ success: false, error: { code: 'VALIDATION_ERROR', message: 'Client secret is required to enable Microsoft sign-in' } });
    }
    const data = {
      enabled: b.enabled,
      tenantId: b.tenantId,
      clientId: b.clientId,
      updatedBy: request.userId!,
      ...(b.clientSecret ? { clientSecretEnc: encryptSecret(b.clientSecret) } : {}),
    };
    await app.prisma.ssoSettings.upsert({ where: { id: 'default' }, update: data, create: { id: 'default', ...data } });
    await auditLogger.logConfigChange(request.userId!, 'sso_settings', { enabled: existing?.enabled ?? false }, { enabled: b.enabled, tenantId: b.tenantId, clientId: b.clientId }, request.ip, request.headers['user-agent']);
    return reply.send({ success: true, data: null });
  });
}
