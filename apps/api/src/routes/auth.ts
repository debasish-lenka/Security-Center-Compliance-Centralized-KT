import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { createAuthService } from '../services/auth.js';
import { env } from '../utils/env.js';
import { createAuditLogger } from '../services/audit-logger.js';
import { encryptSecret, decryptSecret } from '../services/crypto.js';
import { generateRecoveryCodes, generateTotpSecret, requiresMfa, totpEnrollment, verifyTotp } from '../services/mfa.js';
import { findValidInvite } from '../services/invites.js';

const LoginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8).max(128),
});

const RegisterSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8).max(128),
  fullName: z.string().min(1).max(255),
  department: z.string().max(255).optional().nullable(),
});

const ChangePasswordSchema = z.object({
  currentPassword: z.string().min(1).max(128),
  newPassword: z.string().min(10).max(128).regex(/[A-Za-z]/, 'Needs a letter').regex(/\d/, 'Needs a digit'),
});

const MfaCodeSchema = z.object({
  mfaToken: z.string().min(10),
  code: z.string().regex(/^\s*\d{3}\s?\d{3}\s*$/).optional(),
  recoveryCode: z.string().min(8).max(20).optional(),
});

const MfaTokenSchema = z.object({ mfaToken: z.string().min(10) });
const MfaConfirmSchema = z.object({ mfaToken: z.string().min(10), code: z.string().regex(/^\s*\d{3}\s?\d{3}\s*$/) });

const NewPasswordSchema = z.object({
  password: z.string().min(10).max(128).regex(/[A-Za-z]/, 'Needs a letter').regex(/\d/, 'Needs a digit'),
});
const InviteConfirmSchema = z.object({ code: z.string().regex(/^\s*\d{3}\s?\d{3}\s*$/) });

const ForgotPasswordSchema = z.object({
  email: z.string().email(),
});

export async function authRoutes(app: FastifyInstance) {
  const authService = createAuthService(app);
  const auditLogger = createAuditLogger(app);

  const startSession = (reply: any, token: string) =>
    reply.setCookie('auth_token', token, {
      httpOnly: true,
      secure: env.COOKIE_SECURE,
      sameSite: 'lax',
      path: '/',
      maxAge: 7 * 24 * 60 * 60,
    });

  // Login
  app.post('/login', {
    config: { rateLimit: { max: 10, timeWindow: '1 minute' } },
    schema: {
      body: LoginSchema,
    },
  }, async (request, reply) => {
    const { email, password } = request.body as z.infer<typeof LoginSchema>;
    const ipAddress = request.ip;
    const userAgent = request.headers['user-agent'];

    const result = await authService.login(email, password, ipAddress, userAgent);

    if (!result) {
      return reply.code(401).send({
        success: false,
        error: { code: 'INVALID_CREDENTIALS', message: 'Invalid email or password' },
      });
    }

    if (result.kind === 'mfa') {
      return reply.send({
        success: true,
        data: { mfaRequired: !result.setupRequired, mfaSetupRequired: result.setupRequired, mfaToken: result.mfaToken },
      });
    }

    startSession(reply, result.token);
    return reply.send({ success: true, data: { user: result.user, token: result.token } });
  });

  // Register (only for first admin bootstrap or when enabled)
  app.post('/register', {
    schema: {
      body: RegisterSchema,
    },
  }, async (request, reply) => {
    const data = request.body as z.infer<typeof RegisterSchema>;

    // Check if registration is allowed (only if no users exist)
    const userCount = await app.prisma.profile.count();
    if (userCount > 0) {
      return reply.code(403).send({
        success: false,
        error: { code: 'REGISTRATION_DISABLED', message: 'Registration is disabled. Contact an administrator.' },
      });
    }

    const result = await authService.register(data);

    reply.setCookie('auth_token', result.token, {
      httpOnly: true,
      secure: env.COOKIE_SECURE,
      sameSite: 'lax',
      path: '/',
      maxAge: 7 * 24 * 60 * 60,
    });

    return reply.code(201).send({
      success: true,
      data: result,
    });
  });

  // Logout
  app.post('/logout', async (request, reply) => {
    if (request.userId) {
      const ipAddress = request.ip;
      const userAgent = request.headers['user-agent'];
      await authService.logout(request.userId, ipAddress, userAgent);
    }

    reply.clearCookie('auth_token', { path: '/' });

    return reply.send({ success: true, data: null });
  });

  // Get current user profile
  app.get('/me', async (request, reply) => {
    if (!request.userId) {
      return reply.code(401).send({
        success: false,
        error: { code: 'UNAUTHORIZED', message: 'Not authenticated' },
      });
    }

    const user = await authService.getProfile(request.userId);

    return reply.send({
      success: true,
      data: user,
    });
  });

  // Update profile
  app.patch('/me', {
    schema: {
      body: z.object({
        fullName: z.string().min(1).max(255).optional(),
        department: z.string().max(255).optional().nullable(),
      }),
    },
  }, async (request, reply) => {
    if (!request.userId) {
      return reply.code(401).send({
        success: false,
        error: { code: 'UNAUTHORIZED', message: 'Not authenticated' },
      });
    }

    const { fullName, department } = request.body as { fullName?: string; department?: string | null };
    const user = await authService.updateProfile(request.userId, { fullName, department });

    return reply.send({ success: true, data: user });
  });

  // Change password
  app.post('/change-password', {
    schema: {
      body: ChangePasswordSchema,
    },
  }, async (request, reply) => {
    if (!request.userId) {
      return reply.code(401).send({
        success: false,
        error: { code: 'UNAUTHORIZED', message: 'Not authenticated' },
      });
    }

    const { currentPassword, newPassword } = request.body as z.infer<typeof ChangePasswordSchema>;
    const me = await app.prisma.profile.findUnique({ where: { id: request.userId }, select: { authProvider: true } });
    if (me?.authProvider === 'MICROSOFT') {
      return reply.code(400).send({ success: false, error: { code: 'NOT_LOCAL', message: 'This account signs in with Microsoft, so there is no password to change here' } });
    }
    if (currentPassword === newPassword) {
      return reply.code(400).send({ success: false, error: { code: 'SAME_PASSWORD', message: 'Choose a password different from the current one' } });
    }
    const success = await authService.changePassword(request.userId, currentPassword, newPassword);

    if (!success) {
      return reply.code(400).send({
        success: false,
        error: { code: 'INVALID_PASSWORD', message: 'Current password is incorrect' },
      });
    }

    await auditLogger.logConfigChange(request.userId!, 'password_changed', null, { userId: request.userId }, request.ip, request.headers['user-agent']);
    return reply.send({ success: true, data: null });
  });

  // Forgot password
  app.post('/forgot-password', {
    schema: {
      body: ForgotPasswordSchema,
    },
  }, async (request, reply) => {
    const { email } = request.body as z.infer<typeof ForgotPasswordSchema>;
    const result = await authService.requestPasswordReset(email);

    // Always return success to prevent email enumeration
    return reply.send({
      success: true,
      data: env.NODE_ENV === 'development' ? { resetToken: result } : null,
    });
  });

  // Refresh token
  app.post('/refresh', async (request, reply) => {
    if (!request.userId) {
      return reply.code(401).send({
        success: false,
        error: { code: 'UNAUTHORIZED', message: 'Not authenticated' },
      });
    }

    const user = await authService.getProfile(request.userId);
    if (!user || user.status !== 'ACTIVE') {
      return reply.code(401).send({
        success: false,
        error: { code: 'UNAUTHORIZED', message: 'Account not active' },
      });
    }

    const token = app.jwt.sign({
      sub: user.id,
      email: user.email,
      role: user.role,
    });

    reply.setCookie('auth_token', token, {
      httpOnly: true,
      secure: env.COOKIE_SECURE,
      sameSite: 'lax',
      path: '/',
      maxAge: 7 * 24 * 60 * 60,
    });

    return reply.send({ success: true, data: { token } });
  });

  // ---------- Second factor (admins / super admins) ----------

  const authLimit = { rateLimit: { max: 8, timeWindow: '1 minute' } };
  const invalidCode = (reply: any) =>
    reply.code(401).send({ success: false, error: { code: 'INVALID_CODE', message: 'Invalid or expired code' } });
  const invalidSession = (reply: any) =>
    reply.code(401).send({ success: false, error: { code: 'MFA_SESSION_EXPIRED', message: 'Sign-in expired. Please log in again.' } });

  // Step 2 of login for an enrolled user: authenticator code or a recovery code
  app.post('/login/mfa', { config: authLimit, schema: { body: MfaCodeSchema } }, async (request, reply) => {
    const { mfaToken, code, recoveryCode } = request.body as z.infer<typeof MfaCodeSchema>;
    const userId = authService.verifyMfaToken(mfaToken);
    if (!userId) return invalidSession(reply);

    if (!(await authService.verifySecondFactor(userId, { code, recoveryCode }))) {
      await auditLogger.logAuth('LOGIN', userId, request.ip, request.headers['user-agent'], false, 'Invalid MFA code');
      return invalidCode(reply);
    }
    const session = await authService.issueSession(userId, request.ip, request.headers['user-agent']);
    startSession(reply, session.token);
    return reply.send({ success: true, data: session });
  });

  // Admins who haven't enrolled yet (e.g. the seeded super admin) set up the authenticator on first login
  app.post('/mfa/setup', { config: authLimit, schema: { body: MfaTokenSchema } }, async (request, reply) => {
    const userId = authService.verifyMfaToken((request.body as z.infer<typeof MfaTokenSchema>).mfaToken);
    if (!userId) return invalidSession(reply);

    const user = await app.prisma.profile.findUnique({ where: { id: userId } });
    if (!user || user.status !== 'ACTIVE' || !requiresMfa(user.role) || user.totpEnabled) {
      return reply.code(400).send({ success: false, error: { code: 'MFA_NOT_AVAILABLE', message: 'Authenticator setup is not available' } });
    }
    const secret = generateTotpSecret();
    await app.prisma.profile.update({ where: { id: userId }, data: { totpSecretEnc: encryptSecret(secret) } });
    return reply.send({ success: true, data: await totpEnrollment(user.email, secret) });
  });

  app.post('/mfa/confirm', { config: authLimit, schema: { body: MfaConfirmSchema } }, async (request, reply) => {
    const { mfaToken, code } = request.body as z.infer<typeof MfaConfirmSchema>;
    const userId = authService.verifyMfaToken(mfaToken);
    if (!userId) return invalidSession(reply);

    const user = await app.prisma.profile.findUnique({ where: { id: userId } });
    if (!user || user.status !== 'ACTIVE' || user.totpEnabled || !user.totpSecretEnc) return invalidSession(reply);
    if (!verifyTotp(decryptSecret(user.totpSecretEnc), code)) return invalidCode(reply);

    const recovery = generateRecoveryCodes();
    await app.prisma.profile.update({ where: { id: userId }, data: { totpEnabled: true, recoveryCodeHashes: recovery.hashes } });
    await auditLogger.logConfigChange(userId, 'mfa_enrolled', null, { userId }, request.ip, request.headers['user-agent']);

    const session = await authService.issueSession(userId, request.ip, request.headers['user-agent']);
    startSession(reply, session.token);
    return reply.send({ success: true, data: { ...session, recoveryCodes: recovery.codes } });
  });

  // ---------- Account activation (link from the invite email) ----------

  const gone = (reply: any) =>
    reply.code(410).send({ success: false, error: { code: 'INVITE_INVALID', message: 'This link is invalid, already used or has expired. Ask an administrator for a new one.' } });

  app.get('/invite/:token', { config: authLimit }, async (request, reply) => {
    const invite = await findValidInvite(app.prisma, (request.params as { token: string }).token);
    if (!invite) return gone(reply);
    const { email, fullName, role } = invite.user;
    return reply.send({ success: true, data: { email, fullName, role, requiresMfa: requiresMfa(role), expiresAt: invite.expiresAt } });
  });

  // Step 1: choose a password. Regular users are activated here; admins continue to the authenticator step.
  app.post('/invite/:token/password', { config: authLimit, schema: { body: NewPasswordSchema } }, async (request, reply) => {
    const invite = await findValidInvite(app.prisma, (request.params as { token: string }).token);
    if (!invite) return gone(reply);
    const { password } = request.body as z.infer<typeof NewPasswordSchema>;
    const passwordHash = await authService.hashPassword(password);

    if (!requiresMfa(invite.user.role)) {
      await app.prisma.$transaction([
        app.prisma.profile.update({ where: { id: invite.userId }, data: { passwordHash, status: 'ACTIVE' } }),
        app.prisma.inviteToken.update({ where: { id: invite.id }, data: { usedAt: new Date() } }),
      ]);
      await auditLogger.logConfigChange(invite.userId, 'account_activated', null, { userId: invite.userId }, request.ip, request.headers['user-agent']);
      return reply.send({ success: true, data: { activated: true } });
    }

    const secret = generateTotpSecret();
    await app.prisma.inviteToken.update({
      where: { id: invite.id },
      data: { pendingPasswordHash: passwordHash, pendingTotpSecretEnc: encryptSecret(secret) },
    });
    return reply.send({ success: true, data: { activated: false, ...(await totpEnrollment(invite.user.email, secret)) } });
  });

  // Step 2 (admins): prove the authenticator works, then activate and hand out recovery codes
  app.post('/invite/:token/confirm', { config: authLimit, schema: { body: InviteConfirmSchema } }, async (request, reply) => {
    const invite = await findValidInvite(app.prisma, (request.params as { token: string }).token);
    if (!invite) return gone(reply);
    if (!invite.pendingPasswordHash || !invite.pendingTotpSecretEnc) {
      return reply.code(400).send({ success: false, error: { code: 'PASSWORD_FIRST', message: 'Set a password first' } });
    }
    const { code } = request.body as z.infer<typeof InviteConfirmSchema>;
    if (!verifyTotp(decryptSecret(invite.pendingTotpSecretEnc), code)) return invalidCode(reply);

    const recovery = generateRecoveryCodes();
    await app.prisma.$transaction([
      app.prisma.profile.update({
        where: { id: invite.userId },
        data: {
          passwordHash: invite.pendingPasswordHash,
          status: 'ACTIVE',
          totpSecretEnc: invite.pendingTotpSecretEnc,
          totpEnabled: true,
          recoveryCodeHashes: recovery.hashes,
        },
      }),
      app.prisma.inviteToken.update({
        where: { id: invite.id },
        data: { usedAt: new Date(), pendingPasswordHash: null, pendingTotpSecretEnc: null },
      }),
    ]);
    await auditLogger.logConfigChange(invite.userId, 'account_activated', null, { userId: invite.userId }, request.ip, request.headers['user-agent']);
    return reply.send({ success: true, data: { activated: true, recoveryCodes: recovery.codes } });
  });
}
