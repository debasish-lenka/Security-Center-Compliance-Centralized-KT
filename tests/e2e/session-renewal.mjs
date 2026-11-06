// Short logins: a token lasts JWT_EXPIRES_IN (8h by default), and a person who keeps working gets a fresh one.
// Run with: node e2e/run.mjs session-renewal
import { createHmac } from 'crypto';
import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import { createRequire } from 'module';
import { API_URL, DB_URL, API_PKG, ADMIN_EMAIL, ADMIN_PASSWORD, ROOT } from './config.mjs';

const { PrismaClient } = createRequire(API_PKG)('@prisma/client');
const db = new PrismaClient(DB_URL ? { datasources: { db: { url: DB_URL } } } : undefined);
const A = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
const b32 = (s) => { let bits = 0, v = 0; const o = []; for (const c of s) { v = (v << 5) | A.indexOf(c); bits += 5; if (bits >= 8) { o.push((v >>> (bits - 8)) & 255); bits -= 8; } } return Buffer.from(o); };
const totp = (secret) => { const m = Buffer.alloc(8); m.writeBigUInt64BE(BigInt(Math.floor(Date.now() / 30000))); const h = createHmac('sha1', b32(secret)).update(m).digest(); const o = h[h.length - 1] & 15; return String((((h[o] & 127) << 24) | (h[o + 1] << 16) | (h[o + 2] << 8) | h[o + 3]) % 1e6).padStart(6, '0'); };
const raw = (m, p, b, t) => fetch(API_URL + p, { method: m, headers: { ...(b ? { 'content-type': 'application/json' } : {}), ...(t ? { authorization: 'Bearer ' + t } : {}) }, body: b ? JSON.stringify(b) : undefined });
const call = async (m, p, b, t) => { const r = await raw(m, p, b, t); return { status: r.status, body: await r.json().catch(() => ({})) }; };
const res = []; const ok = (n, c, x = '') => { res.push(c); console.log(`${c ? 'PASS' : 'FAIL'}  ${n} ${x}`); };

// the API's own secret (to make tokens of a chosen age); the tests only run against a local API
const envFile = join(ROOT, 'apps', 'api', '.env');
const secret = process.env.JWT_SECRET ?? (existsSync(envFile) ? (readFileSync(envFile, 'utf8').match(/^JWT_SECRET\s*=\s*"?([^"\r\n]+)"?/m) ?? [])[1] : undefined);
const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
const forge = (claims, iatAgo, lifeSeconds) => {
  const now = Math.floor(Date.now() / 1000);
  const head = b64({ alg: 'HS256', typ: 'JWT' }); const body = b64({ ...claims, iat: now - iatAgo, exp: now - iatAgo + lifeSeconds });
  return `${head}.${body}.${createHmac('sha256', secret).update(`${head}.${body}`).digest('base64url')}`;
};

await db.profile.updateMany({ where: { email: ADMIN_EMAIL }, data: { totpEnabled: false, totpSecretEnc: null, recoveryCodeHashes: [] } });
const l = await call('POST', '/auth/login', { email: ADMIN_EMAIL, password: ADMIN_PASSWORD });
const mt = l.body.data.mfaToken; const sec = (await call('POST', '/auth/mfa/setup', { mfaToken: mt })).body.data.secret;
const conf = await raw('POST', '/auth/mfa/confirm', { mfaToken: mt, code: totp(sec) });
const sa = (await conf.json()).data;
const cookie = conf.headers.getSetCookie().find((c) => c.startsWith('auth_token=')) ?? '';

const payloadOf = (t) => JSON.parse(Buffer.from(t.split('.')[1], 'base64url').toString());
const life = payloadOf(sa.token).exp - payloadOf(sa.token).iat;
ok('a login lasts hours, not days', life > 0 && life <= 24 * 3600, `(${life / 3600} h)`);
ok('the cookie lives as long as the token', Number((cookie.match(/Max-Age=(\d+)/i) ?? [])[1]) === life, cookie.match(/Max-Age=\d+/i)?.[0]);
ok('can read the signing secret for this test', !!secret);

const me = await raw('GET', '/auth/me', null, sa.token);
ok('a new token works', me.status === 200);
ok('a new token is not replaced straight away', !me.headers.get('x-session-token'));

const uid = payloadOf(sa.token).sub; const claims = { sub: uid, email: sa.user.email, role: sa.user.role };
const mid = forge(claims, Math.floor(life / 4), life);   // a quarter of its life used: past the renewal point
const r2 = await raw('GET', '/auth/me', null, mid);
const fresh = r2.headers.get('x-session-token');
ok('an older token still works', r2.status === 200);
ok('an older token is swapped for a fresh one', !!fresh);
ok('the fresh one is new (just issued)', !!fresh && Math.floor(Date.now() / 1000) - payloadOf(fresh).iat <= 2);
ok('the fresh one works', !!fresh && (await raw('GET', '/auth/me', null, fresh)).status === 200);
ok('the fresh one is also set as the cookie', (r2.headers.getSetCookie().some((c) => c.startsWith('auth_token=') && !c.includes(mid))));

const young = forge(claims, 5, life);
ok('a young token is left alone', !(await raw('GET', '/auth/me', null, young)).headers.get('x-session-token'));

const expired = forge(claims, life + 60, life);
ok('an expired token is refused', (await raw('GET', '/auth/me', null, expired)).status === 401);
const forged = sa.token.slice(0, -4) + 'AAAA';
ok('a tampered token is refused', (await raw('GET', '/auth/me', null, forged)).status === 401);
const noRenewal = await raw('GET', '/auth/me', null, expired);
ok('an expired token is not renewed', !noRenewal.headers.get('x-session-token'));

// someone signed out by a password change cannot be kept alive by an old token
const OLD = forge(claims, Math.floor(life / 4), life);
await db.profile.update({ where: { id: uid }, data: { sessionsValidFrom: new Date() } });
const ended = await raw('GET', '/auth/me', null, OLD);
ok('a token from before "sign out everywhere" is refused, not renewed', ended.status === 401 && !ended.headers.get('x-session-token'));
await db.profile.update({ where: { id: uid }, data: { sessionsValidFrom: null } });

await db.$disconnect();
console.log(`\n${res.filter(Boolean).length}/${res.length} passed`);
