import type { FastifyInstance } from 'fastify';

// When someone leaves (or changes role) their open work goes to somebody else, in one step and on the record.
// - open tasks (to do / in progress / blocked) move to the new person; a blocked one starts again as "to do"
// - tasks waiting for verification stay with the person who submitted them (a lead still verifies them)
// - projects they own go to the new person, who becomes the owner; the old owner stays on as a contributor
// - projects they only lead get the new person as lead too

const OPEN = ['TODO', 'IN_PROGRESS', 'BLOCKED'] as const;
const LIVE = ['NOT_STARTED', 'ONGOING', 'AT_RISK', 'OVERDUE', 'ON_HOLD'] as const;

export async function previewHandover(app: FastifyInstance, fromId: string) {
  const [tasks, waiting, owned, led] = await Promise.all([
    app.prisma.task.findMany({ where: { assigneeId: fromId, status: { in: [...OPEN] }, project: { status: { in: [...LIVE] } } }, select: { id: true, title: true, project: { select: { name: true } } }, take: 200 }),
    app.prisma.task.count({ where: { assigneeId: fromId, status: 'REVIEW' } }),
    app.prisma.project.findMany({ where: { ownerId: fromId, status: { in: [...LIVE] } }, select: { id: true, name: true } }),
    app.prisma.projectMember.findMany({ where: { userId: fromId, role: 'LEAD', project: { status: { in: [...LIVE] }, ownerId: { not: fromId } } }, select: { project: { select: { id: true, name: true } } } }),
  ]);
  return {
    openTasks: tasks.length,
    tasks: tasks.slice(0, 20).map((t) => ({ id: t.id, title: t.title, project: t.project.name })),
    tasksWaitingVerification: waiting,
    ownedProjects: owned,
    ledProjects: led.map((l) => l.project),
  };
}

export async function handOver(app: FastifyInstance, opts: { fromId: string; toId: string; actorId: string; includeProjects: boolean }) {
  const { fromId, toId, actorId, includeProjects } = opts;
  const [from, to] = await Promise.all([
    app.prisma.profile.findUnique({ where: { id: fromId }, select: { fullName: true } }),
    app.prisma.profile.findUnique({ where: { id: toId }, select: { fullName: true } }),
  ]);
  const tasks = await app.prisma.task.findMany({ where: { assigneeId: fromId, status: { in: [...OPEN] }, project: { status: { in: [...LIVE] } } }, select: { id: true, projectId: true, status: true } });
  const owned = includeProjects ? await app.prisma.project.findMany({ where: { ownerId: fromId, status: { in: [...LIVE] } }, select: { id: true } }) : [];
  const led = includeProjects ? await app.prisma.projectMember.findMany({ where: { userId: fromId, role: 'LEAD', project: { status: { in: [...LIVE] }, ownerId: { not: fromId } } }, select: { projectId: true } }) : [];

  const ensureMember = async (tx: any, projectId: string, role: string, upgrade: boolean) => {
    const m = await tx.projectMember.findUnique({ where: { projectId_userId: { projectId, userId: toId } } });
    if (!m) await tx.projectMember.create({ data: { projectId, userId: toId, role, assignedBy: actorId } });
    else if (upgrade && m.role !== 'OWNER' && !(role === 'LEAD' && m.role === 'LEAD')) await tx.projectMember.update({ where: { id: m.id }, data: { role } });
  };
  const demote = (tx: any, projectId: string) => tx.projectMember.updateMany({ where: { projectId, userId: fromId, role: { in: ['OWNER', 'LEAD'] } }, data: { role: 'CONTRIBUTOR' } });

  await app.prisma.$transaction(async (tx) => {
    for (const projectId of new Set(tasks.map((t) => t.projectId))) await ensureMember(tx, projectId, 'CONTRIBUTOR', false);
    for (const t of tasks) {
      await tx.task.update({ where: { id: t.id }, data: { assigneeId: toId, ...(t.status === 'BLOCKED' ? { status: 'TODO', blockedReason: null } : {}) } });
      await tx.taskReview.create({ data: { taskId: t.id, kind: 'REASSIGNED', actorId, note: `Handed over from ${from?.fullName} to ${to?.fullName}: ${from?.fullName} is leaving the work.` } });
    }
    for (const p of owned) {
      await tx.project.update({ where: { id: p.id }, data: { ownerId: toId } });
      await ensureMember(tx, p.id, 'OWNER', true);
      await tx.projectMember.updateMany({ where: { projectId: p.id, userId: toId }, data: { role: 'OWNER' } });
      await demote(tx, p.id);
    }
    for (const l of led) {
      await ensureMember(tx, l.projectId, 'LEAD', true);
      await demote(tx, l.projectId);
    }
  }, { timeout: 30_000 });

  const summary = { tasks: tasks.length, ownedProjects: owned.length, ledProjects: led.length };
  await app.prisma.notification.create({
    data: {
      userId: toId, type: 'TASK_REASSIGNED', title: 'Work handed over to you',
      message: `${from?.fullName} is leaving the work. ${summary.tasks} open task(s), ${summary.ownedProjects} project(s) as owner and ${summary.ledProjects} as lead are now yours.`,
      resourceType: 'project', resourceId: owned[0]?.id ?? led[0]?.projectId ?? tasks[0]?.projectId ?? null,
    },
  });
  return { ...summary, from: from?.fullName ?? '', to: to?.fullName ?? '' };
}
