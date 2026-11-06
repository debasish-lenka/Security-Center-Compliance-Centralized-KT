// Dashboard: everything that names something can be clicked and opens it. Project page: upload a document from the Documents tab,
// and it shows up in the Document Vault under that project. Run with: node e2e/run.mjs dashboard-links
import puppeteer from 'puppeteer-core';
import { createHmac } from 'crypto';
import { writeFileSync } from 'fs';
import { join } from 'path';
import { createRequire } from 'module';
import { API_URL, WEB_URL, CHROME, DB_URL, API_PKG, ADMIN_EMAIL, ADMIN_PASSWORD, TMP } from './config.mjs';

const { PrismaClient } = createRequire(API_PKG)('@prisma/client');
const db = new PrismaClient(DB_URL ? { datasources: { db: { url: DB_URL } } } : undefined);
const A = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
const b32 = (s) => { let bits = 0, v = 0; const o = []; for (const c of s) { v = (v << 5) | A.indexOf(c); bits += 5; if (bits >= 8) { o.push((v >>> (bits - 8)) & 255); bits -= 8; } } return Buffer.from(o); };
const totp = (secret) => { const m = Buffer.alloc(8); m.writeBigUInt64BE(BigInt(Math.floor(Date.now() / 30000))); const h = createHmac('sha1', b32(secret)).update(m).digest(); const o = h[h.length - 1] & 15; return String((((h[o] & 127) << 24) | (h[o + 1] << 16) | (h[o + 2] << 8) | h[o + 3]) % 1e6).padStart(6, '0'); };
const call = async (m, p, b, t) => { const r = await fetch(API_URL + p, { method: m, headers: { ...(b ? { 'content-type': 'application/json' } : {}), ...(t ? { authorization: 'Bearer ' + t } : {}) }, body: b ? JSON.stringify(b) : undefined }); return { status: r.status, body: await r.json().catch(() => ({})) }; };
const wait = (ms) => new Promise((x) => setTimeout(x, ms));
const res = []; const ok = (n, c, x = '') => { res.push(c); console.log(`${c ? 'PASS' : 'FAIL'}  ${n} ${x}`); };

await db.profile.updateMany({ where: { email: ADMIN_EMAIL }, data: { totpEnabled: false, totpSecretEnc: null, recoveryCodeHashes: [] } });
const l = await call('POST', '/auth/login', { email: ADMIN_EMAIL, password: ADMIN_PASSWORD });
const mt = l.body.data.mfaToken; const sec = (await call('POST', '/auth/mfa/setup', { mfaToken: mt })).body.data.secret;
const sa = (await call('POST', '/auth/mfa/confirm', { mfaToken: mt, code: totp(sec) })).body.data;
const PNAME = 'DASH LINK test';
await db.project.deleteMany({ where: { name: PNAME } });
const pid = (await call('POST', '/projects', { name: PNAME, ownerId: sa.user.id, priority: 'HIGH', expectedCompletionDate: new Date(Date.now() + 3 * 86400000).toISOString().slice(0, 10) }, sa.token)).body.data.id;
const tk = (await call('POST', `/projects/${pid}/tasks`, { title: 'Link test task', assigneeId: sa.user.id, priority: 'LOW' }, sa.token)).body.data;

// ---- API: the recent activity says what, who, which project, and where to click ----
const dash = (await call('GET', '/executive/dashboard/metrics', null, sa.token)).body.data;
const act = (dash?.recentActivity ?? []).find((a) => a.itemName === 'Link test task');
ok('the recent activity names the task', !!act, JSON.stringify((dash?.recentActivity ?? []).slice(0, 2)).slice(0, 200));
ok('it names the project the task is in (not the task again)', act?.projectName === PNAME && act?.projectId === pid, `${act?.projectName}`);
ok('it carries a link to that project', act?.link === `/projects/${pid}`, `${act?.link}`);
ok('resource allocation rows carry the project id', (dash?.charts?.resourceAllocation ?? []).every((r) => r.projectId));

const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new' });
const ctx = await browser.createBrowserContext();
const p = await ctx.newPage();
await p.setViewport({ width: 1400, height: 1100 });
const errs = []; p.on('pageerror', (e) => errs.push(e.message.slice(0, 100)));
await p.goto(WEB_URL + '/login', { waitUntil: 'domcontentloaded' });
await p.evaluate((t, u) => { localStorage.setItem('dbi_auth_token', t); localStorage.setItem('dbi_user', JSON.stringify(u)); }, sa.token, sa.user);
const path = () => new URL(p.url()).pathname;
const openDash = async () => { await p.goto(WEB_URL + '/dashboard', { waitUntil: 'load' }); await p.waitForFunction(() => /Executive Dashboard/.test(document.body.innerText), { timeout: 15000 }).catch(() => {}); await wait(2000); };
const clickText = (sel, re, within) => p.evaluate((sel, re, within) => {
  const root = within ? [...document.querySelectorAll('div')].find((d) => d.querySelector('h1,h2,h3,[class*=CardTitle],p') && new RegExp(within).test((d.firstElementChild?.textContent ?? ''))) ?? document : document;
  const el = [...root.querySelectorAll(sel)].find((e) => new RegExp(re).test(e.textContent)); if (!el) return false; el.click(); return true;
}, sel, re, within);

// ---- KPI cards ----
for (const [title, to] of [['Active Projects', '/projects'], ['Pending KT Reports', '/kt-reports'], ['Compliance Score', '/compliance'], ['Avg Project Health', '/reports']]) {
  await openDash();
  const found = await p.evaluate((t) => { const el = [...document.querySelectorAll('[role=link]')].find((e) => e.textContent.includes(t)); if (!el) return false; el.click(); return true; }, title);
  await wait(1500);
  ok(`the "${title}" card opens ${to}`, found && path() === to, `(${path()})`);
}
await openDash();
ok('the cards can be reached with the keyboard', await p.evaluate(() => [...document.querySelectorAll('[role=link]')].filter((e) => e.tabIndex === 0).length >= 8));

// ---- project card, deadline, health overview, activity, alert ----
await openDash();
await p.evaluate((n) => { const el = [...document.querySelectorAll('div.cursor-pointer')].find((e) => e.textContent.includes(n)); el?.click(); }, PNAME); await wait(1500);
ok('clicking a project in the Projects list opens it', path() === `/projects/${pid}`, `(${path()})`);

await openDash();
const deadlineHref = await p.evaluate((n) => [...document.querySelectorAll('a')].filter((a) => a.textContent.includes(n)).map((a) => a.getAttribute('href')), PNAME);
ok('the project is a link in Upcoming Deadlines and Project Health (and in Projects)', deadlineHref.filter((h) => h === `/projects/${pid}`).length >= 2, JSON.stringify(deadlineHref));
const actHref = await p.evaluate(() => [...document.querySelectorAll('a')].filter((a) => /Link test task/.test(a.textContent)).map((a) => ({ href: a.getAttribute('href'), text: a.textContent.replace(/\s+/g, ' ').slice(0, 120) })));
ok('Recent Activity entries are links showing the task and the project', actHref.length > 0 && actHref[0].href === `/projects/${pid}` && actHref[0].text.includes(PNAME), JSON.stringify(actHref[0]));
await p.evaluate(() => [...document.querySelectorAll('a')].find((a) => /Link test task/.test(a.textContent))?.click()); await wait(1500);
ok('clicking a Recent Activity entry opens the project', path() === `/projects/${pid}`, `(${path()})`);

// ---- upload from the project's Documents tab ----
const openDocsTab = async () => {
  await p.goto(`${WEB_URL}/projects/${pid}`, { waitUntil: 'load' }); await wait(2500);
  const tab = (await p.evaluateHandle(() => [...document.querySelectorAll('button[role=tab]')].find((b) => /^Documents/.test(b.textContent.trim())))).asElement();
  const tb = await tab.boundingBox(); await p.mouse.click(tb.x + tb.width / 2, tb.y + tb.height / 2); await wait(2000);
};
await openDocsTab();
const hasBtn = await p.evaluate(() => [...document.querySelectorAll('button')].some((b) => /Upload Document/.test(b.textContent)));
ok('the Documents tab has an Upload Document button', hasBtn);
await p.evaluate(() => [...document.querySelectorAll('button')].find((b) => /Upload Document/.test(b.textContent))?.click()); await wait(1000);
const dlg = await p.evaluate(() => { const d = document.querySelector('[role=dialog]'); return d ? d.innerText : ''; });
ok('the dialog already shows the project (no project to choose)', dlg.includes(PNAME) && !/Select a project/.test(dlg));
const FILE = join(TMP, `dash-link-${Date.now()}.txt`); writeFileSync(FILE, 'notes for the dashboard link test\n');
const input = await p.$('#pu-file'); await input.uploadFile(FILE);
await p.evaluate(() => [...document.querySelectorAll('[role=dialog] button')].find((b) => b.type === 'submit')?.click()); await wait(3500);
const body = await p.evaluate(() => document.body.innerText);
const name = FILE.split(/[\\/]/).pop();
ok('the upload succeeds and the dialog closes', /Document uploaded successfully/.test(body) || !(await p.$('[role=dialog]')));
const row = await db.projectDocument.findFirst({ where: { projectId: pid, name } });
ok('the document is saved in that project', !!row);
await p.goto(WEB_URL + '/documents', { waitUntil: 'load' }); await wait(3000);
ok('the Document Vault lists it', (await p.evaluate(() => document.body.innerText)).includes(name));
ok('the project tab lists it under its uploader', (await (async () => { await openDocsTab(); return p.evaluate(() => document.body.innerText); })()).includes('1 documents'));
ok('no page crashes', errs.length === 0, errs.join(' ; '));
await browser.close();

await call('DELETE', `/projects/${pid}`, null, sa.token);
await db.project.deleteMany({ where: { name: PNAME } });
await db.$disconnect();
console.log(`\n${res.filter(Boolean).length}/${res.length} passed`);
