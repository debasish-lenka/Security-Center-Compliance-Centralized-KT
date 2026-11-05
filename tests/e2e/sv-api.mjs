// End-to-end test. Needs the local API, web app and database (see tests/README.md). Run with: node e2e/run.mjs <name>
import { API_URL, WEB_URL, API_ORIGIN, CHROME, DB_URL, API_PKG, ADMIN_EMAIL, ADMIN_PASSWORD, TMP, ROOT } from './config.mjs';
import { join as joinPath } from 'path';
import { createHmac } from 'crypto';
import { createRequire } from 'module';
const req = createRequire(API_PKG);
const { PrismaClient } = req('@prisma/client');
const db = new PrismaClient({ datasources: { db: { url: DB_URL } } });
const API = API_URL, FILES = API_ORIGIN;
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
const old = (await db.profile.findMany({ where: { email: { endsWith: '@test.local' } }, select: { id: true } })).map((u) => u.id);
await db.workSession.deleteMany({ where: { userId: { in: old } } });
await db.project.deleteMany({ where: { OR: [{ createdById: { in: old } }, { ownerId: { in: old } }] } }); await db.profile.deleteMany({ where: { id: { in: old } } });
await db.profile.updateMany({ where: { email: ADMIN_EMAIL }, data: { totpEnabled: false, totpSecretEnc: null, recoveryCodeHashes: [] } });
await db.workSettings.deleteMany({}); await db.reminderSettings.deleteMany({});
const sa = await login(ADMIN_EMAIL, ADMIN_PASSWORD);
const PW = 'Sv-Test-Pass-2026';
const ids = {};
for (const k of ['lead', 'lead2', 'a', 'b', 'out']) ids[k] = (await call('POST', '/users', { email: `${k}@test.local`, fullName: `Person ${k}`, role: 'USER', authType: 'PASSWORD', password: PW }, sa.token)).body.data.id;
const S = {}; for (const k of Object.keys(ids)) S[k] = await login(`${k}@test.local`, PW);
const pid = (await call('POST', '/projects', { name: 'SV project', ownerId: ids.lead, managerId: ids.lead2, priority: 'LOW', memberIds: [ids.a, ids.b] }, S.lead.token)).body.data.id;
await call('POST', `/projects/${pid}/members`, { userId: sa.user.id, role: 'CONTRIBUTOR' }, sa.token);
const T = (p) => `/projects/${pid}/tasks${p}`;
const mk = async (title, who) => (await call('POST', T(''), { title, assigneeId: who, priority: 'LOW' }, S.lead.token)).body.data.id;
const t1 = await mk('Task one', ids.a), t2 = await mk('Task two', ids.a), t3 = await mk('Lead own task', ids.lead), t4 = await mk('Task four', ids.b), t5 = await mk('Admin own task', sa.user.id);
const list = async (tok) => (await call('GET', T('?limit=100'), null, tok)).body.data.items;

// ---- who sees what, and what they may do ----
const lead1 = await list(S.lead.token), a1 = await list(S.a.token), b1 = await list(S.b.token);
ok('the project owner sees all 5 tasks (they verify)', lead1.length === 5, String(lead1.length));
ok('a member sees only their own', a1.length === 2 && b1.length === 1);
const t1a = a1.find((t) => t.id === t1);
ok('the assignee may submit, move and block; not verify', t1a.can.submit && t1a.can.move && t1a.can.block && !t1a.can.verify && !t1a.can.unblock, JSON.stringify(t1a.can));
ok('the owner may block and move but not submit someone else\'s task', lead1.find((t) => t.id === t1).can.block && !lead1.find((t) => t.id === t1).can.submit);

// ---- no jumping to Done / Review by hand ----
ok('Done by hand is refused', (await call('PATCH', T(`/${t1}`), { status: 'DONE' }, S.a.token)).status === 409);
ok('Done by hand is refused for the owner too', (await call('PATCH', T(`/${t1}`), { status: 'DONE' }, S.lead.token)).status === 409);
ok('Review by hand is refused', (await call('PATCH', T(`/${t1}`), { status: 'REVIEW' }, S.a.token)).status === 409);
ok('Blocked by hand is refused (it needs a reason)', (await call('PATCH', T(`/${t1}`), { status: 'BLOCKED' }, S.a.token)).status === 409);
ok('To do -> In progress is still fine', (await call('PATCH', T(`/${t1}`), { status: 'IN_PROGRESS' }, S.a.token)).status === 200);

// ---- evidence ----
const upload = async (sess, name) => { const up = (await call('POST', `/projects/${pid}/documents/upload-url`, { name, category: 'OTHER' }, sess.token)).body.data; await fetch(FILES + up.uploadUrl, { method: 'PUT', body: Buffer.from('%PDF-1.4 x') }); return (await call('POST', `/projects/${pid}/documents`, { name, category: 'OTHER', storageKey: up.storageKey, size: 10, mimeType: 'application/pdf' }, sess.token)).body.data.id; };
const session = async (sess) => { const s = (await call('POST', `/projects/${pid}/work/start`, { surface: 'monitor' }, sess.token)).body.data.id; await call('POST', `/projects/${pid}/work/${s}/stop`, null, sess.token); return s; };
const docA = await upload(S.a, 'a-report.pdf'), docB = await upload(S.b, 'b-report.pdf');
const sesA = await session(S.a);
const opts = (await call('GET', T('/evidence-options'), null, S.a.token)).body.data;
ok('evidence options: my finished session and my document', opts.sessions.some((s) => s.id === sesA) && opts.documents.some((d) => d.id === docA) && !opts.documents.some((d) => d.id === docB));
const sub = (tok, id, body) => call('POST', T(`/${id}/submit`), body, tok);
ok('someone else cannot submit my task', (await sub(S.b.token, t1, { summary: 'I did it all by myself, honest.', evidence: [{ type: 'DOCUMENT', id: docB }] })).status === 403);
ok('a one-word summary is refused', (await sub(S.a.token, t1, { summary: 'done', evidence: [{ type: 'DOCUMENT', id: docA }] })).status === 400);
const noEv = await sub(S.a.token, t1, { summary: 'Finished the configuration review.', evidence: [] });
ok('no evidence: refused while evidence is required', noEv.status === 400 && noEv.body.error?.code === 'EVIDENCE_REQUIRED', JSON.stringify(noEv.body).slice(0, 90));
ok("someone else's document is not accepted as evidence", (await sub(S.a.token, t1, { summary: 'Finished the configuration review.', evidence: [{ type: 'DOCUMENT', id: docB }] })).body.error?.code === 'INVALID_EVIDENCE');
const ok1 = await sub(S.a.token, t1, { summary: 'Finished the configuration review; report attached.', evidence: [{ type: 'SESSION', id: sesA }, { type: 'DOCUMENT', id: docA }] });
ok('a submission with a work session and a document goes to review', ok1.status === 201 && ok1.body.data.status === 'REVIEW', JSON.stringify(ok1.body).slice(0, 80));
ok('submitting twice is refused', (await sub(S.a.token, t1, { summary: 'Finished the configuration review again.', evidence: [{ type: 'DOCUMENT', id: docA }] })).status === 409);
const leadNotes = await db.notification.findMany({ where: { userId: { in: [ids.lead, ids.lead2] }, type: 'TASK_SUBMITTED' } });
ok('the owner and the other lead are told', leadNotes.length === 2 && leadNotes.every((n) => /Task one/.test(n.message)));
ok('the submitter is not told about their own submission', (await db.notification.count({ where: { userId: ids.a, type: 'TASK_SUBMITTED' } })) === 0);
ok('the task shows In review with its latest note', (await list(S.lead.token)).find((t) => t.id === t1).latestReview?.kind === 'SUBMITTED');

// ---- verify ----
const ver = (tok, id, body) => call('POST', T(`/${id}/verify`), body, tok);
const own = await ver(S.a.token, t1, { decision: 'APPROVE' });
ok('nobody verifies their own task', own.status === 403 && /own task/.test(own.body.error?.message ?? ''));
ok('a contributor cannot verify', (await ver(S.b.token, t1, { decision: 'APPROVE' })).status === 403);
ok('sending back needs a reason', (await ver(S.lead.token, t1, { decision: 'REJECT' })).status === 400);
const rej = await ver(S.lead.token, t1, { decision: 'REJECT', note: 'The report has no screenshots of the final settings.' });
ok('the lead sends it back with a reason: back to In progress', rej.status === 200 && rej.body.data.status === 'IN_PROGRESS');
ok('the assignee is told why', (await db.notification.findFirst({ where: { userId: ids.a, type: 'TASK_REJECTED' } }))?.message.includes('no screenshots') === true);
ok('it is not Done and the project has 0% so far', (await list(S.a.token)).find((t) => t.id === t1).status === 'IN_PROGRESS' && (await call('GET', `/projects/${pid}`, null, sa.token)).body.data.progress === 0);
ok('after changes it can be submitted again', (await sub(S.a.token, t1, { summary: 'Added the screenshots of the final settings.', evidence: [{ type: 'DOCUMENT', id: docA }] })).status === 201);
const apr = await ver(S.lead2.token, t1, { decision: 'APPROVE', note: 'Looks right.' });
ok('the second lead approves: Done', apr.status === 200 && apr.body.data.status === 'DONE');
const done = (await list(S.lead.token)).find((t) => t.id === t1);
ok('Done has the time it was completed and verified', !!done.completedAt && !!done.verifiedAt);
const pj = (await call('GET', `/projects/${pid}`, null, sa.token)).body.data;
ok('the project percentage counts only the verified task (1 of 5 = 20%)', pj.progress === 20, String(pj.progress));
ok('the assignee is told it is verified', (await db.notification.count({ where: { userId: ids.a, type: 'TASK_VERIFIED' } })) === 1);

// ---- history ----
const hist = (await call('GET', T(`/${t1}/reviews`), null, S.a.token)).body.data.items;
ok('the history shows every step in order', hist.map((h) => h.kind).join() === 'SUBMITTED,CHANGES_REQUESTED,SUBMITTED,APPROVED', hist.map((h) => h.kind).join());
ok('a submission keeps what it pointed to', hist[0].evidence.some((e) => e.type === 'SESSION' && e.evidence) && hist[0].evidence.some((e) => e.type === 'DOCUMENT' && e.name === 'a-report.pdf'));
await db.workSession.update({ where: { id: sesA }, data: { toolCheck: 'NOT_SEEN', ocrChecked: 3, ocrSeen: 0 } });
const hist2 = (await call('GET', T(`/${t1}/reviews`), null, S.a.token)).body.data.items;
const liveSes = hist2[0].evidence.find((e) => e.type === 'SESSION');
ok("the proof shows the session's CURRENT tool check, not the one at submit time", liveSes.toolCheck === 'NOT_SEEN' && liveSes.ocrChecked === 3 && liveSes.ocrSeen === 0, JSON.stringify([liveSes.toolCheck, liveSes.ocrChecked]));
ok('history names the people', hist[1].by === 'Person lead' && hist[3].by === 'Person lead2');
ok('someone outside cannot read the history', (await call('GET', T(`/${t1}/reviews`), null, S.out.token)).status === 403);
ok('a member who is not involved cannot read it either', (await call('GET', T(`/${t4}/reviews`), null, S.a.token)).status === 403);

// ---- own tasks of leads and admins ----
const docL = await upload(S.lead, 'lead-report.pdf');
ok('the owner submits their own task', (await sub(S.lead.token, t3, { summary: 'My own part is finished, see the report.', evidence: [{ type: 'DOCUMENT', id: docL }] })).status === 201);
ok('...but cannot verify it', (await ver(S.lead.token, t3, { decision: 'APPROVE' })).status === 403);
ok('another lead can', (await ver(S.lead2.token, t3, { decision: 'APPROVE' })).status === 200);
const docS = await upload(sa, 'admin-report.pdf');
ok('a super admin submits their own task', (await sub(sa.token, t5, { summary: 'Admin task is finished, see the report.', evidence: [{ type: 'DOCUMENT', id: docS }] })).status === 201);
ok('a super admin may verify their own, and it is marked', (await ver(sa.token, t5, { decision: 'APPROVE' })).status === 200 && (await db.taskReview.findFirst({ where: { taskId: t5, kind: 'APPROVED' } }))?.selfVerified === true);

// ---- blocked ----
const blk = (tok, id, body) => call('POST', T(`/${id}/block`), body, tok);
ok('blocking needs a real reason', (await blk(S.b.token, t4, { reason: 'no' })).status === 400);
ok("another member cannot block someone's task", (await blk(S.a.token, t4, { reason: 'because I say so, my friend' })).status === 403);
const b1r = await blk(S.b.token, t4, { reason: 'No access to the Cisco dashboard yet.' });
ok('the assignee blocks with a reason', b1r.status === 201);
ok('the leads are told what blocks it', (await db.notification.count({ where: { userId: ids.lead, type: 'TASK_BLOCKED' } })) === 1);
const bt = (await list(S.lead.token)).find((t) => t.id === t4);
ok('the reason is shown on the task', bt.status === 'BLOCKED' && bt.blockedReason === 'No access to the Cisco dashboard yet.' && bt.can.unblock);
ok('a blocked task cannot be pushed on by hand', (await call('PATCH', T(`/${t4}`), { status: 'IN_PROGRESS' }, S.b.token)).status === 409);
ok('it is unblocked with the Unblock step', (await call('POST', T(`/${t4}/unblock`), {}, S.b.token)).status === 200 && (await list(S.b.token))[0].status === 'IN_PROGRESS');

// ---- admin switch ----
ok('a normal user cannot change the evidence rule', (await call('PUT', '/admin/work-settings', { requireTaskEvidence: false }, S.a.token)).status === 403);
ok('an admin turns the evidence rule off', (await call('PUT', '/admin/work-settings', { requireTaskEvidence: false }, sa.token)).body.data.requireTaskEvidence === false);
ok('then a summary alone is enough', (await sub(S.a.token, t2, { summary: 'Done, nothing to attach this time.', evidence: [] })).status === 201);
await call('PUT', '/admin/work-settings', { requireTaskEvidence: true }, sa.token);

// ---- waiting for verification reminders ----
const old8 = new Date(Date.now() - 8 * 86400000);
await db.task.update({ where: { id: t2 }, data: { submittedAt: old8 } });
await db.notification.deleteMany({ where: { type: 'WORK_STALLED' } });
const run = await call('POST', '/admin/reminders/run', null, sa.token);
const lt = await db.notification.findMany({ where: { type: 'WORK_STALLED', title: { startsWith: 'Verify:' } } });
ok('a task waiting 8 days for verification reminds the leads', lt.some((n) => n.userId === ids.lead) && lt.some((n) => n.userId === ids.lead2), JSON.stringify(run.body.data?.summary));
ok('...and does not nag the person who is waiting', (await db.notification.count({ where: { userId: ids.a, type: 'WORK_STALLED' } })) === 0);

await call('DELETE', `/projects/${pid}`, null, sa.token);
const us = (await db.profile.findMany({ where: { email: { endsWith: '@test.local' } }, select: { id: true } })).map((u) => u.id);
await db.workSession.deleteMany({ where: { userId: { in: us } } });
await db.project.deleteMany({ where: { OR: [{ createdById: { in: us } }, { ownerId: { in: us } }] } });
await db.notification.deleteMany({ where: { type: { in: ['WORK_STALLED', 'TASK_SUBMITTED', 'TASK_VERIFIED', 'TASK_REJECTED', 'TASK_BLOCKED'] } } });
await db.profile.deleteMany({ where: { id: { in: us } } });
await db.workSettings.deleteMany({}); await db.reminderSettings.deleteMany({});
await db.$disconnect();
console.log(`\n${res.filter(Boolean).length}/${res.length} passed`);
