// End-to-end test. Needs the local API, web app and database (see tests/README.md). Run with: node e2e/run.mjs <name>
import { API_URL, WEB_URL, API_ORIGIN, CHROME, DB_URL, API_PKG, ADMIN_EMAIL, ADMIN_PASSWORD, TMP, ROOT } from './config.mjs';
import { join as joinPath } from 'path';
import { createHmac } from 'crypto';
import { createRequire } from 'module';
const req = createRequire(API_PKG);
const { PrismaClient } = req('@prisma/client');
const db = new PrismaClient({ datasources: { db: { url: DB_URL } } });
const API = API_URL;
const A = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
const b32 = (s) => { let bits = 0, v = 0; const o = []; for (const c of s) { v = (v << 5) | A.indexOf(c); bits += 5; if (bits >= 8) { o.push((v >>> (bits - 8)) & 255); bits -= 8; } } return Buffer.from(o); };
const totp = (secret) => { const m = Buffer.alloc(8); m.writeBigUInt64BE(BigInt(Math.floor(Date.now() / 30000))); const h = createHmac('sha1', b32(secret)).update(m).digest(); const o = h[h.length - 1] & 15; return String((((h[o] & 127) << 24) | (h[o + 1] << 16) | (h[o + 2] << 8) | h[o + 3]) % 1e6).padStart(6, '0'); };
const call = async (m, p, b, t) => { const r = await fetch(API + p, { method: m, headers: { ...(b ? { 'content-type': 'application/json' } : {}), ...(t ? { authorization: 'Bearer ' + t } : {}) }, body: b ? JSON.stringify(b) : undefined }); return { status: r.status, body: await r.json().catch(() => ({})) }; };
const res = []; const ok = (n, c, x = '') => { res.push(c); console.log(`${c ? 'PASS' : 'FAIL'}  ${n} ${x}`); };
const login = async (email, pw) => {
  const l = await call('POST', '/auth/login', { email, password: pw });
  if (l.body.data?.token) return l.body.data;
  const mt = l.body.data.mfaToken; const sec = (await call('POST', '/auth/mfa/setup', { mfaToken: mt })).body.data.secret;
  return (await call('POST', '/auth/mfa/confirm', { mfaToken: mt, code: totp(sec) })).body.data;
};
const clean = async () => {
  const us = (await db.profile.findMany({ where: { email: { endsWith: '@test.local' } }, select: { id: true } })).map((u) => u.id);
  await db.workSession.deleteMany({ where: { userId: { in: us } } });
  await db.project.deleteMany({ where: { OR: [{ createdById: { in: us } }, { ownerId: { in: us } }] } });
  await db.notification.deleteMany({ where: { userId: { in: us } } });
  await db.profile.deleteMany({ where: { id: { in: us } } });
};
await clean();
await db.profile.updateMany({ where: { email: ADMIN_EMAIL }, data: { totpEnabled: false, totpSecretEnc: null, recoveryCodeHashes: [] } });
await db.workSettings.deleteMany({}); await db.reminderSettings.deleteMany({});
const sa = await login(ADMIN_EMAIL, ADMIN_PASSWORD);
const PW = 'Att-Test-Pass-2026';
const ids = {};
for (const [k, role] of [['lead', 'USER'], ['lead2', 'USER'], ['a', 'USER'], ['b', 'USER'], ['c', 'USER'], ['out', 'USER'], ['leaver', 'USER'], ['newbie', 'USER'], ['viewer', 'VIEWER']]) ids[k] = (await call('POST', '/users', { email: `${k}@test.local`, fullName: `Person ${k}`, role, authType: 'PASSWORD', password: PW }, sa.token)).body.data.id;
const S = {}; for (const k of Object.keys(ids)) S[k] = await login(`${k}@test.local`, PW);
const pid = (await call('POST', '/projects', { name: 'ATT project', ownerId: ids.lead, managerId: ids.lead2, priority: 'LOW', memberIds: [ids.a, ids.b, ids.c, ids.leaver] }, S.lead.token)).body.data.id;
await call('POST', `/projects/${pid}/start`, null, S.a.token); await call('POST', `/projects/${pid}/start`, null, S.b.token); await call('POST', `/projects/${pid}/start`, null, S.leaver.token);
const T = (p) => `/projects/${pid}/tasks${p}`;
const mk = async (title, who, due) => (await call('POST', T(''), { title, assigneeId: who, priority: 'LOW', ...(due ? { dueDate: due } : {}) }, S.lead.token)).body.data.id;
const t1 = await mk('Waiting task', ids.a), t2 = await mk('Blocked task', ids.b), t3 = await mk('Overdue task', ids.c, '2026-10-01'), t4 = await mk('Stalled task', ids.a), t5 = await mk('Leaver ATT task', ids.leaver);
await call('PUT', '/admin/work-settings', { requireTaskEvidence: false }, sa.token);
await call('POST', T(`/${t1}/submit`), { summary: 'All finished, please check it.', evidence: [] }, S.a.token);
await call('POST', T(`/${t2}/block`), { reason: 'Waiting for the vendor to send the licence.' }, S.b.token);
const old = new Date(Date.now() - 10 * 86400000);
await db.$executeRaw`UPDATE tasks SET "createdAt" = ${old}, "updatedAt" = ${old} WHERE id = ${t4}`;
await db.$executeRaw`UPDATE activity_feed SET "createdAt" = ${old} WHERE "actorId" = ${ids.a} AND "projectId" = ${pid}`;
await db.$executeRaw`UPDATE project_members SET "assignedAt" = ${old} WHERE "projectId" = ${pid} AND "userId" = ${ids.c}`;

// ---- the list ----
const att = (await call('GET', '/attention', null, S.lead.token)).body.data;
const kinds = att.items.map((i) => i.kind);
ok('the lead sees one task waiting for verification', att.counts.WAITING_VERIFICATION === 1);
ok('one overdue task, one blocked task, one stalled task', att.counts.OVERDUE === 1 && att.counts.BLOCKED === 1 && att.counts.STALLED >= 1, JSON.stringify(att.counts));
ok('one person who never started the project', att.counts.NOT_STARTED === 1 && att.items.find((i) => i.kind === 'NOT_STARTED').personName === 'Person c');
ok('waiting for verification is listed first', kinds[0] === 'WAITING_VERIFICATION', kinds.join());
const blocked = att.items.find((i) => i.kind === 'BLOCKED');
ok('the blocked task carries its reason and who is stuck', blocked.detail === 'Waiting for the vendor to send the licence.' && blocked.personName === 'Person b');
ok('the lead can verify the waiting task, and cannot nudge it', att.items.find((i) => i.kind === 'WAITING_VERIFICATION').canVerify === true && att.items.find((i) => i.kind === 'WAITING_VERIFICATION').canNudge === false);
ok('overdue shows how many days late', att.items.find((i) => i.kind === 'OVERDUE').days >= 30);
ok('a contributor sees nothing (they are not a lead)', (await call('GET', '/attention', null, S.a.token)).body.data.items.length === 0);
ok('the other lead sees the same list', (await call('GET', '/attention', null, S.lead2.token)).body.data.counts.total === att.counts.total);
ok('an admin sees it too', (await call('GET', '/attention', null, sa.token)).body.data.items.some((i) => i.projectId === pid));
ok('a person outside the project sees nothing', (await call('GET', '/attention', null, S.out.token)).body.data.items.length === 0);

// ---- nudge ----
const nud = (tok, body) => call('POST', '/attention/nudge', body, tok);
ok('the lead reminds c about the overdue task', (await nud(S.lead.token, { userId: ids.c, projectId: pid, taskId: t3 })).status === 201);
const got = await db.notification.findFirst({ where: { userId: ids.c, type: 'WORK_NUDGE' } });
ok('c receives it and it says who asks and what', /Person lead is asking about "Overdue task"/.test(got?.message ?? ''), got?.message);
ok('the same reminder twice in a day is refused', (await nud(S.lead.token, { userId: ids.c, projectId: pid, taskId: t3 })).status === 429);
ok('a reminder to start the project is a different subject', (await nud(S.lead.token, { userId: ids.c, projectId: pid })).status === 201);
ok('a contributor cannot send reminders', (await nud(S.a.token, { userId: ids.c, projectId: pid, taskId: t3 })).status === 403);
ok('not to yourself', (await nud(S.lead.token, { userId: ids.lead, projectId: pid })).status === 400);
ok('not to someone outside the project', (await nud(S.lead.token, { userId: ids.out, projectId: pid })).status === 400);
ok("not about a task that is not the person's", (await nud(S.lead.token, { userId: ids.c, projectId: pid, taskId: t4 })).status === 400);
ok('not about a blocked or waiting task', (await nud(S.lead.token, { userId: ids.b, projectId: pid, taskId: t2 })).status === 400);

// ---- reassign ----
const lt = (await call('GET', T('?limit=100'), null, S.lead.token)).body.data.items;
ok('the lead may reassign open and blocked tasks, not the waiting one', lt.find((t) => t.id === t4).can.reassign && lt.find((t) => t.id === t2).can.reassign && !lt.find((t) => t.id === t1).can.reassign);
const at = (await call('GET', T('?limit=100'), null, S.a.token)).body.data.items;
ok('the assignee may not reassign', at.every((t) => !t.can.reassign));
ok('the assignee cannot give their task away', (await call('PATCH', T(`/${t4}`), { assigneeId: ids.b }, S.a.token)).status === 403);
ok('a waiting task cannot be reassigned', (await call('PATCH', T(`/${t1}`), { assigneeId: ids.b }, S.lead.token)).status === 409);
ok('not to someone outside the project', (await call('PATCH', T(`/${t4}`), { assigneeId: ids.out }, S.lead.token)).status === 400);
const re = await call('PATCH', T(`/${t4}`), { assigneeId: ids.b }, S.lead.token);
ok('the lead gives the stalled task to b', re.status === 200 && re.body.data.assigneeId === ids.b);
const hist = await db.taskReview.findMany({ where: { taskId: t4 } });
ok('the history says from whom to whom', hist.some((h) => h.kind === 'REASSIGNED' && /Person a to Person b/.test(h.note ?? '')), JSON.stringify(hist.map((h) => h.note)));
ok('b is told it was given, a is told it moved', (await db.notification.count({ where: { userId: ids.b, type: 'TASK_REASSIGNED' } })) === 1 && (await db.notification.count({ where: { userId: ids.a, type: 'TASK_REASSIGNED' } })) === 1);
const re2 = await call('PATCH', T(`/${t2}`), { assigneeId: ids.c }, S.lead.token);
ok('a blocked task given to someone else starts again as To do, without the old block', re2.status === 200 && re2.body.data.status === 'TODO' && re2.body.data.blockedReason === null);
ok('editing without changing the person is still fine', (await call('PATCH', T(`/${t4}`), { title: 'Stalled task renamed', assigneeId: ids.b }, S.b.token)).status === 200);

// ---- hand over a leaving person's work ----
const pid2 = (await call('POST', '/projects', { name: 'ATT owned by leaver', ownerId: ids.leaver, priority: 'LOW', memberIds: [ids.a] }, S.leaver.token)).body.data.id;
const l2 = (await call('POST', `/projects/${pid2}/tasks`, { title: 'Leaver own task', assigneeId: ids.leaver, priority: 'LOW' }, S.leaver.token)).body.data.id;
ok('a lead cannot see the handover preview (admins only)', (await call('GET', `/users/${ids.leaver}/handover-preview`, null, S.lead.token)).status === 403);
const prev = (await call('GET', `/users/${ids.leaver}/handover-preview`, null, sa.token)).body.data;
ok('the preview counts the open tasks and the owned project', prev.openTasks === 2 && prev.ownedProjects.length === 1 && prev.ownedProjects[0].name === 'ATT owned by leaver', JSON.stringify([prev.openTasks, prev.ownedProjects.length]));
ok('not to themselves', (await call('POST', `/users/${ids.leaver}/handover`, { toUserId: ids.leaver }, sa.token)).status === 400);
ok('not to a viewer', (await call('POST', `/users/${ids.leaver}/handover`, { toUserId: ids.viewer }, sa.token)).status === 400);
ok('a lead cannot hand over', (await call('POST', `/users/${ids.leaver}/handover`, { toUserId: ids.newbie }, S.lead.token)).status === 403);
const ho = await call('POST', `/users/${ids.leaver}/handover`, { toUserId: ids.newbie, includeProjects: true }, sa.token);
ok('the admin hands the work to newbie', ho.status === 200 && ho.body.data.tasks === 2 && ho.body.data.ownedProjects === 1, JSON.stringify(ho.body.data));
const tl = await db.task.findMany({ where: { id: { in: [t5, l2] } }, select: { assigneeId: true } });
ok("both open tasks are newbie's now", tl.every((t) => t.assigneeId === ids.newbie));
const pj = await db.project.findUnique({ where: { id: pid2 }, select: { ownerId: true } });
const mem = await db.projectMember.findMany({ where: { projectId: pid2 }, select: { userId: true, role: true } });
ok('newbie owns the project; the leaver stays on as a contributor', pj.ownerId === ids.newbie && mem.find((m) => m.userId === ids.newbie)?.role === 'OWNER' && mem.find((m) => m.userId === ids.leaver)?.role === 'CONTRIBUTOR', JSON.stringify(mem.map((m) => m.role)));
ok('newbie was added to the other project too, as a contributor', (await db.projectMember.findUnique({ where: { projectId_userId: { projectId: pid, userId: ids.newbie } } }))?.role === 'CONTRIBUTOR');
ok("each task's history records the handover", (await db.taskReview.count({ where: { taskId: { in: [t5, l2] }, kind: 'REASSIGNED' } })) === 2);
ok('newbie is told', (await db.notification.findFirst({ where: { userId: ids.newbie, type: 'TASK_REASSIGNED' } }))?.message.includes('2 open task(s)') === true);
ok('the handover is in the audit log', (await db.auditLog.count({ where: { resourceType: 'user', resourceId: ids.leaver } })) >= 1);
ok('newbie can now see and manage the project as owner', (await call('GET', `/projects/${pid2}`, null, S.newbie.token)).status === 200 && (await call('GET', '/attention', null, S.newbie.token)).body.data.items !== undefined);

await clean();
await db.workSettings.deleteMany({}); await db.reminderSettings.deleteMany({});
await db.$disconnect();
console.log(`\n${res.filter(Boolean).length}/${res.length} passed`);
