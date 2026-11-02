import type { FastifyInstance } from 'fastify';
import type { Prisma, PrismaClient } from '@prisma/client';
import { z } from 'zod';

const MODULES = ['projects', 'documents', 'ktReports', 'compliance', 'people', 'auditLogs'] as const;
type SearchModule = (typeof MODULES)[number];

// `modules` arrives either as repeated params (?modules=a&modules=b) or comma separated
const modulesParam = z
  .union([z.string(), z.array(z.string())])
  .transform((v) => (Array.isArray(v) ? v : v.split(',')).map((m) => m.trim()).filter(Boolean))
  .pipe(z.array(z.enum(MODULES)))
  .optional();

const searchQuerySchema = z.object({
  q: z.string().trim().min(1).max(500),
  modules: modulesParam,
  limit: z.coerce.number().int().min(1).max(100).default(20),
  offset: z.coerce.number().int().min(0).default(0),
});

type SearchResult = {
  type: SearchModule;
  id: string;
  title: string;
  subtitle: string;
  url: string;
  metadata: Record<string, unknown>;
};

interface Viewer {
  id: string;
  role: string;
}

const isAdmin = (viewer: Viewer) => viewer.role === 'SUPER_ADMIN' || viewer.role === 'ADMIN';

// Projects the viewer belongs to; admins see everything
const projectScope = (viewer: Viewer): Prisma.ProjectWhereInput =>
  isAdmin(viewer) ? {} : { members: { some: { userId: viewer.id } } };

async function searchProjects(db: PrismaClient, query: string, limit: number, offset: number, viewer: Viewer): Promise<SearchResult[]> {
  const projects = await db.project.findMany({
    where: {
      AND: [
        projectScope(viewer),
        {
          OR: [
            { name: { contains: query, mode: 'insensitive' } },
            { description: { contains: query, mode: 'insensitive' } },
            { category: { contains: query, mode: 'insensitive' } },
          ],
        },
      ],
    },
    take: limit,
    skip: offset,
    include: { owner: { select: { fullName: true } } },
    orderBy: { updatedAt: 'desc' },
  });

  return projects.map((p) => ({
    type: 'projects',
    id: p.id,
    title: p.name,
    subtitle: `${p.status.replace(/_/g, ' ')} · ${p.progress}% complete · ${p.owner.fullName}`,
    url: `/projects/${p.id}`,
    metadata: { status: p.status, progress: p.progress, owner: p.owner.fullName, priority: p.priority },
  }));
}

// Mirrors the visibility rules enforced by the documents API
async function documentVisibilityScope(db: PrismaClient, viewer: Viewer): Promise<Prisma.ProjectDocumentWhereInput> {
  if (isAdmin(viewer)) return {};

  const [memberships, profile] = await Promise.all([
    db.teamMember.findMany({ where: { userId: viewer.id }, select: { teamId: true } }),
    db.profile.findUnique({ where: { id: viewer.id }, select: { departmentId: true } }),
  ]);
  const teamIds = memberships.map((m) => m.teamId);
  const inProject: Prisma.ProjectWhereInput = { members: { some: { userId: viewer.id } } };

  const clauses: Prisma.ProjectDocumentWhereInput[] = [
    { uploadedById: viewer.id },
    { ownerId: viewer.id },
    { visibility: 'ORGANIZATION' },
    { visibility: 'CUSTOM_USERS', visibleToUserIds: { has: viewer.id } },
    { visibility: 'PROJECT_MEMBERS', project: inProject },
  ];
  if (teamIds.length) clauses.push({ visibility: 'TEAM', visibleToTeamIds: { hasSome: teamIds } });
  if (profile?.departmentId) {
    clauses.push({ visibility: 'DEPARTMENT', visibleToDeptIds: { has: profile.departmentId } });
  }
  return { OR: clauses };
}

async function searchDocuments(db: PrismaClient, query: string, limit: number, offset: number, viewer: Viewer): Promise<SearchResult[]> {
  const documents = await db.projectDocument.findMany({
    where: {
      AND: [
        await documentVisibilityScope(db, viewer),
        {
          OR: [
            { name: { contains: query, mode: 'insensitive' } },
            { originalName: { contains: query, mode: 'insensitive' } },
            { tags: { has: query } },
          ],
        },
      ],
    },
    take: limit,
    skip: offset,
    include: { project: { select: { id: true, name: true } } },
    orderBy: { createdAt: 'desc' },
  });

  return documents.map((d) => ({
    type: 'documents',
    id: d.id,
    title: d.name,
    subtitle: `${d.category.replace(/_/g, ' ')} · ${formatFileSize(d.size)} · ${d.status}`,
    url: `/documents?projectId=${d.projectId}&documentId=${d.id}`,
    metadata: {
      mimeType: d.mimeType,
      size: d.size,
      status: d.status,
      version: d.version,
      projectId: d.projectId,
      projectName: d.project.name,
    },
  }));
}

async function searchKTReports(db: PrismaClient, query: string, limit: number, offset: number, viewer: Viewer): Promise<SearchResult[]> {
  const reports = await db.dailyKTReport.findMany({
    where: {
      AND: [
        { project: projectScope(viewer) },
        {
          OR: [
            { workCompleted: { contains: query, mode: 'insensitive' } },
            { detailedWork: { contains: query, mode: 'insensitive' } },
            { challenges: { contains: query, mode: 'insensitive' } },
            { nextDayPlan: { contains: query, mode: 'insensitive' } },
          ],
        },
      ],
    },
    take: limit,
    skip: offset,
    include: {
      project: { select: { id: true, name: true } },
      user: { select: { fullName: true } },
    },
    orderBy: { reportDate: 'desc' },
  });

  return reports.map((r) => {
    const date = r.reportDate.toISOString().slice(0, 10);
    return {
      type: 'ktReports',
      id: r.id,
      title: `KT report ${date} · ${r.project.name}`,
      subtitle: `${r.status} · ${r.user.fullName}`,
      url: `/kt-reports/${r.id}`,
      metadata: { status: r.status, author: r.user.fullName, date, projectId: r.projectId, projectName: r.project.name },
    };
  });
}

async function searchCompliance(db: PrismaClient, query: string, limit: number, offset: number, viewer: Viewer): Promise<SearchResult[]> {
  // Controls without a project are organisation-wide and visible to everyone
  const scope: Prisma.ComplianceControlWhereInput = isAdmin(viewer)
    ? {}
    : { OR: [{ projectId: null }, { project: projectScope(viewer) }] };

  const controls = await db.complianceControl.findMany({
    where: {
      AND: [
        scope,
        {
          OR: [
            { title: { contains: query, mode: 'insensitive' } },
            { controlId: { contains: query, mode: 'insensitive' } },
            { category: { contains: query, mode: 'insensitive' } },
            { description: { contains: query, mode: 'insensitive' } },
          ],
        },
      ],
    },
    take: limit,
    skip: offset,
    include: { project: { select: { id: true, name: true } } },
    orderBy: { updatedAt: 'desc' },
  });

  return controls.map((c) => ({
    type: 'compliance',
    id: c.id,
    title: `${c.controlId} · ${c.title}`,
    subtitle: `${c.category} · ${c.status.replace(/_/g, ' ')} · Last reviewed: ${
      c.lastReviewedAt ? c.lastReviewedAt.toLocaleDateString() : 'never'
    }`,
    url: `/compliance/${c.id}`,
    metadata: { category: c.category, status: c.status, projectName: c.project?.name },
  }));
}

async function searchPeople(db: PrismaClient, query: string, limit: number, offset: number): Promise<SearchResult[]> {
  const users = await db.profile.findMany({
    where: {
      status: 'ACTIVE',
      OR: [
        { fullName: { contains: query, mode: 'insensitive' } },
        { email: { contains: query, mode: 'insensitive' } },
        { department: { name: { contains: query, mode: 'insensitive' } } },
      ],
    },
    take: limit,
    skip: offset,
    include: { department: { select: { name: true } } },
    orderBy: { fullName: 'asc' },
  });

  return users.map((u) => ({
    type: 'people',
    id: u.id,
    title: u.fullName,
    subtitle: `${u.role.replace(/_/g, ' ')} · ${u.department?.name ?? 'No department'}`,
    url: `/users/${u.id}`,
    metadata: { role: u.role, status: u.status, department: u.department?.name ?? null },
  }));
}

async function searchAuditLogs(db: PrismaClient, query: string, limit: number, offset: number, viewer: Viewer): Promise<SearchResult[]> {
  // Audit data is sensitive: same audience as the audit log API
  if (!isAdmin(viewer)) return [];

  const logs = await db.auditLog.findMany({
    where: {
      OR: [
        { actor: { fullName: { contains: query, mode: 'insensitive' } } },
        { resourceType: { contains: query, mode: 'insensitive' } },
        { resourceId: { contains: query, mode: 'insensitive' } },
      ],
    },
    take: limit,
    skip: offset,
    include: { actor: { select: { fullName: true } } },
    orderBy: { createdAt: 'desc' },
  });

  return logs.map((log) => ({
    type: 'auditLogs',
    id: log.id,
    title: `${log.action} ${log.resourceType}${log.resourceId ? ` "${log.resourceId}"` : ''}`,
    subtitle: `${log.actor?.fullName ?? 'System'} · ${formatRelativeTime(log.createdAt)}`,
    url: `/audit-logs?id=${log.id}`,
    metadata: {
      action: log.action,
      resourceType: log.resourceType,
      resourceId: log.resourceId,
      user: log.actor?.fullName ?? null,
      timestamp: log.createdAt.toISOString(),
    },
  }));
}

function formatFileSize(bytes: number): string {
  if (bytes <= 0) return '0 Bytes';
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), sizes.length - 1);
  return `${parseFloat((bytes / Math.pow(1024, i)).toFixed(1))} ${sizes[i]}`;
}

function formatRelativeTime(date: Date): string {
  const diff = Date.now() - date.getTime();
  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);

  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  if (hours < 24) return `${hours}h ago`;
  if (days < 7) return `${days}d ago`;
  return date.toLocaleDateString();
}

export async function searchRoutes(app: FastifyInstance) {
  // GET /api/v1/search?q=...&modules=projects,documents
  app.get('/', {
    preHandler: [app.authenticate],
    schema: { querystring: searchQuerySchema },
  }, async (request) => {
    const { q, modules, limit, offset } = request.query as z.infer<typeof searchQuerySchema>;
    const viewer: Viewer = { id: request.userId!, role: request.user!.role };

    const activeModules: readonly SearchModule[] = modules?.length ? modules : MODULES;

    const searchers: Record<SearchModule, () => Promise<SearchResult[]>> = {
      projects: () => searchProjects(app.prisma, q, limit, offset, viewer),
      documents: () => searchDocuments(app.prisma, q, limit, offset, viewer),
      ktReports: () => searchKTReports(app.prisma, q, limit, offset, viewer),
      compliance: () => searchCompliance(app.prisma, q, limit, offset, viewer),
      people: () => searchPeople(app.prisma, q, limit, offset),
      auditLogs: () => searchAuditLogs(app.prisma, q, limit, offset, viewer),
    };

    const results = (await Promise.all(activeModules.map((m) => searchers[m]()))).flat();

    // Title matches first, then keep per-module recency order
    const needle = q.toLowerCase();
    results.sort((a, b) => Number(b.title.toLowerCase().includes(needle)) - Number(a.title.toLowerCase().includes(needle)));

    return {
      success: true,
      data: {
        results,
        total: results.length,
        query: q,
        modules: activeModules,
      },
    };
  });
}
