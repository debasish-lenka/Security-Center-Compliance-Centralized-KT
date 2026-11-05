// End-to-end test. Needs the local API, web app and database (see tests/README.md). Run with: node e2e/run.mjs <name>
import { API_URL, WEB_URL, API_ORIGIN, CHROME, DB_URL, API_PKG, ADMIN_EMAIL, ADMIN_PASSWORD, TMP, ROOT } from './config.mjs';
import { join as joinPath } from 'path';
import puppeteer from 'puppeteer-core';
import { createHmac } from 'crypto';
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
const arr = (x) => (Array.isArray(x) ? x : x?.items ?? []);
const sa = await login(ADMIN_EMAIL, ADMIN_PASSWORD);
const PW = 'Start-Test-Pass-2026';
const ids = {};
for (const [k, role] of [['lead', 'USER'], ['a', 'USER'], ['b', 'USER'], ['c', 'USER'], ['vwr', 'VIEWER'], ['mgr', 'MANAGER']]) ids[k] = (await call('POST', '/users', { email: `${k}@test.local`, fullName: `Person ${k}`, role, authType: 'PASSWORD', password: PW }, sa.token)).body.data.id;
const S = {}; for (const k of Object.keys(ids)) S[k] = await login(`${k}@test.local`, PW);

// the lead creates the project and assigns three people
const cr = await call('POST', '/projects', { name: 'START flow', ownerId: ids.lead, priority: 'HIGH', tags: [], memberIds: [ids.a, ids.b, ids.c] }, S.lead.token);
const pid = cr.body.data?.id;
await call('POST', `/projects/${pid}/members`, { userId: ids.vwr, role: 'VIEWER' }, S.lead.token);
const mine = async (k) => arr((await call('GET', '/assignments/projects', null, S[k].token)).body.data).find((x) => x.id === pid);
const pa = await mine('a');
ok('each assigned person gets the project on their dashboard', !!pa && !!(await mine('b')) && !!(await mine('c')));
ok('they are asked to start it', pa.mustStart === true);
ok('the owner (lead) is not asked to start', (await mine('lead')).mustStart === false);
ok('the owner cannot start it either (403)', (await call('POST', `/projects/${pid}/start`, null, S.lead.token)).status === 403);
ok('the owner is not in the team count or lists', !JSON.stringify(pa.startInfo).includes('Person lead'));
ok('0 of 3 started at the beginning (only the chosen team; viewer and owner are not counted)', pa.startInfo.started === 0 && pa.startInfo.total === 3, JSON.stringify([pa.startInfo.started, pa.startInfo.total]));
ok('status is still NOT_STARTED', pa.status === 'NOT_STARTED');
ok('a viewer is not asked to start', (await mine('vwr')).mustStart === false);
ok('a viewer cannot start (403)', (await call('POST', `/projects/${pid}/start`, null, S.vwr.token)).status === 403);
ok('a super admin who is not on the project cannot start (403)', (await call('POST', `/projects/${pid}/start`, null, sa.token)).status === 403);

// person a starts it from the dashboard (browser)
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new' });
const open = async (sess, path) => {
  const ctx = await browser.createBrowserContext(); const p = await ctx.newPage(); await p.setViewport({ width: 1400, height: 1000 });
  await p.goto(WEB + '/login', { waitUntil: 'domcontentloaded' });
  await p.evaluate((t, u) => { localStorage.setItem('dbi_auth_token', t); localStorage.setItem('dbi_user', JSON.stringify(u)); }, sess.token, sess.user);
  await p.goto(WEB + path, { waitUntil: 'load' }); await wait(2500);
  return p;
};
const body = (p) => p.evaluate(() => document.body.innerText);
let pg = await open(S.a, '/assignments');
let t = await body(pg);
ok('dashboard shows My Projects with "1 to start"', /My Projects \(1\)/.test(t) && /1 to start/.test(t) && /Contributor/.test(t));
ok('it shows the Start button and the count', /Start project/.test(t) && /0 of 3 team members started/.test(t));
await pg.evaluate(() => [...document.querySelectorAll('button')].find((b) => /Start project/.test(b.textContent))?.click()); await wait(2500);
t = await body(pg);
ok('after Start the button is gone and the count is 2 of 4', !/Start project/.test(t) && /1 of 3 started/.test(t), (t.match(/\d of 3 [a-z ]+started/) || [''])[0]);
ok('the dashboard shows the latest update by the person', /Latest update: Person a started the project/.test(t));
const proj = (await call('GET', `/projects/${pid}`, null, S.lead.token)).body.data;
ok('the project moved to ONGOING with a start date', proj.status === 'ONGOING' && !!proj.startDate, proj.status);
const note = arr((await call('GET', '/notifications?limit=20', null, S.lead.token)).body.data).find((n) => n.type === 'PROJECT_STARTED');
ok('the lead was told, with the count', !!note && /Person a started/.test(note.message) && /1 of 3/.test(note.message), note?.message);
ok('pressing Start again changes nothing', (await call('POST', `/projects/${pid}/start`, null, S.a.token)).body.data.alreadyStarted === true);
await pg.close();

// b starts; c does not; c then makes a change
await call('POST', `/projects/${pid}/start`, null, S.b.token);
await wait(1100);
const mkTask = await call('POST', `/projects/${pid}/tasks`, { title: 'First task', priority: 'LOW' }, S.c.token);
const afterC = await mine('lead');
ok('2 of 3 started, c is still waiting', afterC.startInfo.started === 2 && afterC.startInfo.waiting.join() === 'Person c', JSON.stringify(afterC.startInfo.waiting));
ok('latest update is by c: "added a task"', afterC.lastUpdate?.by === 'Person c' && /added a task/.test(afterC.lastUpdate.text), JSON.stringify(afterC.lastUpdate));
await wait(1100);
const tk = { id: mkTask.body.data?.id ?? mkTask.body.data?.task?.id };
await call('PATCH', `/projects/${pid}/tasks/${tk.id}`, { status: 'IN_PROGRESS' }, S.b.token);
const afterB = await mine('lead');
ok('then b edits the task: latest update is now b "updated a task"', afterB.lastUpdate?.by === 'Person b' && /updated a task/.test(afterB.lastUpdate.text), JSON.stringify(afterB.lastUpdate));

// the project page for the lead shows it all
pg = await open(S.lead, `/projects/${pid}`);
t = await body(pg);
console.log('PAGE', t.slice(0, 700).split(String.fromCharCode(10)).join(' | '));
ok('project page: "2 of 3 team members started"', /2 of 3 team members started this project/.test(t));
ok('project page lists who started and who is waiting', /Person a/.test(t) && /Person b/.test(t) && /not started yet/i.test(t) && /Person c/.test(t));
ok('project page: latest update by b', /Latest update: Person b updated a task/.test(t));
await pg.close();
pg = await open(S.lead, '/projects');
t = await body(pg);
ok('project list row: "3 of 4 started" and the latest update', /2 of 3 started/.test(t) && /Latest update: Person b/.test(t));
await pg.close();
// the lead's own list API carries the same
const li = arr((await call('GET', '/projects?limit=50', null, S.lead.token)).body.data).find((x) => x.id === pid);
ok('projects API list has startInfo and lastUpdate', li?.startInfo?.started === 2 && li?.lastUpdate?.by === 'Person b');

const p2 = (await call('POST', '/projects', { name: 'START two', ownerId: ids.lead, managerId: ids.mgr, priority: 'CRITICAL', tags: [], memberIds: [ids.a] }, sa.token)).body.data.id;
const i2 = (await call('GET', `/projects/${p2}`, null, sa.token)).body.data.startInfo;
ok('only the selected member is counted (admin creator, owner, manager are not)', i2.total === 1 && i2.waiting.join() === 'Person a' && i2.started === 0, JSON.stringify(i2));
pg = await open(S.mgr, '/dashboard');
t = await body(pg);
ok('manager dashboard: the project with the team chips', /START two/.test(t) && /Team: 0 of 1 started/.test(t) && /Person a/.test(t));
ok('manager dashboard: no owner / manager / admin in the team list', !/System Administrator/.test(t.split('START two')[1]?.slice(0, 300) ?? ''));
ok('manager dashboard: coloured by severity (critical = red band)', (await pg.$$('.border-l-rose-500')).length >= 1);
await pg.close();
pg = await open(S.a, '/assignments');
t = await body(pg);
ok('team member sees both projects, coloured', (await pg.$$('.border-l-rose-500')).length >= 1 && (await pg.$$('.border-l-orange-500')).length >= 1);
await pg.close();
await call('DELETE', `/projects/${p2}`, null, sa.token);
await browser.close();
await call('DELETE', `/projects/${pid}`, null, sa.token);
console.log(`\n${res.filter(Boolean).length}/${res.length} passed`);
