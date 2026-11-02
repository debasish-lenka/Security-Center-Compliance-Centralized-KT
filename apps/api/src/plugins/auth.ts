import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import fp from 'fastify-plugin';

declare module 'fastify' {
  interface FastifyInstance {
    authenticate: (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
    requireRole: (roles: string[]) => (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
  }
}

export const authPlugin = fp(async function authPlugin(app: FastifyInstance) {
  // Authentication decorator
  app.decorate('authenticate', async (request: FastifyRequest, reply: FastifyReply) => {
    // authMiddleware (global onRequest hook) has already verified the JWT and loaded the user
    if (!request.userId) {
      reply.code(401).send({ success: false, error: { code: 'UNAUTHORIZED', message: 'Authentication required' } });
    }
  });

  // Role authorization decorator
  app.decorate('requireRole', (roles: string[]) => {
    return async (request: FastifyRequest, reply: FastifyReply) => {
      const userRole = request.user?.role;
      if (!userRole || !roles.includes(userRole)) {
        reply.code(403).send({ success: false, error: { code: 'FORBIDDEN', message: 'Insufficient permissions' } });
      }
    };
  });
});
