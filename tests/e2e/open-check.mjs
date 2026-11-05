// End-to-end test. Needs the local API, web app and database (see tests/README.md). Run with: node e2e/run.mjs <name>
import { API_URL, WEB_URL, API_ORIGIN, CHROME, DB_URL, API_PKG, ADMIN_EMAIL, ADMIN_PASSWORD, TMP, ROOT } from './config.mjs';
import { join as joinPath } from 'path';
import puppeteer from 'puppeteer-core';
import { createHmac } from 'crypto';
import { createRequire } from 'module';
const req = createRequire(API_PKG);
const { PrismaClient } = req('@prisma/client');
const { PDFDocument } = req('pdf-lib');
const db = new PrismaClient({ datasources: { db: { url: DB_URL } } });
const API = API_URL, WEB = WEB_URL, HOST = API_ORIGIN;
const A = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
const b32 = (s) => { let bits = 0, v = 0; const o = []; for (const c of s) { v = (v << 5) | A.indexOf(c); bits += 5; if (bits >= 8) { o.push((v >>> (bits - 8)) & 255); bits -= 8; } } return Buffer.from(o); };
const totp = (secret) => { const m = Buffer.alloc(8); m.writeBigUInt64BE(BigInt(Math.floor(Date.now() / 30000))); const h = createHmac('sha1', b32(secret)).update(m).digest(); const o = h[h.length - 1] & 15; return String((((h[o] & 127) << 24) | (h[o + 1] << 16) | (h[o + 2] << 8) | h[o + 3]) % 1e6).padStart(6, '0'); };
const call = async (m, p, b, t) => { const r = await fetch(API + p, { method: m, headers: { ...(b ? { 'content-type': 'application/json' } : {}), ...(t ? { authorization: 'Bearer ' + t } : {}) }, body: b ? JSON.stringify(b) : undefined }); return { status: r.status, body: await r.json().catch(() => ({})) }; };
const wait = (ms) => new Promise((x) => setTimeout(x, ms));
const res = []; const ok = (n, c, x = '') => { res.push(c); console.log(`${c ? 'PASS' : 'FAIL'}  ${n} ${x}`); };
await db.profile.updateMany({ where: { email: ADMIN_EMAIL }, data: { totpEnabled: false, totpSecretEnc: null, recoveryCodeHashes: [] } });
const l = await call('POST', '/auth/login', { email: ADMIN_EMAIL, password: ADMIN_PASSWORD });
const mt = l.body.data.mfaToken; const sec = (await call('POST', '/auth/mfa/setup', { mfaToken: mt })).body.data.secret;
const sa = (await call('POST', '/auth/mfa/confirm', { mfaToken: mt, code: totp(sec) })).body.data;
const pid = (await call('POST', '/projects', { name: 'OPEN project', ownerId: sa.user.id, priority: 'LOW' }, sa.token)).body.data.id;
const pdfDoc = await PDFDocument.create(); pdfDoc.addPage([300, 300]).drawText('hello'); const PDF = Buffer.from(await pdfDoc.save());
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
const ZIPISH = Buffer.from('PK\x03\x04 not really a word file but it has the docx extension');
const files = [['a.pdf', PDF, 'application/pdf'], ['b.png', PNG, 'image/png'], ['c.docx', ZIPISH, 'application/vnd.openxmlformats-officedocument.wordprocessingml.document']];
const docs = {};
for (const [name, bytes, mime] of files) {
  const up = (await call('POST', `/projects/${pid}/documents/upload-url`, { name, category: 'OTHER' }, sa.token)).body.data;
  await fetch(HOST + up.uploadUrl, { method: 'PUT', body: bytes });
  docs[name] = (await call('POST', `/projects/${pid}/documents`, { name, category: 'OTHER', storageKey: up.storageKey, size: bytes.length, mimeType: mime }, sa.token)).body.data.id;
}
const disp = async (doc, route) => {
  const r = await fetch(`${API}/projects/${pid}/documents/${doc}/${route}`, { redirect: 'manual', headers: { authorization: 'Bearer ' + sa.token } });
  const loc = r.headers.get('location');
  if (!loc) return { status: r.status };
  const f = await fetch(HOST + loc);
  return { status: r.status, disposition: f.headers.get('content-disposition') ?? '', type: f.headers.get('content-type') };
};
for (const [name] of files) {
  const o = await disp(docs[name], 'open'), d = await disp(docs[name], 'file');
  const browserCan = name !== 'c.docx';
  ok(`${name}: "open" ${browserCan ? 'is shown in the browser (inline)' : 'cannot be shown by a browser, so it downloads'}`, o.status === 302 && (browserCan ? /^inline/.test(o.disposition) : /^attachment/.test(o.disposition)), JSON.stringify(o));
  ok(`${name}: "download" always saves the file (attachment)`, d.status === 302 && /^attachment/.test(d.disposition), JSON.stringify(d));
}
const ev = await db.documentAccessEvent.findMany({ where: { documentId: docs['a.pdf'] }, select: { action: true } });
ok('opening is logged as PREVIEW and downloading as DOWNLOAD', ev.some((e) => e.action === 'PREVIEW') && ev.some((e) => e.action === 'DOWNLOAD'), JSON.stringify(ev.map((e) => e.action)));
const out = (await call('POST', '/users', { email: 'outsider@test.local', fullName: 'Outsider', role: 'USER', authType: 'PASSWORD', password: 'Out-Test-Pass-2026' }, sa.token)).body.data;
const ol = await call('POST', '/auth/login', { email: 'outsider@test.local', password: 'Out-Test-Pass-2026' });
const outTok = ol.body.data.token;
ok('a person outside the project cannot open (403)', (await fetch(`${API}/projects/${pid}/documents/${docs['a.pdf']}/open`, { redirect: 'manual', headers: { authorization: 'Bearer ' + outTok } })).status === 403);
const rawLoc = (await fetch(`${API}/projects/${pid}/documents/${docs['b.png']}/open`, { redirect: 'manual', headers: { authorization: 'Bearer ' + sa.token } })).headers.get('location');
ok('the link path ends with the file name (so a picture tab is titled with it)', /\/b\.png$/.test(rawLoc ?? ''), rawLoc?.slice(-40));
const named = await disp(docs['a.pdf'], 'open');
ok('the opened file carries its real name, not the storage name', /filename\*=UTF-8''a\.pdf/.test(named.disposition), named.disposition);

const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new' });
const ctx = await browser.createBrowserContext(); const p = await ctx.newPage(); await p.setViewport({ width: 1400, height: 1000 });
const errs = []; p.on('pageerror', (e) => errs.push(e.message.slice(0, 100)));
await p.goto(WEB + '/login', { waitUntil: 'domcontentloaded' });
await p.evaluate((tk, u) => { localStorage.setItem('dbi_auth_token', tk); localStorage.setItem('dbi_user', JSON.stringify(u)); }, sa.token, sa.user);
await p.goto(WEB + `/documents?projectId=${pid}`, { waitUntil: 'load' }); await wait(2500);
const links = await p.$$eval('tbody a', (as) => as.map((a) => ({ title: a.title, href: a.getAttribute('href'), target: a.target, download: a.hasAttribute('download') })));
const open = links.filter((x) => /Open/.test(x.title)), dl = links.filter((x) => /Download/.test(x.title));
ok('Document Vault: every Open link goes to /open in a new tab', open.length === 3 && open.every((x) => /\/open$/.test(x.href) && x.target === '_blank'), JSON.stringify(open.slice(0, 1)));
ok('every Download link goes to /file and is a download', dl.length === 3 && dl.every((x) => /\/file$/.test(x.href) && x.download), JSON.stringify(dl.slice(0, 1)));
await p.goto(WEB + `/documents?projectId=${pid}`, { waitUntil: 'load' }); await wait(2000);
await p.evaluate(() => [...document.querySelectorAll('button')].find((b) => b.textContent.trim() === 'Timeline')?.click()); await wait(2500);
const tl = await p.$$eval('main a', (as) => as.filter((a) => /Open|Download/.test(a.textContent)).map((a) => ({ text: a.textContent.trim(), href: a.getAttribute('href'), download: a.hasAttribute('download') })));
ok('Timeline: "Open" opens (/open), "Download" downloads (/file)', tl.some((x) => /Open/.test(x.text) && /\/open$/.test(x.href)) && tl.some((x) => /Download/.test(x.text) && /\/file$/.test(x.href) && x.download), JSON.stringify(tl.slice(0, 2)));
ok('no page crashes', errs.length === 0, errs.join());
await browser.close();
await call('DELETE', `/projects/${pid}`, null, sa.token);
await db.profile.deleteMany({ where: { email: 'outsider@test.local' } });
await db.$disconnect();
console.log(`\n${res.filter(Boolean).length}/${res.length} passed`);
