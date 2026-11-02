import 'fastify';
import type { PrismaClient } from '@prisma/client';
import type { AuditLogger } from './services/audit-logger.js';

declare module 'fastify' {
  interface FastifyInstance {
    prisma: PrismaClient;
    auditLogger: AuditLogger;
  }

  interface FastifyRequest {
    user?: {
      id: string;
      email: string;
      fullName: string;
      department: string | null;
      role: string;
      status: string;
      lastActivityAt: Date | null;
    };
    userId?: string;
  }
}
