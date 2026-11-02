import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { createAuditLogger } from '../services/audit-logger.js';

const CreateMilestoneSchema = z.object({
  name: z.string().min(1).max(255),
  description: z.string().optional().nullable(),
  dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

const UpdateMilestoneSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  description: z.string().optional().nullable(),
  dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});

async function checkProjectAccess(app: FastifyInstance, userId: string, userRole: string, projectId: string) {
  if (userRole === 'SUPER_ADMIN') return true;
  const membership = await app.prisma.projectMember.findUnique({
    where: { projectId_userId: { projectId, userId } },
  });
  return !!membership;
}

export async function milestoneRoutes(app: FastifyInstance) {
  const auditLogger = createAuditLogger(app);

  // List milestones for a project
  app.get('/:projectId/milestones', async (request, reply) => {
    const userId = request.userId!;
    const userRole = request.user!.role;
    const { projectId } = request.params as { projectId: string };

    const hasAccess = await checkProjectAccess(app, userId, userRole, projectId);
    if (!hasAccess) {
      return reply.code(403).send({ success: false, error: { code: 'FORBIDDEN', message: 'Access denied' } });
    }

    const milestones = await app.prisma.milestone.findMany({
      where: { projectId },
      orderBy: { dueDate: 'asc' },
      select: {
        id: true,
        name: true,
        description: true,
        dueDate: true,
        completedAt: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    return reply.send({ success: true, data: milestones });
  });

  // Create milestone
  app.post('/:projectId/milestones', {
    schema: { body: CreateMilestoneSchema },
  }, async (request, reply) => {
    const userId = request.userId!;
    const userRole = request.user!.role;
    const { projectId } = request.params as { projectId: string };
    const data = request.body as z.infer<typeof CreateMilestoneSchema>;

    const hasAccess = await checkProjectAccess(app, userId, userRole, projectId);
    if (!hasAccess) {
      return reply.code(403).send({ success: false, error: { code: 'FORBIDDEN', message: 'Access denied' } });
    }

    const milestone = await app.prisma.milestone.create({
      data: {
        projectId,
        name: data.name,
        description: data.description,
        dueDate: new Date(data.dueDate),
      },
    });

    await auditLogger.logResource('CREATE', userId, 'milestone', milestone.id, { name: data.name }, request.ip, request.headers['user-agent']);

    return reply.code(201).send({ success: true, data: milestone });
  });

  // Update milestone
  app.patch('/:projectId/milestones/:milestoneId', {
    schema: { body: UpdateMilestoneSchema },
  }, async (request, reply) => {
    const userId = request.userId!;
    const userRole = request.user!.role;
    const { projectId, milestoneId } = request.params as { projectId: string; milestoneId: string };
    const data = request.body as z.infer<typeof UpdateMilestoneSchema>;

    const hasAccess = await checkProjectAccess(app, userId, userRole, projectId);
    if (!hasAccess) {
      return reply.code(403).send({ success: false, error: { code: 'FORBIDDEN', message: 'Access denied' } });
    }

    const updateData: any = { ...data };
    if (data.dueDate) updateData.dueDate = new Date(data.dueDate);

    const milestone = await app.prisma.milestone.update({
      where: { id: milestoneId },
      data: updateData,
    });

    await auditLogger.logResource('UPDATE', userId, 'milestone', milestoneId, data, request.ip, request.headers['user-agent']);

    return reply.send({ success: true, data: milestone });
  });

  // Complete milestone
  app.post('/:projectId/milestones/:milestoneId/complete', async (request, reply) => {
    const userId = request.userId!;
    const userRole = request.user!.role;
    const { projectId, milestoneId } = request.params as { projectId: string; milestoneId: string };

    const hasAccess = await checkProjectAccess(app, userId, userRole, projectId);
    if (!hasAccess) {
      return reply.code(403).send({ success: false, error: { code: 'FORBIDDEN', message: 'Access denied' } });
    }

    const milestone = await app.prisma.milestone.update({
      where: { id: milestoneId },
      data: { completedAt: new Date() },
    });

    await auditLogger.logResource('UPDATE', userId, 'milestone', milestoneId, { completed: true }, request.ip, request.headers['user-agent']);

    return reply.send({ success: true, data: milestone });
  });

  // Delete milestone
  app.delete('/:projectId/milestones/:milestoneId', async (request, reply) => {
    const userId = request.userId!;
    const userRole = request.user!.role;
    const { projectId, milestoneId } = request.params as { projectId: string; milestoneId: string };

    const hasAccess = await checkProjectAccess(app, userId, userRole, projectId);
    if (!hasAccess) {
      return reply.code(403).send({ success: false, error: { code: 'FORBIDDEN', message: 'Access denied' } });
    }

    await app.prisma.milestone.delete({ where: { id: milestoneId } });

    await auditLogger.logResource('DELETE', userId, 'milestone', milestoneId, {}, request.ip, request.headers['user-agent']);

    return reply.send({ success: true, data: null });
  });
}