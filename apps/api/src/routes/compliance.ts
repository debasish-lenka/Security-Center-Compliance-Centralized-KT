import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { createAuditLogger } from '../services/audit-logger.js';
import { createNotificationService } from '../services/notifications.js';

const CreateComplianceControlSchema = z.object({
  category: z.string().min(1).max(100),
  controlId: z.string().min(1).max(50),
  title: z.string().min(1).max(500),
  description: z.string().optional().nullable(),
  projectId: z.string().uuid().optional().nullable(),
  ownerId: z.string().uuid(),
  dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable(),
  status: z.enum(['NOT_STARTED', 'IN_PROGRESS', 'COMPLETED', 'OVERDUE', 'AT_RISK']).default('NOT_STARTED'),
  evidence: z.string().optional().nullable(),
});

const UpdateComplianceControlSchema = z.object({
  category: z.string().min(1).max(100).optional(),
  controlId: z.string().min(1).max(50).optional(),
  title: z.string().min(1).max(500).optional(),
  description: z.string().optional().nullable(),
  projectId: z.string().uuid().optional().nullable(),
  ownerId: z.string().uuid().optional(),
  dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable(),
  status: z.enum(['NOT_STARTED', 'IN_PROGRESS', 'COMPLETED', 'OVERDUE', 'AT_RISK']).optional(),
  evidence: z.string().optional().nullable(),
});

const CreateRemediationTaskSchema = z.object({
  title: z.string().min(1).max(255),
  description: z.string().optional().nullable(),
  assigneeId: z.string().uuid(),
  dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

async function checkComplianceAccess(app: FastifyInstance, userId: string, userRole: string, controlId?: string) {
  if (userRole === 'SUPER_ADMIN') return true;
  if (userRole === 'ADMIN' || userRole === 'COMPLIANCE_OFFICER') return true;
  // Check if user is owner of any control
  if (controlId) {
    const control = await app.prisma.complianceControl.findUnique({ where: { id: controlId }, select: { ownerId: true } });
    return control?.ownerId === userId;
  }
  return false;
}

export async function complianceRoutes(app: FastifyInstance) {
  const auditLogger = createAuditLogger(app);

  // List compliance controls
  app.get('/controls', {
    schema: {
      querystring: z.object({
        page: z.coerce.number().int().positive().default(1),
        limit: z.coerce.number().int().positive().max(100).default(20),
        category: z.string().optional(),
        status: z.string().optional(),
        projectId: z.string().uuid().optional(),
        ownerId: z.string().uuid().optional(),
      }),
    },
  }, async (request, reply) => {
    const userId = request.userId!;
    const userRole = request.user!.role;
    const { page, limit, category, status, projectId, ownerId } = request.query as any;

    const where: any = {};
    if (userRole !== 'SUPER_ADMIN' && userRole !== 'ADMIN' && userRole !== 'COMPLIANCE_OFFICER') {
      where.ownerId = userId;
    }
    if (category) where.category = category;
    if (status) where.status = status;
    if (projectId) where.projectId = projectId;
    if (ownerId) where.ownerId = ownerId;

    const [controls, total] = await Promise.all([
      app.prisma.complianceControl.findMany({
        where,
        orderBy: { dueDate: 'asc' },
        skip: (page - 1) * limit,
        take: limit,
        select: {
          id: true,
          category: true,
          controlId: true,
          title: true,
          description: true,
          projectId: true,
          ownerId: true,
          dueDate: true,
          status: true,
          evidence: true,
          lastReviewedAt: true,
          createdAt: true,
          updatedAt: true,
          owner: { select: { fullName: true } },
          project: { select: { name: true } },
          _count: { select: { remediationTasks: true } },
        },
      }),
      app.prisma.complianceControl.count({ where }),
    ]);

    return reply.send({ success: true, data: { items: controls, total, page, limit, totalPages: Math.ceil(total / limit) } });
  });

  // Get single control with remediation tasks
  app.get('/controls/:controlId', async (request, reply) => {
    const userId = request.userId!;
    const userRole = request.user!.role;
    const { controlId } = request.params as { controlId: string };

    const hasAccess = await checkComplianceAccess(app, userId, userRole, controlId);
    if (!hasAccess) {
      return reply.code(403).send({ success: false, error: { code: 'FORBIDDEN', message: 'Access denied' } });
    }

    const control = await app.prisma.complianceControl.findUnique({
      where: { id: controlId },
      select: {
        id: true,
        category: true,
        controlId: true,
        title: true,
        description: true,
        projectId: true,
        ownerId: true,
        dueDate: true,
        status: true,
        evidence: true,
        lastReviewedAt: true,
        createdAt: true,
        updatedAt: true,
        owner: { select: { fullName: true, email: true } },
        project: { select: { name: true } },
        remediationTasks: {
          select: {
            id: true,
            title: true,
            description: true,
            assigneeId: true,
            dueDate: true,
            status: true,
            completedAt: true,
            createdAt: true,
            assignee: { select: { fullName: true, email: true } },
          },
        },
      },
    });

    if (!control) {
      return reply.code(404).send({ success: false, error: { code: 'NOT_FOUND', message: 'Compliance control not found' } });
    }

    return reply.send({ success: true, data: control });
  });

  // Create compliance control
  app.post('/controls', {
    schema: { body: CreateComplianceControlSchema },
  }, async (request, reply) => {
    const userId = request.userId!;
    const userRole = request.user!.role;
    if (userRole !== 'SUPER_ADMIN' && userRole !== 'ADMIN' && userRole !== 'COMPLIANCE_OFFICER') {
      return reply.code(403).send({ success: false, error: { code: 'FORBIDDEN', message: 'Admin access required' } });
    }

    const data = request.body as z.infer<typeof CreateComplianceControlSchema>;

    const control = await app.prisma.complianceControl.create({
      data: {
        ...data,
        dueDate: data.dueDate ? new Date(data.dueDate) : null,
      },
    });

    await auditLogger.logResource('CREATE', userId, 'compliance_control', control.id, data, request.ip, request.headers['user-agent']);

    // Notify owner
    if (data.ownerId !== userId) {
      const notificationService = createNotificationService(app);
      await notificationService.create({
        userId: data.ownerId,
        type: 'COMMENT_ADDED',
        title: 'New Compliance Control Assigned',
        message: `You have been assigned as owner for compliance control: ${data.title}`,
        resourceType: 'compliance_control',
        resourceId: control.id,
      });
    }

    return reply.code(201).send({ success: true, data: control });
  });

  // Update compliance control
  app.patch('/controls/:controlId', {
    schema: { body: UpdateComplianceControlSchema },
  }, async (request, reply) => {
    const userId = request.userId!;
    const userRole = request.user!.role;
    const { controlId } = request.params as { controlId: string };
    const data = request.body as z.infer<typeof UpdateComplianceControlSchema>;

    const hasAccess = await checkComplianceAccess(app, userId, userRole, controlId);
    if (!hasAccess) {
      return reply.code(403).send({ success: false, error: { code: 'FORBIDDEN', message: 'Access denied' } });
    }

    const updateData: any = { ...data };
    if (data.dueDate) updateData.dueDate = new Date(data.dueDate);
    if (data.status === 'COMPLETED') updateData.lastReviewedAt = new Date();

    const control = await app.prisma.complianceControl.update({
      where: { id: controlId },
      data: updateData,
    });

    await auditLogger.logResource('UPDATE', userId, 'compliance_control', controlId, data, request.ip, request.headers['user-agent']);

    return reply.send({ success: true, data: control });
  });

  // Delete compliance control
  app.delete('/controls/:controlId', async (request, reply) => {
    const userId = request.userId!;
    const userRole = request.user!.role;
    if (userRole !== 'SUPER_ADMIN') {
      return reply.code(403).send({ success: false, error: { code: 'FORBIDDEN', message: 'Super admin access required' } });
    }

    const { controlId } = request.params as { controlId: string };
    await app.prisma.complianceControl.delete({ where: { id: controlId } });

    await auditLogger.logResource('DELETE', userId, 'compliance_control', controlId, {}, request.ip, request.headers['user-agent']);

    return reply.send({ success: true, data: null });
  });

  // Remediation tasks
  app.post('/controls/:controlId/remediation-tasks', {
    schema: { body: CreateRemediationTaskSchema },
  }, async (request, reply) => {
    const userId = request.userId!;
    const userRole = request.user!.role;
    const { controlId } = request.params as { controlId: string };
    const data = request.body as z.infer<typeof CreateRemediationTaskSchema>;

    const hasAccess = await checkComplianceAccess(app, userId, userRole, controlId);
    if (!hasAccess) {
      return reply.code(403).send({ success: false, error: { code: 'FORBIDDEN', message: 'Access denied' } });
    }

    const task = await app.prisma.remediationTask.create({
      data: {
        controlId,
        title: data.title,
        description: data.description,
        assigneeId: data.assigneeId,
        dueDate: new Date(data.dueDate),
      },
    });

    await auditLogger.logResource('CREATE', userId, 'remediation_task', task.id, data, request.ip, request.headers['user-agent']);

    // Notify assignee
    if (data.assigneeId !== userId) {
      const notificationService = createNotificationService(app);
      await notificationService.create({
        userId: data.assigneeId,
        type: 'COMMENT_ADDED',
        title: 'New Remediation Task Assigned',
        message: `You have been assigned a remediation task: ${data.title}`,
        resourceType: 'remediation_task',
        resourceId: task.id,
      });
    }

    return reply.code(201).send({ success: true, data: task });
  });

  app.patch('/remediation-tasks/:taskId', async (request, reply) => {
    const userId = request.userId!;
    const userRole = request.user!.role;
    const { taskId } = request.params as { taskId: string };
    const { status } = request.body as { status: 'PENDING' | 'IN_PROGRESS' | 'COMPLETED' | 'OVERDUE' };

    const task = await app.prisma.remediationTask.findUnique({ where: { id: taskId } });
    if (!task) {
      return reply.code(404).send({ success: false, error: { code: 'NOT_FOUND', message: 'Task not found' } });
    }

    const hasAccess = await checkComplianceAccess(app, userId, userRole, task.controlId);
    if (!hasAccess && task.assigneeId !== userId) {
      return reply.code(403).send({ success: false, error: { code: 'FORBIDDEN', message: 'Access denied' } });
    }

    const updateData: any = { status };
    if (status === 'COMPLETED') updateData.completedAt = new Date();

    const updated = await app.prisma.remediationTask.update({ where: { id: taskId }, data: updateData });

    await auditLogger.logResource('UPDATE', userId, 'remediation_task', taskId, { status }, request.ip, request.headers['user-agent']);

    return reply.send({ success: true, data: updated });
  });
}