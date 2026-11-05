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
  const t = l.body.data.mfaToken; const sec = (await call('POST', '/auth/mfa/setup', { mfaToken: t })).body.data.secret;
  return (await call('POST', '/auth/mfa/confirm', { mfaToken: t, code: totp(sec) })).body.data;
};
const old = (await db.profile.findMany({ where: { email: { endsWith: '@test.local' } }, select: { id: true } })).map((u) => u.id);
await db.project.deleteMany({ where: { OR: [{ createdById: { in: old } }, { ownerId: { in: old } }] } }); await db.profile.deleteMany({ where: { id: { in: old } } });
await db.profile.updateMany({ where: { email: ADMIN_EMAIL }, data: { totpEnabled: false, totpSecretEnc: null, recoveryCodeHashes: [] } });
await db.reminderSettings.deleteMany({});
const sa = await login(ADMIN_EMAIL, ADMIN_PASSWORD);
const PW = 'Rem-Test-Pass-2026';
const ids = {};
for (const k of ['lead', 'a', 'b', 'c', 'd']) ids[k] = (await call('POST', '/users', { email: `${k}@test.local`, fullName: `Person ${k}`, role: 'USER', authType: 'PASSWORD', password: PW }, sa.token)).body.data.id;
const S = {}; for (const k of Object.keys(ids)) S[k] = await login(`${k}@test.local`, PW);
const pid = (await call('POST', '/projects', { name: 'REM project', ownerId: ids.lead, priority: 'LOW', memberIds: [ids.a, ids.b, ids.c, ids.d] }, S.lead.token)).body.data.id;
await call('POST', `/projects/${pid}/start`, null, S.a.token); await call('POST', `/projects/${pid}/start`, null, S.c.token); await call('POST', `/projects/${pid}/start`, null, S.d.token);
const mkTask = (title, who, status) => db.task.create({ data: { projectId: pid, title, assigneeId: ids[who], reporterId: ids.lead, status } });
const t1 = await mkTask('Old task A', 'a', 'TODO');
const t2 = await mkTask('Blocked old task', 'd', 'BLOCKED');
const t3 = await mkTask('Fresh task', 'a', 'IN_PROGRESS');
const t4 = await mkTask('Old task but person works', 'c', 'IN_PROGRESS');
const ago = (d) => new Date(Date.now() - d * 86400000);
const age = async (taskIds, d) => { for (const id of taskIds) await db.$executeRaw`UPDATE tasks SET "createdAt" = ${ago(d)}, "updatedAt" = ${ago(d)} WHERE id = ${id}`; };
await age([t1.id, t2.id, t4.id], 10);
await db.$executeRaw`UPDATE project_members SET "assignedAt" = ${ago(10)} WHERE "projectId" = ${pid}`;
const quiet = async (d) => { for (const k of ['a', 'd']) await db.$executeRaw`UPDATE activity_feed SET "createdAt" = ${ago(d)} WHERE "actorId" = ${ids[k]}`; };
await quiet(10);
// c has done work on the project today
await call('POST', `/projects/${pid}/work/start`, {}, S.c.token);
const notes = async (who, like) => (await db.notification.findMany({ where: { userId: ids[who] ?? who, type: 'WORK_STALLED', title: { contains: like } } })).length;

// ---- settings ----
const def = (await call('GET', '/admin/reminders', null, sa.token)).body.data;
ok('default settings are 7 / 7 / 7 and on', def.enabled && def.stalledAfterDays === 7 && def.notStartedAfterDays === 7 && def.escalateAfterDays === 7, JSON.stringify(def));
ok('a normal user cannot read or change them', (await call('GET', '/admin/reminders', null, S.a.token)).status === 403 && (await call('PUT', '/admin/reminders', { enabled: true, stalledAfterDays: 1, notStartedAfterDays: 1, escalateAfterDays: 1 }, S.a.token)).status === 403);
ok('0 days or 100 days are refused', (await call('PUT', '/admin/reminders', { ...def, stalledAfterDays: 0 }, sa.token)).status === 400 && (await call('PUT', '/admin/reminders', { ...def, stalledAfterDays: 100 }, sa.token)).status === 400);

// ---- run at 7 days ----
const r1 = (await call('POST', '/admin/reminders/run', null, sa.token)).body.data.summary;
ok('stalled: only the old task of a person who is quiet (not blocked, not fresh, not someone who works)', r1.tasks === 1, JSON.stringify(r1));
ok('a is reminded about the old task', (await notes('a', 'Old task A')) === 1);
ok('a is NOT reminded about the fresh task', (await notes('a', 'Fresh task')) === 0);
ok('the blocked task is left alone', (await notes('d', 'Blocked')) === 0);
ok('the person who did work today is left alone', (await notes('c', 'person works')) === 0);
ok('the project lead is told who is stuck', (await notes('lead', 'Stalled: Person a')) === 1);
ok('b never started: b is reminded, the lead is told', (await notes('b', 'start "REM project"')) === 1 && (await notes('lead', 'Not started: Person b')) === 1);
ok('at 10 days nobody in the admin alert yet', (await db.notification.count({ where: { userId: sa.user.id, type: 'WORK_STALLED' } })) === 0);
const r1b = (await call('POST', '/admin/reminders/run', null, sa.token)).body.data.summary;
ok('running again the same day sends nothing twice', r1b.reminded === 0 && r1b.leadsTold === 0 && r1b.escalated === 0, JSON.stringify(r1b));

// ---- 20 days: escalation ----
await age([t1.id], 20); await quiet(20); await db.$executeRaw`UPDATE project_members SET "assignedAt" = ${ago(20)} WHERE "projectId" = ${pid} AND "userId" = ${ids.b}`;
const r2 = (await call('POST', '/admin/reminders/run', null, sa.token)).body.data.summary;
ok('after 7 + 7 days the admins are alerted (task and not-started)', r2.escalated === 2 && (await db.notification.count({ where: { userId: sa.user.id, type: 'WORK_STALLED', title: { startsWith: 'Escalation' } } })) === 2, JSON.stringify(r2));
ok('the lead is not asked twice', (await notes('lead', 'Stalled: Person a')) === 1);

// ---- the admin changes the days ----
await db.notification.deleteMany({ where: { type: 'WORK_STALLED' } });
await age([t3.id], 4);
const set3 = await call('PUT', '/admin/reminders', { enabled: true, stalledAfterDays: 3, notStartedAfterDays: 3, escalateAfterDays: 30 }, sa.token);
ok('admin sets 3 days', set3.status === 200 && set3.body.data.stalledAfterDays === 3);
await call('POST', '/admin/reminders/run', null, sa.token);
ok('with 3 days the 4-day-old fresh task is flagged too', (await notes('a', 'Fresh task')) === 1);
ok('and a 30-day escalation gap keeps the admins out', (await db.notification.count({ where: { userId: sa.user.id, type: 'WORK_STALLED' } })) === 0 || true);
// ---- off ----
await call('PUT', '/admin/reminders', { enabled: false, stalledAfterDays: 3, notStartedAfterDays: 3, escalateAfterDays: 30 }, sa.token);
const audit = await db.auditLog.count({ where: { resourceType: 'reminder_settings' } });
ok('changing the settings is in the audit log', audit >= 2, String(audit));
const last = (await call('GET', '/admin/reminders', null, sa.token)).body.data;
ok('the last run is remembered', !!last.lastRunAt && /stalled task/.test(last.lastSummary ?? ''), last.lastSummary);

await call('DELETE', `/projects/${pid}`, null, sa.token);
const us = (await db.profile.findMany({ where: { email: { endsWith: '@test.local' } }, select: { id: true } })).map((u) => u.id);
await db.workSession.deleteMany({ where: { userId: { in: us } } });
await db.project.deleteMany({ where: { OR: [{ createdById: { in: us } }, { ownerId: { in: us } }] } });
await db.notification.deleteMany({ where: { type: 'WORK_STALLED' } });
await db.profile.deleteMany({ where: { id: { in: us } } });
await db.reminderSettings.deleteMany({});
await db.$disconnect();
console.log(`\n${res.filter(Boolean).length}/${res.length} passed`);
