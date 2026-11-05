// End-to-end test. Needs the local API, web app and database (see tests/README.md). Run with: node e2e/run.mjs <name>
import { API_URL, WEB_URL, API_ORIGIN, CHROME, DB_URL, API_PKG, ADMIN_EMAIL, ADMIN_PASSWORD, TMP, ROOT } from './config.mjs';
import { join as joinPath } from 'path';
import puppeteer from 'puppeteer-core';
import { createHmac } from 'crypto';
import { createRequire } from 'module';
const req = createRequire(API_PKG);
const { PrismaClient } = req('@prisma/client');
const db = new PrismaClient({ datasources: { db: { url: DB_URL } } });
const API = API_URL, WEB = WEB_URL, FILES = API_ORIGIN;
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
const old = (await db.profile.findMany({ where: { email: { endsWith: '@test.local' } }, select: { id: true } })).map((u) => u.id);
await db.workSession.deleteMany({ where: { userId: { in: old } } });
await db.project.deleteMany({ where: { OR: [{ createdById: { in: old } }, { ownerId: { in: old } }] } }); await db.profile.deleteMany({ where: { id: { in: old } } });
await db.profile.updateMany({ where: { email: ADMIN_EMAIL }, data: { totpEnabled: false, totpSecretEnc: null, recoveryCodeHashes: [] } });
await db.workSettings.deleteMany({});
const sa = await login(ADMIN_EMAIL, ADMIN_PASSWORD);
const PW = 'Svw-Test-Pass-2026';
const ids = {};
for (const k of ['lead', 'a']) ids[k] = (await call('POST', '/users', { email: `${k}@test.local`, fullName: `Person ${k}`, role: 'USER', authType: 'PASSWORD', password: PW }, sa.token)).body.data.id;
const S = {}; for (const k of Object.keys(ids)) S[k] = await login(`${k}@test.local`, PW);
const pid = (await call('POST', '/projects', { name: 'SVW project', ownerId: ids.lead, priority: 'LOW', memberIds: [ids.a] }, S.lead.token)).body.data.id;
const task = async (title, who) => (await call('POST', `/projects/${pid}/tasks`, { title, assigneeId: who, priority: 'LOW' }, S.lead.token)).body.data.id;
const t1 = await task('Review the firewall rules', ids.a), t2 = await task('Patch the DLP server', ids.a);
// a finished session and a document of a's, to point to
const up = (await call('POST', `/projects/${pid}/documents/upload-url`, { name: 'fw-report.pdf', category: 'OTHER' }, S.a.token)).body.data;
await fetch(FILES + up.uploadUrl, { method: 'PUT', body: Buffer.from('%PDF-1.4 x') });
await call('POST', `/projects/${pid}/documents`, { name: 'fw-report.pdf', category: 'OTHER', storageKey: up.storageKey, size: 10, mimeType: 'application/pdf' }, S.a.token);
const ses = (await call('POST', `/projects/${pid}/work/start`, { surface: 'monitor', linkLabel: 'Firewall console', linkUrl: 'https://fw.example.com' }, S.a.token)).body.data.id;
await call('POST', `/projects/${pid}/work/${ses}/stop`, null, S.a.token);

const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new' });
const mk = async (sess) => { const ctx = await browser.createBrowserContext(); const p = await ctx.newPage(); await p.setViewport({ width: 1500, height: 1100 }); const errs = []; p.on('pageerror', (e) => errs.push(e.message.slice(0, 100))); await p.goto(WEB + '/login', { waitUntil: 'domcontentloaded' }); await p.evaluate((t, u) => { localStorage.setItem('dbi_auth_token', t); localStorage.setItem('dbi_user', JSON.stringify(u)); }, sess.token, sess.user); return { p, errs }; };
const text = (p) => p.evaluate(() => document.body.innerText);
const click = async (p, re, sel = 'button', root = 'body') => { const h = await p.evaluateHandle((s, r, rt) => [...document.querySelector(rt).querySelectorAll(s)].find((b) => new RegExp(r, 'i').test(b.textContent.trim()) && !b.disabled), sel, re.source, root); const el = h.asElement(); if (!el) return false; await el.evaluate((e) => e.scrollIntoView({ block: 'center' })); await wait(150); const bb = await el.boundingBox(); await p.mouse.click(bb.x + bb.width / 2, bb.y + bb.height / 2); return true; };
const clickRow = async (p, title, re) => { const h = await p.evaluateHandle((t, r) => { const row = [...document.querySelectorAll('div')].find((d) => d.className.includes('bg-dbi-elevated/60') && d.textContent.includes(t)); return row ? [...row.querySelectorAll('button')].find((b) => new RegExp(r, 'i').test(b.textContent.trim() || b.getAttribute('aria-label') || '')) : null; }, title, re.source); const el = h.asElement(); if (!el) return false; await el.evaluate((e) => e.scrollIntoView({ block: 'center' })); await wait(150); const bb = await el.boundingBox(); await p.mouse.click(bb.x + bb.width / 2, bb.y + bb.height / 2); return true; };
const openWork = async (p) => { await p.goto(WEB + `/projects/${pid}`, { waitUntil: 'load' }); await wait(2500); await click(p, /^Tasks & Milestones$/, 'button[role=tab]'); await wait(1800); };
const row = (p, title) => p.evaluate((t) => { const r = [...document.querySelectorAll('div')].find((d) => d.className.includes('bg-dbi-elevated/60') && d.textContent.includes(t)); return r ? r.innerText.replace(/\s+/g, ' ') : ''; }, title);
const typeIn = async (p, sel, v) => { await p.click(sel); await p.keyboard.type(v); };

// ---------- the assignee ----------
const U = await mk(S.a); await openWork(U.p);
let r1 = await row(U.p, 'Review the firewall rules');
ok('the assignee sees To do and a Submit for review button, no Verify', /Submit for review/.test(r1) && !/Verify/.test(r1) && /Blocked\?/.test(r1), r1.slice(0, 120));
ok('the status list has no Done and no In review option', await U.p.evaluate(() => [...document.querySelectorAll('select[aria-label="Task status"]')].every((s) => [...s.options].map((o) => o.value).join() === 'TODO,IN_PROGRESS')));
// Submit: the button stays off until there is a summary
await clickRow(U.p, 'Review the firewall rules', /Submit for review/); await wait(2500);
let dlg = await text(U.p);
ok('the submit dialog lists my work session and my document', /Submit "Review the firewall rules" for verification/.test(dlg) && /Work session/.test(dlg) && /fw-report\.pdf/.test(dlg), dlg.replace(/\s+/g,' ').slice(-400));
ok('Submit is disabled until something is written', await U.p.evaluate(() => [...document.querySelectorAll('[role=dialog] button')].find((b) => /^Submit for verification$/.test(b.textContent.trim()))?.disabled));
await typeIn(U.p, '#submit-summary', 'Reviewed all 42 rules, removed 3 unused ones, report attached.'); await wait(300);
await click(U.p, /^Submit for verification$/, 'button', '[role=dialog]'); await wait(1500);
dlg = await text(U.p);
ok('without proof the server says so and the dialog stays open', /Add at least one proof/.test(dlg), '');
await U.p.evaluate(() => { const l = [...document.querySelectorAll('[role=dialog] label')].find((x) => /fw-report\.pdf/.test(x.textContent)); l?.querySelector('input')?.click(); }); await wait(300);
await click(U.p, /^Submit for verification$/, 'button', '[role=dialog]'); await wait(2500);
r1 = await row(U.p, 'Review the firewall rules');
ok('the task now says Waiting for verification and has no Submit button', /Waiting for verification/.test(r1) && !/Submit for review/.test(r1), r1.slice(0, 160));

// ---------- the lead ----------
const L = await mk(S.lead); await openWork(L.p);
let t = await text(L.p);
ok('the lead sees a banner that one task waits for them', /1 task\(s\) are waiting for your verification/.test(t));
await clickRow(L.p, 'Review the firewall rules', /^Verify$/); await wait(1800);
dlg = await text(L.p);
ok('the verify dialog shows what was written and the proof', /Reviewed all 42 rules/.test(dlg) && /fw-report\.pdf/.test(dlg) && /Proof \(1\)/.test(dlg));
ok('Send back is off without a note; Approve is on', await L.p.evaluate(() => { const b = [...document.querySelectorAll('[role=dialog] button')]; return b.find((x) => /^Send back$/.test(x.textContent.trim()))?.disabled && !b.find((x) => /^Approve/.test(x.textContent.trim()))?.disabled; }));
const href = await L.p.$$eval('[role=dialog] a', (as) => as.map((a) => a.getAttribute('href')));
ok('the document in the proof opens in a new tab (/open)', href.some((h) => /\/documents\/.+\/open$/.test(h)), href.join());
await typeIn(L.p, '#verify-note', 'Please add a screenshot of the final rule list.'); await wait(300);
await click(L.p, /^Send back$/, 'button', '[role=dialog]'); await wait(2500);
// ---------- sent back, then done ----------
await openWork(U.p);
r1 = await row(U.p, 'Review the firewall rules');
ok('the assignee sees it was sent back with the reason', /Sent back by Person lead: Please add a screenshot/.test(r1) && /Submit for review/.test(r1), r1.slice(0, 200));
await clickRow(U.p, 'Review the firewall rules', /Submit for review/); await wait(1500);
await typeIn(U.p, '#submit-summary', 'Added the screenshot of the final rule list.'); await wait(200);
await U.p.evaluate(() => { const l = [...document.querySelectorAll('[role=dialog] label')].find((x) => /fw-report\.pdf/.test(x.textContent)); l?.querySelector('input')?.click(); }); await wait(300);
await click(U.p, /^Submit for verification$/, 'button', '[role=dialog]'); await wait(2500);
await openWork(L.p);
await clickRow(L.p, 'Review the firewall rules', /^Verify$/); await wait(1800);
await click(L.p, /^Approve/, 'button', '[role=dialog]'); await wait(2500);
r1 = await row(L.p, 'Review the firewall rules');
ok('the lead approves: Done (verified) with the time', /Done \(verified\)/.test(r1) && /verified \d{2} \w{3} \d{4}/.test(r1), r1.slice(0, 200));
const proj = (await call('GET', `/projects/${pid}`, null, sa.token)).body.data;
ok('the project percentage follows (1 of 2 = 50%)', proj.progress === 50, String(proj.progress));
// history
await clickRow(L.p, 'Review the firewall rules', /History of/); await wait(1800);
dlg = await text(L.p);
ok('the history lists submit, send back, submit, verified with who and when', /Submitted for verification/.test(dlg) && /Sent back for changes/.test(dlg) && /Verified: done/.test(dlg) && /Person lead · \d{2} \w{3} \d{4}/.test(dlg), dlg.replace(/\s+/g, ' ').slice(-450));
await L.p.keyboard.press('Escape'); await wait(500);

// ---------- blocked ----------
await openWork(U.p);
await clickRow(U.p, 'Patch the DLP server', /Blocked\?/); await wait(1500);
ok('Mark as blocked is off until a reason is written', await U.p.evaluate(() => [...document.querySelectorAll('[role=dialog] button')].find((b) => /^Mark as blocked$/.test(b.textContent.trim()))?.disabled));
await typeIn(U.p, 'textarea[aria-label="Why is it blocked"]', 'The DLP server password has not been shared with me.'); await wait(300);
await click(U.p, /^Mark as blocked$/, 'button', '[role=dialog]'); await wait(2500);
r1 = await row(U.p, 'Patch the DLP server');
ok('the task shows Blocked and the reason, with an Unblock button', /Blocked/.test(r1) && /password has not been shared/.test(r1) && /Unblock/.test(r1), r1.slice(0, 200));
ok('the lead was told', (await db.notification.count({ where: { userId: ids.lead, type: 'TASK_BLOCKED' } })) === 1);
await clickRow(U.p, 'Patch the DLP server', /^Unblock$/); await wait(2000);
r1 = await row(U.p, 'Patch the DLP server');
ok('Unblock puts it back In progress', !/Blocked:/.test(r1) && /Submit for review/.test(r1));

// ---------- the edit form no longer offers Done ----------
await clickRow(U.p, 'Patch the DLP server', /Edit Patch/); await wait(1500);
const opts = await U.p.$$eval('#task-status option', (os) => os.map((o) => o.value));
ok('the edit form offers only To do and In progress', opts.join() === 'TODO,IN_PROGRESS', opts.join());
await U.p.keyboard.press('Escape'); await wait(500);

// ---------- admin switch ----------
const AD = await mk(sa);
await AD.p.goto(WEB + '/reminders', { waitUntil: 'load' }); await wait(2500);
t = await text(AD.p);
ok('the admin page has the "proof when submitting" card set to Required', /Tasks: proof when submitting/.test(t) && /Required/.test(t));
await AD.p.click('#task-evidence'); await wait(1500);
ok('turning it off is saved', (await call('GET', '/admin/work-settings', null, sa.token)).body.data.requireTaskEvidence === false);
await AD.p.click('#task-evidence'); await wait(1500);
ok('and on again', (await call('GET', '/admin/work-settings', null, sa.token)).body.data.requireTaskEvidence === true);
ok('no page crashes', U.errs.length === 0 && L.errs.length === 0 && AD.errs.length === 0, [...U.errs, ...L.errs, ...AD.errs].join(' ; '));

await browser.close();
await call('DELETE', `/projects/${pid}`, null, sa.token);
const us = (await db.profile.findMany({ where: { email: { endsWith: '@test.local' } }, select: { id: true } })).map((u) => u.id);
await db.workSession.deleteMany({ where: { userId: { in: us } } });
await db.project.deleteMany({ where: { OR: [{ createdById: { in: us } }, { ownerId: { in: us } }] } });
await db.notification.deleteMany({ where: { type: { in: ['TASK_SUBMITTED', 'TASK_VERIFIED', 'TASK_REJECTED', 'TASK_BLOCKED'] } } });
await db.profile.deleteMany({ where: { id: { in: us } } });
await db.workSettings.deleteMany({});
await db.$disconnect();
console.log(`\n${res.filter(Boolean).length}/${res.length} passed`);
