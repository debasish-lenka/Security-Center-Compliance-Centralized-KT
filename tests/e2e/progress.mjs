// End-to-end test. Needs the local API, web app and database (see tests/README.md). Run with: node e2e/run.mjs <name>
import { API_URL, WEB_URL, API_ORIGIN, CHROME, DB_URL, API_PKG, ADMIN_EMAIL, ADMIN_PASSWORD, TMP, ROOT } from './config.mjs';
import { join as joinPath } from 'path';
import puppeteer from 'puppeteer-core';
import { createHmac } from 'crypto';
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
  const t = l.body.data.mfaToken; const sec = (await call('POST', '/auth/mfa/setup', { mfaToken: t })).body.data.secret;
  return (await call('POST', '/auth/mfa/confirm', { mfaToken: t, code: totp(sec) })).body.data;
};
const arr = (x) => (Array.isArray(x) ? x : x?.items ?? []);
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
const sa = await login(ADMIN_EMAIL, ADMIN_PASSWORD);
const PW = 'Prog-Test-Pass-2026';
const ids = {};
for (const [k, n] of [['lead', 'Lead Person'], ['a', 'Person a'], ['b', 'Person b']]) ids[k] = (await call('POST', '/users', { email: `${k}@test.local`, fullName: n, role: 'USER', authType: 'PASSWORD', password: PW }, sa.token)).body.data.id;
const S = {}; for (const k of Object.keys(ids)) S[k] = await login(`${k}@test.local`, PW);
const pid = (await call('POST', '/projects', { name: 'PROG project', ownerId: ids.lead, priority: 'HIGH', tags: [], memberIds: [ids.a, ids.b] }, S.lead.token)).body.data.id;
const upload = async (name, bytes, mime) => {
  const up = (await call('POST', `/projects/${pid}/documents/upload-url`, { name, category: 'OTHER' }, S.a.token)).body.data;
  await fetch(FILES + up.uploadUrl, { method: 'PUT', body: bytes });
  return (await call('POST', `/projects/${pid}/documents`, { name, category: 'OTHER', storageKey: up.storageKey, size: bytes.length, mimeType: mime }, S.a.token)).body.data.id;
};
await upload('one.png', PNG, 'image/png'); await upload('two.png', PNG, 'image/png'); await upload('doc.pdf', Buffer.from('%PDF-1.4 x'), 'application/pdf');
const mkTask = async (title, who) => (await call('POST', `/projects/${pid}/tasks`, { title, priority: 'LOW', assigneeId: ids[who] }, S.lead.token)).body.data.id;
const t1 = await mkTask('Task A1', 'a'), t2 = await mkTask('Task A2', 'a'), t3 = await mkTask('Task B1', 'b');
await call('PUT', '/admin/work-settings', { requireTaskEvidence: false }, sa.token);
const finish = async (tid, tok) => { await call('POST', `/projects/${pid}/tasks/${tid}/submit`, { summary: 'Finished, nothing more to add.', evidence: [] }, tok); await call('POST', `/projects/${pid}/tasks/${tid}/verify`, { decision: 'APPROVE' }, S.lead.token); };
await finish(t1, S.a.token);
await wait(500);

const d = (await call('GET', `/projects/${pid}`, null, S.lead.token)).body.data;
ok('documents uploaded = 3, images uploaded = 2', d.documentCount === 3 && d.imageCount === 2, `${d.documentCount} / ${d.imageCount}`);
ok('total progress = 1 of 3 tasks = 33%', d.progress === 33 && d.progressBreakdown.tasks.done === 1 && d.progressBreakdown.tasks.total === 3, d.progress);
const u = Object.fromEntries(d.progressBreakdown.users.map((x) => [x.fullName, x.percent]));
ok('per person: a 50%, b 0% (owner is not listed)', u['Person a'] === 50 && u['Person b'] === 0 && !('Lead Person' in u), JSON.stringify(u));
const li = arr((await call('GET', '/projects?limit=50', null, S.lead.token)).body.data).find((x) => x.id === pid);
ok('the project list shows the same 33%', li.progress === 33);

const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new' });
const ctx = await browser.createBrowserContext(); const p = await ctx.newPage(); await p.setViewport({ width: 1400, height: 1100 });
await p.goto(WEB + '/login', { waitUntil: 'domcontentloaded' });
await p.evaluate((t, u) => { localStorage.setItem('dbi_auth_token', t); localStorage.setItem('dbi_user', JSON.stringify(u)); }, S.lead.token, S.lead.user);
const text = () => p.evaluate(() => document.body.innerText);
await p.goto(WEB + `/projects/${pid}`, { waitUntil: 'load' }); await wait(3000);
let t = await text();
ok('no budget anywhere on the project page', !/budget/i.test(t));
ok('box: Documents uploaded 3', /Documents uploaded\s*\n?\s*3/.test(t));
ok('box: Images uploaded 2', /Images uploaded\s*\n?\s*2/.test(t));
ok('total progress 33% and "1 of 3 tasks done"', /33%/.test(t) && /1 of 3 tasks done/.test(t));
ok('progress by person with percentages', /Progress by person/.test(t) && /Person a[\s\S]*50%/.test(t) && /Person b[\s\S]*0%/.test(t));
ok('red for under 40% (total is 33%), amber for 50%', (await p.$$('.bg-rose-500')).length >= 1 && (await p.$$('.bg-amber-500')).length >= 1);

await p.goto(WEB + '/projects', { waitUntil: 'load' }); await wait(2500);
ok('project list has no Budget column', !/budget/i.test(await text()));
await p.goto(WEB + '/projects/new', { waitUntil: 'load' }); await wait(2000);
ok('create form has no budget field', !/budget/i.test(await text()));
await p.goto(WEB + `/projects/${pid}/edit`, { waitUntil: 'load' }); await wait(2500);
ok('edit form has no budget or spent field', !/budget|spent/i.test(await text()));

// ---- edit a task ----
await p.goto(WEB + `/projects/${pid}`, { waitUntil: 'load' }); await wait(2500);
const tab = (await p.evaluateHandle(() => [...document.querySelectorAll('button[role=tab]')].find((b) => /Tasks/.test(b.textContent)))).asElement();
const tb = await tab.boundingBox(); await p.mouse.click(tb.x + tb.width / 2, tb.y + tb.height / 2); await wait(1500);
ok('every task row has an Edit button', (await p.$$('button[aria-label^="Edit "]')).length === 3);
await p.click('button[aria-label="Edit Task B1"]'); await wait(900);
ok('the edit dialog opens filled in', await p.$eval('#task-title', (e) => e.value) === 'Task B1');
await p.$eval('#task-title', (e) => { const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set; set.call(e, 'Task B1 renamed'); e.dispatchEvent(new Event('input', { bubbles: true })); });
await p.select('#task-priority', 'HIGH'); await p.select('#task-status', 'IN_PROGRESS');
await p.evaluate(() => [...document.querySelectorAll('button')].find((b) => /Save changes/.test(b.textContent))?.click()); await wait(2000);
t = await text();
ok('the row shows the new title', /Task B1 renamed/.test(t));
const tk = arr((await call('GET', `/projects/${pid}/tasks?limit=50`, null, S.lead.token)).body.data).find((x) => x.id === t3);
ok('saved: title, priority, status', tk.title === 'Task B1 renamed' && tk.priority === 'HIGH' && tk.status === 'IN_PROGRESS', JSON.stringify([tk.title, tk.priority, tk.status]));
await finish(t3, S.b.token);
const dd = (await call('GET', `/projects/${pid}`, null, S.lead.token)).body.data;
ok('finishing the task (submit + verify) moved the progress (2 of 3 = 67%)', dd.progress === 67, dd.progress);

// ---- the log ----
const logs = arr((await call('GET', `/audit-logs?resourceType=task&resourceId=${t3}&limit=20`, null, sa.token)).body.data);
const e = logs.find((l) => l.action === 'UPDATE' && l.details?.changes?.title);
const ch = e?.details?.changes ?? {};
ok('the audit log has the edit with from -> to', !!e && ch.title?.from === 'Task B1' && ch.title?.to === 'Task B1 renamed' && ch.priority?.to === 'HIGH' && ch.status?.to === 'IN_PROGRESS', JSON.stringify(ch).slice(0, 160));
ok('and who did it', logs.some((l) => /Lead Person/.test(JSON.stringify(l.actor ?? l.user ?? l))));
// start click is logged too
await call('POST', `/projects/${pid}/start`, null, S.a.token);
const plogs = arr((await call('GET', `/audit-logs?resourceType=project&resourceId=${pid}&limit=20`, null, sa.token)).body.data);
ok('pressing Start is in the audit log', plogs.some((l) => JSON.stringify(l.details).includes('"action":"start"')));
await call('PATCH', `/projects/${pid}`, { name: 'PROG project v2' }, S.lead.token);
const plogs2 = arr((await call('GET', `/audit-logs?resourceType=project&resourceId=${pid}&limit=20`, null, sa.token)).body.data);
ok('a project edit logs from -> to', plogs2.some((l) => l.details?.changes?.name?.from === 'PROG project' && l.details.changes.name.to === 'PROG project v2'));

await browser.close();
await call('DELETE', `/projects/${pid}`, null, sa.token);
console.log(`\n${res.filter(Boolean).length}/${res.length} passed`);
