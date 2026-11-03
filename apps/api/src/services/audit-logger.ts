import type { FastifyInstance } from 'fastify';
import type { AuditAction, Prisma } from '@prisma/client';

interface AuditLogInput {
  actorId?: string | null;
  action: AuditAction;
  resourceType: string;
  resourceId?: string | null;
  details?: Record<string, unknown> | null;
  ipAddress?: string | null;
  userAgent?: string | null;
  outcome: 'SUCCESS' | 'FAILURE';
  errorMessage?: string | null;
}

export class AuditLogger {
  private prisma: FastifyInstance['prisma'];

  constructor(prisma: FastifyInstance['prisma']) {
    this.prisma = prisma;
  }

  async log(input: AuditLogInput): Promise<void> {
    try {
      await this.prisma.auditLog.create({
        data: {
          actorId: input.actorId ?? null,
          action: input.action,
          resourceType: input.resourceType,
          resourceId: input.resourceId,
          details: input.details as Prisma.InputJsonValue | undefined,
          ipAddress: input.ipAddress,
          userAgent: input.userAgent,
          outcome: input.outcome,
          errorMessage: input.errorMessage,
        },
      });
    } catch (error) {
      // Never throw from audit logging - just log to console
      console.error('Failed to write audit log:', error);
    }
  }

  // Convenience methods
  async logAuth(
    action: 'LOGIN' | 'LOGOUT',
    userId: string | null,
    ipAddress?: string,
    userAgent?: string,
    success = true,
    errorMessage?: string
  ) {
    await this.log({
      actorId: userId,
      action,
      resourceType: 'auth',
      ipAddress,
      userAgent,
      outcome: success ? 'SUCCESS' : 'FAILURE',
      errorMessage,
    });
  }

  async logResource(
    action: 'CREATE' | 'UPDATE' | 'DELETE' | 'ASSIGN' | 'UNASSIGN' | 'UPLOAD' | 'DOWNLOAD' | 'APPROVE' | 'REJECT' | 'EXPORT',
    actorId: string,
    resourceType: string,
    resourceId: string,
    details?: Record<string, unknown>,
    ipAddress?: string,
    userAgent?: string,
    success = true,
    errorMessage?: string
  ) {
    await this.log({
      actorId,
      action,
      resourceType,
      resourceId,
      details,
      ipAddress,
      userAgent,
      outcome: success ? 'SUCCESS' : 'FAILURE',
      errorMessage,
    });
  }

  async logRoleChange(
    actorId: string,
    targetUserId: string,
    oldRoles: string[],
    newRoles: string[],
    ipAddress?: string,
    userAgent?: string
  ) {
    await this.log({
      actorId,
      action: 'ROLE_CHANGE',
      resourceType: 'user',
      resourceId: targetUserId,
      details: { oldRoles, newRoles },
      ipAddress,
      userAgent,
      outcome: 'SUCCESS',
    });
  }

  async logPermissionChange(
    actorId: string,
    targetUserId: string,
    oldPermissions: string[],
    newPermissions: string[],
    ipAddress?: string,
    userAgent?: string
  ) {
    await this.log({
      actorId,
      action: 'PERMISSION_CHANGE',
      resourceType: 'user',
      resourceId: targetUserId,
      details: { oldPermissions, newPermissions },
      ipAddress,
      userAgent,
      outcome: 'SUCCESS',
    });
  }

  async logConfigChange(
    actorId: string,
    configKey: string,
    oldValue: unknown,
    newValue: unknown,
    ipAddress?: string,
    userAgent?: string
  ) {
    await this.log({
      actorId,
      action: 'CONFIG_CHANGE',
      resourceType: 'config',
      resourceId: configKey,
      details: { oldValue, newValue },
      ipAddress,
      userAgent,
      outcome: 'SUCCESS',
    });
  }
}

// Factory function for Fastify plugin
export function createAuditLogger(app: FastifyInstance): AuditLogger {
  return new AuditLogger(app.prisma);
}