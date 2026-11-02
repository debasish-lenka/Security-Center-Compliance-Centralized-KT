import type { FastifyInstance } from 'fastify';
import { NotificationType } from '@prisma/client';

interface NotificationInput {
  userId: string;
  type: NotificationType;
  title: string;
  message: string;
  resourceType?: string;
  resourceId?: string;
}

export class NotificationService {
  private prisma: FastifyInstance['prisma'];

  constructor(prisma: FastifyInstance['prisma']) {
    this.prisma = prisma;
  }

  async create(input: NotificationInput): Promise<void> {
    await this.prisma.notification.create({
      data: input,
    });
  }

  async createBulk(inputs: NotificationInput[]): Promise<void> {
    await this.prisma.notification.createMany({
      data: inputs,
    });
  }

  async markAsRead(userId: string, notificationIds: string[]): Promise<void> {
    await this.prisma.notification.updateMany({
      where: {
        id: { in: notificationIds },
        userId,
      },
      data: { isRead: true },
    });
  }

  async markAllAsRead(userId: string): Promise<void> {
    await this.prisma.notification.updateMany({
      where: { userId, isRead: false },
      data: { isRead: true },
    });
  }

  async getUnreadCount(userId: string): Promise<number> {
    return this.prisma.notification.count({
      where: { userId, isRead: false },
    });
  }

  // Convenience methods for common notifications
  async notifyProjectAssigned(userId: string, projectId: string, projectName: string): Promise<void> {
    await this.create({
      userId,
      type: 'PROJECT_ASSIGNED',
      title: 'New Project Assignment',
      message: `You have been assigned to project: ${projectName}`,
      resourceType: 'project',
      resourceId: projectId,
    });
  }

  async notifyDeadlineApproaching(userId: string, projectId: string, projectName: string, days: number): Promise<void> {
    await this.create({
      userId,
      type: 'DEADLINE_APPROACHING',
      title: 'Deadline Approaching',
      message: `Project "${projectName}" deadline is in ${days} day(s)`,
      resourceType: 'project',
      resourceId: projectId,
    });
  }

  async notifyOverdueTask(userId: string, taskId: string, taskTitle: string, projectName: string): Promise<void> {
    await this.create({
      userId,
      type: 'OVERDUE_TASK',
      title: 'Task Overdue',
      message: `Task "${taskTitle}" in project "${projectName}" is overdue`,
      resourceType: 'task',
      resourceId: taskId,
    });
  }

  async notifyMissingKTReport(userId: string, projectId: string, projectName: string, date: Date): Promise<void> {
    await this.create({
      userId,
      type: 'MISSING_KT_REPORT',
      title: 'Missing KT Report',
      message: `KT report for project "${projectName}" on ${date.toLocaleDateString()} is missing`,
      resourceType: 'kt_report',
      resourceId: projectId,
    });
  }

  async notifyNewDocument(userId: string, documentId: string, documentName: string, projectName: string): Promise<void> {
    await this.create({
      userId,
      type: 'NEW_DOCUMENT',
      title: 'New Document Uploaded',
      message: `Document "${documentName}" was uploaded to project "${projectName}"`,
      resourceType: 'document',
      resourceId: documentId,
    });
  }

  async notifyProjectCompleted(userId: string, projectId: string, projectName: string): Promise<void> {
    await this.create({
      userId,
      type: 'PROJECT_COMPLETED',
      title: 'Project Completed',
      message: `Project "${projectName}" has been marked as completed`,
      resourceType: 'project',
      resourceId: projectId,
    });
  }

  async notifyCommentAdded(userId: string, projectId: string, projectName: string, authorName: string): Promise<void> {
    await this.create({
      userId,
      type: 'COMMENT_ADDED',
      title: 'New Comment',
      message: `${authorName} added a comment to project "${projectName}"`,
      resourceType: 'project',
      resourceId: projectId,
    });
  }

  async notifyRoleChanged(userId: string, newRole: string): Promise<void> {
    await this.create({
      userId,
      type: 'ROLE_CHANGED',
      title: 'Role Updated',
      message: `Your role has been updated to: ${newRole}`,
      resourceType: 'user',
      resourceId: userId,
    });
  }

  async notifyPermissionChanged(userId: string): Promise<void> {
    await this.create({
      userId,
      type: 'PERMISSION_CHANGED',
      title: 'Permissions Updated',
      message: 'Your permissions have been updated',
      resourceType: 'user',
      resourceId: userId,
    });
  }
}

export function createNotificationService(app: FastifyInstance): NotificationService {
  return new NotificationService(app.prisma);
}