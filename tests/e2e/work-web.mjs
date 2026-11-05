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
  const t = l.body.data.mfaToken; const sec = (await call('POST', '/auth/mfa/setup', { mfaToken: t })).body.data.secret;
  return (await call('POST', '/auth/mfa/confirm', { mfaToken: t, code: totp(sec) })).body.data;
};
{ const old = (await db.profile.findMany({ where: { email: { endsWith: '@test.local' } }, select: { id: true } })).map((u) => u.id);
  await db.project.deleteMany({ where: { OR: [{ createdById: { in: old } }, { ownerId: { in: old } }] } }); await db.profile.deleteMany({ where: { id: { in: old } } }); }
await db.profile.updateMany({ where: { email: ADMIN_EMAIL }, data: { totpEnabled: false, totpSecretEnc: null, recoveryCodeHashes: [] } });
const sa = await login(ADMIN_EMAIL, ADMIN_PASSWORD);
const PW = 'Work-Web-Pass-2026';
const ids = {};
for (const k of ['lead', 'a']) ids[k] = (await call('POST', '/users', { email: `${k}@test.local`, fullName: `Person ${k}`, role: 'USER', authType: 'PASSWORD', password: PW }, sa.token)).body.data.id;
const S = {}; for (const k of Object.keys(ids)) S[k] = await login(`${k}@test.local`, PW);

const browser = await puppeteer.launch({
  executablePath: CHROME, headless: 'new',
  args: ['--auto-select-desktop-capture-source=Entire screen', '--use-fake-ui-for-media-stream', '--enable-usermedia-screen-capturing', '--auto-accept-this-tab-capture'],
});
const mk = async (sess, w = 1400, h = 1100) => {
  const ctx = await browser.createBrowserContext(); const p = await ctx.newPage(); await p.setViewport({ width: w, height: h });
  const errs = []; p.on('pageerror', (e) => errs.push(e.message.slice(0, 120)));
  await p.goto(WEB + '/login', { waitUntil: 'domcontentloaded' });
  await p.evaluate((t, u) => { localStorage.setItem('dbi_auth_token', t); localStorage.setItem('dbi_user', JSON.stringify(u)); }, sess.token, sess.user);
  return { ctx, p, errs };
};
const text = (p) => p.evaluate(() => document.body.innerText);
const clickText = async (p, re, sel = 'button') => { const h = await p.evaluateHandle((s, r) => [...document.querySelectorAll(s)].find((b) => new RegExp(r, 'i').test(b.textContent.trim())), sel, re.source); const el = h.asElement(); if (!el) return false; await el.evaluate((e) => e.scrollIntoView({ block: 'center' })); await wait(150); const bb = await el.boundingBox(); if (!bb) return false; await p.mouse.click(bb.x + bb.width / 2, bb.y + bb.height / 2); return true; };

// ---- lead creates the project in the UI with two work links ----
const L = await mk(S.lead);
await L.p.goto(WEB + '/projects/new', { waitUntil: 'load' }); await wait(2500);
const setVal = async (p, sel, v) => { await p.$eval(sel, (el, val) => { const s = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set; s.call(el, val); el.dispatchEvent(new Event('input', { bubbles: true })); }, v); };
await setVal(L.p, '#name', 'WORKWEB project');
// owner
const trig = (await L.p.evaluateHandle(() => [...document.querySelectorAll('button[role=combobox]')].find((b) => /Select owner/.test(b.textContent)))).asElement();
let bb = await trig.boundingBox(); await L.p.mouse.click(bb.x + bb.width / 2, bb.y + bb.height / 2); await wait(600);
await L.p.evaluate(() => [...document.querySelectorAll('[role=option]')].find((o) => /Person lead/.test(o.textContent))?.click()); await wait(400);
await clickText(L.p, /Add a work link/); await wait(300);
await setVal(L.p, 'input[aria-label="Work link 1 name"]', 'Cisco dashboard'); await setVal(L.p, 'input[aria-label="Work link 1 address"]', WEB + '/login');
await clickText(L.p, /Add a work link/); await wait(300);
await setVal(L.p, 'input[aria-label="Work link 2 name"]', 'ManageEngine'); await setVal(L.p, 'input[aria-label="Work link 2 address"]', 'https://example.com/me');
await clickText(L.p, /Add a work link/); await wait(300);
await setVal(L.p, 'input[aria-label="Work link 3 name"]', 'half filled'); // incomplete row: must be dropped
// pick member a
await L.p.evaluate(() => { const l = [...document.querySelectorAll('label')].find((x) => /Person a/.test(x.textContent)); l?.querySelector('input')?.click(); });
await clickText(L.p, /^Create Project$/); await wait(3000);
const mine = (await call('GET', '/projects?limit=100', null, S.lead.token)).body.data;
const list = mine.items ?? mine;
const proj = list.find((p) => p.name === 'WORKWEB project');
ok('project created from the form', !!proj);
if (!proj) { console.log((await text(L.p)).replace(/\s+/g, ' ').slice(0, 900), L.p.url(), L.errs); await L.p.screenshot({ path: 'dbg.png' }); await browser.close(); process.exit(1); }
const pid = proj?.id;
const det = (await call('GET', `/projects/${pid}`, null, S.lead.token)).body.data;
ok('only the two complete work links were saved', det.workLinks?.length === 2 && det.workLinks[0].label === 'Cisco dashboard' && det.workLinks[1].url === 'https://example.com/me', JSON.stringify(det.workLinks));
await L.p.goto(WEB + `/projects/${pid}/edit`, { waitUntil: 'load' }); await wait(2500);
const editVals = await L.p.$$eval('input[aria-label^="Work link"]', (els) => els.map((e) => e.value));
ok('Edit Project shows the saved links', editVals.join('|') === `Cisco dashboard|${WEB}/login|ManageEngine|https://example.com/me`, editVals.join('|'));

// ---- member a works ----
const U = await mk(S.a);
await U.p.goto(WEB + `/projects/${pid}`, { waitUntil: 'load' }); await wait(2500);
await clickText(U.p, /^Work Log$/, 'button[role=tab]'); await wait(1500);
let t = await text(U.p);
ok('Work Log tab: a start button for each tool, nothing running', /Start work in Cisco dashboard/.test(t) && /Start work in ManageEngine/.test(t) && /Not working/.test(t));
ok('Generate KT is off with nothing to generate', await U.p.evaluate(() => [...document.querySelectorAll('button')].find((b) => /Generate KT/.test(b.textContent))?.disabled));
U.p.on('console', (m) => { if (['error', 'warning'].includes(m.type())) console.log('   [console]', m.text().slice(0, 160)); });
U.p.on('response', (r) => { if (/\/work\//.test(r.url()) && r.request().method() !== 'GET') console.log('   [api]', r.request().method(), r.url().split('/work/')[1], r.status()); });
const popups = []; browser.on('targetcreated', (tg) => popups.push(tg.url()));
await clickText(U.p, /Start work in Cisco dashboard/); await wait(5000);
t = await text(U.p);
ok('a session is running', /Running/.test(t), t.slice(t.indexOf('Work on this project'), t.indexOf('Work on this project') + 120).replace(/\n/g, ' '));
ok('the tool opened in a new tab', popups.some((u) => u === `${WEB_URL}/login`), popups.join(','));
const shareOn = /Screen is being shared/.test(t);
console.log('   (screen share granted by the test browser:', shareOn, ')');
let state = (await call('GET', `/projects/${pid}/work/state`, null, S.a.token)).body.data;
ok('the server knows the session and the tool', state.active?.linkLabel === 'Cisco dashboard');
if (shareOn) {
  await wait(4000);
  state = (await call('GET', `/projects/${pid}/work/state`, null, S.a.token)).body.data;
  ok('the first picture of the share was captured by itself', state.active.shots >= 1, `shots ${state.active.shots}`);
  const full = (await call('GET', `/projects/${pid}/work/sessions/${state.active.id}`, null, S.a.token)).body.data.entries;
  ok('"started sharing" is on record', full.some((e) => /Started sharing/.test(e.text ?? '')));
}
// note
await U.p.type('textarea[aria-label="Work note"]', 'Checked the 12 site health scores in the Cisco dashboard; two sites are below 80.');
await clickText(U.p, /^Save note$/); await wait(1500);
t = await text(U.p);
ok('the note is saved and listed', /two sites are below 80/.test(t) && /1 note\b/.test(t));
// a picture from a file (works with or without screen share)
if (!shareOn) {
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
  const fs = await import('fs'); const path = joinPath(TMP, 'dbi-test-one.png');
  fs.writeFileSync(path, png);
  const input = await U.p.$('input[data-testid=shot-file]'); await input.uploadFile(path); await wait(2500);
  state = (await call('GET', `/projects/${pid}/work/state`, null, S.a.token)).body.data;
  ok('a picture added from a file is stored', state.active.shots >= 1, `shots ${state.active.shots}`);
}
await clickText(U.p, /Open ManageEngine/); await wait(800);
const ev = (await call('GET', `/projects/${pid}/work/sessions/${state.active.id}`, null, S.a.token)).body.data.entries;
ok('opening another tool is written down', ev.some((e) => /Opened ManageEngine/.test(e.text ?? '')));
// generate is blocked while running
ok('Generate KT is off while work is running', await U.p.evaluate(() => [...document.querySelectorAll('button')].find((b) => /Generate KT/.test(b.textContent))?.disabled));
await clickText(U.p, /^Stop work$/); await wait(3000);
t = await text(U.p);
ok('stopped: back to Not working, one finished session waiting for a KT', /Not working/.test(t) && /1 finished session/.test(t), '');
await clickText(U.p, /^Generate KT$/); await wait(3500);
t = await text(U.p);
ok('Generate KT saves version 1 in the vault', /Work KT version 1 saved/.test(t) || /Nothing new/.test(t));
const docs = (await call('GET', `/projects/${pid}/documents/timeline`, null, S.a.token)).body.data;
const wk = (docs.items ?? docs).find((d) => /Work KT - WORKWEB project - Person a/.test(d.name));
ok('the document is in the vault with the project and person in its name, version 1', !!wk && wk.version === 1);
// the test browser answers the share dialog only once, so the second round runs with sharing optional
await call('PUT', '/admin/work-settings', { requireScreenShare: false }, sa.token); await U.p.goto(WEB + `/projects/${pid}`, { waitUntil: 'load' }); await wait(3500); await clickText(U.p, /^Work Log$/, 'button[role=tab]'); await wait(2000);
// second round -> version 2
{ const r2 = await call('POST', `/projects/${pid}/work/start`, {}, S.a.token); const sid2 = r2.body.data.id;
  await call('POST', `/projects/${pid}/work/${sid2}/note`, { text: 'Second round: exported the report.' }, S.a.token);
  await call('POST', `/projects/${pid}/work/${sid2}/stop`, null, S.a.token); }
await U.p.goto(WEB + `/projects/${pid}`, { waitUntil: 'load' }); await wait(3500); await clickText(U.p, /^Work Log$/, 'button[role=tab]'); await wait(2000);
await clickText(U.p, /^Generate KT$/); await wait(3000);
const docs2 = (await call('GET', `/projects/${pid}/documents/timeline`, null, S.a.token)).body.data;
const wk2 = (docs2.items ?? docs2).filter((d) => /Work KT - WORKWEB/.test(d.name));
ok('generating again makes version 2 of the same document (not a second document)', wk2.length === 1 && wk2[0].version === 2, JSON.stringify(wk2.map((d) => [d.name, d.version])));

// ---- the lead looks ----
await L.p.goto(WEB + `/projects/${pid}`, { waitUntil: 'load' }); await wait(2500);
await clickText(L.p, /^Work Log$/, 'button[role=tab]'); await wait(2000);
t = await text(L.p);
ok('the lead sees the team\'s sessions with the person name', /Work sessions of the team/.test(t) && /Person a/.test(t));
await clickText(L.p, /^View$/); await wait(2000);
t = await text(L.p);
ok('a session opens in full: note and events', /Checked the 12 site health scores|Second round/.test(t) && /Started work/.test(t));
const imgs = await L.p.$$eval('[role=dialog] img', (els) => els.map((e) => e.complete && e.naturalWidth > 0));
if (shareOn || true) ok('the pictures in it load (if any were taken)', imgs.every(Boolean), `${imgs.length} pictures`);
// the member only sees own
t = await text(U.p);
ok('the member only sees "My work sessions"', /My work sessions/.test(t) && !/Work sessions of the team/.test(t));
ok('no page crashes', L.errs.length === 0 && U.errs.length === 0, [...L.errs, ...U.errs].join(' ; '));

await browser.close();
await db.workSettings.deleteMany({});
await call('DELETE', `/projects/${pid}`, null, sa.token);
const us = await db.profile.findMany({ where: { email: { endsWith: '@test.local' } }, select: { id: true } });
const uids = us.map((u) => u.id);
await db.project.deleteMany({ where: { OR: [{ createdById: { in: uids } }, { ownerId: { in: uids } }] } });
await db.profile.deleteMany({ where: { id: { in: uids } } });
await db.$disconnect();
console.log(`\n${res.filter(Boolean).length}/${res.length} passed`);
