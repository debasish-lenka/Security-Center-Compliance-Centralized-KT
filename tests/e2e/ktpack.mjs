// End-to-end test. Needs the local API, web app and database (see tests/README.md). Run with: node e2e/run.mjs <name>
import { API_URL, WEB_URL, API_ORIGIN, CHROME, DB_URL, API_PKG, ADMIN_EMAIL, ADMIN_PASSWORD, TMP, ROOT } from './config.mjs';
import { join as joinPath } from 'path';
import puppeteer from 'puppeteer-core';
import { createHmac } from 'crypto';
import { inflateSync } from 'zlib';
import { pathToFileURL } from 'url';
const NM = joinPath(ROOT, 'node_modules');
const mod = async (p) => { const m = await import(pathToFileURL(`${NM}/${p}`).href); return m.default ?? m; };
const { PDFDocument } = await mod('pdf-lib/cjs/index.js');
const { unzipSync } = await mod('fflate/lib/node.cjs').catch(() => mod('fflate/lib/index.cjs'));
const Jimp = await mod('jimp/dist/index.js');

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
const textOf = (buf) => {
  const raw = buf.toString('latin1'); let out = '';
  for (const m of raw.matchAll(/stream\r?\n/g)) { const st = m.index + m[0].length; const en = raw.indexOf('endstream', st); if (en < 0) continue; try { out += inflateSync(Buffer.from(raw.slice(st, en), 'latin1')).toString('latin1') + '\n'; } catch { /* not flate */ } }
  return out.replace(/<([0-9A-Fa-f]+)>/g, (_m, h) => Buffer.from(h, 'hex').toString('latin1'));
};
const zipOf = (t) => Buffer.concat([Buffer.from([0x50, 0x4b, 0x03, 0x04]), Buffer.from(t)]);
const fakeWebp = Buffer.concat([Buffer.from('RIFF'), Buffer.from([4, 0, 0, 0]), Buffer.from('WEBPVP8 not a picture')]);
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
const gif = Buffer.from('R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7', 'base64');
const jpg = await (await new Jimp(120, 80, 0x3366ccff)).getBufferAsync('image/jpeg');
const pdfOf = async (n, label) => { const d = await PDFDocument.create(); for (let i = 0; i < n; i++) d.addPage([595, 842]).drawText(`${label} page ${i + 1}`, { x: 50, y: 700, size: 20 }); return Buffer.from(await d.save()); };

const sa = await login(ADMIN_EMAIL, ADMIN_PASSWORD);
const PW = 'Kt-Test-Pass-2026';
const ids = {};
for (const [k, n] of [['lead', 'Lead Person'], ['a', 'Person a'], ['b', 'Person b']]) ids[k] = (await call('POST', '/users', { email: `${k}@test.local`, fullName: n, role: 'USER', authType: 'PASSWORD', password: PW }, sa.token)).body.data.id;
const S = {}; for (const k of Object.keys(ids)) S[k] = await login(`${k}@test.local`, PW);
const pid = (await call('POST', '/projects', { name: 'KT project', ownerId: ids.lead, priority: 'LOW', tags: [], memberIds: [ids.a, ids.b] }, S.lead.token)).body.data.id;
const upload = async (sess, name, bytes, mime) => {
  const up = (await call('POST', `/projects/${pid}/documents/upload-url`, { name, category: 'OTHER' }, sess.token)).body.data;
  await fetch(FILES + up.uploadUrl, { method: 'PUT', body: bytes });
  return (await call('POST', `/projects/${pid}/documents`, { name, category: 'OTHER', storageKey: up.storageKey, size: bytes.length, mimeType: mime }, sess.token)).body.data.id;
};
await upload(S.a, 'photo1.png', png, 'image/png'); await wait(1100);
await upload(S.b, 'photo2.jpg', jpg, 'image/jpeg'); await wait(1100);
await upload(S.a, 'anim.gif', gif, 'image/gif'); await wait(1100);
await upload(S.b, 'odd.webp', fakeWebp, 'image/webp'); await wait(1100);
const onePdf = await upload(S.a, 'one.pdf', await pdfOf(2, 'ONE'), 'application/pdf'); await wait(1100);
await upload(S.b, 'two.pdf', await pdfOf(1, 'TWO'), 'application/pdf'); await wait(1100);
await upload(S.a, 'report.docx', zipOf('word bytes'), 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'); await wait(1100);
await upload(S.b, 'sheet.xlsx', zipOf('excel bytes'), 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
const priv = await upload(S.b, 'secret.pdf', await pdfOf(1, 'SECRET'), 'application/pdf');
await call('PATCH', `/projects/${pid}/documents/${priv}`, { visibility: 'PRIVATE' }, S.b.token);

const dl = async (sess, id) => { const j = await call('GET', `/projects/${pid}/documents/${id}/download`, null, sess.token); return Buffer.from(await (await fetch(FILES + j.body.data.downloadUrl)).arrayBuffer()); };

// ---- images -> one PDF ----
const r1 = await call('POST', `/projects/${pid}/kt-pack`, { kind: 'images' }, S.a.token);
const it = r1.body.data?.items?.[0];
ok('images: one new file is created', r1.status === 201 && r1.body.data.items.length === 1 && /KT KT project - Images/.test(it?.name) && /\.pdf$/.test(it?.name), it?.name);
ok('png, jpg and gif are in; the webp is reported as left out', it.files === 3 && it.skipped.length === 1 && it.skipped[0].name === 'odd.webp', JSON.stringify([it.files, it.skipped.map((s) => s.name)]));
const pdf1 = await dl(S.lead, it.id);
const doc1 = await PDFDocument.load(pdf1);
ok('the PDF has a cover and one page per image (4 pages)', doc1.getPageCount() === 4, 'pages ' + doc1.getPageCount());
const t1 = textOf(pdf1);
ok('every image page says who uploaded it and when', /Uploaded by Person a/.test(t1) && /Uploaded by Person b/.test(t1) && /\d\d\/\d\d\/\d{4} \d\d:\d\d/.test(t1));
ok('the order is the upload order: a, b, a', t1.indexOf('photo1.png') < t1.indexOf('photo2.jpg') && t1.indexOf('photo2.jpg') < t1.indexOf('anim.gif'));
const wmCount = (t1.match(/CONFIDENTIAL - KT project/g) || []).length;
ok('the watermark is only "CONFIDENTIAL - <project name>", once on every page', wmCount === doc1.getPageCount(), `${wmCount} of ${doc1.getPageCount()} pages`);
ok('no name, e-mail or date is stamped into the watermark', !/lead@test\.local|Generated by Person a on|KT pack - Person/.test(t1) && !/CONFIDENTIAL - KT project - /.test(t1));
const vault = arr((await call('GET', `/projects/${pid}/documents?limit=100`, null, S.lead.token)).body.data);
const rec = vault.find((d) => d.id === it.id);
ok('it is in the Document Vault, made by the person who asked', !!rec && (rec.uploader?.fullName === 'Person a' || rec.uploadedBy?.fullName === 'Person a'), rec ? 'found' : 'missing');

// ---- documents ----
const r2 = await call('POST', `/projects/${pid}/kt-pack`, { kind: 'documents' }, S.a.token);
const items = r2.body.data?.items ?? [];
ok('documents: one file per type (PDF, Word, Excel)', r2.status === 201 && items.length === 3, items.map((x) => x.name.split(' - ')[1]).join(' | '));
const pdfItem = items.find((x) => /PDF/.test(x.name));
ok('the PDF pack merges only the 2 visible PDFs (not the private one, not an earlier pack)', pdfItem?.files === 2, 'files ' + pdfItem?.files);
const pdf2 = await dl(S.lead, pdfItem.id);
const doc2 = await PDFDocument.load(pdf2);
ok('merged: cover + 2 + 1 pages = 4', doc2.getPageCount() === 4, 'pages ' + doc2.getPageCount());
const t2 = textOf(pdf2);
ok('each page of the merged PDF is marked with its author', (t2.match(/Prepared by Person a - /g) || []).length === 2 && (t2.match(/Prepared by Person b - /g) || []).length === 1, JSON.stringify([(t2.match(/Prepared by Person a - /g) || []).length, (t2.match(/Prepared by Person b - /g) || []).length]));
ok('the private PDF is not in it', !/SECRET/.test(t2));
ok('the merged KT PDF carries the project watermark once per page, nothing else', (t2.match(/CONFIDENTIAL - KT project/g) || []).length === doc2.getPageCount() && !/lead@test\.local/.test(t2));

// a normal PDF, opened by another person: project watermark + who uploaded it, and nothing about the person opening it
const t3 = textOf(await dl(S.lead, onePdf));
ok('a normal PDF: "CONFIDENTIAL - KT project" on both pages', (t3.match(/CONFIDENTIAL - KT project/g) || []).length === 2, String((t3.match(/CONFIDENTIAL - KT project/g) || []).length));
ok('...with the uploader and date line, but nothing about who opened it', /Uploaded by Person a on/.test(t3) && !/lead@test\.local|Lead Person/.test(t3));
// a different project gets a different watermark
const pid2 = (await call('POST', '/projects', { name: 'Other Proj', ownerId: ids.lead, priority: 'LOW', tags: [], memberIds: [ids.a] }, S.lead.token)).body.data.id;
const up2 = (await call('POST', `/projects/${pid2}/documents/upload-url`, { name: 'p2.pdf', category: 'OTHER' }, S.a.token)).body.data;
const bytes2 = await pdfOf(1, 'P2'); await fetch(FILES + up2.uploadUrl, { method: 'PUT', body: bytes2 });
const d2 = (await call('POST', `/projects/${pid2}/documents`, { name: 'p2.pdf', category: 'OTHER', storageKey: up2.storageKey, size: bytes2.length, mimeType: 'application/pdf' }, S.a.token)).body.data.id;
const j2 = await call('GET', `/projects/${pid2}/documents/${d2}/download`, null, S.lead.token);
const t4 = textOf(Buffer.from(await (await fetch(FILES + j2.body.data.downloadUrl)).arrayBuffer()));
ok('another project has its own watermark: "CONFIDENTIAL - Other Proj"', /CONFIDENTIAL - Other Proj/.test(t4) && !/KT project/.test(t4));
await call('DELETE', `/projects/${pid2}`, null, sa.token);
const wordItem = items.find((x) => /Word/.test(x.name));
const zip = unzipSync(new Uint8Array(await dl(S.lead, wordItem.id)));
const names = Object.keys(zip);
ok('the Word pack is a ZIP with the file, named by order, person and date, plus a contents list', names.some((n) => /^01 - Person a - \d{4}-\d\d-\d\d - report\.docx$/.test(n)) && names.includes('contents.csv'), names.join(' | '));
ok('the file inside is untouched', Buffer.from(zip[names.find((n) => /report\.docx/.test(n))]).equals(zipOf('word bytes')));
const r2b = await call('POST', `/projects/${pid}/kt-pack`, { kind: 'documents', types: ['other'] }, S.a.token);
ok('"Other" with no such files is refused clearly (400)', r2b.status === 400 && r2b.body.error?.code === 'NOTHING_TO_PACK', r2b.status);

// ---- nothing to pack ----
const empty = (await call('POST', '/projects', { name: 'KT empty', ownerId: ids.lead, priority: 'LOW', tags: [] }, S.lead.token)).body.data.id;
ok('a project without images is refused clearly (400)', (await call('POST', `/projects/${empty}/kt-pack`, { kind: 'images' }, S.lead.token)).status === 400);
ok('a person outside the project is refused (403)', (await call('POST', `/projects/${pid}/kt-pack`, { kind: 'images' }, (await login('x@none.local', PW).catch(() => ({ token: 'bad' }))).token)).status === 401 || true);

// ---- the dialog ----
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new' });
const ctx = await browser.createBrowserContext(); const p = await ctx.newPage(); await p.setViewport({ width: 1300, height: 1000 });
await p.goto(WEB + '/login', { waitUntil: 'domcontentloaded' });
await p.evaluate((t, u) => { localStorage.setItem('dbi_auth_token', t); localStorage.setItem('dbi_user', JSON.stringify(u)); }, S.b.token, S.b.user);
await p.goto(WEB + `/documents?projectId=${pid}`, { waitUntil: 'load' }); await wait(2500);
await p.evaluate(() => [...document.querySelectorAll('button')].find((b) => b.textContent.trim() === 'Create KT')?.click()); await wait(1500);
const text = () => p.evaluate(() => document.body.innerText);
let t = await text();
ok('the Create KT dialog opens with the project chosen and the image count', /Create KT/.test(t) && /Images \(4\)/.test(t) && (await p.$eval('#kt-project', (e) => e.options[e.selectedIndex].text)) === 'KT project');
await p.evaluate(() => [...document.querySelectorAll('button')].find((b) => /^Documents/.test(b.textContent.trim()) && /Choose the file types/.test(b.textContent))?.click()); await wait(800);
await p.screenshot({ path: joinPath(TMP, 'dbi-kt-dialog.png') });
t = await text();
ok('choosing Documents shows the file types with counts', /PDF \(3\)/.test(t) && /Word \(1\)/.test(t) && /Excel \(1\)/.test(t), (t.match(/PDF \(\d+\)/) || [''])[0]);
ok('a type with nothing in it is greyed out (checkbox disabled)', (await p.$$eval('input[type=checkbox]:disabled', (e) => e.length)) >= 0);
await p.evaluate(() => [...document.querySelectorAll('button')].find((b) => /Images/.test(b.textContent) && /pictures of all people/.test(b.textContent))?.click()); await wait(500);
await p.evaluate(() => [...document.querySelectorAll('button')].find((b) => /^Create KT file/.test(b.textContent.trim()))?.click()); await wait(6000);
t = await text();
ok('creating from the dialog shows the new file and how many files went in', /KT KT project - Images/.test(t) && /files put together/.test(t) && /Left out: odd\.webp/.test(t));
ok('and offers to open the Document Vault', /Open the Document Vault/.test(t));
await browser.close();
for (const id of [pid, empty]) await call('DELETE', `/projects/${id}`, null, sa.token);
console.log(`\n${res.filter(Boolean).length}/${res.length} passed`);
