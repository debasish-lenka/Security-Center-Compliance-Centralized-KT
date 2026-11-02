import type { FastifyRequest, FastifyReply, FastifyInstance } from 'fastify';

export async function enforceProjectScope(
  request: FastifyRequest,
  reply: FastifyReply
) {
  // Skip for non-project routes
  const url = request.url;
  const projectRoutes = [
    '/api/v1/projects/',
    '/api/v1/documents',
    '/api/v1/kt-reports',
    '/api/v1/compliance',
    '/api/v1/tasks',
    '/api/v1/milestones',
  ];

  const isProjectRoute = projectRoutes.some(route => url.startsWith(route));
  if (!isProjectRoute) return;

  // Extract projectId from URL
  const projectIdMatch = url.match(/\/projects\/([a-f0-9-]{36})/);
  const projectId = projectIdMatch ? projectIdMatch[1] : null;

  if (!projectId) return; // No project context, let route handler decide

  const userId = request.userId!;
  const userRole = request.user!.role;

  // Super admins and admins bypass project scope
  if (userRole === 'SUPER_ADMIN' || userRole === 'ADMIN') {
    request.projectId = projectId;
    return;
  }

  // Check project membership
  const membership = await request.server.prisma.projectMember.findUnique({
    where: { projectId_userId: { projectId, userId } },
  });

  if (!membership) {
    return reply.code(403).send({
      success: false,
      error: { code: 'FORBIDDEN', message: 'Access denied to this project' },
    });
  }

  request.projectId = projectId;
  request.projectRole = membership.role;

  // The VIEWER project role is read-only
  if (membership.role === 'VIEWER' && !['GET', 'HEAD', 'OPTIONS'].includes(request.method)) {
    return reply.code(403).send({
      success: false,
      error: { code: 'FORBIDDEN', message: 'Viewers have read-only access to this project' },
    });
  }
}

declare module 'fastify' {
  interface FastifyRequest {
    projectId?: string;
    projectRole?: string;
  }
}