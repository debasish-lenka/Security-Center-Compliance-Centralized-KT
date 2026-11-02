import { z } from 'zod';

// ============================================
// Common Types
// ============================================

export const UUIDSchema = z.string().uuid();
export const EmailSchema = z.string().email().toLowerCase();
export const DateTimeSchema = z.string().datetime();
export const DateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

// ============================================
// Pagination
// ============================================

export const PaginationParamsSchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
  sortBy: z.string().optional(),
  sortOrder: z.enum(['asc', 'desc']).default('desc'),
});

export type PaginationParams = z.infer<typeof PaginationParamsSchema>;

export const PaginatedResponseSchema = <T extends z.ZodTypeAny>(itemSchema: T) =>
  z.object({
    items: z.array(itemSchema),
    total: z.number().int().nonnegative(),
    page: z.number().int().positive(),
    limit: z.number().int().positive(),
    totalPages: z.number().int().nonnegative(),
  });

export type PaginatedResponse<T> = {
  items: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
};

// ============================================
// User & Authentication
// ============================================

export const UserRoleSchema = z.enum(['super_admin', 'admin', 'compliance_officer', 'manager', 'user']);
export type UserRole = z.infer<typeof UserRoleSchema>;

export const UserStatusSchema = z.enum(['active', 'inactive', 'pending', 'suspended']);
export type UserStatus = z.infer<typeof UserStatusSchema>;

export const PermissionSchema = z.enum([
  'project.create',
  'project.edit',
  'project.delete',
  'project.assign',
  'project.view',
  'report.submit',
  'report.view',
  'report.approve',
  'document.upload',
  'document.view',
  'document.download',
  'document.delete',
  'user.manage',
  'role.manage',
  'compliance.manage',
  'audit.view',
  'settings.manage',
]);

export type Permission = z.infer<typeof PermissionSchema>;

export const ProfileSchema = z.object({
  id: UUIDSchema,
  email: EmailSchema,
  fullName: z.string().min(1).max(255),
  department: z.string().max(255).optional().nullable(),
  role: UserRoleSchema,
  status: UserStatusSchema,
  createdAt: DateTimeSchema,
  updatedAt: DateTimeSchema,
  lastActivityAt: DateTimeSchema.optional().nullable(),
});

export type Profile = z.infer<typeof ProfileSchema>;

export const CreateProfileSchema = z.object({
  email: EmailSchema,
  fullName: z.string().min(1).max(255),
  department: z.string().max(255).optional().nullable(),
  role: UserRoleSchema.default('user'),
});

export type CreateProfileInput = z.infer<typeof CreateProfileSchema>;

export const UpdateProfileSchema = z.object({
  fullName: z.string().min(1).max(255).optional(),
  department: z.string().max(255).optional().nullable(),
  status: UserStatusSchema.optional(),
  role: UserRoleSchema.optional(),
});

export type UpdateProfileInput = z.infer<typeof UpdateProfileSchema>;

// ============================================
// Projects
// ============================================

export const ProjectStatusSchema = z.enum([
  'not_started',
  'ongoing',
  'on_hold',
  'completed',
  'overdue',
  'at_risk',
]);

export type ProjectStatus = z.infer<typeof ProjectStatusSchema>;

export const ProjectPrioritySchema = z.enum(['low', 'medium', 'high', 'critical']);
export type ProjectPriority = z.infer<typeof ProjectPrioritySchema>;

export const ProjectSchema = z.object({
  id: UUIDSchema,
  name: z.string().min(1).max(255),
  description: z.string().optional().nullable(),
  category: z.string().max(100).optional().nullable(),
  createdBy: UUIDSchema,
  ownerId: UUIDSchema,
  startDate: DateSchema.optional().nullable(),
  expectedCompletionDate: DateSchema.optional().nullable(),
  actualCompletionDate: DateSchema.optional().nullable(),
  priority: ProjectPrioritySchema.default('medium'),
  status: ProjectStatusSchema.default('not_started'),
  progress: z.number().int().min(0).max(100).default(0),
  createdAt: DateTimeSchema,
  updatedAt: DateTimeSchema,
});

export type Project = z.infer<typeof ProjectSchema>;

export const CreateProjectSchema = z.object({
  name: z.string().min(1).max(255),
  description: z.string().optional().nullable(),
  category: z.string().max(100).optional().nullable(),
  ownerId: UUIDSchema,
  startDate: DateSchema.optional().nullable(),
  expectedCompletionDate: DateSchema.optional().nullable(),
  priority: ProjectPrioritySchema.default('medium'),
  memberIds: z.array(UUIDSchema).default([]),
});

export type CreateProjectInput = z.infer<typeof CreateProjectSchema>;

export const UpdateProjectSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  description: z.string().optional().nullable(),
  category: z.string().max(100).optional().nullable(),
  ownerId: UUIDSchema.optional(),
  startDate: DateSchema.optional().nullable(),
  expectedCompletionDate: DateSchema.optional().nullable(),
  actualCompletionDate: DateSchema.optional().nullable(),
  priority: ProjectPrioritySchema.optional(),
  status: ProjectStatusSchema.optional(),
  progress: z.number().int().min(0).max(100).optional(),
});

export type UpdateProjectInput = z.infer<typeof UpdateProjectSchema>;

// ============================================
// Project Members
// ============================================

export const ProjectMemberRoleSchema = z.enum(['owner', 'lead', 'contributor', 'reviewer', 'viewer']);
export type ProjectMemberRole = z.infer<typeof ProjectMemberRoleSchema>;

export const ProjectMemberSchema = z.object({
  id: UUIDSchema,
  projectId: UUIDSchema,
  userId: UUIDSchema,
  role: ProjectMemberRoleSchema.default('viewer'),
  assignedAt: DateTimeSchema,
  assignedBy: UUIDSchema,
});

export type ProjectMember = z.infer<typeof ProjectMemberSchema>;

export const AddProjectMemberSchema = z.object({
  userId: UUIDSchema,
  role: ProjectMemberRoleSchema.default('viewer'),
});

export type AddProjectMemberInput = z.infer<typeof AddProjectMemberSchema>;

// ============================================
// Tasks & Milestones
// ============================================

export const TaskStatusSchema = z.enum(['todo', 'in_progress', 'review', 'done', 'blocked']);
export type TaskStatus = z.infer<typeof TaskStatusSchema>;

export const TaskPrioritySchema = z.enum(['low', 'medium', 'high', 'critical']);
export type TaskPriority = z.infer<typeof TaskPrioritySchema>;

export const TaskSchema = z.object({
  id: UUIDSchema,
  projectId: UUIDSchema,
  title: z.string().min(1).max(255),
  description: z.string().optional().nullable(),
  status: TaskStatusSchema.default('todo'),
  priority: TaskPrioritySchema.default('medium'),
  assigneeId: UUIDSchema.optional().nullable(),
  reporterId: UUIDSchema,
  dueDate: DateSchema.optional().nullable(),
  completedAt: DateTimeSchema.optional().nullable(),
  createdAt: DateTimeSchema,
  updatedAt: DateTimeSchema,
});

export type Task = z.infer<typeof TaskSchema>;

export const CreateTaskSchema = z.object({
  projectId: UUIDSchema,
  title: z.string().min(1).max(255),
  description: z.string().optional().nullable(),
  priority: TaskPrioritySchema.default('medium'),
  assigneeId: UUIDSchema.optional().nullable(),
  dueDate: DateSchema.optional().nullable(),
});

export type CreateTaskInput = z.infer<typeof CreateTaskSchema>;

export const MilestoneSchema = z.object({
  id: UUIDSchema,
  projectId: UUIDSchema,
  name: z.string().min(1).max(255),
  description: z.string().optional().nullable(),
  dueDate: DateSchema,
  completedAt: DateTimeSchema.optional().nullable(),
  createdAt: DateTimeSchema,
  updatedAt: DateTimeSchema,
});

export type Milestone = z.infer<typeof MilestoneSchema>;

export const CreateMilestoneSchema = z.object({
  projectId: UUIDSchema,
  name: z.string().min(1).max(255),
  description: z.string().optional().nullable(),
  dueDate: DateSchema,
});

export type CreateMilestoneInput = z.infer<typeof CreateMilestoneSchema>;

// ============================================
// Daily KT Reports
// ============================================

export const KTReportSchema = z.object({
  id: UUIDSchema,
  projectId: UUIDSchema,
  userId: UUIDSchema,
  reportDate: DateSchema,
  workCompleted: z.string().optional().nullable(),
  detailedWork: z.string().optional().nullable(),
  completedTasks: z.string().optional().nullable(),
  pendingTasks: z.string().optional().nullable(),
  challenges: z.string().optional().nullable(),
  nextDayPlan: z.string().optional().nullable(),
  status: z.enum(['draft', 'submitted', 'approved', 'rejected']).default('draft'),
  submittedAt: DateTimeSchema.optional().nullable(),
  approvedAt: DateTimeSchema.optional().nullable(),
  approvedBy: UUIDSchema.optional().nullable(),
  createdAt: DateTimeSchema,
  updatedAt: DateTimeSchema,
});

export type KTReport = z.infer<typeof KTReportSchema>;

export const CreateKTReportSchema = z.object({
  projectId: UUIDSchema,
  reportDate: DateSchema,
  workCompleted: z.string().optional().nullable(),
  detailedWork: z.string().optional().nullable(),
  completedTasks: z.string().optional().nullable(),
  pendingTasks: z.string().optional().nullable(),
  challenges: z.string().optional().nullable(),
  nextDayPlan: z.string().optional().nullable(),
  status: z.enum(['draft', 'submitted']).default('draft'),
});

export type CreateKTReportInput = z.infer<typeof CreateKTReportSchema>;

export const UpdateKTReportSchema = z.object({
  workCompleted: z.string().optional().nullable(),
  detailedWork: z.string().optional().nullable(),
  completedTasks: z.string().optional().nullable(),
  pendingTasks: z.string().optional().nullable(),
  challenges: z.string().optional().nullable(),
  nextDayPlan: z.string().optional().nullable(),
  status: z.enum(['draft', 'submitted']).optional(),
});

export type UpdateKTReportInput = z.infer<typeof UpdateKTReportSchema>;

// ============================================
// Documents
// ============================================

export const DocumentCategorySchema = z.enum([
  'kt_report',
  'technical',
  'compliance',
  'meeting_notes',
  'design',
  'other',
]);

export type DocumentCategory = z.infer<typeof DocumentCategorySchema>;

export const DocumentStatusSchema = z.enum([
  'draft',
  'pending_review',
  'approved',
  'rejected',
  'published',
  'archived',
]);

export type DocumentStatus = z.infer<typeof DocumentStatusSchema>;

export const ReviewStatusSchema = z.enum([
  'pending',
  'approved',
  'rejected',
  'changes_requested',
]);

export type ReviewStatus = z.infer<typeof ReviewStatusSchema>;

export const WatermarkConfigSchema = z.object({
  enabled: z.boolean().default(true),
  text: z.string().optional(),
  position: z.enum(['top-left', 'top-right', 'bottom-left', 'bottom-right', 'center', 'diagonal']).default('diagonal'),
  opacity: z.number().min(0).max(1).default(0.15),
  fontSize: z.number().positive().default(24),
  color: z.string().default('#000000'),
  includeUser: z.boolean().default(true),
  includeTimestamp: z.boolean().default(true),
  includeDocumentInfo: z.boolean().default(true),
});

export type WatermarkConfig = z.infer<typeof WatermarkConfigSchema>;

export const DocumentSchema = z.object({
  id: UUIDSchema,
  projectId: UUIDSchema,
  name: z.string().min(1).max(500),
  originalName: z.string().min(1).max(500),
  mimeType: z.string().max(100),
  size: z.number().int().positive(),
  category: DocumentCategorySchema.default('other'),
  uploadedBy: UUIDSchema,
  ownerId: UUIDSchema,
  coAuthorIds: z.array(UUIDSchema).default([]),
  tags: z.array(z.string()).default([]),
  status: DocumentStatusSchema.default('draft'),
  reviewStatus: ReviewStatusSchema.optional().nullable(),
  reviewerId: UUIDSchema.optional().nullable(),
  reviewedAt: DateTimeSchema.optional().nullable(),
  reviewComments: z.string().optional().nullable(),
  watermarkConfig: WatermarkConfigSchema.optional().nullable(),
  metadata: z.record(z.unknown()).optional().nullable(),
  ktReportId: UUIDSchema.optional().nullable(),
  storageKey: z.string().min(1),
  version: z.number().int().positive().default(1),
  createdAt: DateTimeSchema,
  updatedAt: DateTimeSchema,
});

export type Document = z.infer<typeof DocumentSchema>;

export const CreateDocumentSchema = z.object({
  projectId: UUIDSchema,
  name: z.string().min(1).max(500),
  originalName: z.string().min(1).max(500),
  mimeType: z.string().max(100),
  size: z.number().int().positive(),
  category: DocumentCategorySchema.default('other'),
  ownerId: UUIDSchema,
  coAuthorIds: z.array(UUIDSchema).default([]),
  tags: z.array(z.string()).default([]),
  ktReportId: UUIDSchema.optional().nullable(),
  storageKey: z.string().min(1),
  watermarkConfig: WatermarkConfigSchema.optional().nullable(),
  metadata: z.record(z.unknown()).optional().nullable(),
});

export type CreateDocumentInput = z.infer<typeof CreateDocumentSchema>;

export const UpdateDocumentSchema = z.object({
  name: z.string().min(1).max(500).optional(),
  category: DocumentCategorySchema.optional(),
  ownerId: UUIDSchema.optional(),
  coAuthorIds: z.array(UUIDSchema).optional(),
  tags: z.array(z.string()).optional(),
  status: DocumentStatusSchema.optional(),
  reviewStatus: ReviewStatusSchema.optional().nullable(),
  reviewerId: UUIDSchema.optional().nullable(),
  reviewComments: z.string().optional().nullable(),
  watermarkConfig: WatermarkConfigSchema.optional().nullable(),
  metadata: z.record(z.unknown()).optional().nullable(),
});

export type UpdateDocumentInput = z.infer<typeof UpdateDocumentSchema>;

export const DocumentVersionSchema = z.object({
  id: UUIDSchema,
  documentId: UUIDSchema,
  version: z.number().int().positive(),
  storageKey: z.string().min(1),
  size: z.number().int().positive(),
  uploadedBy: UUIDSchema,
  createdAt: DateTimeSchema,
});

export type DocumentVersion = z.infer<typeof DocumentVersionSchema>;

export const DocumentReviewSchema = z.object({
  id: UUIDSchema,
  documentId: UUIDSchema,
  reviewerId: UUIDSchema,
  status: ReviewStatusSchema,
  comments: z.string().optional().nullable(),
  createdAt: DateTimeSchema,
  updatedAt: DateTimeSchema,
});

export type DocumentReview = z.infer<typeof DocumentReviewSchema>;

export const CreateDocumentReviewSchema = z.object({
  documentId: UUIDSchema,
  reviewerId: UUIDSchema,
  status: ReviewStatusSchema,
  comments: z.string().optional().nullable(),
});

export type CreateDocumentReviewInput = z.infer<typeof CreateDocumentReviewSchema>;

// ============================================
// Compliance
// ============================================

export const ComplianceStatusSchema = z.enum([
  'not_started',
  'in_progress',
  'completed',
  'overdue',
  'at_risk',
]);

export type ComplianceStatus = z.infer<typeof ComplianceStatusSchema>;

export const ComplianceControlSchema = z.object({
  id: UUIDSchema,
  category: z.string().min(1).max(100),
  controlId: z.string().min(1).max(50),
  title: z.string().min(1).max(500),
  description: z.string().optional().nullable(),
  projectId: UUIDSchema.optional().nullable(),
  ownerId: UUIDSchema,
  dueDate: DateSchema.optional().nullable(),
  status: ComplianceStatusSchema.default('not_started'),
  evidence: z.string().optional().nullable(),
  lastReviewedAt: DateTimeSchema.optional().nullable(),
  createdAt: DateTimeSchema,
  updatedAt: DateTimeSchema,
});

export type ComplianceControl = z.infer<typeof ComplianceControlSchema>;

export const CreateComplianceControlSchema = z.object({
  category: z.string().min(1).max(100),
  controlId: z.string().min(1).max(50),
  title: z.string().min(1).max(500),
  description: z.string().optional().nullable(),
  projectId: UUIDSchema.optional().nullable(),
  ownerId: UUIDSchema,
  dueDate: DateSchema.optional().nullable(),
  status: ComplianceStatusSchema.default('not_started'),
  evidence: z.string().optional().nullable(),
});

export type CreateComplianceControlInput = z.infer<typeof CreateComplianceControlSchema>;

export const RemediationTaskSchema = z.object({
  id: UUIDSchema,
  controlId: UUIDSchema,
  title: z.string().min(1).max(255),
  description: z.string().optional().nullable(),
  assigneeId: UUIDSchema,
  dueDate: DateSchema,
  status: z.enum(['pending', 'in_progress', 'completed', 'overdue']).default('pending'),
  completedAt: DateTimeSchema.optional().nullable(),
  createdAt: DateTimeSchema,
  updatedAt: DateTimeSchema,
});

export type RemediationTask = z.infer<typeof RemediationTaskSchema>;

// ============================================
// Notifications
// ============================================

export const NotificationTypeSchema = z.enum([
  'project_assigned',
  'deadline_approaching',
  'overdue_task',
  'missing_kt_report',
  'new_document',
  'project_completed',
  'comment_added',
  'role_changed',
  'permission_changed',
]);

export type NotificationType = z.infer<typeof NotificationTypeSchema>;

export const NotificationSchema = z.object({
  id: UUIDSchema,
  userId: UUIDSchema,
  type: NotificationTypeSchema,
  title: z.string().min(1).max(255),
  message: z.string(),
  resourceType: z.string().optional().nullable(),
  resourceId: UUIDSchema.optional().nullable(),
  isRead: z.boolean().default(false),
  createdAt: DateTimeSchema,
});

export type Notification = z.infer<typeof NotificationSchema>;

// ============================================
// Audit Logs
// ============================================

export const AuditActionSchema = z.enum([
  'create',
  'update',
  'delete',
  'login',
  'logout',
  'assign',
  'unassign',
  'upload',
  'download',
  'approve',
  'reject',
  'role_change',
  'permission_change',
  'config_change',
]);

export type AuditAction = z.infer<typeof AuditActionSchema>;

export const AuditLogSchema = z.object({
  id: UUIDSchema,
  actorId: UUIDSchema.optional().nullable(),
  action: AuditActionSchema,
  resourceType: z.string().min(1).max(100),
  resourceId: UUIDSchema.optional().nullable(),
  details: z.record(z.unknown()).optional().nullable(),
  ipAddress: z.string().optional().nullable(),
  userAgent: z.string().optional().nullable(),
  outcome: z.enum(['success', 'failure']),
  errorMessage: z.string().optional().nullable(),
  createdAt: DateTimeSchema,
});

export type AuditLog = z.infer<typeof AuditLogSchema>;

// ============================================
// Auth
// ============================================

export const LoginSchema = z.object({
  email: EmailSchema,
  password: z.string().min(8).max(128),
});

export type LoginInput = z.infer<typeof LoginSchema>;

export const RegisterSchema = z.object({
  email: EmailSchema,
  password: z.string().min(8).max(128),
  fullName: z.string().min(1).max(255),
  department: z.string().max(255).optional().nullable(),
});

export type RegisterInput = z.infer<typeof RegisterSchema>;

export const ChangePasswordSchema = z.object({
  currentPassword: z.string().min(8).max(128),
  newPassword: z.string().min(8).max(128),
});

export type ChangePasswordInput = z.infer<typeof ChangePasswordSchema>;

export const ForgotPasswordSchema = z.object({
  email: EmailSchema,
});

export type ForgotPasswordInput = z.infer<typeof ForgotPasswordSchema>;

export const ResetPasswordSchema = z.object({
  token: z.string().min(1),
  newPassword: z.string().min(8).max(128),
});

export type ResetPasswordInput = z.infer<typeof ResetPasswordSchema>;

export const TokenPayloadSchema = z.object({
  sub: UUIDSchema,
  email: EmailSchema,
  role: UserRoleSchema,
  iat: z.number().int(),
  exp: z.number().int(),
});

export type TokenPayload = z.infer<typeof TokenPayloadSchema>;

// ============================================
// API Response
// ============================================

export const ApiResponseSchema = <T extends z.ZodTypeAny>(dataSchema: T) =>
  z.object({
    success: z.boolean(),
    data: dataSchema.optional().nullable(),
    error: z.object({
      code: z.string(),
      message: z.string(),
      details: z.record(z.unknown()).optional().nullable(),
    }).optional().nullable(),
    meta: z.object({
      timestamp: DateTimeSchema,
      requestId: z.string().optional(),
    }).optional(),
  });

export type ApiResponse<T> = {
  success: boolean;
  data: T | null;
  error: { code: string; message: string; details?: Record<string, unknown> } | null;
  meta?: { timestamp: string; requestId?: string };
};