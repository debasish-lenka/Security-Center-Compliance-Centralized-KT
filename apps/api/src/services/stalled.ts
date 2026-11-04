import type { FastifyInstance } from 'fastify';
import { TEAM_ROLES } from './project-progress.js';

// Work that is not moving. Once a day the system looks at every open task and every project a person has been
// given but not started, and when the quiet has lasted longer than the admin's setting it:
//   1. reminds the person,   2. tells the project owner / leads (and the manager),   3. a while later alerts the admins.
// "Progress" means any sign of work: the task was changed, the person did something on the project, or ran a work session.

const DAY = 86_400_000;
const OPEN = ['TODO', 'IN_PROGRESS', 'REVIEW'] as const; // BLOCKED is the person saying why they are stuck: no nagging
const LIVE = ['NOT_STARTED', 'ONGOING', 'AT_RISK', 'OVERDUE'] as const; // a finished or paused project is left alone

export interface StalledSummary { tasks: number; notStarted: number; reminded: number; leadsTold: number; escalated: number }

export async function getReminderSettings(app: FastifyInstance) {
  return app.prisma.reminderSettings.upsert({ where: { id: 'default' }, create: { id: 'default' }, update: {} });
}

export async function runStalledCheck(app: FastifyInstance, source: 'schedule' | 'manual'): Promise<StalledSummary | null> {
  const settings = await getReminderSettings(app);
  if (!settings.enabled && source === 'schedule') return null;
  const now = Date.now();
  const summary: StalledSummary = { tasks: 0, notStarted: 0, reminded: 0, leadsTold: 0, escalated: 0 };

  const admins = (await app.prisma.profile.findMany({ where: { role: { in: ['SUPER_ADMIN', 'ADMIN'] }, status: 'ACTIVE' }, select: { id: true } })).map((a) => a.id);
  const repeatMs = Math.max(1, settings.stalledAfterDays) * DAY; // the same reminder is not repeated more often than this

  // one reminder per (person, title) per period
  const tell = async (userId: string, title: string, message: string, projectId: string) => {
    const seen = await app.prisma.notification.findFirst({ where: { userId, type: 'WORK_STALLED', title, createdAt: { gte: new Date(now - repeatMs) } }, select: { id: true } });
    if (seen) return false;
    await app.prisma.notification.create({ data: { userId, type: 'WORK_STALLED', title, message: message.slice(0, 1000), resourceType: 'project', resourceId: projectId } });
    return true;
  };

  const projects = await app.prisma.project.findMany({
    where: { status: { in: [...LIVE] } },
    select: {
      id: true, name: true, ownerId: true,
      members: { select: { userId: true, role: true, acceptedAt: true, assignedAt: true, user: { select: { fullName: true, status: true } } } },
    },
  });
  if (projects.length === 0) return finish(app, summary);
  const projectIds = projects.map((p) => p.id);

  // the latest sign of work, per person and project
  const [feed, sessions, tasks] = await Promise.all([
    app.prisma.activityFeed.groupBy({ by: ['actorId', 'projectId'], where: { projectId: { in: projectIds } }, _max: { createdAt: true } }),
    app.prisma.workSession.groupBy({ by: ['userId', 'projectId'], where: { projectId: { in: projectIds } }, _max: { lastSeenAt: true } }),
    app.prisma.task.findMany({
      where: { projectId: { in: projectIds }, status: { in: [...OPEN] }, assigneeId: { not: null } },
      select: { id: true, title: true, projectId: true, assigneeId: true, createdAt: true, updatedAt: true },
    }),
  ]);
  const lastWork = new Map<string, number>();
  const bump = (key: string, d: Date | null | undefined) => { if (d) lastWork.set(key, Math.max(lastWork.get(key) ?? 0, d.getTime())); };
  for (const f of feed) bump(`${f.actorId}|${f.projectId}`, f._max.createdAt);
  for (const s of sessions) bump(`${s.userId}|${s.projectId}`, s._max.lastSeenAt);

  const byId = new Map(projects.map((p) => [p.id, p]));
  const leadsOf = (p: (typeof projects)[number]) => [...new Set([p.ownerId, ...p.members.filter((m) => m.role === 'OWNER' || m.role === 'LEAD').map((m) => m.userId)])];
  const active = (p: (typeof projects)[number], id: string) => p.members.find((m) => m.userId === id)?.user.status === 'ACTIVE' || id === p.ownerId;

  // ---- open tasks nobody is moving ----
  for (const t of tasks) {
    const p = byId.get(t.projectId);
    if (!p || !t.assigneeId || !active(p, t.assigneeId)) continue;
    const last = Math.max(t.updatedAt.getTime(), t.createdAt.getTime(), lastWork.get(`${t.assigneeId}|${t.projectId}`) ?? 0);
    const idle = Math.floor((now - last) / DAY);
    if (idle < settings.stalledAfterDays) continue;
    summary.tasks++;
    const who = p.members.find((m) => m.userId === t.assigneeId)?.user.fullName ?? 'The assignee';
    if (await tell(t.assigneeId, `Reminder: "${t.title}" has not moved`, `Your task "${t.title}" in ${p.name} has had no progress for ${idle} days. Please update it, or mark it blocked and say why.`, p.id)) summary.reminded++;
    for (const lead of leadsOf(p).filter((l) => l !== t.assigneeId)) {
      if (await tell(lead, `Stalled: ${who} - "${t.title}"`, `${who} has made no progress on "${t.title}" in ${p.name} for ${idle} days.`, p.id)) summary.leadsTold++;
    }
    if (idle >= settings.stalledAfterDays + settings.escalateAfterDays) {
      for (const a of admins.filter((x) => x !== t.assigneeId && !leadsOf(p).includes(x))) {
        if (await tell(a, `Escalation: ${who} - "${t.title}"`, `${who} has made no progress on "${t.title}" in ${p.name} for ${idle} days. The project lead was told ${settings.escalateAfterDays} or more days ago.`, p.id)) summary.escalated++;
      }
    }
  }

  // ---- people given a project who never started it ----
  for (const p of projects) {
    for (const m of p.members) {
      if (!(TEAM_ROLES as readonly string[]).includes(m.role) || m.acceptedAt || m.user.status !== 'ACTIVE') continue;
      const idle = Math.floor((now - m.assignedAt.getTime()) / DAY);
      if (idle < settings.notStartedAfterDays) continue;
      summary.notStarted++;
      if (await tell(m.userId, `Reminder: start "${p.name}"`, `You were added to ${p.name} ${idle} days ago and have not started it yet. Open My Assignments and press Start project.`, p.id)) summary.reminded++;
      for (const lead of leadsOf(p).filter((l) => l !== m.userId)) {
        if (await tell(lead, `Not started: ${m.user.fullName} - "${p.name}"`, `${m.user.fullName} was added to ${p.name} ${idle} days ago and has not started it.`, p.id)) summary.leadsTold++;
      }
      if (idle >= settings.notStartedAfterDays + settings.escalateAfterDays) {
        for (const a of admins.filter((x) => x !== m.userId && !leadsOf(p).includes(x))) {
          if (await tell(a, `Escalation: ${m.user.fullName} has not started "${p.name}"`, `${m.user.fullName} was added to ${p.name} ${idle} days ago and still has not started it.`, p.id)) summary.escalated++;
        }
      }
    }
  }
  return finish(app, summary);
}

async function finish(app: FastifyInstance, s: StalledSummary): Promise<StalledSummary> {
  const text = `${s.tasks} stalled task(s), ${s.notStarted} not-started assignment(s); ${s.reminded} reminder(s), ${s.leadsTold} lead notice(s), ${s.escalated} admin alert(s)`;
  await app.prisma.reminderSettings.update({ where: { id: 'default' }, data: { lastRunAt: new Date(), lastSummary: text } });
  return s;
}

// Looks every half hour; the real check runs about once a day
export function startStalledJob(app: FastifyInstance) {
  const tick = async () => {
    try {
      const s = await getReminderSettings(app);
      if (!s.enabled) return;
      if (s.lastRunAt && Date.now() - s.lastRunAt.getTime() < 20 * 3600_000) return;
      const r = await runStalledCheck(app, 'schedule');
      if (r) app.log.info(r, 'stalled-work check done');
    } catch (e) {
      app.log.warn({ err: e }, 'stalled-work check failed');
    }
  };
  setInterval(tick, 30 * 60_000).unref();
  setTimeout(tick, 2 * 60_000).unref();
}
