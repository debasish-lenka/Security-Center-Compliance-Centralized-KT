// Audit log filters: several values at once, combined with each other. Uses log rows with known values that this test writes itself
// (resource types zz_a, zz_b, zz_c), so the numbers are exact whatever else is in the log. Run with: node e2e/run.mjs audit-api
import { createHmac } from 'crypto';
import { createRequire } from 'module';
import { API_URL, DB_URL, API_PKG, ADMIN_EMAIL, ADMIN_PASSWORD } from './config.mjs';

const { PrismaClient } = createRequire(API_PKG)('@prisma/client');
const db = new PrismaClient(DB_URL ? { datasources: { db: { url: DB_URL } } } : undefined);
const A = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
const b32 = (s) => { let bits = 0, v = 0; const o = []; for (const c of s) { v = (v << 5) | A.indexOf(c); bits += 5; if (bits >= 8) { o.push((v >>> (bits - 8)) & 255); bits -= 8; } } return Buffer.from(o); };
const totp = (secret) => { const m = Buffer.alloc(8); m.writeBigUInt64BE(BigInt(Math.floor(Date.now() / 30000))); const h = createHmac('sha1', b32(secret)).update(m).digest(); const o = h[h.length - 1] & 15; return String((((h[o] & 127) << 24) | (h[o + 1] << 16) | (h[o + 2] << 8) | h[o + 3]) % 1e6).padStart(6, '0'); };
const raw = (m, p, b, t) => fetch(API_URL + p, { method: m, headers: { ...(b ? { 'content-type': 'application/json' } : {}), ...(t ? { authorization: 'Bearer ' + t } : {}) }, body: b ? JSON.stringify(b) : undefined });
const call = async (m, p, b, t) => { const r = await raw(m, p, b, t); return { status: r.status, body: await r.json().catch(() => ({})) }; };
const res = []; const ok = (n, c, x = '') => { res.push(c); console.log(`${c ? 'PASS' : 'FAIL'}  ${n} ${x}`); };

await db.profile.updateMany({ where: { email: ADMIN_EMAIL }, data: { totpEnabled: false, totpSecretEnc: null, recoveryCodeHashes: [] } });
const l = await call('POST', '/auth/login', { email: ADMIN_EMAIL, password: ADMIN_PASSWORD });
const mt = l.body.data.mfaToken; const sec = (await call('POST', '/auth/mfa/setup', { mfaToken: mt })).body.data.secret;
const sa = (await call('POST', '/auth/mfa/confirm', { mfaToken: mt, code: totp(sec) })).body.data;
const adminId = sa.user.id;
await db.auditLog.deleteMany({ where: { resourceType: { startsWith: 'zz_' } } });
await db.profile.deleteMany({ where: { email: 'audit-two@test.local' } });
const u2 = (await call('POST', '/users', { email: 'audit-two@test.local', fullName: 'Audit Two', role: 'USER', authType: 'PASSWORD', password: 'Audit-Test-Pass-2026' }, sa.token)).body.data;
const u2tok = (await call('POST', '/auth/login', { email: 'audit-two@test.local', password: 'Audit-Test-Pass-2026' })).body.data?.token;

const now = Date.now();
const rows = [
  { actorId: adminId, action: 'CREATE', resourceType: 'zz_a', resourceId: 'r1', ipAddress: '203.0.113.5', outcome: 'SUCCESS', details: { name: 'Alpha plan' }, createdAt: new Date(now - 60_000) },
  { actorId: adminId, action: 'UPDATE', resourceType: 'zz_a', resourceId: 'r1', ipAddress: '203.0.113.5', outcome: 'SUCCESS', details: { title: 'Beta notes' }, createdAt: new Date(now - 50_000) },
  { actorId: adminId, action: 'DELETE', resourceType: 'zz_b', resourceId: 'r2', ipAddress: '203.0.113.9', outcome: 'FAILURE', errorMessage: 'denied by the rule', createdAt: new Date(now - 40_000) },
  { actorId: null, action: 'LOGIN', resourceType: 'zz_b', resourceId: 'r3', ipAddress: '198.51.100.7', outcome: 'SUCCESS', createdAt: new Date(now - 30_000) },
  { actorId: u2.id, action: 'UPDATE', resourceType: 'zz_a', resourceId: 'r4', ipAddress: '203.0.113.5', outcome: 'SUCCESS', createdAt: new Date(now - 20_000) },
  { actorId: adminId, action: 'CREATE', resourceType: 'zz_c', resourceId: 'r5', ipAddress: '203.0.113.5', outcome: 'SUCCESS', createdAt: new Date(now - 3 * 86400_000) },
];
for (const r of rows) await db.auditLog.create({ data: r });
const get = async (qs) => (await call('GET', `/audit-logs?limit=100&${qs}`, null, sa.token)).body.data;
const ids = (d) => d.items.map((i) => i.resourceId).sort().join(',');
const ZZ = 'resourceType=zz_a,zz_b,zz_c';

ok('several resource types at once', ids(await get('resourceType=zz_a,zz_b')) === 'r1,r1,r2,r3,r4', ids(await get('resourceType=zz_a,zz_b')));
ok('one resource type still works (older callers)', (await get('resourceType=zz_c')).total === 1);
ok('several actions at once', ids(await get(`${ZZ}&action=CREATE,UPDATE`)) === 'r1,r1,r4,r5');
ok('action + resource type together', ids(await get('resourceType=zz_a&action=UPDATE')) === 'r1,r4');
ok('failed only', ids(await get(`${ZZ}&outcome=FAILURE`)) === 'r2');
ok('succeeded only', (await get(`${ZZ}&outcome=SUCCESS`)).total === 5);
ok('both outcomes = no filter', (await get(`${ZZ}&outcome=SUCCESS,FAILURE`)).total === 6);
ok('one person', ids(await get(`${ZZ}&actorId=${adminId}`)) === 'r1,r1,r2,r5');
ok('two people', ids(await get(`${ZZ}&actorId=${adminId},${u2.id}`)) === 'r1,r1,r2,r4,r5');
ok('entries with no person ("system")', ids(await get(`${ZZ}&actorId=system`)) === 'r3');
ok('a person and "system" together', ids(await get(`${ZZ}&actorId=${u2.id},system`)) === 'r3,r4');
ok('part of an IP address', ids(await get(`${ZZ}&ip=203.0.113`)) === 'r1,r1,r2,r4,r5');
ok('exact IP + person', ids(await get(`${ZZ}&ip=203.0.113.5&actorId=${adminId}`)) === 'r1,r1,r5');
ok('everything on one item', ids(await get('resourceType=zz_a&resourceId=r1')) === 'r1,r1');
ok('search finds a name inside the details', ids(await get(`${ZZ}&search=Alpha`)) === 'r1');
ok('search finds a title inside the details', ids(await get(`${ZZ}&search=beta%20notes`)) === 'r1');
ok('search finds the error text', ids(await get(`${ZZ}&search=denied%20by`)) === 'r2');
ok('search finds a person by name', ids(await get(`${ZZ}&search=Audit%20Two`)) === 'r4');
const today = new Date(now + 5.5 * 3600_000).toISOString().slice(0, 10);
ok('from a date (that day in IST) leaves out older entries', ids(await get(`${ZZ}&startDate=${today}`)) === 'r1,r1,r2,r3,r4');
ok('to a date leaves out newer entries', ids(await get(`${ZZ}&endDate=${new Date(now - 2 * 86400_000).toISOString().slice(0, 10)}`)) === 'r5');
const hhmm = (ms) => new Date(ms + 5.5 * 3600_000).toISOString().slice(0, 16); // IST wall-clock minute
ok('a date and time range (read as IST)', ids(await get(`${ZZ}&startDate=${hhmm(now - 45_000)}&endDate=${hhmm(now - 25_000)}`)).length > 0 && !ids(await get(`${ZZ}&startDate=${hhmm(now - 45_000)}&endDate=${hhmm(now - 25_000)}`)).includes('r5'));
ok('a time in the future finds nothing', (await get(`${ZZ}&startDate=${new Date(now + 86400_000).toISOString()}`)).total === 0);
ok('an action that does not exist finds nothing (not an error)', (await get(`${ZZ}&action=NOPE`)).total === 0);
ok('a bad person id finds nothing (not an error)', (await get(`${ZZ}&actorId=not-a-uuid`)).total === 0);
ok('all filters together', ids(await get(`resourceType=zz_a,zz_b&action=UPDATE,DELETE&outcome=FAILURE&actorId=${adminId}&ip=203.0.113.9`)) === 'r2');

const byIp = await get(`${ZZ}&sortBy=ipAddress&sortOrder=asc`);
ok('sorted by IP address', byIp.items[0].ipAddress === '198.51.100.7');
const named = (await get(`${ZZ}&search=Alpha`)).items[0];
ok('each entry says what it is about', named?.itemName === 'Alpha plan');
ok('entries about something that does not exist have no link', named?.link === null);

const sum = (await call('GET', `/audit-logs/summary?${ZZ}`, null, sa.token)).body.data;
ok('summary: total and failed', sum.total === 6 && sum.failed === 1 && sum.succeeded === 5, JSON.stringify([sum.total, sum.failed]));
ok('summary: people and system entries', sum.people === 2 && sum.systemEvents === 1);
ok('summary: top actions', sum.byAction.find((a) => a.value === 'UPDATE')?.count === 2 && sum.byAction.find((a) => a.value === 'CREATE')?.count === 2);
ok('summary: per day (two days)', sum.perDay.length === 2 && sum.perDay[sum.perDay.length - 1].count === 5, JSON.stringify(sum.perDay));
const sumF = (await call('GET', `/audit-logs/summary?${ZZ}&outcome=FAILURE`, null, sa.token)).body.data;
ok('summary follows the filter', sumF.total === 1 && sumF.failed === 1);

const actors = (await call('GET', '/audit-logs/actors', null, sa.token)).body.data;
ok('people list has the admin, Audit Two and "system"', ['system', adminId, u2.id].every((v) => actors.some((a) => a.value === v)) && actors.find((a) => a.value === u2.id)?.label === 'Audit Two');
const facets = (await call('GET', '/audit-logs/facets', null, sa.token)).body.data;
ok('facets list the resource types and actions with counts', facets.resourceTypes.find((r) => r.value === 'zz_a')?.count === 3 && facets.actions.some((a) => a.value === 'CREATE'));

const csv = await raw('GET', `/audit-logs/export?${ZZ}&action=UPDATE`, null, sa.token);
const text = await csv.text();
ok('the export follows the filter (2 rows + header)', csv.status === 200 && text.trim().split(/\r?\n/).length === 3, `${text.trim().split(/\r?\n/).length} lines`);
ok('a normal user cannot read the log', (await call('GET', '/audit-logs', null, u2tok)).status === 403);
ok('a normal user cannot read the summary', (await call('GET', '/audit-logs/summary', null, u2tok)).status === 403);

await db.auditLog.deleteMany({ where: { resourceType: { startsWith: 'zz_' } } });
await db.profile.deleteMany({ where: { email: 'audit-two@test.local' } });
await db.$disconnect();
console.log(`\n${res.filter(Boolean).length}/${res.length} passed`);
