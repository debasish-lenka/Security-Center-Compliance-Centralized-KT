import type { FastifyInstance } from 'fastify';
import { TEAM_ROLES } from './project-progress.js';
import { getReminderSettings } from './stalled.js';

// "Needs attention": what a project lead has to look at today, in one list.
// Admins see every live project, a lead sees the projects they own or lead.

const DAY = 86_400_000;
const OPEN = ['TODO', 'IN_PROGRESS', 'REVIEW', 'BLOCKED'] as const;
const LIVE = ['NOT_STARTED', 'ONGOING', 'AT_RISK', 'OVERDUE'] as const;

export type AttentionKind = 'WAITING_VERIFICATION' | 'OVERDUE' | 'BLOCKED' | 'STALLED' | 'NOT_STARTED';
const ORDER: AttentionKind[] = ['WAITING_VERIFICATION', 'OVERDUE', 'BLOCKED', 'STALLED', 'NOT_STARTED'];

export interface AttentionItem {
  kind: AttentionKind;
  projectId: string;
  projectName: string;
  taskId: string | null;
  taskTitle: string | null;
  personId: string | null;
  personName: string | null;
  days: number;
  since: Date | null;
  detail: string | null;
  canVerify: boolean;
  canNudge: boolean;
}

export async function attentionFor(app: FastifyInstance, me: { id: string; role: string }) {
  const settings = await getReminderSettings(app);
  const now = Date.now();
  const admin = me.role === 'SUPER_ADMIN' || me.role === 'ADMIN';

  const projects = await app.prisma.project.findMany({
    where: {
      status: { in: [...LIVE] },
      ...(admin ? {} : { OR: [{ ownerId: me.id }, { members: { some: { userId: me.id, role: { in: ['OWNER', 'LEAD'] } } } }] }),
    },
    select: { id: true, name: true, members: { select: { userId: true, role: true, acceptedAt: true, assignedAt: true, user: { select: { fullName: true, status: true } } } } },
  });
  const empty = { settings: { stalledAfterDays: settings.stalledAfterDays, notStartedAfterDays: settings.notStartedAfterDays }, counts: { total: 0 } as Record<string, number>, items: [] as AttentionItem[] };
  if (projects.length === 0) return empty;
  const projectIds = projects.map((p) => p.id);
  const byProject = new Map(projects.map((p) => [p.id, p]));

  const [tasks, feed, sessions] = await Promise.all([
    app.prisma.task.findMany({
      where: { projectId: { in: projectIds }, status: { in: [...OPEN] } },
      select: { id: true, title: true, projectId: true, status: true, dueDate: true, blockedReason: true, submittedAt: true, createdAt: true, updatedAt: true, assignee: { select: { id: true, fullName: true, status: true } } },
    }),
    app.prisma.activityFeed.groupBy({ by: ['actorId', 'projectId'], where: { projectId: { in: projectIds } }, _max: { createdAt: true } }),
    app.prisma.workSession.groupBy({ by: ['userId', 'projectId'], where: { projectId: { in: projectIds } }, _max: { lastSeenAt: true } }),
  ]);
  const lastWork = new Map<string, number>();
  const bump = (k: string, d: Date | null | undefined) => { if (d) lastWork.set(k, Math.max(lastWork.get(k) ?? 0, d.getTime())); };
  for (const f of feed) bump(`${f.actorId}|${f.projectId}`, f._max.createdAt);
  for (const s of sessions) bump(`${s.userId}|${s.projectId}`, s._max.lastSeenAt);

  const blockedIds = tasks.filter((t) => t.status === 'BLOCKED').map((t) => t.id);
  const blockedAt = new Map<string, Date>();
  if (blockedIds.length) {
    const rows = await app.prisma.taskReview.findMany({ where: { taskId: { in: blockedIds }, kind: 'BLOCKED' }, orderBy: { createdAt: 'desc' }, select: { taskId: true, createdAt: true } });
    for (const r of rows) if (!blockedAt.has(r.taskId)) blockedAt.set(r.taskId, r.createdAt);
  }

  const startOfToday = new Date(); startOfToday.setUTCHours(0, 0, 0, 0);
  const items: AttentionItem[] = [];
  for (const t of tasks) {
    const p = byProject.get(t.projectId)!;
    const base = { projectId: p.id, projectName: p.name, taskId: t.id, taskTitle: t.title, personId: t.assignee?.id ?? null, personName: t.assignee?.fullName ?? null };
    const mine = t.assignee?.id === me.id;
    if (t.status === 'REVIEW') {
      const since = t.submittedAt ?? t.updatedAt;
      items.push({ ...base, kind: 'WAITING_VERIFICATION', days: Math.floor((now - since.getTime()) / DAY), since, detail: null, canVerify: !mine || me.role === 'SUPER_ADMIN', canNudge: false });
      continue;
    }
    if (t.status === 'BLOCKED') {
      const since = blockedAt.get(t.id) ?? t.updatedAt;
      items.push({ ...base, kind: 'BLOCKED', days: Math.floor((now - since.getTime()) / DAY), since, detail: t.blockedReason, canVerify: false, canNudge: false });
    }
    if (t.dueDate && t.dueDate < startOfToday) {
      items.push({ ...base, kind: 'OVERDUE', days: Math.max(1, Math.floor((startOfToday.getTime() - t.dueDate.getTime()) / DAY)), since: t.dueDate, detail: null, canVerify: false, canNudge: !!t.assignee && !mine && t.assignee.status === 'ACTIVE' });
    }
    if (t.status !== 'BLOCKED' && t.assignee && t.assignee.status === 'ACTIVE') {
      const last = Math.max(t.updatedAt.getTime(), t.createdAt.getTime(), lastWork.get(`${t.assignee.id}|${t.projectId}`) ?? 0);
      const idle = Math.floor((now - last) / DAY);
      if (idle >= settings.stalledAfterDays) items.push({ ...base, kind: 'STALLED', days: idle, since: new Date(last), detail: null, canVerify: false, canNudge: !mine });
    }
  }
  for (const p of projects) {
    for (const m of p.members) {
      if (!(TEAM_ROLES as readonly string[]).includes(m.role) || m.acceptedAt || m.user.status !== 'ACTIVE' || m.userId === me.id) continue;
      const idle = Math.floor((now - m.assignedAt.getTime()) / DAY);
      if (idle < settings.notStartedAfterDays) continue;
      items.push({ kind: 'NOT_STARTED', projectId: p.id, projectName: p.name, taskId: null, taskTitle: null, personId: m.userId, personName: m.user.fullName, days: idle, since: m.assignedAt, detail: null, canVerify: false, canNudge: true });
    }
  }

  items.sort((a, b) => ORDER.indexOf(a.kind) - ORDER.indexOf(b.kind) || b.days - a.days);
  const counts: Record<string, number> = { total: items.length };
  for (const k of ORDER) counts[k] = items.filter((i) => i.kind === k).length;
  return { settings: empty.settings, counts, items: items.slice(0, 300) };
}
