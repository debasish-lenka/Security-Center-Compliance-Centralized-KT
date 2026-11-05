// End-to-end test. Needs the local API, web app and database (see tests/README.md). Run with: node e2e/run.mjs <name>
import { API_URL, WEB_URL, API_ORIGIN, CHROME, DB_URL, API_PKG, ADMIN_EMAIL, ADMIN_PASSWORD, TMP, ROOT } from './config.mjs';
import { join as joinPath } from 'path';
import puppeteer from 'puppeteer-core';
import { createHmac } from 'crypto';
import { writeFileSync } from 'fs';
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
const clean = async () => {
  const us = (await db.profile.findMany({ where: { email: { endsWith: '@test.local' } }, select: { id: true } })).map((u) => u.id);
  await db.project.deleteMany({ where: { OR: [{ createdById: { in: us } }, { ownerId: { in: us } }] } });
  await db.workSession.deleteMany({ where: { userId: { in: us } } });
  await db.profile.deleteMany({ where: { id: { in: us } } });
};
await clean();
await db.profile.updateMany({ where: { email: ADMIN_EMAIL }, data: { totpEnabled: false, totpSecretEnc: null, recoveryCodeHashes: [] } });
const sa = await login(ADMIN_EMAIL, ADMIN_PASSWORD);
const PW = 'Upc-Test-Pass-2026';
const ids = {};
for (const k of ['a', 'b']) ids[k] = (await call('POST', '/users', { email: `${k}@test.local`, fullName: `Person ${k}`, role: 'USER', authType: 'PASSWORD', password: PW }, sa.token)).body.data.id;
const S = {}; for (const k of Object.keys(ids)) S[k] = await login(`${k}@test.local`, PW);
const p1 = (await call('POST', '/projects', { name: 'UPC one', ownerId: ids.a, priority: 'LOW' }, S.a.token)).body.data.id;
const p2 = (await call('POST', '/projects', { name: 'UPC two', ownerId: ids.b, priority: 'LOW' }, S.b.token)).body.data.id;

const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
const PDF = Buffer.from('%PDF-1.4\n1 0 obj\n<<>>\nendobj\n');
const EXE = Buffer.concat([Buffer.from('MZ'), Buffer.alloc(200, 0x90)]);
const ZIP = Buffer.concat([Buffer.from([0x50, 0x4b, 0x03, 0x04]), Buffer.alloc(60, 1)]);
const OLE = Buffer.concat([Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]), Buffer.alloc(60, 2)]);
const TXT = Buffer.from('plain readable text\nline two\n');
const BIN = Buffer.concat([Buffer.from('looks like text but'), Buffer.from([0, 1, 2, 3]), Buffer.from(' has binary')]);
const urlFor = async (pid, tok, name) => call('POST', `/projects/${pid}/documents/upload-url`, { name, category: 'OTHER' }, tok);
const putFile = async (pid, tok, name, bytes, declared) => {
  const u = await urlFor(pid, tok, name);
  if (u.status !== 200) return { stage: 'url', status: u.status, code: u.body.error?.code };
  // a server that refuses a huge body may close the connection before the client has finished sending it
  const put = await fetch(FILES + u.body.data.uploadUrl, { method: 'PUT', body: bytes }).catch(() => null);
  if (!put) return { stage: 'put', status: 0, code: 'CONNECTION_CLOSED', key: u.body.data.storageKey, message: 'connection closed by the server' };
  const pj = await put.json().catch(() => ({}));
  if (put.status !== 200) return { stage: 'put', status: put.status, code: pj.error?.code, key: u.body.data.storageKey, message: pj.error?.message };
  const doc = await call('POST', `/projects/${pid}/documents`, { name, category: 'OTHER', storageKey: u.body.data.storageKey, size: declared ?? bytes.length, mimeType: 'application/octet-stream' }, tok);
  return { stage: 'doc', status: doc.status, code: doc.body.error?.code, doc: doc.body.data, key: u.body.data.storageKey };
};

// ---- the name ----
for (const bad of ['virus.exe', 'run.js', 'page.html', 'pic.svg', 'start.bat', 'script.ps1', 'run.sh', 'shell.php', 'noending', 'report.pdf.exe', 'LOUD.EXE', 'setup.msi', 'tool.jar', 'x.scr', 'a.lnk']) {
  const r = await urlFor(p1, S.a.token, bad);
  ok(`"${bad}" is refused before anything is sent`, r.status === 400 && r.body.error?.code === 'UNSUPPORTED_TYPE', `${r.status} ${r.body.error?.code ?? ''}`);
}
for (const good of ['a.pdf', 'b.PNG', 'c.docx', 'd.xlsx', 'e.txt', 'f.conf', 'g.zip', 'h.JPG', 'i.csv']) ok(`"${good}" is accepted`, (await urlFor(p1, S.a.token, good)).status === 200);

// ---- the content ----
const t = async (n, name, bytes, want) => { const r = await putFile(p1, S.a.token, name, bytes); ok(n, want === 'ok' ? r.stage === 'doc' && r.status === 201 : r.stage === 'put' && r.status === 415, JSON.stringify({ stage: r.stage, status: r.status, code: r.code })); return r; };
await t('a real PDF is stored', 'real.pdf', PDF, 'ok');
await t('a real PNG is stored', 'real.png', PNG, 'ok');
await t('a Word/Excel (zip) file is stored', 'real.docx', ZIP, 'ok');
await t('an old Word (OLE) file is stored', 'old.doc', OLE, 'ok');
await t('a text file is stored', 'real.txt', TXT, 'ok');
const exePdf = await t('a program renamed to .pdf is refused', 'fake.pdf', EXE, 'no');
ok('...and the refused file is not on the disk (nothing to attach)', (await call('POST', `/projects/${p1}/documents`, { name: 'fake.pdf', category: 'OTHER', storageKey: exePdf.key, size: 10, mimeType: 'x' }, S.a.token)).body.error?.code === 'FILE_NOT_FOUND');
await t('a PDF renamed to .png is refused', 'fake.png', PDF, 'no');
await t('plain text renamed to .docx is refused', 'fake.docx', TXT, 'no');
await t('a binary renamed to .txt is refused', 'fake.txt', BIN, 'no');
{ const r = await putFile(p1, S.a.token, 'empty.pdf', Buffer.alloc(0)); ok('an empty file is refused with a clear message', r.stage === 'put' && [400, 415].includes(r.status) && /empty/i.test(r.message ?? ''), JSON.stringify({ status: r.status, message: r.message })); }
const big = await putFile(p1, S.a.token, 'huge.pdf', Buffer.concat([PDF, Buffer.alloc(51 * 1024 * 1024)]));
ok('a file over the 50 MB limit is refused (413 with a clear message, or the connection is closed)', big.stage === 'put' && ((big.status === 413 && big.code === 'TOO_LARGE' && /50 MB/.test(big.message ?? '')) || big.status === 0), JSON.stringify({ status: big.status, code: big.code, message: big.message }));

// ---- the document record can only point at the file this project just received ----
const mine = await putFile(p1, S.a.token, 'mine.pdf', PDF, 5);
ok("the size is the real size on disk, not what the browser said (it claimed 5 bytes)", mine.status === 201 && mine.doc.size === PDF.length, String(mine.doc?.size));
const otherUp = await urlFor(p2, S.b.token, 'secret.pdf'); await fetch(FILES + otherUp.body.data.uploadUrl, { method: 'PUT', body: PDF });
const steal = await call('POST', `/projects/${p1}/documents`, { name: 'taken.pdf', category: 'OTHER', storageKey: otherUp.body.data.storageKey, size: 10, mimeType: 'application/pdf' }, S.a.token);
ok("a document cannot point at ANOTHER project's file", steal.status === 400 && steal.body.error?.code === 'INVALID_STORAGE_KEY', JSON.stringify(steal.body.error));
const trav = await call('POST', `/projects/${p1}/documents`, { name: 'x.pdf', category: 'OTHER', storageKey: `${p1}/work/abc/123.jpg`, size: 10, mimeType: 'image/jpeg' }, S.a.token);
ok('nor at a work screenshot or version file of its own project', trav.status === 400 && trav.body.error?.code === 'INVALID_STORAGE_KEY');
const dots = await call('POST', `/projects/${p1}/documents`, { name: 'x.pdf', category: 'OTHER', storageKey: `${p1}/../${p2}/1793800000000-aaaaaaaa.pdf`, size: 10, mimeType: 'application/pdf' }, S.a.token);
ok('a key with ../ is refused', dots.status === 400);
const reuse = await call('POST', `/projects/${p1}/documents`, { name: 'again.pdf', category: 'OTHER', storageKey: mine.key, size: 10, mimeType: 'application/pdf' }, S.a.token);
ok('the same uploaded file cannot be attached to a second document', reuse.status === 409 && reuse.body.error?.code === 'ALREADY_USED');
const ghost = await call('POST', `/projects/${p1}/documents`, { name: 'ghost.pdf', category: 'OTHER', storageKey: `${p1}/1793800000000-abcdef12.pdf`, size: 10, mimeType: 'application/pdf' }, S.a.token);
ok('a key that was never uploaded is refused', ghost.status === 400 && ghost.body.error?.code === 'FILE_NOT_FOUND');

// ---- the policy and the page ----
const pol = await call('GET', '/upload-policy', null, S.a.token);
ok('the policy lists what is allowed (pdf yes, exe no) and the limit', pol.status === 200 && pol.body.data.extensions.includes('pdf') && !pol.body.data.extensions.includes('exe') && pol.body.data.maxMb === 50);
ok('it needs a login', (await call('GET', '/upload-policy')).status === 401);

const BAD = joinPath(TMP, 'dbi-bad.exe'), GOOD = joinPath(TMP, 'dbi-good.pdf'), FAKE = joinPath(TMP, 'dbi-fake-name.pdf');
writeFileSync(BAD, EXE); writeFileSync(GOOD, PDF); writeFileSync(FAKE, EXE);
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new' });
const ctx = await browser.createBrowserContext(); const p = await ctx.newPage(); await p.setViewport({ width: 1400, height: 1100 });
const errs = []; p.on('pageerror', (e) => errs.push(e.message.slice(0, 100)));
await p.goto(WEB + '/login', { waitUntil: 'domcontentloaded' });
await p.evaluate((tk, u) => { localStorage.setItem('dbi_auth_token', tk); localStorage.setItem('dbi_user', JSON.stringify(u)); }, S.a.token, S.a.user);
await p.goto(WEB + `/documents?projectId=${p1}`, { waitUntil: 'load' }); await wait(3000);
await p.evaluate(() => [...document.querySelectorAll('button')].find((b) => /Upload/.test(b.textContent))?.click()); await wait(1500);
const hint = await p.evaluate(() => document.querySelector('[role=dialog]')?.innerText.replace(/\s+/g, ' ') ?? '');
ok('the upload dialog states the limit and the allowed types', /Up to 50 MB/.test(hint) && /\.pdf/.test(hint) && /Programs, scripts and web pages are not accepted/.test(hint), hint.slice(hint.indexOf('Up to'), hint.indexOf('Up to') + 120));
ok('the file picker is filtered (accept=...)', (await p.$eval('#upload-file', (e) => e.accept)).includes('.pdf'));
const submit = async () => p.evaluate(() => [...document.querySelectorAll('[role=dialog] button')].find((b) => /^Upload$/.test(b.textContent.trim()))?.click());
const input = await p.$('#upload-file');
await input.uploadFile(BAD); await wait(300); await submit(); await wait(1500);
ok('a .exe is stopped on the page with a clear message', /This type of file is not allowed/.test(await p.evaluate(() => document.body.innerText)));
await input.uploadFile(FAKE); await wait(300); await submit(); await wait(2500);
ok('a program renamed to .pdf is stopped by the server and the page shows why', /not a real \.pdf file/.test(await p.evaluate(() => document.body.innerText)));
await input.uploadFile(GOOD); await wait(300); await submit(); await wait(3000);
ok('a real PDF uploads', /Document uploaded successfully/.test(await p.evaluate(() => document.body.innerText)));
ok('no page crashes', errs.length === 0, errs.join());
await browser.close();
await clean();
await db.$disconnect();
console.log(`\n${res.filter(Boolean).length}/${res.length} passed`);
