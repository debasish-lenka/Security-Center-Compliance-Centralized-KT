import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';

// Flat /knowledge-books URLs for the UI. The rules (access, PDF generation, audit) live in the
// project-scoped routes; these find the project and call them internally.

const isAdmin = (role: string) => role === 'SUPER_ADMIN' || role === 'ADMIN';

export async function knowledgeBookFlatRoutes(app: FastifyInstance) {
  const authHeaders = (request: FastifyRequest) => ({
    ...(request.headers.authorization ? { authorization: request.headers.authorization } : {}),
    ...(request.headers.cookie ? { cookie: request.headers.cookie } : {}),
  });

  async function forward(request: FastifyRequest, reply: any, method: 'GET' | 'POST' | 'PATCH' | 'DELETE', url: string, payload?: unknown) {
    const res = await app.inject({
      method,
      url,
      payload: payload as any,
      headers: { ...authHeaders(request), ...(payload !== undefined ? { 'content-type': 'application/json' } : {}) },
    });
    return reply.code(res.statusCode).send(res.json());
  }

  const projectOf = async (id: string) =>
    (await app.prisma.knowledgeBook.findUnique({ where: { id }, select: { projectId: true } }))?.projectId;
  const notFound = (reply: any) =>
    reply.code(404).send({ success: false, error: { code: 'NOT_FOUND', message: 'Knowledge book not found' } });

  // Books of every project the user can see (admins: all)
  app.get('/', {
    schema: {
      querystring: z.object({
        page: z.coerce.number().int().positive().default(1),
        limit: z.coerce.number().int().positive().max(100).default(20),
        status: z.string().optional(),
        search: z.string().trim().max(200).optional(),
      }),
    },
  }, async (request, reply) => {
    const { page, limit, status, search } = request.query as { page: number; limit: number; status?: string; search?: string };
    const where: any = isAdmin(request.user!.role) ? {} : { project: { members: { some: { userId: request.userId! } } } };
    if (status && status !== 'ALL') where.status = status;
    if (search) where.title = { contains: search, mode: 'insensitive' };

    const [items, total] = await Promise.all([
      app.prisma.knowledgeBook.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
        include: {
          project: { select: { id: true, name: true } },
          generator: { select: { id: true, fullName: true } },
        },
      }),
      app.prisma.knowledgeBook.count({ where }),
    ]);
    return reply.send({ success: true, data: { items, total, page, limit, totalPages: Math.ceil(total / limit) } });
  });

  // Generate a new book (body carries projectId)
  app.post('/', async (request, reply) => {
    const body = (request.body ?? {}) as { projectId?: string };
    if (!body.projectId) {
      return reply.code(400).send({ success: false, error: { code: 'VALIDATION_ERROR', message: 'Choose a project' } });
    }
    return forward(request, reply, 'POST', `/api/v1/projects/${body.projectId}/knowledge-books`, body);
  });

  app.patch('/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    const projectId = await projectOf(id);
    if (!projectId) return notFound(reply);
    return forward(request, reply, 'PATCH', `/api/v1/projects/${projectId}/knowledge-books/${id}`, request.body ?? {});
  });

  app.delete('/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    const projectId = await projectOf(id);
    if (!projectId) return notFound(reply);
    return forward(request, reply, 'DELETE', `/api/v1/projects/${projectId}/knowledge-books/${id}`);
  });

  // { downloadUrl } for the book's PDF
  app.get('/:id/download', async (request, reply) => {
    const { id } = request.params as { id: string };
    const projectId = await projectOf(id);
    if (!projectId) return notFound(reply);
    return forward(request, reply, 'GET', `/api/v1/projects/${projectId}/knowledge-books/${id}/download`);
  });
}
