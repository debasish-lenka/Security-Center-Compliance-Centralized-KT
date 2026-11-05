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
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
const sa = await login(ADMIN_EMAIL, ADMIN_PASSWORD);
const PW = 'Upl-Test-Pass-2026';
const ids = {};
for (const [k, n] of [['lead', 'Lead Person'], ['a', 'Person a'], ['b', 'Person b'], ['idle', 'Person idle']]) ids[k] = (await call('POST', '/users', { email: `${k}@test.local`, fullName: n, role: 'USER', authType: 'PASSWORD', password: PW }, sa.token)).body.data.id;
const S = {}; for (const k of Object.keys(ids)) S[k] = await login(`${k}@test.local`, PW);
const pid = (await call('POST', '/projects', { name: 'UPL project', ownerId: ids.lead, priority: 'LOW', tags: [], memberIds: [ids.a, ids.b, ids.idle] }, S.lead.token)).body.data.id;
const upload = async (sess, name, bytes, mime) => {
  const up = (await call('POST', `/projects/${pid}/documents/upload-url`, { name, category: 'OTHER' }, sess.token)).body.data;
  await fetch(FILES + up.uploadUrl, { method: 'PUT', body: bytes });
  return (await call('POST', `/projects/${pid}/documents`, { name, category: 'OTHER', storageKey: up.storageKey, size: bytes.length, mimeType: mime }, sess.token)).body.data.id;
};
await upload(S.a, 'a1.png', PNG, 'image/png'); await upload(S.a, 'a2.png', PNG, 'image/png'); await upload(S.a, 'a-notes.pdf', Buffer.from('%PDF-1.4 x'), 'application/pdf');
await upload(S.b, 'b1.png', PNG, 'image/png');
await upload(sa, 'admin-shot.png', PNG, 'image/png');   // a super admin who is not on the project

const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new' });
const ctx = await browser.createBrowserContext(); const p = await ctx.newPage(); await p.setViewport({ width: 1400, height: 1100 });
await p.goto(WEB + '/login', { waitUntil: 'domcontentloaded' });
await p.evaluate((t, u) => { localStorage.setItem('dbi_auth_token', t); localStorage.setItem('dbi_user', JSON.stringify(u)); }, S.lead.token, S.lead.user);
const text = () => p.evaluate(() => document.body.innerText);
await p.goto(WEB + `/projects/${pid}`, { waitUntil: 'load' }); await wait(2500);
const tab = (await p.evaluateHandle(() => [...document.querySelectorAll('button[role=tab]')].find((b) => /^Documents/.test(b.textContent.trim())))).asElement();
const tb = await tab.boundingBox(); await p.mouse.click(tb.x + tb.width / 2, tb.y + tb.height / 2); await wait(2500);
let t = await text();
ok('the tab lists people, not a flat file table', /Uploads by person/.test(t) && !/Uploaded By\s*Date/i.test(t));
const rows = await p.$$eval('button[aria-expanded]', (bs) => bs.map((b) => b.innerText.replace(/\s+/g, ' ').trim()));
const row = (n) => rows.find((r) => r.includes(n)) ?? '';
ok('Person a: 2 images, 1 document', /2 images/.test(row('Person a')) && /1 documents/.test(row('Person a')), row('Person a'));
ok('Person b: 1 image, 0 documents', /1 images/.test(row('Person b')) && /0 documents/.test(row('Person b')), row('Person b'));
ok('a person who uploaded nothing is listed with 0 and 0', /0 images/.test(row('Person idle')) && /0 documents/.test(row('Person idle')));
ok('the super admin (not on the team) is listed because they uploaded', /1 images/.test(row('System Administrator')), row('System Administrator'));
ok('the owner and manager are listed too', row('Lead Person') !== '');
ok('the header counts add up: 4 images · 1 documents', /4 images · 1 documents from 3 people/.test(t));

// click a person
await p.evaluate(() => [...document.querySelectorAll('button[aria-expanded]')].find((b) => /Person a/.test(b.innerText))?.click()); await wait(1500);
const thumbs = await p.$$eval('main img', (els) => els.map((e) => ({ ok: e.complete && e.naturalWidth > 0, alt: e.alt })));
ok("opening a person shows only that person's 2 images", thumbs.length === 2 && thumbs.every((i) => i.ok && /^a\d\.png$/.test(i.alt)), JSON.stringify(thumbs.map((i) => i.alt)));
ok('and their document', /a-notes\.pdf/.test(await text()));
ok("another person's file is not in that panel", !/b1\.png|admin-shot/.test(await text()));

// the new page
await p.evaluate(() => [...document.querySelectorAll('button')].find((b) => /Show all images and documents/.test(b.textContent))?.click()); await wait(3000);
ok('it opens a new page', new URL(p.url()).pathname === `/projects/${pid}/uploads`, p.url());
t = await text();
ok('the page says it is all uploads, combined', /all uploads/.test(t) && /4 images · 1 documents from 3 people/.test(t));
let imgs = await p.$$eval('main img', (els) => els.map((e) => ({ ok: e.complete && e.naturalWidth > 0, alt: e.alt })));
ok('all 4 images of all people are on that one page', imgs.length === 4 && imgs.every((i) => i.ok), imgs.map((i) => i.alt).join());
ok('each has its person and date under it', /Uploaded by Person a/.test(t) && /Uploaded by Person b/.test(t) && /Uploaded by System Administrator/.test(t));
await p.evaluate(() => [...document.querySelectorAll('button')].find((b) => /^Person b \(1\)/.test(b.textContent.trim()))?.click()); await wait(1200);
imgs = await p.$$eval('main img', (els) => els.map((e) => e.alt));
ok('a person chip narrows it to that person', imgs.join() === 'b1.png', imgs.join());
await p.evaluate(() => [...document.querySelectorAll('button')].find((b) => /^Everyone/.test(b.textContent.trim()))?.click()); await wait(1200);
ok('"Everyone" brings them all back', (await p.$$eval('main img', (els) => els.length)) === 4);
await p.click('a[aria-label="Back to the project"]'); await wait(2000);
ok('the back arrow returns to the project', new URL(p.url()).pathname === `/projects/${pid}`);
await browser.close();
await call('DELETE', `/projects/${pid}`, null, sa.token);
console.log(`\n${res.filter(Boolean).length}/${res.length} passed`);
