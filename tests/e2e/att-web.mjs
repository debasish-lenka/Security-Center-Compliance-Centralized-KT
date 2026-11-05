// End-to-end test. Needs the local API, web app and database (see tests/README.md). Run with: node e2e/run.mjs <name>
import { API_URL, WEB_URL, API_ORIGIN, CHROME, DB_URL, API_PKG, ADMIN_EMAIL, ADMIN_PASSWORD, TMP, ROOT } from './config.mjs';
import { join as joinPath } from 'path';
import puppeteer from 'puppeteer-core';
import { createHmac } from 'crypto';
import { createRequire } from 'module';
const req = createRequire(API_PKG);
const { PrismaClient } = req('@prisma/client');
const db = new PrismaClient({ datasources: { db: { url: DB_URL } } });
const API = API_URL, WEB = WEB_URL;
const A = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
const b32 = (s) => { let bits = 0, v = 0; const o = []; for (const c of s) { v = (v << 5) | A.indexOf(c); bits += 5; if (bits >= 8) { o.push((v >>> (bits - 8)) & 255); bits -= 8; } } return Buffer.from(o); };
const totp = (secret) => { const m = Buffer.alloc(8); m.writeBigUInt64BE(BigInt(Math.floor(Date.now() / 30000))); const h = createHmac('sha1', b32(secret)).update(m).digest(); const o = h[h.length - 1] & 15; return String((((h[o] & 127) << 24) | (h[o + 1] << 16) | (h[o + 2] << 8) | h[o + 3]) % 1e6).padStart(6, '0'); };
const call = async (m, p, b, t) => { const r = await fetch(API + p, { method: m, headers: { ...(b ? { 'content-type': 'application/json' } : {}), ...(t ? { authorization: 'Bearer ' + t } : {}) }, body: b ? JSON.stringify(b) : undefined }); return { status: r.status, body: await r.json().catch(() => ({})) }; };
const wait = (ms) => new Promise((x) => setTimeout(x, ms));
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
const PW = 'Atw-Test-Pass-2026';
const ids = {};
for (const k of ['lead', 'a', 'b', 'c', 'leaver', 'newbie']) ids[k] = (await call('POST', '/users', { email: `${k}@test.local`, fullName: `Person ${k}`, role: 'USER', authType: 'PASSWORD', password: PW }, sa.token)).body.data.id;
const S = {}; for (const k of Object.keys(ids)) S[k] = await login(`${k}@test.local`, PW);
const pid = (await call('POST', '/projects', { name: 'ATW project', ownerId: ids.lead, priority: 'LOW', memberIds: [ids.a, ids.b, ids.c, ids.leaver] }, S.lead.token)).body.data.id;
for (const k of ['a', 'b', 'leaver']) await call('POST', `/projects/${pid}/start`, null, S[k].token);
const T = (p) => `/projects/${pid}/tasks${p}`;
const mk = async (title, who, due) => (await call('POST', T(''), { title, assigneeId: who, priority: 'LOW', ...(due ? { dueDate: due } : {}) }, S.lead.token)).body.data.id;
const t1 = await mk('Waiting task', ids.a), t2 = await mk('Blocked task', ids.b), t3 = await mk('Overdue task', ids.c, '2026-10-01'), t5 = await mk('Leaver task', ids.leaver);
await call('PUT', '/admin/work-settings', { requireTaskEvidence: false }, sa.token);
await call('POST', T(`/${t1}/submit`), { summary: 'All finished, please check it.', evidence: [] }, S.a.token);
await call('POST', T(`/${t2}/block`), { reason: 'Waiting for the vendor to send the licence.' }, S.b.token);
const old = new Date(Date.now() - 10 * 86400000);
await db.$executeRaw`UPDATE project_members SET "assignedAt" = ${old} WHERE "projectId" = ${pid} AND "userId" = ${ids.c}`;

const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new' });
const mkp = async (sess) => { const ctx = await browser.createBrowserContext(); const p = await ctx.newPage(); await p.setViewport({ width: 1500, height: 1200 }); const errs = []; p.on('pageerror', (e) => errs.push(e.message.slice(0, 100))); await p.goto(WEB + '/login', { waitUntil: 'domcontentloaded' }); await p.evaluate((t, u) => { localStorage.setItem('dbi_auth_token', t); localStorage.setItem('dbi_user', JSON.stringify(u)); }, sess.token, sess.user); return { p, errs }; };
const text = (p) => p.evaluate(() => document.body.innerText);
const clickIn = async (p, scope, re, root = 'body') => { const h = await p.evaluateHandle((sc, r, rt) => { const els = [...document.querySelector(rt).querySelectorAll('div,li')].filter((d) => d.className.toString().includes('bg-dbi-elevated/60') && d.textContent.includes(sc)); const row = els[els.length - 1]; return row ? [...row.querySelectorAll('button,a')].find((b) => new RegExp(r, 'i').test((b.textContent.trim() || b.getAttribute('aria-label') || ''))) : null; }, scope, re.source, root); const el = h.asElement(); if (!el) return false; await el.evaluate((e) => e.scrollIntoView({ block: 'center' })); await wait(150); const bb = await el.boundingBox(); await p.mouse.click(bb.x + bb.width / 2, bb.y + bb.height / 2); return true; };
const clickBtn = async (p, re, root = 'body') => { const h = await p.evaluateHandle((r, rt) => [...document.querySelector(rt).querySelectorAll('button')].find((b) => new RegExp(r, 'i').test(b.textContent.trim()) && !b.disabled), re.source, root); const el = h.asElement(); if (!el) return false; await el.evaluate((e) => e.scrollIntoView({ block: 'center' })); await wait(150); const bb = await el.boundingBox(); await p.mouse.click(bb.x + bb.width / 2, bb.y + bb.height / 2); return true; };

// ---------- the lead ----------
const L = await mkp(S.lead);
await L.p.goto(WEB + '/assignments', { waitUntil: 'load' }); await wait(2500);
ok('the sidebar has "Needs attention"', await L.p.evaluate(() => [...document.querySelectorAll('nav a')].some((a) => a.textContent.trim() === 'Needs attention')));
await L.p.goto(WEB + '/attention', { waitUntil: 'load' }); await wait(3000);
let t = await text(L.p);
ok('the page shows the counts per kind', /Waiting for your verification: 1/.test(t) && /Overdue: 1/.test(t) && /Blocked: 1/.test(t) && /Has not started the project: 1/.test(t), t.slice(t.indexOf('Waiting'), t.indexOf('Waiting') + 160).replace(/\n/g, ' '));
ok('each kind has its own list with the project and the person', /Waiting task/.test(t) && /Person a/.test(t) && /Overdue task/.test(t) && /Person c/.test(t) && /ATW project/.test(t));
ok('the blocked task shows why', /Waiting for the vendor to send the licence/.test(t));
const verifyHref = await L.p.evaluate(() => [...document.querySelectorAll('a')].find((a) => /Verify/.test(a.textContent))?.getAttribute('href'));
ok('Verify goes straight to the project\'s tasks tab', new RegExp(`/projects/${pid}\\?tab=work`).test(verifyHref ?? ''), verifyHref);
// remind
await clickIn(L.p, 'Overdue task', /Remind/); await wait(1500);
t = await text(L.p);
ok('Remind sends it', /Reminder sent/.test(t), '');
ok('c really got it', (await db.notification.count({ where: { userId: ids.c, type: 'WORK_NUDGE' } })) === 1);
await clickIn(L.p, 'Overdue task', /Remind/); await wait(1500);
ok('the same reminder again is refused with a reason', /already sent in the last 24 hours/.test(await text(L.p)));
// give the blocked task to someone else
await clickIn(L.p, 'Blocked task', /Give to someone else/); await wait(1500);
ok('the dialog lists the other people on the project', await L.p.evaluate(() => { const s = document.querySelector('select[aria-label="Give the task to"]'); const o = s ? [...s.options].map((x) => x.textContent) : []; return o.some((x) => /Person a/.test(x)) && !o.some((x) => /Person b/.test(x)); }));
await L.p.select('select[aria-label="Give the task to"]', ids.a); await wait(300);
await clickBtn(L.p, /^Give the task$/, '[role=dialog]'); await wait(2500);
t = await text(L.p);
ok('the blocked task leaves the Blocked list', /Blocked: 0/.test(t) || !/Waiting for the vendor/.test(t), '');
const moved = await db.task.findUnique({ where: { id: t2 }, select: { assigneeId: true, status: true, blockedReason: true } });
ok('it is now a To do task of a, with no block', moved.assigneeId === ids.a && moved.status === 'TODO' && moved.blockedReason === null);
// the project's task page: verify button and reassign icon
await L.p.goto(WEB + verifyHref, { waitUntil: 'load' }); await wait(3000);
t = await text(L.p);
ok('the link opens the Tasks tab with the Verify button', /Tasks \(|Waiting task/.test(t) && /Verify/.test(t));
ok('open tasks have a "Give to someone else" button; the waiting one has none', await L.p.evaluate(() => { const rows = [...document.querySelectorAll('div')].filter((d) => d.className.toString().includes('bg-dbi-elevated/60')); const has = (title) => !!rows.find((r) => r.textContent.includes(title))?.querySelector('button[aria-label^="Give "]'); return has('Overdue task') && has('Leaver task') && !has('Waiting task'); }));
await clickIn(L.p, 'Overdue task', /Give Overdue task/); await wait(1500);
ok('the same dialog opens from the task row', /Give "Overdue task" to someone else/.test(await text(L.p)));
await L.p.keyboard.press('Escape'); await wait(500);

// ---------- a contributor ----------
const U = await mkp(S.a);
await U.p.goto(WEB + '/attention', { waitUntil: 'load' }); await wait(2500);
ok('a contributor sees an empty list', /Nothing needs your attention right now/.test(await text(U.p)));

// ---------- the admin hands over a leaving person's work ----------
const AD = await mkp(sa);
await AD.p.goto(WEB + `/users/${ids.leaver}`, { waitUntil: 'load' }); await wait(3000);
ok('the user page has a "Hand over work" button', await clickBtn(AD.p, /Hand over work/)); await wait(2000);
t = await text(AD.p);
ok('the dialog shows what would move', /Hand over the work of Person leaver/.test(t) && /1\s*open task/.test(t) && /Leaver task/.test(t));
ok('"Hand over" is off until a person is chosen', await AD.p.evaluate(() => [...document.querySelectorAll('[role=dialog] button')].find((b) => /^Hand over$/.test(b.textContent.trim()))?.disabled));
await AD.p.select('#handover-to', ids.newbie); await wait(300);
await clickBtn(AD.p, /^Hand over$/, '[role=dialog]'); await wait(3000);
t = await text(AD.p);
ok('it says what was handed over', /Work handed over/.test(t));
const lt = await db.task.findUnique({ where: { id: t5 }, select: { assigneeId: true } });
ok("the task is newbie's now", lt.assigneeId === ids.newbie);
ok('no page crashes', L.errs.length === 0 && U.errs.length === 0 && AD.errs.length === 0, [...L.errs, ...U.errs, ...AD.errs].join(' ; '));

await browser.close();
await clean();
await db.workSettings.deleteMany({}); await db.reminderSettings.deleteMany({});
await db.$disconnect();
console.log(`\n${res.filter(Boolean).length}/${res.length} passed`);
