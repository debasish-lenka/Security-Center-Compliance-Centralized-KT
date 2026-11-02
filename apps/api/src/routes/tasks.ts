import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { createAuditLogger } from '../services/audit-logger.js';
import { createNotificationService } from '../services/notifications.js';

const CreateTaskSchema = z.object({
  title: z.string().min(1).max(255),
  description: z.string().optional().nullable(),
  priority: z.enum(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']).default('MEDIUM'),
  assigneeId: z.string().uuid().optional().nullable(),
  dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable(),
});

const UpdateTaskSchema = z.object({
  title: z.string().min(1).max(255).optional(),
  description: z.string().optional().nullable(),
  status: z.enum(['TODO', 'IN_PROGRESS', 'REVIEW', 'DONE', 'BLOCKED']).optional(),
  priority: z.enum(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']).optional(),
  assigneeId: z.string().uuid().optional().nullable(),
  dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable(),
});

async function checkProjectAccess(app: FastifyInstance, userId: string, userRole: string, projectId: string) {
  if (userRole === 'SUPER_ADMIN') return true;
  const membership = await app.prisma.projectMember.findUnique({
    where: { projectId_userId: { projectId, userId } },
  });
  return !!membership;
}

export async function taskRoutes(app: FastifyInstance) {
  const auditLogger = createAuditLogger(app);

  // List tasks for a project
  app.get('/:projectId/tasks', {
    schema: {
      querystring: z.object({
        page: z.coerce.number().int().positive().default(1),
        limit: z.coerce.number().int().positive().max(100).default(20),
        status: z.string().optional(),
        priority: z.string().optional(),
        assigneeId: z.string().uuid().optional(),
      }),
    },
  }, async (request, reply) => {
    const userId = request.userId!;
    const userRole = request.user!.role;
    const { projectId } = request.params as { projectId: string };
    const { page, limit, status, priority, assigneeId } = request.query as any;

    const hasAccess = await checkProjectAccess(app, userId, userRole, projectId);
    if (!hasAccess) {
      return reply.code(403).send({ success: false, error: { code: 'FORBIDDEN', message: 'Access denied' } });
    }

    const where: any = { projectId };
    if (status) where.status = status;
    if (priority) where.priority = priority;
    if (assigneeId) where.assigneeId = assigneeId;
    if (userRole !== 'SUPER_ADMIN' && userRole !== 'ADMIN') {
      where.OR = [{ assigneeId: userId }, { reporterId: userId }];
    }

    const [tasks, total] = await Promise.all([
      app.prisma.task.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
        select: {
          id: true,
          title: true,
          description: true,
          status: true,
          priority: true,
          dueDate: true,
          completedAt: true,
          createdAt: true,
          updatedAt: true,
          assignee: { select: { id: true, fullName: true } },
          reporter: { select: { id: true, fullName: true } },
        },
      }),
      app.prisma.task.count({ where }),
    ]);

    return reply.send({
      success: true,
      data: { items: tasks, total, page, limit, totalPages: Math.ceil(total / limit) },
    });
  });

  // Get single task
  app.get('/:projectId/tasks/:taskId', async (request, reply) => {
    const userId = request.userId!;
    const userRole = request.user!.role;
    const { projectId, taskId } = request.params as { projectId: string; taskId: string };

    const hasAccess = await checkProjectAccess(app, userId, userRole, projectId);
    if (!hasAccess) {
      return reply.code(403).send({ success: false, error: { code: 'FORBIDDEN', message: 'Access denied' } });
    }

    const task = await app.prisma.task.findFirst({
      where: { id: taskId, projectId },
      select: {
        id: true,
        title: true,
        description: true,
        status: true,
        priority: true,
        dueDate: true,
        completedAt: true,
        createdAt: true,
        updatedAt: true,
        assignee: { select: { id: true, fullName: true, email: true } },
        reporter: { select: { id: true, fullName: true } },
      },
    });

    if (!task) {
      return reply.code(404).send({ success: false, error: { code: 'NOT_FOUND', message: 'Task not found' } });
    }

    return reply.send({ success: true, data: task });
  });

  // Create task
  app.post('/:projectId/tasks', {
    schema: { body: CreateTaskSchema },
  }, async (request, reply) => {
    const userId = request.userId!;
    const userRole = request.user!.role;
    const { projectId } = request.params as { projectId: string };
    const data = request.body as z.infer<typeof CreateTaskSchema>;

    const hasAccess = await checkProjectAccess(app, userId, userRole, projectId);
    if (!hasAccess) {
      return reply.code(403).send({ success: false, error: { code: 'FORBIDDEN', message: 'Access denied' } });
    }

    // Verify assignee is a project member
    if (data.assigneeId) {
      const membership = await app.prisma.projectMember.findUnique({
        where: { projectId_userId: { projectId, userId: data.assigneeId } },
      });
      if (!membership) {
        return reply.code(400).send({ success: false, error: { code: 'INVALID_ASSIGNEE', message: 'Assignee is not a project member' } });
      }
    }

    const task = await app.prisma.task.create({
      data: {
        projectId,
        title: data.title,
        description: data.description,
        priority: data.priority,
        assigneeId: data.assigneeId,
        reporterId: userId,
        dueDate: data.dueDate ? new Date(data.dueDate) : null,
      },
    });

    await auditLogger.logResource('CREATE', userId, 'task', task.id, { title: data.title }, request.ip, request.headers['user-agent']);

    // Notify assignee
    if (data.assigneeId && data.assigneeId !== userId) {
      const notificationService = createNotificationService(app);
      const project = await app.prisma.project.findUnique({ where: { id: projectId } });
      await notificationService.create({
        userId: data.assigneeId,
        type: 'COMMENT_ADDED',
        title: 'New Task Assigned',
        message: `You have been assigned to task "${data.title}" in project "${project?.name}"`,
        resourceType: 'task',
        resourceId: task.id,
      });
    }

    return reply.code(201).send({ success: true, data: task });
  });

  // Update task
  app.patch('/:projectId/tasks/:taskId', {
    schema: { body: UpdateTaskSchema },
  }, async (request, reply) => {
    const userId = request.userId!;
    const userRole = request.user!.role;
    const { projectId, taskId } = request.params as { projectId: string; taskId: string };
    const data = request.body as z.infer<typeof UpdateTaskSchema>;

    const hasAccess = await checkProjectAccess(app, userId, userRole, projectId);
    if (!hasAccess) {
      return reply.code(403).send({ success: false, error: { code: 'FORBIDDEN', message: 'Access denied' } });
    }

    const existingTask = await app.prisma.task.findFirst({ where: { id: taskId, projectId } });
    if (!existingTask) {
      return reply.code(404).send({ success: false, error: { code: 'NOT_FOUND', message: 'Task not found' } });
    }

    // Verify assignee is a project member
    if (data.assigneeId) {
      const membership = await app.prisma.projectMember.findUnique({
        where: { projectId_userId: { projectId, userId: data.assigneeId } },
      });
      if (!membership) {
        return reply.code(400).send({ success: false, error: { code: 'INVALID_ASSIGNEE', message: 'Assignee is not a project member' } });
      }
    }

    const updateData: any = { ...data };
    if (data.dueDate) updateData.dueDate = new Date(data.dueDate);
    if (data.status === 'DONE' && existingTask.status !== 'DONE') {
      updateData.completedAt = new Date();
    } else if (data.status && data.status !== 'DONE') {
      updateData.completedAt = null;
    }

    const task = await app.prisma.task.update({
      where: { id: taskId },
      data: updateData,
    });

    await auditLogger.logResource('UPDATE', userId, 'task', taskId, data, request.ip, request.headers['user-agent']);

    return reply.send({ success: true, data: task });
  });

  // Delete task
  app.delete('/:projectId/tasks/:taskId', async (request, reply) => {
    const userId = request.userId!;
    const userRole = request.user!.role;
    const { projectId, taskId } = request.params as { projectId: string; taskId: string };

    const hasAccess = await checkProjectAccess(app, userId, userRole, projectId);
    if (!hasAccess) {
      return reply.code(403).send({ success: false, error: { code: 'FORBIDDEN', message: 'Access denied' } });
    }

    await app.prisma.task.delete({ where: { id: taskId } });

    await auditLogger.logResource('DELETE', userId, 'task', taskId, {}, request.ip, request.headers['user-agent']);

    return reply.send({ success: true, data: null });
  });
}