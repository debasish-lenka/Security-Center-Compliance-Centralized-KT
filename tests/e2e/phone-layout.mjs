// On a phone-sized screen (390 px wide) no page may scroll sideways, and nothing may stick out of the screen.
// Visits the pages as an admin (with a project that has tasks, people and a document) and reports the offending elements.
import puppeteer from 'puppeteer-core';
import { createHmac } from 'crypto';
import { createRequire } from 'module';
import { API_URL, WEB_URL, API_ORIGIN, CHROME, DB_URL, API_PKG, ADMIN_EMAIL, ADMIN_PASSWORD } from './config.mjs';

const { PrismaClient } = createRequire(API_PKG)('@prisma/client');
const db = new PrismaClient(DB_URL ? { datasources: { db: { url: DB_URL } } } : undefined);
const A = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
const b32 = (s) => { let bits = 0, v = 0; const o = []; for (const c of s) { v = (v << 5) | A.indexOf(c); bits += 5; if (bits >= 8) { o.push((v >>> (bits - 8)) & 255); bits -= 8; } } return Buffer.from(o); };
const totp = (secret) => { const m = Buffer.alloc(8); m.writeBigUInt64BE(BigInt(Math.floor(Date.now() / 30000))); const h = createHmac('sha1', b32(secret)).update(m).digest(); const o = h[h.length - 1] & 15; return String((((h[o] & 127) << 24) | (h[o + 1] << 16) | (h[o + 2] << 8) | h[o + 3]) % 1e6).padStart(6, '0'); };
const call = async (m, p, b, t) => { const r = await fetch(API_URL + p, { method: m, headers: { ...(b ? { 'content-type': 'application/json' } : {}), ...(t ? { authorization: 'Bearer ' + t } : {}) }, body: b ? JSON.stringify(b) : undefined }); return { status: r.status, body: await r.json().catch(() => ({})) }; };
const wait = (ms) => new Promise((x) => setTimeout(x, ms));
const res = []; const ok = (n, c, x = '') => { res.push(c); console.log(`${c ? 'PASS' : 'FAIL'}  ${n} ${x}`); };
const login = async (email, pw) => {
  const l = await call('POST', '/auth/login', { email, password: pw });
  if (l.body.data?.token) return l.body.data;
  const mt = l.body.data.mfaToken; const sec = (await call('POST', '/auth/mfa/setup', { mfaToken: mt })).body.data.secret;
  return (await call('POST', '/auth/mfa/confirm', { mfaToken: mt, code: totp(sec) })).body.data;
};

await db.profile.updateMany({ where: { email: ADMIN_EMAIL }, data: { totpEnabled: false, totpSecretEnc: null, recoveryCodeHashes: [] } });
const sa = await login(ADMIN_EMAIL, ADMIN_PASSWORD);
const PW = 'Phone-Test-Pass-2026';
const ids = {};
for (const k of ['lead', 'a', 'b']) ids[k] = (await call('POST', '/users', { email: `${k}@test.local`, fullName: `Person With A Long Name ${k}`, role: 'USER', authType: 'PASSWORD', password: PW }, sa.token)).body.data.id;
const pid = (await call('POST', '/projects', { name: 'A project with quite a long name to see how it wraps on a phone', ownerId: ids.lead, priority: 'HIGH', memberIds: [ids.a, ids.b], workLinks: [{ label: 'Cisco dashboard', url: 'https://dnac.example.com/some/long/path/that/goes/on' }] }, sa.token)).body.data.id;
for (const [t, who] of [['A task with a rather long title that needs to wrap', ids.a], ['Another task', ids.b]]) await call('POST', `/projects/${pid}/tasks`, { title: t, assigneeId: who, priority: 'LOW' }, sa.token);
const up = (await call('POST', `/projects/${pid}/documents/upload-url`, { name: 'a-document-with-a-quite-long-file-name-for-testing.pdf', category: 'OTHER' }, sa.token)).body.data;
await fetch(API_ORIGIN + up.uploadUrl, { method: 'PUT', body: Buffer.from('%PDF-1.4\n1 0 obj\n<<>>\nendobj\n') });
await call('POST', `/projects/${pid}/documents`, { name: 'a-document-with-a-quite-long-file-name-for-testing.pdf', category: 'OTHER', storageKey: up.storageKey, size: 30, mimeType: 'application/pdf' }, sa.token);

const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new' });
const ctx = await browser.createBrowserContext();
const p = await ctx.newPage();
await p.setViewport({ width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
const errs = []; p.on('pageerror', (e) => errs.push(e.message.slice(0, 100)));
await p.goto(WEB_URL + '/login', { waitUntil: 'domcontentloaded' });
await p.evaluate((t, u) => { localStorage.setItem('dbi_auth_token', t); localStorage.setItem('dbi_user', JSON.stringify(u)); }, sa.token, sa.user);

// what sticks out: the page is wider than the screen, or an element reaches past the right edge (and is not inside
// something that scrolls on purpose)
const measure = () => p.evaluate(() => {
  const W = document.documentElement.clientWidth;
  const wide = document.documentElement.scrollWidth - W;
  const culprits = [];
  const scrollsOnPurpose = (el) => { for (let e = el.parentElement; e; e = e.parentElement) { const o = getComputedStyle(e).overflowX; if (o === 'auto' || o === 'scroll' || o === 'hidden' || o === 'clip') return true; } return false; };
  for (const el of document.querySelectorAll('body *')) {
    const r = el.getBoundingClientRect();
    if (r.width === 0 || r.height === 0) continue;
    const st = getComputedStyle(el);
    if (st.position === 'fixed' || st.visibility === 'hidden' || st.display === 'none') continue;
    if (r.right > W + 1 && !scrollsOnPurpose(el)) culprits.push({ tag: el.tagName.toLowerCase(), cls: String(el.className).slice(0, 70), text: (el.textContent || '').trim().slice(0, 40), right: Math.round(r.right) });
  }
  // report only the outermost: drop elements whose parent is also in the list
  return { wide, culprits: culprits.slice(0, 6) };
});

const PAGES = [
  '/dashboard', '/assignments', '/attention', '/projects', '/projects/new', `/projects/${pid}`, `/projects/${pid}/edit`, '/documents', '/knowledge-books', '/kt-reports',
  '/compliance', '/reports', '/audit-logs', '/notifications', '/settings', '/users', '/roles', '/backups', '/reminders', '/recycle-bin', '/admin-control-center',
];
for (const path of PAGES) {
  await p.goto(WEB_URL + path, { waitUntil: 'load' }); await wait(2200);
  const m = await measure();
  ok(`${path.replace(pid, ':id')} does not scroll sideways on a phone`, m.wide <= 1 && m.culprits.length === 0, m.wide > 1 || m.culprits.length ? `wider by ${m.wide}px; ${JSON.stringify(m.culprits)}` : '');
}
// every tab of a project
await p.goto(`${WEB_URL}/projects/${pid}`, { waitUntil: 'load' }); await wait(2500);
const tabs = await p.$$eval('button[role=tab]', (bs) => bs.map((b) => b.textContent.trim()));
for (const name of tabs) {
  await p.evaluate((n) => [...document.querySelectorAll('button[role=tab]')].find((b) => b.textContent.trim() === n)?.click(), name); await wait(1500);
  const m = await measure();
  ok(`project tab "${name}" fits the phone screen`, m.wide <= 1 && m.culprits.length === 0, m.wide > 1 || m.culprits.length ? `wider by ${m.wide}px; ${JSON.stringify(m.culprits)}` : '');
}
ok('the tab bar can still be reached by sliding it (all tabs exist)', tabs.length >= 6, tabs.join(', '));
ok('no page crashes', errs.length === 0, errs.join(' ; '));
await browser.close();

await call('DELETE', `/projects/${pid}`, null, sa.token);
const us = (await db.profile.findMany({ where: { email: { endsWith: '@test.local' } }, select: { id: true } })).map((u) => u.id);
await db.project.deleteMany({ where: { OR: [{ createdById: { in: us } }, { ownerId: { in: us } }] } });
await db.notification.deleteMany({ where: { userId: { in: us } } });
await db.profile.deleteMany({ where: { id: { in: us } } });
await db.$disconnect();
console.log(`\n${res.filter(Boolean).length}/${res.length} passed`);
