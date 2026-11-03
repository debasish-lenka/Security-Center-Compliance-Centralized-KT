import type { FastifyInstance } from 'fastify';
import argon2 from 'argon2';
import { randomBytes } from 'crypto';
import { env } from '../utils/env.js';
import { createAuditLogger } from './audit-logger.js';
import { requiresMfa, verifyTotp, consumeRecoveryCode } from './mfa.js';
import { decryptSecret } from './crypto.js';

export type LoginResult =
  | { kind: 'session'; user: any; token: string }
  | { kind: 'mfa'; setupRequired: boolean; mfaToken: string };

export class AuthService {
  private app: FastifyInstance;
  private prisma: FastifyInstance['prisma'];
  private auditLogger: ReturnType<typeof createAuditLogger>;

  constructor(app: FastifyInstance) {
    this.app = app;
    this.prisma = app.prisma;
    this.auditLogger = createAuditLogger(app);
  }

  async hashPassword(password: string): Promise<string> {
    return argon2.hash(password, {
      type: argon2.argon2id,
      memoryCost: 2 ** 16,
      timeCost: 3,
      parallelism: 1,
    });
  }

  async verifyPassword(password: string, hash: string): Promise<boolean> {
    try {
      return await argon2.verify(hash, password);
    } catch {
      return false;
    }
  }

  async generateResetToken(): Promise<string> {
    return randomBytes(32).toString('hex');
  }

  async login(
    email: string,
    password: string,
    ipAddress?: string,
    userAgent?: string
  ): Promise<LoginResult | null> {
    const user = await this.prisma.profile.findUnique({
      where: { email: email.toLowerCase() },
      include: { department: { select: { name: true } } },
    });

    if (!user) {
      await this.auditLogger.logAuth('LOGIN', null, ipAddress, userAgent, false, 'User not found');
      return null;
    }

    if (user.authProvider === 'MICROSOFT') {
      await this.auditLogger.logAuth('LOGIN', user.id, ipAddress, userAgent, false, 'Microsoft account used password sign-in');
      return null;
    }

    const valid = await this.verifyPassword(password, user.passwordHash);

    if (!valid) {
      await this.auditLogger.logAuth('LOGIN', user.id, ipAddress, userAgent, false, 'Invalid password');
      return null;
    }

    if (user.status !== 'ACTIVE') {
      await this.auditLogger.logAuth('LOGIN', user.id, ipAddress, userAgent, false, 'Account not active');
      return null;
    }

    // Admins and super admins must pass a second factor before getting a session
    if (requiresMfa(user.role)) {
      const mfaToken = this.app.jwt.sign({ sub: user.id, purpose: 'mfa' }, { expiresIn: '5m' });
      return { kind: 'mfa', setupRequired: !user.totpEnabled, mfaToken };
    }

    return { kind: 'session', ...(await this.issueSession(user.id, ipAddress, userAgent)) };
  }

  // Final step of every login: sign the session token and audit it
  async issueSession(userId: string, ipAddress?: string, userAgent?: string): Promise<{ user: any; token: string }> {
    const user = await this.prisma.profile.findUniqueOrThrow({
      where: { id: userId },
      include: { department: { select: { name: true } } },
    });
    const token = this.app.jwt.sign({ sub: user.id, email: user.email, role: user.role });
    await this.auditLogger.logAuth('LOGIN', user.id, ipAddress, userAgent, true);
    return {
      user: {
        id: user.id,
        email: user.email,
        fullName: user.fullName,
        department: user.department?.name ?? null,
        role: user.role,
        status: user.status,
      },
      token,
    };
  }

  // Validates a short-lived MFA token issued after the password step
  verifyMfaToken(mfaToken: string): string | null {
    try {
      const payload = this.app.jwt.verify<{ sub: string; purpose?: string }>(mfaToken);
      return payload.purpose === 'mfa' ? payload.sub : null;
    } catch {
      return null;
    }
  }

  // Checks an authenticator code or a one-time recovery code
  async verifySecondFactor(userId: string, input: { code?: string; recoveryCode?: string }): Promise<boolean> {
    const user = await this.prisma.profile.findUnique({ where: { id: userId } });
    if (!user || user.status !== 'ACTIVE' || !user.totpEnabled || !user.totpSecretEnc) return false;

    if (input.code) return verifyTotp(decryptSecret(user.totpSecretEnc), input.code);

    if (input.recoveryCode) {
      const remaining = consumeRecoveryCode(user.recoveryCodeHashes, input.recoveryCode);
      if (!remaining) return false;
      await this.prisma.profile.update({ where: { id: userId }, data: { recoveryCodeHashes: remaining } });
      return true;
    }
    return false;
  }

  async logout(userId: string, ipAddress?: string, userAgent?: string): Promise<void> {
    await this.auditLogger.logAuth('LOGOUT', userId, ipAddress, userAgent, true);
  }

  async register(data: {
    email: string;
    password: string;
    fullName: string;
    department?: string | null;
  }): Promise<{ user: any; token: string }> {
    const passwordHash = await this.hashPassword(data.password);

    const departmentId = await this.resolveDepartmentId(data.department);

    // The first account bootstraps the system and becomes the Super Admin
    const user = await this.prisma.profile.create({
      data: {
        email: data.email.toLowerCase(),
        passwordHash,
        fullName: data.fullName,
        departmentId,
        role: 'SUPER_ADMIN',
        status: 'ACTIVE',
      },
      include: { department: { select: { name: true } } },
    });

    const token = this.app.jwt.sign({
      sub: user.id,
      email: user.email,
      role: user.role,
    });

    await this.auditLogger.logAuth('LOGIN', user.id, undefined, undefined, true);

    return {
      user: {
        id: user.id,
        email: user.email,
        fullName: user.fullName,
        department: user.department?.name ?? null,
        role: user.role,
        status: user.status,
      },
      token,
    };
  }

  private async resolveDepartmentId(name?: string | null): Promise<string | null> {
    const trimmed = name?.trim();
    if (!trimmed) return null;
    const dept = await this.prisma.department.upsert({
      where: { name: trimmed },
      update: {},
      create: { name: trimmed },
    });
    return dept.id;
  }

  async changePassword(userId: string, currentPassword: string, newPassword: string): Promise<boolean> {
    const user = await this.prisma.profile.findUnique({ where: { id: userId } });
    if (!user) return false;

    const valid = await this.verifyPassword(currentPassword, user.passwordHash);
    if (!valid) return false;

    const newHash = await this.hashPassword(newPassword);
    await this.prisma.profile.update({
      where: { id: userId },
      data: { passwordHash: newHash, sessionsValidFrom: new Date() },
    });
    return true;
  }

  async requestPasswordReset(email: string): Promise<string | null> {
    const user = await this.prisma.profile.findUnique({
      where: { email: email.toLowerCase() },
    });

    if (!user) return null; // Don't reveal if email exists

    const token = await this.generateResetToken();
    const expiresAt = new Date(Date.now() + 3600000); // 1 hour

    await this.prisma.profile.update({
      where: { id: user.id },
      data: {
        // Store reset token (in production, use a separate table)
        // For now, we'll store it in a custom field or use a separate model
      },
    });

    // TODO: Send email with reset link
    // For now, return token for development
    if (env.NODE_ENV === 'development') {
      return token;
    }

    return 'sent';
  }

  async resetPassword(token: string, newPassword: string): Promise<boolean> {
    // TODO: Implement proper token validation
    // For now, this is a placeholder
    return false;
  }

  async getProfile(userId: string) {
    const profile = await this.prisma.profile.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        fullName: true,
        department: { select: { name: true } },
        role: true,
        status: true,
        authProvider: true,
        totpEnabled: true,
        createdAt: true,
        updatedAt: true,
        lastActivityAt: true,
      },
    });
    return profile && { ...profile, department: profile.department?.name ?? null };
  }

  async updateProfile(userId: string, data: {
    fullName?: string;
    department?: string | null;
  }) {
    const departmentId = data.department === undefined
      ? undefined
      : await this.resolveDepartmentId(data.department);
    const profile = await this.prisma.profile.update({
      where: { id: userId },
      data: { fullName: data.fullName, departmentId },
      select: {
        id: true,
        email: true,
        fullName: true,
        department: { select: { name: true } },
        role: true,
        status: true,
        createdAt: true,
        updatedAt: true,
        lastActivityAt: true,
      },
    });
    return { ...profile, department: profile.department?.name ?? null };
  }
}

export function createAuthService(app: FastifyInstance): AuthService {
  return new AuthService(app);
}