import type { FastifyRequest, FastifyReply, FastifyInstance } from 'fastify';
import { env } from '../utils/env.js';

const PUBLIC_PATHS = [
  '/health',
  '/api/v1/files/', // signed-link transfers; the token is the credential
  '/docs',
  '/api/v1/auth/login',
  '/api/v1/auth/mfa',
  '/api/v1/auth/invite',
  '/api/v1/auth/microsoft',
  '/api/v1/auth/register',
  '/api/v1/auth/forgot-password',
  '/api/v1/auth/reset-password',
  '/api/v1/auth/refresh',
];

export async function authMiddleware(
  request: FastifyRequest,
  reply: FastifyReply
) {
  // Skip auth for public paths
  if (PUBLIC_PATHS.some(path => request.url.startsWith(path))) {
    return;
  }

  // Skip auth for swagger UI assets
  if (request.url.startsWith('/docs/')) {
    return;
  }

  try {
    // Try to get token from cookie first, then Authorization header
    let token = request.cookies?.auth_token;

    if (!token) {
      const authHeader = request.headers.authorization;
      if (authHeader?.startsWith('Bearer ')) {
        token = authHeader.slice(7);
      }
    }

    if (!token) {
      throw new Error('No token provided');
    }

    // Verify JWT
    const payload = request.server.jwt.verify<{ sub: string; email: string; role: string; purpose?: string; iat?: number }>(token);
    if (payload.purpose) throw new Error('Not a session token');

    // Get user from database
    const prisma = request.server.prisma;
    const user = await prisma.profile.findUnique({
      where: { id: payload.sub },
      select: {
        id: true,
        email: true,
        fullName: true,
        department: { select: { name: true } },
        role: true,
        status: true,
        lastActivityAt: true,
        sessionsValidFrom: true,
      },
    });

    if (!user) {
      throw new Error('User not found');
    }

    if (user.status !== 'ACTIVE') {
      throw new Error('Account is not active');
    }

    // A password change or 2FA reset ends every session started before it (iat is in whole seconds)
    if (user.sessionsValidFrom && (payload.iat ?? 0) < Math.floor(user.sessionsValidFrom.getTime() / 1000)) {
      throw new Error('Session ended');
    }

    const { sessionsValidFrom: _sv, ...publicUser } = user;
    // Attach user to request
    request.user = { ...publicUser, department: user.department?.name ?? null };
    request.userId = user.id;

    // Update last activity (async, don't await)
    prisma.profile.update({
      where: { id: user.id },
      data: { lastActivityAt: new Date() },
    }).catch(() => {}); // Ignore errors

  } catch (error) {
    // Clear invalid cookie
    reply.clearCookie('auth_token', { path: '/' });

    throw Object.assign(new Error('Unauthorized'), { statusCode: 401 });
  }
}
