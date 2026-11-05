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
// a real 1x1 png
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');

const sa = await login(ADMIN_EMAIL, ADMIN_PASSWORD);
const PW = 'Time-Test-Pass-2026';
const ids = {};
for (const k of ['u1', 'u2', 'out']) ids[k] = (await call('POST', '/users', { email: `${k}@test.local`, fullName: `Person ${k}`, role: 'USER', authType: 'PASSWORD', password: PW }, sa.token)).body.data.id;
const S = {}; for (const k of Object.keys(ids)) S[k] = await login(`${k}@test.local`, PW);
const pid = (await call('POST', '/projects', { name: 'TIMELINE project', ownerId: sa.user.id, priority: 'LOW', tags: [] }, sa.token)).body.data.id;
for (const k of ['u1', 'u2']) await call('POST', `/projects/${pid}/members`, { userId: ids[k], role: 'CONTRIBUTOR' }, sa.token);

const upload = async (sess, name, bytes, mime) => {
  const up = (await call('POST', `/projects/${pid}/documents/upload-url`, { name, category: 'OTHER' }, sess.token)).body.data;
  await fetch(FILES + up.uploadUrl, { method: 'PUT', body: bytes });
  return (await call('POST', `/projects/${pid}/documents`, { name, category: 'OTHER', storageKey: up.storageKey, size: bytes.length, mimeType: mime }, sess.token)).body.data.id;
};
const d1 = await upload(S.u1, 'first-photo.png', PNG, 'image/png'); await wait(1100);
const d2 = await upload(S.u2, 'second-photo.png', PNG, 'image/png'); await wait(1100);
const d3 = await upload(S.u1, 'notes.pdf', Buffer.from('%PDF-1.4 fake'), 'application/pdf'); await wait(1100);
const d4 = await upload(S.u1, 'private-photo.png', PNG, 'image/png');
await call('PATCH', `/projects/${pid}/documents/${d4}`, { visibility: 'PRIVATE' }, S.u1.token);

// ---- API ----
const tl = arr((await call('GET', `/projects/${pid}/documents/timeline`, null, S.u2.token)).body.data);
ok('timeline lists the files oldest first', tl.map((x) => x.name).join() === 'first-photo.png,second-photo.png,notes.pdf', tl.map((x) => x.name).join());
ok('each file carries its uploader and time', tl[0].uploader.fullName === 'Person u1' && tl[1].uploader.fullName === 'Person u2' && !!tl[0].createdAt);
ok('images carry a preview link, a pdf does not', tl[0].isImage && !!tl[0].previewUrl && !tl[2].isImage && tl[2].previewUrl === null);
ok('a private file of someone else is not listed', !tl.some((x) => x.name === 'private-photo.png'));
ok('its owner still sees it', arr((await call('GET', `/projects/${pid}/documents/timeline`, null, S.u1.token)).body.data).some((x) => x.name === 'private-photo.png'));
ok('a person outside the project is refused', (await call('GET', `/projects/${pid}/documents/timeline`, null, S.out.token)).status === 403);
const img = await fetch(FILES + tl[0].previewUrl);
ok('the preview link serves the image', img.status === 200 && /image\/png/.test(img.headers.get('content-type') ?? ''), img.headers.get('content-type'));

// ---- browser: u2 opens the vault ----
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new' });
const ctx = await browser.createBrowserContext(); const p = await ctx.newPage(); await p.setViewport({ width: 1300, height: 1000 });
await p.goto(WEB + '/login', { waitUntil: 'domcontentloaded' });
await p.evaluate((t, u) => { localStorage.setItem('dbi_auth_token', t); localStorage.setItem('dbi_user', JSON.stringify(u)); }, S.u2.token, S.u2.user);
await p.goto(WEB + `/documents?projectId=${pid}`, { waitUntil: 'load' }); await wait(2500);
await p.evaluate(() => [...document.querySelectorAll('button')].find((b) => b.textContent.trim() === 'Timeline')?.click()); await wait(2500);
const text = () => p.evaluate(() => document.body.innerText);
let t = await text();
ok('timeline shows the uploader and date under the files', /Uploaded by Person u1/.test(t) && /Uploaded by Person u2/.test(t));
ok('the project is already chosen', /TIMELINE project/.test(t));
const imgs = await p.$$eval('main img', (els) => els.map((e) => ({ ok: e.complete && e.naturalWidth > 0, alt: e.alt })));
ok('both images really load on the page', imgs.length === 2 && imgs.every((i) => i.ok), JSON.stringify(imgs));
const order = await p.evaluate(() => [...document.querySelectorAll('main p.font-medium')].map((e) => e.textContent.trim()).filter((x) => /\.(png|pdf)$/.test(x)));
ok('shown top to bottom, oldest first', order.join() === 'first-photo.png,second-photo.png,notes.pdf', order.join());
ok('the private file is not on the page', !/private-photo/.test(t));

// ---- a new upload joins the bottom ----
await upload(S.u1, 'third-photo.png', PNG, 'image/png');
await p.reload({ waitUntil: 'load' }); await wait(2500);
await p.evaluate(() => [...document.querySelectorAll('button')].find((b) => b.textContent.trim() === 'Timeline')?.click()); await wait(2500);
const order2 = await p.evaluate(() => [...document.querySelectorAll('main p.font-medium')].map((e) => e.textContent.trim()).filter((x) => /\.(png|pdf)$/.test(x)));
ok('a new upload is added below the others', order2.join() === 'first-photo.png,second-photo.png,notes.pdf,third-photo.png', order2.join());
await p.evaluate(() => [...document.querySelectorAll('button')].find((b) => /Oldest first/.test(b.textContent))?.click()); await wait(600);
const order3 = await p.evaluate(() => [...document.querySelectorAll('main p.font-medium')].map((e) => e.textContent.trim()).filter((x) => /\.(png|pdf)$/.test(x)));
ok('"newest first" reverses it', order3[0] === 'third-photo.png', order3.join());
// the list view still works
await p.evaluate(() => [...document.querySelectorAll('button')].find((b) => b.textContent.trim() === 'List')?.click()); await wait(1500);
ok('the List view is still there', /All Documents/.test(await text()));
await browser.close();
await call('DELETE', `/projects/${pid}`, null, sa.token);
console.log(`\n${res.filter(Boolean).length}/${res.length} passed`);
