import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { createAuditLogger } from '../services/audit-logger.js';

const CreateWorkflowSchema = z.object({
  name: z.string().min(1).max(200),
  description: z.string().optional().nullable(),
  type: z.enum([
    'DOCUMENT_APPROVAL',
    'KT_REPORT_REVIEW',
    'COMPLIANCE_REMEDIATION',
    'PROJECT_CREATION',
    'USER_ONBOARDING',
    'ACCESS_REQUEST',
    'CUSTOM'
  ]),
  trigger: z.enum(['MANUAL', 'ON_CREATE', 'ON_UPDATE', 'ON_STATUS_CHANGE', 'SCHEDULED', 'WEBHOOK']),
  config: z.object({
    // For document approval
    steps: z.array(z.object({
      id: z.string(),
      name: z.string(),
      type: z.enum(['APPROVAL', 'REVIEW', 'NOTIFICATION', 'TASK', 'CONDITION', 'SCRIPT']),
      assignees: z.array(z.string().uuid()).optional(),
      assigneeRole: z.string().optional(),
      condition: z.string().optional(), // JSON logic condition
      timeoutHours: z.number().optional(),
      escalationAssignees: z.array(z.string().uuid()).optional(),
      config: z.record(z.unknown()).optional(),
    })).optional(),
    // For scheduled workflows
    schedule: z.object({
      cron: z.string().optional(),
      timezone: z.string().optional(),
    }).optional(),
    // For webhook triggers
    webhook: z.object({
      url: z.string().url().optional(),
      secret: z.string().optional(),
      events: z.array(z.string()).optional(),
    }).optional(),
  }).default({}),
});

const UpdateWorkflowSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  description: z.string().optional().nullable(),
  type: z.enum([
    'DOCUMENT_APPROVAL',
    'KT_REPORT_REVIEW',
    'COMPLIANCE_REMEDIATION',
    'PROJECT_CREATION',
    'USER_ONBOARDING',
    'ACCESS_REQUEST',
    'CUSTOM'
  ]).optional(),
  trigger: z.enum(['MANUAL', 'ON_CREATE', 'ON_UPDATE', 'ON_STATUS_CHANGE', 'SCHEDULED', 'WEBHOOK']).optional(),
  config: z.record(z.unknown()).optional(),
  isActive: z.boolean().optional(),
});

const ExecuteWorkflowSchema = z.object({
  input: z.record(z.unknown()).optional(),
});

async function checkAdminAccess(userRole: string) {
  return ['SUPER_ADMIN', 'ADMIN', 'SECURITY_ADMIN'].includes(userRole);
}

export async function workflowRoutes(app: FastifyInstance) {
  const auditLogger = createAuditLogger(app);

  // List workflows
  app.get('/', {
    schema: {
      querystring: z.object({
        page: z.coerce.number().int().positive().default(1),
        limit: z.coerce.number().int().positive().max(100).default(20),
        type: z.string().optional(),
        isActive: z.coerce.boolean().optional(),
        search: z.string().optional(),
      }),
    },
  }, async (request, reply) => {
    const userRole = request.user!.role;
    if (!await checkAdminAccess(userRole)) {
      return reply.code(403).send({ success: false, error: { code: 'FORBIDDEN', message: 'Admin access required' } });
    }

    const { page, limit, type, isActive, search } = request.query as any;
    const where: any = {};
    if (type) where.type = type;
    if (isActive !== undefined) where.isActive = isActive;
    if (search) {
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { description: { contains: search, mode: 'insensitive' } },
      ];
    }

    const [workflows, total] = await Promise.all([
      app.prisma.workflow.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
        include: {
          creator: { select: { id: true, fullName: true, email: true } },
          _count: { select: { executions: true } },
        },
      }),
      app.prisma.workflow.count({ where }),
    ]);

    return reply.send({
      success: true,
      data: { items: workflows, total, page, limit, totalPages: Math.ceil(total / limit) },
    });
  });

  // Get single workflow
  app.get('/:workflowId', async (request, reply) => {
    const userRole = request.user!.role;
    if (!await checkAdminAccess(userRole)) {
      return reply.code(403).send({ success: false, error: { code: 'FORBIDDEN', message: 'Admin access required' } });
    }

    const { workflowId } = request.params as { workflowId: string };
    const workflow = await app.prisma.workflow.findUnique({
      where: { id: workflowId },
      include: {
        creator: { select: { id: true, fullName: true, email: true } },
        executions: {
          orderBy: { startedAt: 'desc' },
          take: 10,
        },
      },
    });

    if (!workflow) {
      return reply.code(404).send({ success: false, error: { code: 'NOT_FOUND', message: 'Workflow not found' } });
    }

    return reply.send({ success: true, data: workflow });
  });

  // Create workflow
  app.post('/', {
    schema: { body: CreateWorkflowSchema },
  }, async (request, reply) => {
    const userId = request.userId!;
    const userRole = request.user!.role;
    if (!await checkAdminAccess(userRole)) {
      return reply.code(403).send({ success: false, error: { code: 'FORBIDDEN', message: 'Admin access required' } });
    }

    const data = request.body as z.infer<typeof CreateWorkflowSchema>;

    const workflow = await app.prisma.workflow.create({
      data: {
        name: data.name,
        description: data.description,
        type: data.type,
        trigger: data.trigger,
        config: data.config as any,
        createdById: userId,
      },
      include: {
        creator: { select: { id: true, fullName: true } },
      },
    });

    await auditLogger.logResource('CREATE', userId, 'workflow', workflow.id, { name: data.name, type: data.type }, request.ip, request.headers['user-agent']);

    return reply.code(201).send({ success: true, data: workflow });
  });

  // Update workflow
  app.patch('/:workflowId', {
    schema: { body: UpdateWorkflowSchema },
  }, async (request, reply) => {
    const userId = request.userId!;
    const userRole = request.user!.role;
    if (!await checkAdminAccess(userRole)) {
      return reply.code(403).send({ success: false, error: { code: 'FORBIDDEN', message: 'Admin access required' } });
    }

    const { workflowId } = request.params as { workflowId: string };
    const data = request.body as z.infer<typeof UpdateWorkflowSchema>;

    // Build update data explicitly to match Prisma types
    const updateData: any = {};
    if (data.name !== undefined) updateData.name = data.name;
    if (data.description !== undefined) updateData.description = data.description;
    if (data.type !== undefined) updateData.type = data.type;
    if (data.trigger !== undefined) updateData.trigger = data.trigger;
    if (data.config !== undefined) updateData.config = data.config;
    if (data.isActive !== undefined) updateData.isActive = data.isActive;

    const workflow = await app.prisma.workflow.update({
      where: { id: workflowId },
      data: updateData,
      include: {
        creator: { select: { id: true, fullName: true } },
      },
    });

    await auditLogger.logResource('UPDATE', userId, 'workflow', workflowId, data, request.ip, request.headers['user-agent']);

    return reply.send({ success: true, data: workflow });
  });

  // Delete workflow
  app.delete('/:workflowId', async (request, reply) => {
    const userId = request.userId!;
    const userRole = request.user!.role;
    if (!await checkAdminAccess(userRole)) {
      return reply.code(403).send({ success: false, error: { code: 'FORBIDDEN', message: 'Admin access required' } });
    }

    const { workflowId } = request.params as { workflowId: string };

    await app.prisma.workflow.delete({ where: { id: workflowId } });

    await auditLogger.logResource('DELETE', userId, 'workflow', workflowId, {}, request.ip, request.headers['user-agent']);

    return reply.send({ success: true, data: null });
  });

  // Execute workflow manually
  app.post('/:workflowId/execute', {
    schema: { body: ExecuteWorkflowSchema },
  }, async (request, reply) => {
    const userId = request.userId!;
    const userRole = request.user!.role;
    if (!await checkAdminAccess(userRole)) {
      return reply.code(403).send({ success: false, error: { code: 'FORBIDDEN', message: 'Admin access required' } });
    }

    const { workflowId } = request.params as { workflowId: string };
    const { input } = request.body as z.infer<typeof ExecuteWorkflowSchema>;

    const workflow = await app.prisma.workflow.findUnique({ where: { id: workflowId } });
    if (!workflow) {
      return reply.code(404).send({ success: false, error: { code: 'NOT_FOUND', message: 'Workflow not found' } });
    }

    if (!workflow.isActive) {
      return reply.code(400).send({ success: false, error: { code: 'WORKFLOW_INACTIVE', message: 'Workflow is not active' } });
    }

    // Create execution record
    const execution = await app.prisma.workflowExecution.create({
      data: {
        workflowId,
        status: 'RUNNING',
        input: input as any,
        triggeredBy: userId,
      },
    });

    // Execute workflow asynchronously
    executeWorkflowAsync(app, execution.id, workflow, input || {}, userId).catch(err => {
      console.error('Workflow execution failed:', err);
    });

    await auditLogger.logResource('CREATE', userId, 'workflow_execution', execution.id, {
      workflowId,
      workflowName: workflow.name,
      input
    }, request.ip, request.headers['user-agent']);

    return reply.code(202).send({ success: true, data: { ...execution, status: 'RUNNING' } });
  });

  // List workflow executions
  app.get('/:workflowId/executions', {
    schema: {
      querystring: z.object({
        page: z.coerce.number().int().positive().default(1),
        limit: z.coerce.number().int().positive().max(100).default(20),
        status: z.string().optional(),
      }),
    },
  }, async (request, reply) => {
    const userRole = request.user!.role;
    if (!await checkAdminAccess(userRole)) {
      return reply.code(403).send({ success: false, error: { code: 'FORBIDDEN', message: 'Admin access required' } });
    }

    const { workflowId } = request.params as { workflowId: string };
    const { page, limit, status } = request.query as any;

    const where: any = { workflowId };
    if (status) where.status = status;

    const [executions, total] = await Promise.all([
      app.prisma.workflowExecution.findMany({
        where,
        orderBy: { startedAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      app.prisma.workflowExecution.count({ where }),
    ]);

    return reply.send({
      success: true,
      data: { items: executions, total, page, limit, totalPages: Math.ceil(total / limit) },
    });
  });

  // Get execution details
  app.get('/executions/:executionId', async (request, reply) => {
    const userRole = request.user!.role;
    if (!await checkAdminAccess(userRole)) {
      return reply.code(403).send({ success: false, error: { code: 'FORBIDDEN', message: 'Admin access required' } });
    }

    const { executionId } = request.params as { executionId: string };
    const execution = await app.prisma.workflowExecution.findUnique({
      where: { id: executionId },
      include: {
        workflow: { select: { id: true, name: true, type: true } },
      },
    });

    if (!execution) {
      return reply.code(404).send({ success: false, error: { code: 'NOT_FOUND', message: 'Execution not found' } });
    }

    return reply.send({ success: true, data: execution });
  });

  // Cancel execution
  app.post('/executions/:executionId/cancel', async (request, reply) => {
    const userId = request.userId!;
    const userRole = request.user!.role;
    if (!await checkAdminAccess(userRole)) {
      return reply.code(403).send({ success: false, error: { code: 'FORBIDDEN', message: 'Admin access required' } });
    }

    const { executionId } = request.params as { executionId: string };
    const execution = await app.prisma.workflowExecution.findUnique({ where: { id: executionId } });

    if (!execution) {
      return reply.code(404).send({ success: false, error: { code: 'NOT_FOUND', message: 'Execution not found' } });
    }

    if (execution.status !== 'PENDING' && execution.status !== 'RUNNING') {
      return reply.code(400).send({ success: false, error: { code: 'INVALID_STATUS', message: 'Can only cancel pending or running executions' } });
    }

    const updated = await app.prisma.workflowExecution.update({
      where: { id: executionId },
      data: {
        status: 'CANCELLED',
        completedAt: new Date(),
        error: 'Cancelled by user',
      },
    });

    await auditLogger.logResource('UPDATE', userId, 'workflow_execution', executionId, { action: 'cancel' }, request.ip, request.headers['user-agent']);

    return reply.send({ success: true, data: updated });
  });

  // Get workflow statistics
  app.get('/stats/overview', async (request, reply) => {
    const userRole = request.user!.role;
    if (!await checkAdminAccess(userRole)) {
      return reply.code(403).send({ success: false, error: { code: 'FORBIDDEN', message: 'Admin access required' } });
    }

    const [totalWorkflows, activeWorkflows, recentExecutions, executionStats] = await Promise.all([
      app.prisma.workflow.count(),
      app.prisma.workflow.count({ where: { isActive: true } }),
      app.prisma.workflowExecution.findMany({
        orderBy: { startedAt: 'desc' },
        take: 5,
        include: { workflow: { select: { name: true } } },
      }),
      app.prisma.workflowExecution.groupBy({
        by: ['status'],
        _count: true,
      }),
    ]);

    return reply.send({
      success: true,
      data: {
        totalWorkflows,
        activeWorkflows,
        recentExecutions,
        executionStats: executionStats.map(s => ({ status: s.status, count: s._count })),
      },
    });
  });
}

async function executeWorkflowAsync(
  app: FastifyInstance,
  executionId: string,
  workflow: any,
  input: Record<string, unknown>,
  triggeredBy: string
) {
  try {
    const config = workflow.config as any;
    const steps = config.steps || [];

    let stepResults: Record<string, any> = {};
    let currentInput = { ...input };

    for (const step of steps) {
      // Check for cancellation
      const execution = await app.prisma.workflowExecution.findUnique({ where: { id: executionId } });
      if (execution?.status === 'CANCELLED') {
        return;
      }

      let stepOutput: any = null;

      switch (step.type) {
        case 'APPROVAL':
          // Create approval tasks for assignees
          if (step.assignees && step.assignees.length > 0) {
            const notificationService = (await import('../services/notifications.js')).createNotificationService(app);
            for (const assigneeId of step.assignees) {
              await notificationService.create({
                userId: assigneeId,
                type: 'NEW_DOCUMENT',
                title: `Approval Required: ${workflow.name}`,
                message: `Step "${step.name}" requires your approval`,
                resourceType: 'workflow',
                resourceId: executionId,
              });
            }
          }
          // In a real implementation, this would wait for approval
          stepOutput = { status: 'pending_approval', assignees: step.assignees };
          break;

        case 'REVIEW':
          // Create review tasks
          if (step.assignees && step.assignees.length > 0) {
            const notificationService = (await import('../services/notifications.js')).createNotificationService(app);
            for (const assigneeId of step.assignees) {
              await notificationService.create({
                userId: assigneeId,
                type: 'NEW_DOCUMENT',
                title: `Review Required: ${workflow.name}`,
                message: `Step "${step.name}" requires your review`,
                resourceType: 'workflow',
                resourceId: executionId,
              });
            }
          }
          stepOutput = { status: 'pending_review', assignees: step.assignees };
          break;

        case 'NOTIFICATION':
          // Send notifications
          if (step.assignees && step.assignees.length > 0) {
            const notificationService = (await import('../services/notifications.js')).createNotificationService(app);
            for (const assigneeId of step.assignees) {
              await notificationService.create({
                userId: assigneeId,
                type: 'NEW_DOCUMENT',
                title: step.config?.title as string || `Workflow: ${workflow.name}`,
                message: step.config?.message as string || `Step "${step.name}" completed`,
                resourceType: 'workflow',
                resourceId: executionId,
              });
            }
          }
          stepOutput = { status: 'notified', assignees: step.assignees };
          break;

        case 'TASK':
          // Create a task
          if (step.assignees && step.assignees.length > 0 && step.config?.projectId) {
            // Create task in project
            // This would integrate with the task system
          }
          stepOutput = { status: 'task_created' };
          break;

        case 'CONDITION':
          // Evaluate condition
          // This would use a JSON logic evaluator
          stepOutput = { status: 'evaluated', result: true };
          break;

        case 'SCRIPT':
          // Execute custom script
          // This would use a sandboxed script executor
          stepOutput = { status: 'executed' };
          break;
      }

      stepResults[step.id] = stepOutput;
      currentInput[`step_${step.id}`] = stepOutput;
    }

    // Update execution as completed
    await app.prisma.workflowExecution.update({
      where: { id: executionId },
      data: {
        status: 'COMPLETED',
        output: stepResults as any,
        completedAt: new Date(),
      },
    });

    // Log activity
    await app.prisma.activityFeed.create({
      data: {
        actorId: triggeredBy,
        action: 'CREATE',
        resourceType: 'workflow_execution',
        resourceId: executionId,
        details: { workflowId: workflow.id, workflowName: workflow.name, stepsCompleted: steps.length },
        ipAddress: 'system',
        userAgent: 'workflow-engine',
      },
    });

  } catch (error) {
    console.error('Workflow execution error:', error);

    await app.prisma.workflowExecution.update({
      where: { id: executionId },
      data: {
        status: 'FAILED',
        error: error instanceof Error ? error.message : 'Unknown error',
        completedAt: new Date(),
      },
    });
  }
}