import type { FastifyInstance, FastifyRequest } from 'fastify';

// Who has pressed "Start project", and who made the latest change on a project.
// Only the team members picked for the work count (contributors and reviewers). The owner, the managers /
// leads and read-only viewers do not have to start anything, so they are never listed or counted.
export const TEAM_ROLES = ['CONTRIBUTOR', 'REVIEWER'] as const;

export interface StartInfo {
  started: number; // people who pressed Start
  total: number;   // the team members expected to start
  startedBy: { userId: string; fullName: string; at: Date }[];
  waiting: string[]; // names of those who have not started yet
  iStarted: boolean | null; // null when the viewer is not one of them
}

export async function startInfo(app: FastifyInstance, projectIds: string[], viewerId?: string): Promise<Map<string, StartInfo>> {
  const out = new Map<string, StartInfo>();
  if (projectIds.length === 0) return out;
  const members = await app.prisma.projectMember.findMany({
    where: { projectId: { in: projectIds }, role: { in: [...TEAM_ROLES] }, user: { status: 'ACTIVE' } },
    select: { projectId: true, userId: true, acceptedAt: true, user: { select: { fullName: true } } },
    orderBy: { acceptedAt: 'asc' },
  });
  for (const id of projectIds) out.set(id, { started: 0, total: 0, startedBy: [], waiting: [], iStarted: null });
  for (const m of members) {
    const info = out.get(m.projectId)!;
    info.total += 1;
    if (m.acceptedAt) {
      info.started += 1;
      info.startedBy.push({ userId: m.userId, fullName: m.user.fullName, at: m.acceptedAt });
    } else {
      info.waiting.push(m.user.fullName);
    }
    if (m.userId === viewerId) info.iStarted = !!m.acceptedAt;
  }
  return out;
}

export interface LastUpdate { by: string; byId: string; text: string; at: Date }

export async function latestUpdates(app: FastifyInstance, projectIds: string[]): Promise<Map<string, LastUpdate>> {
  const out = new Map<string, LastUpdate>();
  if (projectIds.length === 0) return out;
  const rows = await app.prisma.activityFeed.findMany({
    where: { projectId: { in: projectIds } },
    orderBy: { createdAt: 'desc' },
    distinct: ['projectId'],
    include: { actor: { select: { id: true, fullName: true } } },
  });
  for (const r of rows) {
    const d = (r.details ?? {}) as { text?: string };
    out.set(r.projectId!, { by: r.actor.fullName, byId: r.actor.id, text: d.text ?? `${r.action.toLowerCase()} ${r.resourceType.replace(/_/g, ' ')}`, at: r.createdAt });
  }
  return out;
}

const NOUN: Record<string, string> = {
  tasks: 'a task',
  milestones: 'a milestone',
  'kt-reports': 'a KT report',
  documents: 'a document',
  members: 'a team member',
  'knowledge-books': 'a knowledge book',
  'knowledge-book': 'a knowledge book',
};
const RESOURCE: Record<string, string> = {
  tasks: 'task', milestones: 'milestone', 'kt-reports': 'kt_report', documents: 'document', members: 'team', 'knowledge-books': 'knowledge_book',
};

// Every successful change under /projects/:id/... is remembered as that person's latest update on the project.
// (Routes that already write their own activity row, and requests that are not "work", are skipped.)
const SKIP = /\/(delete-request|start|rollback|upload-url|access-analytics|watermark|work|tasks\/[0-9a-f-]{36}\/(?:submit|verify|block|unblock))/;

export async function recordProjectActivity(app: FastifyInstance, request: FastifyRequest, status: number) {
  try {
    if (['GET', 'HEAD', 'OPTIONS'].includes(request.method) || status >= 400 || !request.userId) return;
    const path = request.url.split('?')[0];
    const m = path.match(/^\/api\/v1\/projects\/([0-9a-f-]{36})(?:\/([^/]+))?/);
    if (!m || SKIP.test(path)) return;
    const [, projectId, segment] = m;

    const verb = request.method === 'POST' ? 'added' : request.method === 'DELETE' ? 'removed' : 'updated';
    const text = !segment ? 'updated the project details' : `${verb} ${NOUN[segment] ?? segment.replace(/-/g, ' ')}`;
    await app.prisma.activityFeed.create({
      data: {
        actorId: request.userId,
        action: request.method === 'POST' ? 'CREATE' : request.method === 'DELETE' ? 'DELETE' : 'UPDATE',
        resourceType: segment ? RESOURCE[segment] ?? segment : 'project',
        projectId,
        details: { text },
        ipAddress: request.ip,
        userAgent: request.headers['user-agent'],
      },
    });
    if (segment === 'tasks') await syncProjectProgress(app, projectId); // a task changed: the project's percentage follows
  } catch (e) {
    app.log.warn({ err: e }, 'could not record project activity');
  }
}

// ---- Progress: total and per person, worked out from the project's tasks ----
export interface ProgressBreakdown {
  overall: number;
  tasks: { total: number; done: number; inProgress: number };
  users: { userId: string; fullName: string; role: string; total: number; done: number; percent: number }[];
}

export function buildProgress(
  members: { userId: string; role: string; user: { fullName: string } }[],
  tasks: { assigneeId: string | null; status: string }[],
  stored: number,
): ProgressBreakdown {
  const pct = (done: number, total: number) => (total > 0 ? Math.round((done / total) * 100) : 0);
  const done = tasks.filter((t) => t.status === 'DONE').length;
  const users = members
    // the team picked for the work, plus anyone who has a task even if they are not in that team
    .filter((m) => (TEAM_ROLES as readonly string[]).includes(m.role) || tasks.some((t) => t.assigneeId === m.userId))
    .map((m) => {
      const mine = tasks.filter((t) => t.assigneeId === m.userId);
      const mineDone = mine.filter((t) => t.status === 'DONE').length;
      return { userId: m.userId, fullName: m.user.fullName, role: m.role, total: mine.length, done: mineDone, percent: pct(mineDone, mine.length) };
    })
    .sort((a, b) => a.fullName.localeCompare(b.fullName));
  return {
    // no tasks yet: keep the figure that was typed in by hand
    overall: tasks.length > 0 ? pct(done, tasks.length) : stored,
    tasks: { total: tasks.length, done, inProgress: tasks.filter((t) => t.status === 'IN_PROGRESS').length },
    users,
  };
}

// Keeps the stored progress of a project equal to done / total tasks (used by the project list too)
export async function syncProjectProgress(app: FastifyInstance, projectId: string) {
  const tasks = await app.prisma.task.findMany({ where: { projectId }, select: { status: true } });
  if (tasks.length === 0) return;
  const progress = Math.round((tasks.filter((t) => t.status === 'DONE').length / tasks.length) * 100);
  await app.prisma.project.updateMany({ where: { id: projectId, progress: { not: progress } }, data: { progress } });
}
