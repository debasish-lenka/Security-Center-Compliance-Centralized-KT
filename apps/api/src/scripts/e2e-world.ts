/* eslint-disable no-console */
// A small throw-away "world" for end-to-end testing with several people:
//   3 test users (Test Member, Test Lead, Test Newbie), one project "TWO USER TEST" with 3 tasks,
//   and one finished work session of Test Member to use as proof.
// Everything is marked: users end in @test.local and the project has a fixed name, so `clean` removes only these.
//
//   docker compose exec -T api node dist/scripts/e2e-world.js seed     (creates it, prints the password once)
//   docker compose exec -T api node dist/scripts/e2e-world.js clean    (removes it again)
import { randomBytes } from 'crypto';
import argon2 from 'argon2';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const PROJECT = 'TWO USER TEST';
const PEOPLE = [
  { key: 'member', fullName: 'Test Member', email: 'test.member@test.local' },
  { key: 'lead', fullName: 'Test Lead', email: 'test.lead@test.local' },
  { key: 'newbie', fullName: 'Test Newbie', email: 'test.newbie@test.local' },
] as const;

async function clean() {
  const users = await prisma.profile.findMany({ where: { email: { endsWith: '@test.local' } }, select: { id: true, email: true } });
  const ids = users.map((u) => u.id);
  await prisma.project.deleteMany({ where: { name: PROJECT } });
  await prisma.workSession.deleteMany({ where: { userId: { in: ids } } });
  await prisma.notification.deleteMany({ where: { userId: { in: ids } } });
  const left: string[] = [];
  for (const u of users) {
    try { await prisma.profile.delete({ where: { id: u.id } }); }
    catch {
      // it has history we must keep (audit log...): switch the account off instead
      await prisma.profile.update({ where: { id: u.id }, data: { status: 'INACTIVE', sessionsValidFrom: new Date() } });
      left.push(u.email);
    }
  }
  console.log(`Removed the project "${PROJECT}" and ${users.length - left.length} test user(s).`);
  if (left.length) console.log(`Switched off (they have history that is kept): ${left.join(', ')}`);
}

async function seed() {
  await clean();
  const password = `Tt-${randomBytes(6).toString('hex')}-9X`;
  const passwordHash = await argon2.hash(password, { type: argon2.argon2id, memoryCost: 2 ** 16, timeCost: 3, parallelism: 1 });
  const u: Record<string, string> = {};
  for (const p of PEOPLE) {
    u[p.key] = (await prisma.profile.create({ data: { email: p.email, fullName: p.fullName, passwordHash, role: 'USER', status: 'ACTIVE', authProvider: 'LOCAL' }, select: { id: true } })).id;
  }
  const project = await prisma.project.create({
    data: {
      name: PROJECT, description: 'Throw-away project for testing with several people. Safe to delete.', priority: 'LOW', status: 'NOT_STARTED',
      createdById: u.lead, ownerId: u.lead,
    },
  });
  await prisma.projectMember.create({ data: { projectId: project.id, userId: u.lead, role: 'OWNER', assignedBy: u.lead, acceptedAt: new Date() } });
  await prisma.projectMember.create({ data: { projectId: project.id, userId: u.member, role: 'CONTRIBUTOR', assignedBy: u.lead } });
  await prisma.projectMember.create({ data: { projectId: project.id, userId: u.newbie, role: 'CONTRIBUTOR', assignedBy: u.lead } });
  const overdue = new Date(Date.now() - 30 * 86_400_000);
  await prisma.task.create({ data: { projectId: project.id, title: 'Member task 1', assigneeId: u.member, reporterId: u.lead, priority: 'LOW', status: 'TODO' } });
  await prisma.task.create({ data: { projectId: project.id, title: 'Member task 2', assigneeId: u.member, reporterId: u.lead, priority: 'LOW', status: 'TODO' } });
  await prisma.task.create({ data: { projectId: project.id, title: 'Overdue task', assigneeId: u.newbie, reporterId: u.lead, priority: 'LOW', status: 'TODO', dueDate: overdue } });
  // a finished work session of Test Member, to tick as proof when submitting
  const started = new Date(Date.now() - 70 * 60_000);
  const ended = new Date(Date.now() - 10 * 60_000);
  const session = await prisma.workSession.create({ data: { projectId: project.id, userId: u.member, startedAt: started, endedAt: ended, endReason: 'STOPPED', lastSeenAt: ended, shareStarts: 1, surface: 'monitor', linkLabel: 'Test console' } });
  await prisma.workEntry.create({ data: { sessionId: session.id, kind: 'EVENT', text: 'Started work, opened Test console', createdAt: started } });
  await prisma.workEntry.create({ data: { sessionId: session.id, kind: 'NOTE', text: 'Reviewed the settings in the test console.', createdAt: new Date(started.getTime() + 20 * 60_000) } });
  await prisma.workEntry.create({ data: { sessionId: session.id, kind: 'EVENT', text: 'Stopped work', createdAt: ended } });

  console.log('\nTest world created.\n');
  console.log(`  Project : ${PROJECT}   (owner Test Lead; members Test Member and Test Newbie; 3 tasks)`);
  for (const p of PEOPLE) console.log(`  ${p.fullName.padEnd(12)} ${p.email}`);
  console.log(`\n  Password for all three:  ${password}\n`);
  console.log('Remove it again with:  docker compose exec -T api node dist/scripts/e2e-world.js clean\n');
}

const cmd = process.argv[2];
(cmd === 'seed' ? seed() : cmd === 'clean' ? clean() : Promise.reject(new Error('Use: seed | clean')))
  .catch((e) => { console.error(String(e?.message ?? e)); process.exitCode = 1; })
  .finally(() => prisma.$disconnect());
