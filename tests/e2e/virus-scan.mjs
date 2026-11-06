// Virus scan of uploads. There is no real ClamAV on a developer machine, so this starts a stand-in scanner that speaks the
// same protocol (clamd INSTREAM: finds the standard EICAR test string), and a second throw-away API on :3101 that talks to it.
// What is proven: a clean file goes through (also a big one, sent in pieces), an infected one is refused and logged,
// and when the scanner is down or answers nonsense the upload is refused, never let through unscanned.
// The real ClamAV is checked on the server with the EICAR file (see tests/README.md).
import { createServer } from 'net';
import { spawn } from 'child_process';
import { createHmac } from 'crypto';
import { existsSync } from 'fs';
import { join } from 'path';
import { createRequire } from 'module';
import { DB_URL, API_PKG, ADMIN_EMAIL, ADMIN_PASSWORD, ROOT } from './config.mjs';

const { PrismaClient } = createRequire(API_PKG)('@prisma/client');
const db = new PrismaClient(DB_URL ? { datasources: { db: { url: DB_URL } } } : undefined);
const res = []; const ok = (n, c, x = '') => { res.push(c); console.log(`${c ? 'PASS' : 'FAIL'}  ${n} ${x}`); };
const wait = (ms) => new Promise((x) => setTimeout(x, ms));
const EICAR = 'X5O!P%@AP[4\\PZX54(P^)7CC)7}$EICAR-STANDARD-ANTIVIRUS-TEST-FILE!$H+H*';

// ---- the stand-in scanner ----
let mode = 'normal';           // normal | garbage
let seen = [];                 // sizes of the files it was sent
const scanner = createServer((sock) => {
  let buf = Buffer.alloc(0);
  sock.on('error', () => {});
  sock.on('data', (d) => {
    buf = Buffer.concat([buf, d]);
    if (buf.length < 10 || buf.subarray(0, 10).toString() !== 'zINSTREAM\0') return;
    let pos = 10; const parts = [];
    for (;;) {
      if (buf.length < pos + 4) return;
      const len = buf.readUInt32BE(pos); pos += 4;
      if (len === 0) break;
      if (buf.length < pos + len) return;
      parts.push(buf.subarray(pos, pos + len)); pos += len;
    }
    const file = Buffer.concat(parts); seen.push(file.length);
    if (mode === 'garbage') return sock.end('what is this\0');
    sock.end(file.includes(EICAR) ? 'stream: Eicar-Test-Signature FOUND\0' : 'stream: OK\0');
  });
});
await new Promise((r) => scanner.listen(0, '127.0.0.1', r));
const scannerPort = scanner.address().port;

// ---- a second API, with scanning on ----
const tsx = [join(ROOT, 'node_modules', 'tsx', 'dist', 'cli.mjs'), join(ROOT, 'apps', 'api', 'node_modules', 'tsx', 'dist', 'cli.mjs')].find(existsSync);
const PORT = 3101; const ORIGIN = `http://localhost:${PORT}`; const API = `${ORIGIN}/api/v1`;
const api = spawn(process.execPath, [tsx, 'src/index.ts'], { cwd: join(ROOT, 'apps', 'api'), env: { ...process.env, PORT: String(PORT), VIRUS_SCAN: 'on', CLAMAV_HOST: '127.0.0.1', CLAMAV_PORT: String(scannerPort), CLAMAV_TIMEOUT_MS: '8000', BACKGROUND_JOBS: 'off' }, stdio: 'ignore' });
const stop = () => { try { api.kill(); } catch {} };
process.on('exit', stop);
let up = false;
for (let i = 0; i < 60 && !up; i++) { await wait(1000); up = await fetch(`${ORIGIN}/health`).then((r) => r.ok).catch(() => false); }
ok('the test API with scanning on started', up);
if (!up) { stop(); scanner.close(); await db.$disconnect(); console.log(`\n0/${res.length} passed`); process.exit(1); }

const A = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
const b32 = (s) => { let bits = 0, v = 0; const o = []; for (const c of s) { v = (v << 5) | A.indexOf(c); bits += 5; if (bits >= 8) { o.push((v >>> (bits - 8)) & 255); bits -= 8; } } return Buffer.from(o); };
const totp = (secret) => { const m = Buffer.alloc(8); m.writeBigUInt64BE(BigInt(Math.floor(Date.now() / 30000))); const h = createHmac('sha1', b32(secret)).update(m).digest(); const o = h[h.length - 1] & 15; return String((((h[o] & 127) << 24) | (h[o + 1] << 16) | (h[o + 2] << 8) | h[o + 3]) % 1e6).padStart(6, '0'); };
const call = async (m, p, b, t) => { const r = await fetch(API + p, { method: m, headers: { ...(b ? { 'content-type': 'application/json' } : {}), ...(t ? { authorization: 'Bearer ' + t } : {}) }, body: b ? JSON.stringify(b) : undefined }); return { status: r.status, body: await r.json().catch(() => ({})) }; };

await db.profile.updateMany({ where: { email: ADMIN_EMAIL }, data: { totpEnabled: false, totpSecretEnc: null, recoveryCodeHashes: [] } });
const l = await call('POST', '/auth/login', { email: ADMIN_EMAIL, password: ADMIN_PASSWORD });
const mt = l.body.data.mfaToken; const sec = (await call('POST', '/auth/mfa/setup', { mfaToken: mt })).body.data.secret;
const sa = (await call('POST', '/auth/mfa/confirm', { mfaToken: mt, code: totp(sec) })).body.data;
const pid = (await call('POST', '/projects', { name: 'VIRUS SCAN test', ownerId: sa.user.id, priority: 'LOW' }, sa.token)).body.data.id;

const put = async (name, bytes) => {
  const u = (await call('POST', `/projects/${pid}/documents/upload-url`, { name, category: 'OTHER' }, sa.token)).body.data;
  const r = await fetch(ORIGIN + u.uploadUrl, { method: 'PUT', body: bytes });
  return { status: r.status, body: await r.json().catch(() => ({})), key: u.storageKey };
};
const policy = await call('GET', '/upload-policy', null, sa.token);
ok('the upload rules say that files are checked for viruses', policy.body.data?.virusScan === true);

// a clean file
seen = [];
const clean = await put('clean.txt', Buffer.from('just some notes\n'));
ok('a clean file is saved', clean.status === 200 && clean.body.success === true);
ok('the scanner was asked about exactly that file', seen.length === 1 && seen[0] === 16, JSON.stringify(seen));

// a big clean file arrives at the scanner whole, in pieces
seen = [];
const big = Buffer.alloc(30 * 1024 * 1024, 'a');
const bigRes = await put('big.log', big);
ok('a 30 MB clean file is saved', bigRes.status === 200);
ok('the scanner received all 30 MB', seen[0] === big.length, JSON.stringify(seen));

// an infected file
const before = await db.auditLog.count({ where: { resourceType: 'file', outcome: 'FAILURE' } });
const bad = await put('notes.txt', Buffer.from(`hello ${EICAR} world`));
ok('an infected file is refused', bad.status === 422 && bad.body.error?.code === 'VIRUS_FOUND', `${bad.status} ${bad.body.error?.code}`);
ok('the message names what was found', /Eicar-Test-Signature/.test(bad.body.error?.message ?? ''));
const logged = await db.auditLog.findFirst({ where: { resourceType: 'file', resourceId: bad.key, outcome: 'FAILURE' } });
ok('the refusal is written to the audit log', !!logged && /Eicar/.test(logged.errorMessage ?? ''));
ok('only one new audit line', (await db.auditLog.count({ where: { resourceType: 'file', outcome: 'FAILURE' } })) === before + 1);
const point = await call('POST', `/projects/${pid}/documents`, { name: 'notes.txt', category: 'OTHER', storageKey: bad.key, size: 30, mimeType: 'text/plain' }, sa.token);
ok('a refused file cannot be turned into a document', point.status >= 400, `(${point.status})`);

// an infected file inside a pdf-looking file is still scanned (scan happens after the type check)
const badPdf = await put('x.pdf', Buffer.from(`%PDF-1.4\n% ${EICAR}\n`));
ok('an infected pdf is refused', badPdf.status === 422 && badPdf.body.error?.code === 'VIRUS_FOUND');
const exe = await call('POST', `/projects/${pid}/documents/upload-url`, { name: 'program.exe', category: 'OTHER' }, sa.token);
ok('a wrong type is still refused by the type rules first', exe.status >= 400 && !exe.body.data?.uploadUrl, `(${exe.status})`);

// the scanner answers nonsense
mode = 'garbage';
const g = await put('clean2.txt', Buffer.from('fine'));
ok('an unreadable scanner answer refuses the upload', g.status === 503 && g.body.error?.code === 'SCANNER_UNAVAILABLE', `${g.status}`);
mode = 'normal';

// the scanner is down
await new Promise((r) => scanner.close(r));
const down = await put('clean3.txt', Buffer.from('fine'));
ok('with the scanner down the upload is refused, not let through', down.status === 503 && down.body.error?.code === 'SCANNER_UNAVAILABLE', `${down.status}`);
ok('the message tells the person to try again', /try again/i.test(down.body.error?.message ?? ''));

await call('DELETE', `/projects/${pid}`, null, sa.token);
stop();
await db.project.deleteMany({ where: { name: 'VIRUS SCAN test' } });   // also what an interrupted earlier run left behind
await db.$disconnect();
console.log(`\n${res.filter(Boolean).length}/${res.length} passed`);
