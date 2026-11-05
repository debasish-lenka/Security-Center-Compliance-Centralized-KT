import type { FastifyInstance } from 'fastify';
import { policySummary } from '../services/upload-policy.js';

// What may be uploaded, so the pages can say it and filter the file picker (the server checks again on every upload)
export async function uploadPolicyRoutes(app: FastifyInstance) {
  app.get('/upload-policy', { preHandler: [app.authenticate] }, async (_request, reply) => reply.send({ success: true, data: policySummary() }));
}
