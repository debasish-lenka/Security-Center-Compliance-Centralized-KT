import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { createAuditLogger } from '../services/audit-logger.js';
import { getStorageService } from '../services/storage.js';
import { recycleDocument } from '../services/recycle-bin.js';
import { createNotificationService } from '../services/notifications.js';
import { adminReasonError, describeChanges, diffFields, tellSuperAdmins } from '../services/document-oversight.js';

const UploadDocumentSchema = z.object({
  name: z.string().min(1).max(500),
  category: z.enum(['KT_REPORT', 'TECHNICAL', 'COMPLIANCE', 'MEETING_NOTES', 'DESIGN', 'OTHER']).default('OTHER'),
  ktReportId: z.string().uuid().optional().nullable(),
  ownerId: z.string().uuid().optional(),
  coAuthorIds: z.array(z.string().uuid()).default([]),
  tags: z.array(z.string()).default([]),
  // Visibility modes
  visibility: z.enum(['PRIVATE', 'PROJECT_MEMBERS', 'TEAM', 'DEPARTMENT', 'ORGANIZATION', 'CUSTOM_USERS']).default('PROJECT_MEMBERS'),
  visibleToTeamIds: z.array(z.string().uuid()).optional(),
  visibleToDeptIds: z.array(z.string().uuid()).optional(),
  visibleToUserIds: z.array(z.string().uuid()).optional(),
  // Watermark configuration
  watermarkConfig: z.object({
    enabled: z.boolean().default(true),
    text: z.string().optional(),
    position: z.enum(['top-left', 'top-right', 'bottom-left', 'bottom-right', 'center', 'diagonal']).default('diagonal'),
    opacity: z.number().min(0).max(1).default(0.15),
    fontSize: z.number().positive().default(24),
    color: z.string().default('#000000'),
    includeUser: z.boolean().default(true),
    includeTimestamp: z.boolean().default(true),
    includeDocumentInfo: z.boolean().default(true),
    // Footer configuration
    footer: z.object({
      enabled: z.boolean().default(false),
      text: z.string().optional(),
      includePageNumbers: z.boolean().default(true),
      includeClassification: z.boolean().default(true),
      includeConfidentiality: z.boolean().default(true),
    }).optional(),
  }).optional(),
  metadata: z.record(z.unknown()).optional(),
});

const UpdateDocumentSchema = z.object({
  reason: z.string().trim().max(500).optional(), // required when an ADMIN edits
  name: z.string().min(1).max(500).optional(),
  category: z.enum(['KT_REPORT', 'TECHNICAL', 'COMPLIANCE', 'MEETING_NOTES', 'DESIGN', 'OTHER']).optional(),
  ownerId: z.string().uuid().optional(),
  coAuthorIds: z.array(z.string().uuid()).optional(),
  tags: z.array(z.string()).optional(),
  status: z.enum(['DRAFT', 'PENDING_REVIEW', 'APPROVED', 'REJECTED', 'PUBLISHED', 'ARCHIVED']).optional(),
  reviewStatus: z.enum(['PENDING', 'APPROVED', 'REJECTED', 'CHANGES_REQUESTED']).optional().nullable(),
  reviewerId: z.string().uuid().optional().nullable(),
  reviewComments: z.string().optional().nullable(),
  // Visibility modes
  visibility: z.enum(['PRIVATE', 'PROJECT_MEMBERS', 'TEAM', 'DEPARTMENT', 'ORGANIZATION', 'CUSTOM_USERS']).optional(),
  visibleToTeamIds: z.array(z.string().uuid()).optional(),
  visibleToDeptIds: z.array(z.string().uuid()).optional(),
  visibleToUserIds: z.array(z.string().uuid()).optional(),
  // Watermark configuration
  watermarkConfig: z.object({
    enabled: z.boolean().default(true),
    text: z.string().optional(),
    position: z.enum(['top-left', 'top-right', 'bottom-left', 'bottom-right', 'center', 'diagonal']).default('diagonal'),
    opacity: z.number().min(0).max(1).default(0.15),
    fontSize: z.number().positive().default(24),
    color: z.string().default('#000000'),
    includeUser: z.boolean().default(true),
    includeTimestamp: z.boolean().default(true),
    includeDocumentInfo: z.boolean().default(true),
    // Footer configuration
    footer: z.object({
      enabled: z.boolean().default(false),
      text: z.string().optional(),
      includePageNumbers: z.boolean().default(true),
      includeClassification: z.boolean().default(true),
      includeConfidentiality: z.boolean().default(true),
    }).optional(),
  }).optional().nullable(),
  metadata: z.record(z.unknown()).optional().nullable(),
});

const DocumentReviewSchema = z.object({
  documentId: z.string().uuid(),
  reviewerId: z.string().uuid(),
  status: z.enum(['PENDING', 'APPROVED', 'REJECTED', 'CHANGES_REQUESTED']),
  comments: z.string().optional().nullable(),
});

async function checkProjectAccess(app: FastifyInstance, userId: string, userRole: string, projectId: string) {
  if (userRole === 'SUPER_ADMIN' || userRole === 'ADMIN') return true;
  const membership = await app.prisma.projectMember.findUnique({
    where: { projectId_userId: { projectId, userId } },
  });
  return !!membership;
}

// Text stamped on a PDF for whoever opens it: who, when, and which document
async function stampFor(app: FastifyInstance, userId: string, docName: string): Promise<string> {
  const u = await app.prisma.profile.findUnique({ where: { id: userId }, select: { fullName: true, email: true } });
  const when = new Date().toISOString().slice(0, 16).replace('T', ' ') + ' UTC';
  return `CONFIDENTIAL - ${u?.fullName ?? 'User'} (${u?.email ?? userId}) - ${when} - ${docName}`.slice(0, 220);
}

async function checkDocumentAccess(app: FastifyInstance, userId: string, userRole: string, documentId: string) {
  if (userRole === 'SUPER_ADMIN' || userRole === 'ADMIN') return true;

  const document = await app.prisma.projectDocument.findUnique({
    where: { id: documentId },
    select: {
      projectId: true,
      visibility: true,
      visibleToTeamIds: true,
      visibleToDeptIds: true,
      visibleToUserIds: true,
      ownerId: true,
      coAuthorIds: true,
    },
  });

  if (!document) return false;

  // Check project membership
  const membership = await app.prisma.projectMember.findUnique({
    where: { projectId_userId: { projectId: document.projectId, userId } },
  });

  // If not a project member, check visibility
  if (!membership) {
    // Check custom user visibility
    if (document.visibility === 'CUSTOM_USERS' && document.visibleToUserIds?.includes(userId)) {
      return true;
    }
    // Check department visibility
    if (document.visibility === 'DEPARTMENT' && document.visibleToDeptIds) {
      const userProfile = await app.prisma.profile.findUnique({
        where: { id: userId },
        select: { departmentId: true },
      });
      if (userProfile?.departmentId && document.visibleToDeptIds.includes(userProfile.departmentId)) {
        return true;
      }
    }
    // Check team visibility
    if (document.visibility === 'TEAM' && document.visibleToTeamIds) {
      const teamMemberships = await app.prisma.teamMember.findMany({
        where: { userId, teamId: { in: document.visibleToTeamIds } },
      });
      if (teamMemberships.length > 0) return true;
    }
    // Public visibility (ORGANIZATION)
    if (document.visibility === 'ORGANIZATION') {
      return true;
    }
    return false;
  }

  // User is a project member - check visibility
  switch (document.visibility) {
    case 'PRIVATE':
      // Only owner and co-authors
      return document.ownerId === userId || document.coAuthorIds.includes(userId);
    case 'PROJECT_MEMBERS':
      return true; // All project members
    case 'TEAM':
      if (!document.visibleToTeamIds || document.visibleToTeamIds.length === 0) return true;
      const teamMemberships = await app.prisma.teamMember.findMany({
        where: { userId, teamId: { in: document.visibleToTeamIds } },
      });
      return teamMemberships.length > 0;
    case 'DEPARTMENT':
      if (!document.visibleToDeptIds || document.visibleToDeptIds.length === 0) return true;
      const userProfile = await app.prisma.profile.findUnique({
        where: { id: userId },
        select: { departmentId: true },
      });
      return !!userProfile?.departmentId && document.visibleToDeptIds.includes(userProfile.departmentId);
    case 'ORGANIZATION':
      return true;
    case 'CUSTOM_USERS':
      return document.visibleToUserIds?.includes(userId) || document.ownerId === userId || document.coAuthorIds.includes(userId);
    default:
      return true;
  }
}

async function checkDocumentOwnerOrLead(app: FastifyInstance, userId: string, userRole: string, documentId: string) {
  if (userRole === 'SUPER_ADMIN' || userRole === 'ADMIN') return true;
  const document = await app.prisma.projectDocument.findUnique({
    where: { id: documentId },
    select: { projectId: true, ownerId: true },
  });
  if (!document) return false;
  const membership = await app.prisma.projectMember.findUnique({
    where: { projectId_userId: { projectId: document.projectId, userId } },
  });
  if (!membership) return false;
  // Owner or project lead/owner can manage
  return document.ownerId === userId || ['OWNER', 'LEAD'].includes(membership.role);
}

export async function documentRoutes(app: FastifyInstance) {
  const auditLogger = createAuditLogger(app);
  const storage = getStorageService();

  // List documents for a project
  app.get('/:projectId/documents', {
    schema: {
      querystring: z.object({
        page: z.coerce.number().int().positive().default(1),
        limit: z.coerce.number().int().positive().max(100).default(20),
        category: z.string().optional(),
        search: z.string().optional(),
        status: z.string().optional(),
        visibility: z.string().optional(),
      }),
    },
  }, async (request, reply) => {
    const userId = request.userId!;
    const userRole = request.user!.role;
    const { projectId } = request.params as { projectId: string };
    const { page, limit, category, search, status, visibility } = request.query as any;

    const hasAccess = await checkProjectAccess(app, userId, userRole, projectId);
    if (!hasAccess) {
      return reply.code(403).send({ success: false, error: { code: 'FORBIDDEN', message: 'Access denied' } });
    }

    // Get user's teams and department for visibility filtering
    const [userProfile, userTeamMemberships] = await Promise.all([
      app.prisma.profile.findUnique({ where: { id: userId }, select: { departmentId: true } }),
      app.prisma.teamMember.findMany({ where: { userId }, select: { teamId: true } }),
    ]);
    const userTeamIds = userTeamMemberships.map(m => m.teamId);
    const userDepartmentId = userProfile?.departmentId;

    const where: any = { projectId };
    if (category) where.category = category;
    if (status) where.status = status;
    if (visibility) where.visibility = visibility;
    if (search) {
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { originalName: { contains: search, mode: 'insensitive' } },
      ];
    }

    // Get all matching documents first, then filter by visibility
    const allDocuments = await app.prisma.projectDocument.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        name: true,
        originalName: true,
        mimeType: true,
        size: true,
        category: true,
        version: true,
        ownerId: true,
        coAuthorIds: true,
        tags: true,
        status: true,
        reviewStatus: true,
        reviewerId: true,
        deleteRequests: { where: { status: 'PENDING' }, select: { id: true } },
        visibility: true,
        visibleToTeamIds: true,
        visibleToDeptIds: true,
        visibleToUserIds: true,
        createdAt: true,
        updatedAt: true,
        uploader: { select: { id: true, fullName: true } },
        owner: { select: { id: true, fullName: true, email: true } },
        ktReport: { select: { id: true, reportDate: true } },
      },
    });

    // Filter by visibility
    const visibleDocuments = allDocuments.filter(doc => {
      switch (doc.visibility) {
        case 'PRIVATE':
          return doc.ownerId === userId || doc.coAuthorIds.includes(userId);
        case 'PROJECT_MEMBERS':
          return true;
        case 'TEAM':
          if (!doc.visibleToTeamIds || doc.visibleToTeamIds.length === 0) return true;
          return doc.visibleToTeamIds.some((tid: string) => userTeamIds.includes(tid));
        case 'DEPARTMENT':
          if (!doc.visibleToDeptIds || doc.visibleToDeptIds.length === 0) return true;
          return !!userDepartmentId && doc.visibleToDeptIds.includes(userDepartmentId);
        case 'ORGANIZATION':
          return true;
        case 'CUSTOM_USERS':
          return doc.visibleToUserIds?.includes(userId) || doc.ownerId === userId || doc.coAuthorIds.includes(userId);
        default:
          return true;
      }
    });

    // Apply pagination after filtering
    const paginatedDocuments = visibleDocuments.slice((page - 1) * limit, page * limit);
    const total = visibleDocuments.length;

    return reply.send({
      success: true,
      data: { items: paginatedDocuments, total, page, limit, totalPages: Math.ceil(total / limit) },
    });
  });

  // Get document metadata
  app.get('/:projectId/documents/:documentId', async (request, reply) => {
    const userId = request.userId!;
    const userRole = request.user!.role;
    const { projectId, documentId } = request.params as { projectId: string; documentId: string };

    const hasAccess = await checkDocumentAccess(app, userId, userRole, documentId);
    if (!hasAccess) {
      return reply.code(403).send({ success: false, error: { code: 'FORBIDDEN', message: 'Access denied' } });
    }

    const document = await app.prisma.projectDocument.findFirst({
      where: { id: documentId, projectId },
      select: {
        id: true,
        name: true,
        originalName: true,
        mimeType: true,
        size: true,
        category: true,
        version: true,
        ownerId: true,
        coAuthorIds: true,
        tags: true,
        status: true,
        reviewStatus: true,
        reviewerId: true,
        reviewedAt: true,
        reviewComments: true,
        // Visibility fields
        visibility: true,
        visibleToTeamIds: true,
        visibleToDeptIds: true,
        visibleToUserIds: true,
        watermarkConfig: true,
        metadata: true,
        storageKey: true,
        createdAt: true,
        updatedAt: true,
        uploader: { select: { id: true, fullName: true, email: true } },
        owner: { select: { id: true, fullName: true, email: true } },
        reviewer: { select: { id: true, fullName: true, email: true } },
        ktReport: { select: { id: true, reportDate: true } },
        versions: { select: { id: true, version: true, size: true, createdAt: true, uploader: { select: { fullName: true } } } },
      },
    });

    if (!document) {
      return reply.code(404).send({ success: false, error: { code: 'NOT_FOUND', message: 'Document not found' } });
    }

    return reply.send({ success: true, data: document });
  });

  // Get upload URL (signed URL for direct upload to S3)
  app.post('/:projectId/documents/upload-url', {
    schema: { body: UploadDocumentSchema },
  }, async (request, reply) => {
    const userId = request.userId!;
    const userRole = request.user!.role;
    const { projectId } = request.params as { projectId: string };
    const { name, category, ktReportId } = request.body as z.infer<typeof UploadDocumentSchema>;

    const hasAccess = await checkProjectAccess(app, userId, userRole, projectId);
    if (!hasAccess) {
      return reply.code(403).send({ success: false, error: { code: 'FORBIDDEN', message: 'Access denied' } });
    }

    // Verify ktReportId belongs to this project if provided
    if (ktReportId) {
      const report = await app.prisma.dailyKTReport.findFirst({
        where: { id: ktReportId, projectId },
      });
      if (!report) {
        return reply.code(400).send({ success: false, error: { code: 'INVALID_KT_REPORT', message: 'KT report not found in this project' } });
      }
    }

    const storageKey = storage.generateKey(name, projectId);
    const uploadUrl = await storage.getUploadUrl(storageKey, 3600); // 1 hour

    return reply.send({
      success: true,
      data: { uploadUrl, storageKey, expiresIn: 3600 },
    });
  });

  // Confirm upload and create document record
  app.post('/:projectId/documents', {
    schema: { body: z.object({ ...UploadDocumentSchema.shape, storageKey: z.string(), size: z.number().int().positive(), mimeType: z.string() }) },
  }, async (request, reply) => {
    const userId = request.userId!;
    const userRole = request.user!.role;
    const { projectId } = request.params as { projectId: string };
    const { name, category, ktReportId, storageKey, size, mimeType, ownerId, coAuthorIds, tags, watermarkConfig, metadata,
      visibility, visibleToTeamIds, visibleToDeptIds, visibleToUserIds } = request.body as any;

    const hasAccess = await checkProjectAccess(app, userId, userRole, projectId);
    if (!hasAccess) {
      return reply.code(403).send({ success: false, error: { code: 'FORBIDDEN', message: 'Access denied' } });
    }

    // Verify file exists in storage
    const exists = await storage.exists(storageKey);
    if (!exists) {
      return reply.code(400).send({ success: false, error: { code: 'FILE_NOT_FOUND', message: 'File not found in storage' } });
    }

    // Default owner to uploader if not specified
    const finalOwnerId = ownerId || userId;

    // Verify owner is a project member
    const ownerMembership = await app.prisma.projectMember.findUnique({
      where: { projectId_userId: { projectId, userId: finalOwnerId } },
    });
    if (!ownerMembership) {
      return reply.code(400).send({ success: false, error: { code: 'INVALID_OWNER', message: 'Owner must be a project member' } });
    }

    // Verify co-authors are project members
    if (coAuthorIds && coAuthorIds.length > 0) {
      for (const coAuthorId of coAuthorIds) {
        const membership = await app.prisma.projectMember.findUnique({
          where: { projectId_userId: { projectId, userId: coAuthorId } },
        });
        if (!membership) {
          return reply.code(400).send({ success: false, error: { code: 'INVALID_COAUTHOR', message: `Co-author ${coAuthorId} must be a project member` } });
        }
      }
    }

    // Verify visibility teams exist and user has access
    if (visibleToTeamIds && visibleToTeamIds.length > 0) {
      const teams = await app.prisma.team.findMany({
        where: { id: { in: visibleToTeamIds } },
        select: { id: true },
      });
      if (teams.length !== visibleToTeamIds.length) {
        return reply.code(400).send({ success: false, error: { code: 'INVALID_TEAMS', message: 'One or more teams not found' } });
      }
    }

    // Verify visibility departments exist
    if (visibleToDeptIds && visibleToDeptIds.length > 0) {
      const departments = await app.prisma.department.findMany({
        where: { id: { in: visibleToDeptIds } },
        select: { id: true },
      });
      if (departments.length !== visibleToDeptIds.length) {
        return reply.code(400).send({ success: false, error: { code: 'INVALID_DEPARTMENTS', message: 'One or more departments not found' } });
      }
    }

    // Verify visibility users exist and are project members
    if (visibleToUserIds && visibleToUserIds.length > 0) {
      for (const visibleUserId of visibleToUserIds) {
        const membership = await app.prisma.projectMember.findUnique({
          where: { projectId_userId: { projectId, userId: visibleUserId } },
        });
        if (!membership) {
          return reply.code(400).send({ success: false, error: { code: 'INVALID_VISIBLE_USER', message: `User ${visibleUserId} must be a project member` } });
        }
      }
    }

    const document = await app.prisma.projectDocument.create({
      data: {
        projectId,
        name,
        originalName: name,
        mimeType,
        size,
        category,
        uploadedById: userId,
        ownerId: finalOwnerId,
        coAuthorIds: coAuthorIds || [],
        tags: tags || [],
        watermarkConfig,
        metadata,
        ktReportId,
        storageKey,
        visibility: visibility || 'PROJECT_MEMBERS',
        visibleToTeamIds: visibleToTeamIds || [],
        visibleToDeptIds: visibleToDeptIds || [],
        visibleToUserIds: visibleToUserIds || [],
      },
    });

    // The uploaded file is version 1
    await app.prisma.documentVersion.create({
      data: {
        documentId: document.id,
        version: 1,
        storageKey,
        size,
        mimeType,
        originalName: name,
        uploadedById: userId,
        changelog: 'Initial upload',
        isCurrent: true,
      },
    });

    // Log access event
    await app.prisma.documentAccessEvent.create({
      data: { documentId: document.id, userId, action: 'UPLOAD', ipAddress: request.ip, userAgent: request.headers['user-agent'] },
    });

    await auditLogger.logResource('UPLOAD', userId, 'document', document.id, { name, size, category, ownerId: finalOwnerId, coAuthorIds, tags }, request.ip, request.headers['user-agent']);

    await tellSuperAdmins(app, { actorId: userId, kind: 'CREATED', docId: document.id, docName: name, projectId });

    // Notify project members
    const notificationService = createNotificationService(app);
    const members = await app.prisma.projectMember.findMany({
      where: { projectId, userId: { not: userId } },
      select: { userId: true },
    });
    for (const member of members) {
      await notificationService.notifyNewDocument(member.userId, document.id, name, (await app.prisma.project.findUnique({ where: { id: projectId } }))?.name || '');
    }

    // Notify co-authors
    if (coAuthorIds && coAuthorIds.length > 0) {
      for (const coAuthorId of coAuthorIds) {
        await notificationService.create({
          userId: coAuthorId,
          type: 'NEW_DOCUMENT',
          title: 'Added as Co-Author',
          message: `You have been added as a co-author to document "${name}"`,
          resourceType: 'document',
          resourceId: document.id,
        });
      }
    }

    return reply.code(201).send({ success: true, data: document });
  });

  // Browser-friendly download: same checks and audit as /download, then redirect to the signed link
  app.get('/:projectId/documents/:documentId/file', async (request, reply) => {
    const userId = request.userId!;
    const userRole = request.user!.role;
    const { projectId, documentId } = request.params as { projectId: string; documentId: string };

    if (!(await checkDocumentAccess(app, userId, userRole, documentId))) {
      return reply.code(403).send({ success: false, error: { code: 'FORBIDDEN', message: 'Access denied' } });
    }
    const document = await app.prisma.projectDocument.findFirst({ where: { id: documentId, projectId } });
    if (!document) {
      return reply.code(404).send({ success: false, error: { code: 'NOT_FOUND', message: 'Document not found' } });
    }

    await app.prisma.documentAccessEvent.create({
      data: { documentId, userId, action: 'DOWNLOAD', ipAddress: request.ip, userAgent: request.headers['user-agent'] },
    });
    await auditLogger.logResource('DOWNLOAD', userId, 'document', documentId, { name: document.name }, request.ip, request.headers['user-agent']);

    return reply.redirect(await storage.getDownloadUrl(document.storageKey, document.originalName, 60, await stampFor(app, userId, document.name)));
  });

  // Get download URL
  app.get('/:projectId/documents/:documentId/download', async (request, reply) => {
    const userId = request.userId!;
    const userRole = request.user!.role;
    const { projectId, documentId } = request.params as { projectId: string; documentId: string };

    const hasAccess = await checkDocumentAccess(app, userId, userRole, documentId);
    if (!hasAccess) {
      return reply.code(403).send({ success: false, error: { code: 'FORBIDDEN', message: 'Access denied' } });
    }

    const document = await app.prisma.projectDocument.findFirst({ where: { id: documentId, projectId } });
    if (!document) {
      return reply.code(404).send({ success: false, error: { code: 'NOT_FOUND', message: 'Document not found' } });
    }

    const downloadUrl = await storage.getDownloadUrl(document.storageKey, document.originalName, 300, await stampFor(app, userId, document.name)); // 5 minutes

    // Log access event
    await app.prisma.documentAccessEvent.create({
      data: { documentId, userId, action: 'DOWNLOAD', ipAddress: request.ip, userAgent: request.headers['user-agent'] },
    });

    await auditLogger.logResource('DOWNLOAD', userId, 'document', documentId, { name: document.name }, request.ip, request.headers['user-agent']);

    return reply.send({ success: true, data: { downloadUrl, expiresIn: 300 } });
  });

  // Get preview URL
  app.get('/:projectId/documents/:documentId/preview', async (request, reply) => {
    const userId = request.userId!;
    const userRole = request.user!.role;
    const { projectId, documentId } = request.params as { projectId: string; documentId: string };

    const hasAccess = await checkDocumentAccess(app, userId, userRole, documentId);
    if (!hasAccess) {
      return reply.code(403).send({ success: false, error: { code: 'FORBIDDEN', message: 'Access denied' } });
    }

    const document = await app.prisma.projectDocument.findFirst({ where: { id: documentId, projectId } });
    if (!document) {
      return reply.code(404).send({ success: false, error: { code: 'NOT_FOUND', message: 'Document not found' } });
    }

    const previewUrl = await storage.getPreviewUrl(document.storageKey, 300, await stampFor(app, userId, document.name)); // 5 minutes

    // Log access event
    await app.prisma.documentAccessEvent.create({
      data: { documentId, userId, action: 'PREVIEW', ipAddress: request.ip, userAgent: request.headers['user-agent'] },
    });

    return reply.send({ success: true, data: { previewUrl, expiresIn: 300 } });
  });

  // Delete document
  app.delete('/:projectId/documents/:documentId', async (request, reply) => {
    const userId = request.userId!;
    const userRole = request.user!.role;
    const { projectId, documentId } = request.params as { projectId: string; documentId: string };

    if (userRole !== 'SUPER_ADMIN') {
      return reply.code(403).send({
        success: false,
        error: { code: 'APPROVAL_REQUIRED', message: 'Documents are deleted through a delete request that a manager approves' },
      });
    }

    const hasAccess = await checkDocumentAccess(app, userId, userRole, documentId);
    if (!hasAccess) {
      return reply.code(403).send({ success: false, error: { code: 'FORBIDDEN', message: 'Access denied' } });
    }

    const document = await app.prisma.projectDocument.findFirst({ where: { id: documentId, projectId } });
    if (!document) {
      return reply.code(404).send({ success: false, error: { code: 'NOT_FOUND', message: 'Document not found' } });
    }

    // Move to the recycle bin (kept for 30 days) instead of destroying it
    await recycleDocument(app, documentId, userId);

    await auditLogger.logResource('DELETE', userId, 'document', documentId, { name: document.name }, request.ip, request.headers['user-agent']);
    await tellSuperAdmins(app, { actorId: userId, kind: 'DELETED', docId: documentId, docName: document.name, projectId });

    return reply.send({ success: true, data: null });
  });

  // Upload new version
  app.post('/:projectId/documents/:documentId/versions', async (request, reply) => {
    const userId = request.userId!;
    const userRole = request.user!.role;
    const { projectId, documentId } = request.params as { projectId: string; documentId: string };

    const hasAccess = await checkDocumentAccess(app, userId, userRole, documentId);
    if (!hasAccess) {
      return reply.code(403).send({ success: false, error: { code: 'FORBIDDEN', message: 'Access denied' } });
    }

    const document = await app.prisma.projectDocument.findFirst({ where: { id: documentId, projectId } });
    if (!document) {
      return reply.code(404).send({ success: false, error: { code: 'NOT_FOUND', message: 'Document not found' } });
    }

    const reasonError = adminReasonError(userRole, (request.body as any)?.reason);
    if (reasonError) {
      return reply.code(400).send({ success: false, error: { code: 'REASON_REQUIRED', message: reasonError } });
    }

    // Get next version number
    const latestVersion = await app.prisma.documentVersion.findFirst({
      where: { documentId },
      orderBy: { version: 'desc' },
      select: { version: true },
    });
    const nextVersion = (latestVersion?.version || 0) + 1;

    // Move current file to versions
    const versionStorageKey = storage.generateVersionKey(document.originalName, projectId, nextVersion);
    // In a real implementation, you'd copy the file in S3
    // For now, we'll just create the version record

    const version = await app.prisma.documentVersion.create({
      data: {
        documentId,
        version: nextVersion,
        storageKey: versionStorageKey,
        size: document.size,
        mimeType: document.mimeType,
        originalName: document.originalName,
        uploadedById: userId,
      },
    });

    // Update document version
    await app.prisma.projectDocument.update({
      where: { id: documentId },
      data: { version: nextVersion },
    });

    const versionReason = ((request.body as any)?.reason as string | undefined)?.trim() || null;
    await auditLogger.logResource('UPLOAD', userId, 'document_version', version.id, { version: nextVersion, reason: versionReason }, request.ip, request.headers['user-agent']);
    await tellSuperAdmins(app, { actorId: userId, kind: 'EDITED', docId: documentId, docName: document.name, projectId, detail: `new version v${nextVersion}`, reason: versionReason });

    return reply.code(201).send({ success: true, data: version });
  });

  // Get document versions
  app.get('/:projectId/documents/:documentId/versions', async (request, reply) => {
    const userId = request.userId!;
    const userRole = request.user!.role;
    const { projectId, documentId } = request.params as { projectId: string; documentId: string };

    const hasAccess = await checkDocumentAccess(app, userId, userRole, documentId);
    if (!hasAccess) {
      return reply.code(403).send({ success: false, error: { code: 'FORBIDDEN', message: 'Access denied' } });
    }

    const versions = await app.prisma.documentVersion.findMany({
      where: { documentId },
      orderBy: { version: 'desc' },
      select: {
        id: true,
        version: true,
        size: true,
        storageKey: true,
        uploadedById: true,
        createdAt: true,
        changelog: true,
        uploader: { select: { id: true, fullName: true, email: true } },
      },
    });

    return reply.send({ success: true, data: { items: versions } });
  });

  // Rollback to a specific version
  app.post('/:projectId/documents/:documentId/versions/:versionId/rollback', async (request, reply) => {
    const userId = request.userId!;
    const userRole = request.user!.role;
    const { projectId, documentId, versionId } = request.params as { projectId: string; documentId: string; versionId: string };

    const hasAccess = await checkDocumentAccess(app, userId, userRole, documentId);
    if (!hasAccess) {
      return reply.code(403).send({ success: false, error: { code: 'FORBIDDEN', message: 'Access denied' } });
    }

    const document = await app.prisma.projectDocument.findFirst({ where: { id: documentId, projectId } });
    if (!document) {
      return reply.code(404).send({ success: false, error: { code: 'NOT_FOUND', message: 'Document not found' } });
    }

    // Check if user can manage document
    const canManage = await checkDocumentOwnerOrLead(app, userId, userRole, documentId);
    if (!canManage) {
      return reply.code(403).send({ success: false, error: { code: 'FORBIDDEN', message: 'Only document owner or project lead can rollback versions' } });
    }
    const reasonError = adminReasonError(userRole, (request.body as any)?.reason);
    if (reasonError) {
      return reply.code(400).send({ success: false, error: { code: 'REASON_REQUIRED', message: reasonError } });
    }
    const rollbackReason = ((request.body as any)?.reason as string | undefined)?.trim() || null;

    const version = await app.prisma.documentVersion.findUnique({ where: { id: versionId } });
    if (!version || version.documentId !== documentId) {
      return reply.code(404).send({ success: false, error: { code: 'NOT_FOUND', message: 'Version not found' } });
    }

    // Get the next version number
    const latestVersion = await app.prisma.documentVersion.findFirst({
      where: { documentId },
      orderBy: { version: 'desc' },
      select: { version: true },
    });
    const nextVersion = (latestVersion?.version || 0) + 1;

    // Create a new version as a copy of the rolled-back version (preserving history)
    const newVersion = await app.prisma.documentVersion.create({
      data: {
        documentId,
        version: nextVersion,
        storageKey: version.storageKey,
        size: version.size,
        mimeType: version.mimeType,
        originalName: version.originalName,
        uploadedById: userId,
        changelog: `Rolled back from version ${version.version} (from version ID: ${versionId}) at ${new Date().toISOString()} by ${userId}`,
      },
    });

    // Update document to point to the rolled-back version
    await app.prisma.projectDocument.update({
      where: { id: documentId },
      data: {
        version: nextVersion,
        storageKey: version.storageKey,
        size: version.size,
      },
    });

    await auditLogger.logResource('UPDATE', userId, 'document', documentId, {
      action: 'rollback',
      fromVersion: document.version,
      toVersion: nextVersion,
      rolledBackFromVersion: version.version,
      rolledBackFromId: versionId,
      reason: rollbackReason,
    }, request.ip, request.headers['user-agent']);
    await tellSuperAdmins(app, { actorId: userId, kind: 'EDITED', docId: documentId, docName: document.name, projectId, detail: `rolled back from v${document.version} to the content of v${version.version}`, reason: rollbackReason });

    // Log activity
    await app.prisma.activityFeed.create({
      data: {
        actorId: userId,
        action: 'ROLLBACK',
        resourceType: 'document',
        resourceId: documentId,
        projectId,
        details: {
          documentName: document.name,
          fromVersion: document.version,
          toVersion: nextVersion,
          rolledBackFromVersion: version.version,
        },
        ipAddress: request.ip,
        userAgent: request.headers['user-agent'],
      },
    });

    // Notify co-authors and owner
    const notificationService = createNotificationService(app);
    const notifyUsers = [...new Set([document.ownerId, ...document.coAuthorIds].filter(Boolean))].filter(id => id !== userId);
    for (const notifyUserId of notifyUsers) {
      await notificationService.create({
        userId: notifyUserId,
        type: 'NEW_DOCUMENT',
        title: 'Document Rolled Back',
        message: `Document "${document.name}" has been rolled back to version ${version.version} (now version ${nextVersion})`,
        resourceType: 'document',
        resourceId: documentId,
      });
    }

    return reply.send({ success: true, data: newVersion });
  });

  // Get download URL for a specific version
  app.get('/:projectId/documents/:documentId/versions/:versionId/download', async (request, reply) => {
    const userId = request.userId!;
    const userRole = request.user!.role;
    const { projectId, documentId, versionId } = request.params as { projectId: string; documentId: string; versionId: string };

    const hasAccess = await checkDocumentAccess(app, userId, userRole, documentId);
    if (!hasAccess) {
      return reply.code(403).send({ success: false, error: { code: 'FORBIDDEN', message: 'Access denied' } });
    }

    const version = await app.prisma.documentVersion.findUnique({ where: { id: versionId } });
    if (!version || version.documentId !== documentId) {
      return reply.code(404).send({ success: false, error: { code: 'NOT_FOUND', message: 'Version not found' } });
    }

    const downloadUrl = await storage.getDownloadUrl(version.storageKey, `v${version.version}-${documentId}`, 300, await stampFor(app, userId, `${documentId} v${version.version}`));

    // Log access event
    await app.prisma.documentAccessEvent.create({
      data: { documentId, userId, action: 'DOWNLOAD_VERSION', ipAddress: request.ip, userAgent: request.headers['user-agent'] },
    });

    return reply.send({ success: true, data: { downloadUrl, expiresIn: 300 } });
  });

  // Update document metadata (owner, co-authors, tags, status, review, watermark, metadata, visibility)
  app.patch('/:projectId/documents/:documentId', {
    schema: { body: UpdateDocumentSchema },
  }, async (request, reply) => {
    const userId = request.userId!;
    const userRole = request.user!.role;
    const { projectId, documentId } = request.params as { projectId: string; documentId: string };
    const updates = request.body as z.infer<typeof UpdateDocumentSchema>;

    const hasAccess = await checkDocumentAccess(app, userId, userRole, documentId);
    if (!hasAccess) {
      return reply.code(403).send({ success: false, error: { code: 'FORBIDDEN', message: 'Access denied' } });
    }

    const document = await app.prisma.projectDocument.findFirst({ where: { id: documentId, projectId } });
    if (!document) {
      return reply.code(404).send({ success: false, error: { code: 'NOT_FOUND', message: 'Document not found' } });
    }

    // Check if user can manage document (owner or project lead/owner)
    const canManage = await checkDocumentOwnerOrLead(app, userId, userRole, documentId);
    if (!canManage && (updates.ownerId || updates.coAuthorIds || updates.tags || updates.status || updates.reviewStatus || updates.reviewerId || updates.reviewComments || updates.watermarkConfig || updates.metadata)) {
      return reply.code(403).send({ success: false, error: { code: 'FORBIDDEN', message: 'Only document owner or project lead can update these fields' } });
    }

    const reasonError = adminReasonError(userRole, updates.reason);
    if (reasonError) {
      return reply.code(400).send({ success: false, error: { code: 'REASON_REQUIRED', message: reasonError } });
    }

    // Build update data explicitly to match Prisma types
    const updateData: any = {};
    if (updates.name !== undefined) updateData.name = updates.name;
    if (updates.category !== undefined) updateData.category = updates.category;
    if (updates.ownerId !== undefined) updateData.ownerId = updates.ownerId;
    if (updates.coAuthorIds !== undefined) updateData.coAuthorIds = updates.coAuthorIds;
    if (updates.tags !== undefined) updateData.tags = updates.tags;
    if (updates.status !== undefined) updateData.status = updates.status;
    if (updates.reviewStatus !== undefined) {
      updateData.reviewStatus = updates.reviewStatus;
      updateData.reviewedAt = new Date(); // Set reviewedAt when reviewStatus changes
    }
    if (updates.reviewerId !== undefined) updateData.reviewerId = updates.reviewerId;
    if (updates.reviewComments !== undefined) updateData.reviewComments = updates.reviewComments;
    if (updates.visibility !== undefined) updateData.visibility = updates.visibility;
    if (updates.visibleToTeamIds !== undefined) updateData.visibleToTeamIds = updates.visibleToTeamIds;
    if (updates.visibleToDeptIds !== undefined) updateData.visibleToDeptIds = updates.visibleToDeptIds;
    if (updates.visibleToUserIds !== undefined) updateData.visibleToUserIds = updates.visibleToUserIds;
    if (updates.watermarkConfig !== undefined) updateData.watermarkConfig = updates.watermarkConfig;
    if (updates.metadata !== undefined) updateData.metadata = updates.metadata;

    const updatedDocument = await app.prisma.projectDocument.update({
      where: { id: documentId },
      data: updateData,
      select: {
        id: true,
        name: true,
        originalName: true,
        mimeType: true,
        size: true,
        category: true,
        version: true,
        ownerId: true,
        coAuthorIds: true,
        tags: true,
        status: true,
        reviewStatus: true,
        reviewerId: true,
        reviewedAt: true,
        reviewComments: true,
        // Visibility fields
        visibility: true,
        visibleToTeamIds: true,
        visibleToDeptIds: true,
        visibleToUserIds: true,
        watermarkConfig: true,
        metadata: true,
        createdAt: true,
        updatedAt: true,
        uploader: { select: { id: true, fullName: true } },
        owner: { select: { id: true, fullName: true, email: true } },
        reviewer: { select: { id: true, fullName: true, email: true } },
        ktReport: { select: { id: true, reportDate: true } },
        versions: { select: { id: true, version: true, size: true, createdAt: true, uploader: { select: { fullName: true } } } },
      },
    });

    // Before/after of every field that really changed, plus the reason, for the audit log and the super admins
    const changes = diffFields(document as Record<string, any>, updateData);
    const editReason = updates.reason?.trim() || null;
    await auditLogger.logResource('UPDATE', userId, 'document', documentId, { changes, reason: editReason }, request.ip, request.headers['user-agent']);
    if (Object.keys(changes).length > 0) {
      await tellSuperAdmins(app, { actorId: userId, kind: 'EDITED', docId: documentId, docName: document.name, projectId, detail: describeChanges(changes), reason: editReason });
    }

    return reply.send({ success: true, data: updatedDocument });
  });

  // Transfer document ownership
  app.post('/:projectId/documents/:documentId/transfer-ownership', {
    schema: { body: z.object({ newOwnerId: z.string().uuid(), reason: z.string().trim().max(500).optional() }) },
  }, async (request, reply) => {
    const userId = request.userId!;
    const userRole = request.user!.role;
    const { projectId, documentId } = request.params as { projectId: string; documentId: string };
    const { newOwnerId, reason: transferReason } = request.body as { newOwnerId: string; reason?: string };

    const hasAccess = await checkDocumentAccess(app, userId, userRole, documentId);
    if (!hasAccess) {
      return reply.code(403).send({ success: false, error: { code: 'FORBIDDEN', message: 'Access denied' } });
    }

    const document = await app.prisma.projectDocument.findFirst({ where: { id: documentId, projectId } });
    if (!document) {
      return reply.code(404).send({ success: false, error: { code: 'NOT_FOUND', message: 'Document not found' } });
    }

    // Check if user can transfer ownership (current owner or project lead/owner)
    const canManage = await checkDocumentOwnerOrLead(app, userId, userRole, documentId);
    if (!canManage) {
      return reply.code(403).send({ success: false, error: { code: 'FORBIDDEN', message: 'Only document owner or project lead can transfer ownership' } });
    }
    const reasonError = adminReasonError(userRole, transferReason);
    if (reasonError) {
      return reply.code(400).send({ success: false, error: { code: 'REASON_REQUIRED', message: reasonError } });
    }

    // Verify new owner is a project member
    const membership = await app.prisma.projectMember.findUnique({
      where: { projectId_userId: { projectId, userId: newOwnerId } },
    });
    if (!membership) {
      return reply.code(400).send({ success: false, error: { code: 'INVALID_OWNER', message: 'New owner must be a project member' } });
    }

    const updatedDocument = await app.prisma.projectDocument.update({
      where: { id: documentId },
      data: { ownerId: newOwnerId },
      select: {
        id: true,
        name: true,
        ownerId: true,
        owner: { select: { id: true, fullName: true, email: true } },
      },
    });

    await auditLogger.logResource('UPDATE', userId, 'document', documentId, { ownerId: newOwnerId, previousOwnerId: document.ownerId, action: 'transfer_ownership', reason: transferReason ?? null }, request.ip, request.headers['user-agent']);
    await tellSuperAdmins(app, { actorId: userId, kind: 'EDITED', docId: documentId, docName: document.name, projectId, detail: 'ownership transferred', reason: transferReason ?? null });

    // Notify new owner
    const notificationService = createNotificationService(app);
    await notificationService.create({
      userId: newOwnerId,
      type: 'NEW_DOCUMENT',
      title: 'Document Ownership Transferred',
      message: `You are now the owner of document "${document.name}"`,
      resourceType: 'document',
      resourceId: documentId,
    });

    return reply.send({ success: true, data: updatedDocument });
  });

  // Submit document for review
  app.post('/:projectId/documents/:documentId/submit-review', {
    schema: { body: z.object({ reviewerId: z.string().uuid() }) },
  }, async (request, reply) => {
    const userId = request.userId!;
    const userRole = request.user!.role;
    const { projectId, documentId } = request.params as { projectId: string; documentId: string };
    const { reviewerId } = request.body as { reviewerId: string };

    const hasAccess = await checkDocumentAccess(app, userId, userRole, documentId);
    if (!hasAccess) {
      return reply.code(403).send({ success: false, error: { code: 'FORBIDDEN', message: 'Access denied' } });
    }

    const document = await app.prisma.projectDocument.findFirst({ where: { id: documentId, projectId } });
    if (!document) {
      return reply.code(404).send({ success: false, error: { code: 'NOT_FOUND', message: 'Document not found' } });
    }

    // Check if user can submit for review (owner, co-author, or project lead)
    const canManage = await checkDocumentOwnerOrLead(app, userId, userRole, documentId);
    const isCoAuthor = document.coAuthorIds.includes(userId);
    if (!canManage && !isCoAuthor) {
      return reply.code(403).send({ success: false, error: { code: 'FORBIDDEN', message: 'Only document owner, co-authors, or project lead can submit for review' } });
    }

    // Verify reviewer is a project member
    const membership = await app.prisma.projectMember.findUnique({
      where: { projectId_userId: { projectId, userId: reviewerId } },
    });
    if (!membership) {
      return reply.code(400).send({ success: false, error: { code: 'INVALID_REVIEWER', message: 'Reviewer must be a project member' } });
    }

    const updatedDocument = await app.prisma.projectDocument.update({
      where: { id: documentId },
      data: {
        status: 'PENDING_REVIEW',
        reviewStatus: 'PENDING',
        reviewerId,
      },
      select: {
        id: true,
        name: true,
        status: true,
        reviewStatus: true,
        reviewerId: true,
        reviewer: { select: { id: true, fullName: true, email: true } },
      },
    });

    // Create review record
    await app.prisma.documentReview.create({
      data: {
        documentId,
        reviewerId,
        status: 'PENDING',
      },
    });

    await auditLogger.logResource('UPDATE', userId, 'document', documentId, { action: 'submit_review', reviewerId }, request.ip, request.headers['user-agent']);

    // Notify reviewer
    const notificationService = createNotificationService(app);
    await notificationService.create({
      userId: reviewerId,
      type: 'NEW_DOCUMENT',
      title: 'Document Review Requested',
      message: `You have been requested to review document "${document.name}"`,
      resourceType: 'document',
      resourceId: documentId,
    });

    return reply.send({ success: true, data: updatedDocument });
  });

  // Review document (approve, reject, request changes)
  app.post('/:projectId/documents/:documentId/review', {
    schema: { body: z.object({ status: z.enum(['APPROVED', 'REJECTED', 'CHANGES_REQUESTED']), comments: z.string().optional().nullable() }) },
  }, async (request, reply) => {
    const userId = request.userId!;
    const userRole = request.user!.role;
    const { projectId, documentId } = request.params as { projectId: string; documentId: string };
    const { status, comments } = request.body as { status: 'APPROVED' | 'REJECTED' | 'CHANGES_REQUESTED'; comments?: string | null };

    const hasAccess = await checkDocumentAccess(app, userId, userRole, documentId);
    if (!hasAccess) {
      return reply.code(403).send({ success: false, error: { code: 'FORBIDDEN', message: 'Access denied' } });
    }

    const document = await app.prisma.projectDocument.findFirst({ where: { id: documentId, projectId } });
    if (!document) {
      return reply.code(404).send({ success: false, error: { code: 'NOT_FOUND', message: 'Document not found' } });
    }

    // Check if user is the assigned reviewer
    if (document.reviewerId !== userId && userRole !== 'SUPER_ADMIN') {
      return reply.code(403).send({ success: false, error: { code: 'FORBIDDEN', message: 'Only assigned reviewer can review this document' } });
    }

    const updatedDocument = await app.prisma.projectDocument.update({
      where: { id: documentId },
      data: {
        reviewStatus: status,
        reviewedAt: new Date(),
        reviewComments: comments,
        status: status === 'APPROVED' ? 'APPROVED' : status === 'REJECTED' ? 'REJECTED' : 'DRAFT',
      },
      select: {
        id: true,
        name: true,
        status: true,
        reviewStatus: true,
        reviewedAt: true,
        reviewComments: true,
      },
    });

    // Update or create review record
    const existingReview = await app.prisma.documentReview.findFirst({
      where: { documentId, reviewerId: userId },
    });

    if (existingReview) {
      await app.prisma.documentReview.update({
        where: { id: existingReview.id },
        data: { status, comments },
      });
    } else {
      await app.prisma.documentReview.create({
        data: { documentId, reviewerId: userId, status, comments },
      });
    }

    await auditLogger.logResource('APPROVE', userId, 'document', documentId, { action: 'review', status, comments }, request.ip, request.headers['user-agent']);

    // Notify document owner
    if (document.ownerId !== userId) {
      const notificationService = createNotificationService(app);
      await notificationService.create({
        userId: document.ownerId,
        type: 'NEW_DOCUMENT',
        title: `Document Review ${status === 'APPROVED' ? 'Approved' : status === 'REJECTED' ? 'Rejected' : 'Changes Requested'}`,
        message: `Your document "${document.name}" has been ${status.toLowerCase()}`,
        resourceType: 'document',
        resourceId: documentId,
      });
    }

    return reply.send({ success: true, data: updatedDocument });
  });

  // Get document reviews
  app.get('/:projectId/documents/:documentId/reviews', async (request, reply) => {
    const userId = request.userId!;
    const userRole = request.user!.role;
    const { projectId, documentId } = request.params as { projectId: string; documentId: string };

    const hasAccess = await checkDocumentAccess(app, userId, userRole, documentId);
    if (!hasAccess) {
      return reply.code(403).send({ success: false, error: { code: 'FORBIDDEN', message: 'Access denied' } });
    }

    const reviews = await app.prisma.documentReview.findMany({
      where: { documentId },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        documentId: true,
        reviewerId: true,
        status: true,
        comments: true,
        createdAt: true,
        updatedAt: true,
        reviewer: { select: { id: true, fullName: true, email: true } },
      },
    });

    return reply.send({ success: true, data: { items: reviews } });
  });

  // Get document access analytics
  app.get('/:projectId/documents/:documentId/access-analytics', async (request, reply) => {
    const userId = request.userId!;
    const userRole = request.user!.role;
    const { projectId, documentId } = request.params as { projectId: string; documentId: string };

    const hasAccess = await checkDocumentAccess(app, userId, userRole, documentId);
    if (!hasAccess) {
      return reply.code(403).send({ success: false, error: { code: 'FORBIDDEN', message: 'Access denied' } });
    }

    const document = await app.prisma.projectDocument.findFirst({ where: { id: documentId, projectId } });
    if (!document) {
      return reply.code(404).send({ success: false, error: { code: 'NOT_FOUND', message: 'Document not found' } });
    }

    // Check if user can view analytics (owner, project lead/owner, or reviewer)
    const canManage = await checkDocumentOwnerOrLead(app, userId, userRole, documentId);
    const isReviewer = document.reviewerId === userId;
    if (!canManage && !isReviewer && userRole !== 'SUPER_ADMIN') {
      return reply.code(403).send({ success: false, error: { code: 'FORBIDDEN', message: 'Only document owner, project lead, or reviewer can view analytics' } });
    }

    const accessEvents = await app.prisma.documentAccessEvent.findMany({
      where: { documentId },
      orderBy: { createdAt: 'desc' },
      take: 100,
      select: {
        id: true,
        userId: true,
        action: true,
        ipAddress: true,
        userAgent: true,
        createdAt: true,
        user: { select: { id: true, fullName: true, email: true } },
      },
    });

    // Aggregate analytics
    const actionCounts = accessEvents.reduce((acc: Record<string, number>, event) => {
      acc[event.action] = (acc[event.action] || 0) + 1;
      return acc;
    }, {});

    const uniqueUsers = new Set(accessEvents.map(e => e.userId)).size;
    const viewsByDay = accessEvents.reduce((acc: Record<string, number>, event) => {
      const day = event.createdAt.toISOString().split('T')[0];
      acc[day] = (acc[day] || 0) + 1;
      return acc;
    }, {});

    return reply.send({
      success: true,
      data: {
        totalAccesses: accessEvents.length,
        uniqueUsers,
        actionCounts,
        viewsByDay,
        recentEvents: accessEvents.slice(0, 20),
      },
    });
  });

  // Get document with watermark preview
  app.get('/:projectId/documents/:documentId/watermark-preview', async (request, reply) => {
    const userId = request.userId!;
    const userRole = request.user!.role;
    const { projectId, documentId } = request.params as { projectId: string; documentId: string };

    const hasAccess = await checkDocumentAccess(app, userId, userRole, documentId);
    if (!hasAccess) {
      return reply.code(403).send({ success: false, error: { code: 'FORBIDDEN', message: 'Access denied' } });
    }

    const document = await app.prisma.projectDocument.findFirst({ where: { id: documentId, projectId } });
    if (!document) {
      return reply.code(404).send({ success: false, error: { code: 'NOT_FOUND', message: 'Document not found' } });
    }

    // Generate preview URL with watermark
    const previewUrl = await storage.getPreviewUrl(document.storageKey, 300, await stampFor(app, userId, document.name));

    // Log access event
    await app.prisma.documentAccessEvent.create({
      data: { documentId, userId, action: 'PREVIEW_WATERMARK', ipAddress: request.ip, userAgent: request.headers['user-agent'] },
    });

    return reply.send({
      success: true,
      data: {
        previewUrl,
        expiresIn: 300,
        watermarkConfig: document.watermarkConfig,
      }
    });
  });

  // Bulk update visibility for multiple documents
  app.post('/:projectId/documents/bulk-visibility', {
    schema: {
      body: z.object({
        documentIds: z.array(z.string().uuid()).min(1),
        visibility: z.enum(['PRIVATE', 'PROJECT_MEMBERS', 'TEAM', 'DEPARTMENT', 'ORGANIZATION', 'CUSTOM_USERS']),
        visibleToTeamIds: z.array(z.string().uuid()).optional(),
        visibleToDeptIds: z.array(z.string().uuid()).optional(),
        visibleToUserIds: z.array(z.string().uuid()).optional(),
      }),
    },
  }, async (request, reply) => {
    const userId = request.userId!;
    const userRole = request.user!.role;
    const { projectId } = request.params as { projectId: string };
    const { documentIds, visibility, visibleToTeamIds, visibleToDeptIds, visibleToUserIds } = request.body as any;

    const hasAccess = await checkProjectAccess(app, userId, userRole, projectId);
    if (!hasAccess) {
      return reply.code(403).send({ success: false, error: { code: 'FORBIDDEN', message: 'Access denied' } });
    }

    // Check if user is project lead/owner
    const membership = await app.prisma.projectMember.findUnique({
      where: { projectId_userId: { projectId, userId } },
    });
    if (!membership || !['OWNER', 'LEAD'].includes(membership.role)) {
      return reply.code(403).send({ success: false, error: { code: 'FORBIDDEN', message: 'Only project lead/owner can bulk update visibility' } });
    }

    // Verify all documents exist and belong to this project
    const documents = await app.prisma.projectDocument.findMany({
      where: { id: { in: documentIds }, projectId },
      select: { id: true, name: true, ownerId: true },
    });

    if (documents.length !== documentIds.length) {
      return reply.code(404).send({ success: false, error: { code: 'NOT_FOUND', message: 'One or more documents not found' } });
    }

    // Verify visibility teams exist
    if (visibleToTeamIds && visibleToTeamIds.length > 0) {
      const teams = await app.prisma.team.findMany({
        where: { id: { in: visibleToTeamIds } },
        select: { id: true },
      });
      if (teams.length !== visibleToTeamIds.length) {
        return reply.code(400).send({ success: false, error: { code: 'INVALID_TEAMS', message: 'One or more teams not found' } });
      }
    }

    // Verify visibility departments exist
    if (visibleToDeptIds && visibleToDeptIds.length > 0) {
      const departments = await app.prisma.department.findMany({
        where: { id: { in: visibleToDeptIds } },
        select: { id: true },
      });
      if (departments.length !== visibleToDeptIds.length) {
        return reply.code(400).send({ success: false, error: { code: 'INVALID_DEPARTMENTS', message: 'One or more departments not found' } });
      }
    }

    // Verify visibility users are project members
    if (visibleToUserIds && visibleToUserIds.length > 0) {
      for (const visibleUserId of visibleToUserIds) {
        const userMembership = await app.prisma.projectMember.findUnique({
          where: { projectId_userId: { projectId, userId: visibleUserId } },
        });
        if (!userMembership) {
          return reply.code(400).send({ success: false, error: { code: 'INVALID_VISIBLE_USER', message: `User ${visibleUserId} must be a project member` } });
        }
      }
    }

    // Bulk update
    const updatedDocuments = await app.prisma.$transaction(
      documentIds.map((docId: string) =>
        app.prisma.projectDocument.update({
          where: { id: docId },
          data: {
            visibility,
            visibleToTeamIds: visibleToTeamIds || [],
            visibleToDeptIds: visibleToDeptIds || [],
            visibleToUserIds: visibleToUserIds || [],
          },
          select: { id: true, name: true, visibility: true },
        })
      )
    );

    await auditLogger.logResource('UPDATE', userId, 'document', 'bulk', {
      action: 'update_visibility',
      count: documentIds.length,
      visibility
    }, request.ip, request.headers['user-agent']);

    // Log activity for each document
    for (const doc of documents) {
      await app.prisma.activityFeed.create({
        data: {
          actorId: userId,
          action: 'UPDATE',
          resourceType: 'document',
          resourceId: doc.id,
          projectId,
          details: { documentName: doc.name, action: 'bulk_visibility_update', newVisibility: visibility },
          ipAddress: request.ip,
          userAgent: request.headers['user-agent'],
        },
      });
    }

    return reply.send({
      success: true,
      data: {
        updated: updatedDocuments.length,
        documents: updatedDocuments
      }
    });
  });
}