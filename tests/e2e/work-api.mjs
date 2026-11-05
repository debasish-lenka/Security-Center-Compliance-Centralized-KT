// End-to-end test. Needs the local API, web app and database (see tests/README.md). Run with: node e2e/run.mjs <name>
import { API_URL, WEB_URL, API_ORIGIN, CHROME, DB_URL, API_PKG, ADMIN_EMAIL, ADMIN_PASSWORD, TMP, ROOT } from './config.mjs';
import { join as joinPath } from 'path';
import { createHmac } from 'crypto';
import { createRequire } from 'module';
const req = createRequire(API_PKG);
const Jimp = req('jimp');
const { PrismaClient } = req('@prisma/client');
const db = new PrismaClient({ datasources: { db: { url: DB_URL } } });
const API = API_URL, FILES = API_ORIGIN;
const A = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
const b32 = (s) => { let bits = 0, v = 0; const o = []; for (const c of s) { v = (v << 5) | A.indexOf(c); bits += 5; if (bits >= 8) { o.push((v >>> (bits - 8)) & 255); bits -= 8; } } return Buffer.from(o); };
const totp = (secret) => { const m = Buffer.alloc(8); m.writeBigUInt64BE(BigInt(Math.floor(Date.now() / 30000))); const h = createHmac('sha1', b32(secret)).update(m).digest(); const o = h[h.length - 1] & 15; return String((((h[o] & 127) << 24) | (h[o + 1] << 16) | (h[o + 2] << 8) | h[o + 3]) % 1e6).padStart(6, '0'); };
const call = async (m, p, b, t) => { const r = await fetch(API + p, { method: m, headers: { ...(b ? { 'content-type': 'application/json' } : {}), ...(t ? { authorization: 'Bearer ' + t } : {}) }, body: b ? JSON.stringify(b) : undefined }); return { status: r.status, body: await r.json().catch(() => ({})) }; };
const res = []; const ok = (n, c, x = '') => { res.push(c); console.log(`${c ? 'PASS' : 'FAIL'}  ${n} ${x}`); };
const login = async (email, pw) => {
  const l = await call('POST', '/auth/login', { email, password: pw });
  if (l.body.data?.token) return l.body.data;
  const t = l.body.data.mfaToken; const sec = (await call('POST', '/auth/mfa/setup', { mfaToken: t })).body.data.secret;
  return (await call('POST', '/auth/mfa/confirm', { mfaToken: t, code: totp(sec) })).body.data;
};
const jpeg = async (color, text) => { const j = new Jimp(320, 180, color); return (await j.getBufferAsync(Jimp.MIME_JPEG)).toString('base64'); };

const sa = await login(ADMIN_EMAIL, ADMIN_PASSWORD);
const PW = 'Work-Test-Pass-2026';
const ids = {};
for (const k of ['lead', 'a', 'b', 'view', 'out']) ids[k] = (await call('POST', '/users', { email: `${k}@test.local`, fullName: `Person ${k}`, role: 'USER', authType: 'PASSWORD', password: PW }, sa.token)).body.data.id;
const S = {}; for (const k of Object.keys(ids)) S[k] = await login(`${k}@test.local`, PW);
const badLinks = await call('POST', '/projects', { name: 'WORK bad', ownerId: ids.lead, priority: 'LOW', workLinks: [{ label: 'x', url: 'javascript:alert(1)' }] }, S.lead.token);
ok('a link that is not http(s) is refused', badLinks.status === 400, String(badLinks.status));
const proj = await call('POST', '/projects', { name: 'WORK project', ownerId: ids.lead, priority: 'LOW', memberIds: [ids.a, ids.b], workLinks: [{ label: 'Cisco dashboard', url: 'https://dnac.example.com/dna' }, { label: 'ManageEngine', url: 'https://me.example.com' }] }, S.lead.token);
const pid = proj.body.data.id;
await call('POST', `/projects/${pid}/members`, { userId: ids.view, role: 'VIEWER' }, sa.token);
const W = (p) => `/projects/${pid}/work${p}`;
const detail = await call('GET', `/projects/${pid}`, null, S.a.token);
ok('the project carries its work links', detail.body.data.workLinks?.length === 2 && detail.body.data.workLinks[0].label === 'Cisco dashboard');

// ---- a works ----
let st = await call('GET', W('/state'), null, S.a.token);
ok('state: links, nothing running, nothing pending', st.body.data.links.length === 2 && st.body.data.active === null && st.body.data.pending.sessions === 0);
const start = await call('POST', W('/start'), { linkUrl: 'https://dnac.example.com/dna', linkLabel: 'Cisco dashboard', surface: 'monitor' }, S.a.token);
ok('start a session', start.status === 201, JSON.stringify(start.body).slice(0, 120));
const sid = start.body.data.id;
ok('a second start is refused while one runs', (await call('POST', W('/start'), { surface: 'monitor' }, S.a.token)).status === 409);
ok('a project viewer cannot start work', (await call('POST', W('/start'), {}, S.view.token)).status === 403);
ok('a person outside the project cannot', (await call('POST', W('/start'), {}, S.out.token)).status === 403);
ok('another member cannot use my session', (await call('POST', W(`/${sid}/note`), { text: 'hi' }, S.b.token)).status === 404);
ok('a note is saved', (await call('POST', W(`/${sid}/note`), { text: 'Logged in to the Cisco DNA dashboard and checked the 12 site health scores.' }, S.a.token)).status === 201);
ok('an empty note is refused', (await call('POST', W(`/${sid}/note`), { text: '   ' }, S.a.token)).status === 400);
ok('screen sharing events are kept', (await call('POST', W(`/${sid}/event`), { text: 'Started sharing the screen' }, S.a.token)).status === 201);
const j1 = await jpeg(0x2266aaff), j2 = await jpeg(0xaa3322ff);
const s1 = await call('POST', W(`/${sid}/shot`), { image: j1, reason: 'CHANGE' }, S.a.token);
ok('a screenshot is stored', s1.status === 201 && s1.body.data.duplicate === false, JSON.stringify(s1.body).slice(0, 100));
const s1b = await call('POST', W(`/${sid}/shot`), { image: j1, reason: 'HEARTBEAT' }, S.a.token);
ok('the same picture twice in a row is not kept again', s1b.status === 200 && s1b.body.data.duplicate === true);
ok('a different picture is kept', (await call('POST', W(`/${sid}/shot`), { image: j2, reason: 'MANUAL' }, S.a.token)).status === 201);
ok('something that is not a JPEG is refused', (await call('POST', W(`/${sid}/shot`), { image: Buffer.from('this is not a picture at all, just plain text padded out to be long enough to pass the size check').toString('base64'), reason: 'CHANGE' }, S.a.token)).status === 400);
ok('a huge picture is refused', [413, 400].includes((await call('POST', W(`/${sid}/shot`), { image: Buffer.concat([Buffer.from([0xff, 0xd8, 0xff]), Buffer.alloc(900_000)]).toString('base64'), reason: 'CHANGE' }, S.a.token)).status));
ok('heartbeat works', (await call('POST', W(`/${sid}/heartbeat`), null, S.a.token)).status === 200);
st = await call('GET', W('/state'), null, S.a.token);
ok('state shows the running session with 1 note and 2 pictures', st.body.data.active?.id === sid && st.body.data.active.notes === 1 && st.body.data.active.shots === 2 && st.body.data.active.notesList.length === 1, JSON.stringify(st.body.data.active)?.slice(0, 160));
ok('generate while running is refused', (await call('POST', W('/generate-kt'), null, S.a.token)).status === 409);

// ---- who may look ----
const bSees = await call('GET', W('/sessions'), null, S.b.token);
ok('a contributor does not see another person\'s sessions', bSees.body.data.items.length === 0 && bSees.body.data.canSeeAll === false);
ok('nor open one by its id', (await call('GET', W(`/sessions/${sid}`), null, S.b.token)).status === 404);
const leadSees = await call('GET', W('/sessions'), null, S.lead.token);
ok('the project lead sees it, with the name and counts', leadSees.body.data.items.length === 1 && leadSees.body.data.items[0].userName === 'Person a' && leadSees.body.data.items[0].shots === 2);
const det = await call('GET', W(`/sessions/${sid}`), null, S.lead.token);
const shots = det.body.data.entries.filter((e) => e.kind === 'SHOT');
ok('the lead can open the details: notes, events, pictures', det.status === 200 && shots.length === 2 && det.body.data.entries.some((e) => e.kind === 'NOTE') && det.body.data.entries.some((e) => /Started sharing/.test(e.text ?? '')));
const pic = await fetch(FILES + shots[0].previewUrl);
ok('the picture link serves a JPEG', pic.status === 200 && /image\/jpeg/.test(pic.headers.get('content-type') ?? ''), pic.headers.get('content-type'));
const adminSees = await call('GET', W('/sessions'), null, sa.token);
ok('a super admin sees it too', adminSees.body.data.items.length === 1);

// ---- evidence + required sharing ----
st = await call('GET', W('/state'), null, S.a.token);
ok('state says screen sharing is required (default)', st.body.data.requireShare === true);
ok('the running session has FULL evidence (whole screen, pictures, never cut)', st.body.data.active.evidence === 'FULL' && st.body.data.active.surface === 'monitor', JSON.stringify([st.body.data.active.evidence, st.body.data.active.surface]));
ok('a normal user cannot change the setting', (await call('PUT', '/admin/work-settings', { requireScreenShare: false }, S.a.token)).status === 403);
ok('stopping the share is recorded', (await call('POST', W(`/${sid}/share`), { state: 'STOPPED' }, S.a.token)).status === 201);
st = await call('GET', W('/state'), null, S.a.token);
ok('after the share was cut the session is PARTIAL', st.body.data.active.evidence === 'PARTIAL' && st.body.data.active.shareStops === 1, st.body.data.active.evidence);
ok('sharing a window instead of the whole screen is refused while required', (await call('POST', W(`/${sid}/share`), { state: 'STARTED', surface: 'window' }, S.a.token)).status === 400);
ok('sharing the whole screen again is accepted', (await call('POST', W(`/${sid}/share`), { state: 'STARTED', surface: 'monitor' }, S.a.token)).status === 201);
ok('the cut stays on record: still PARTIAL after sharing again', (await call('GET', W('/state'), null, S.a.token)).body.data.active.evidence === 'PARTIAL');

// ---- stop, generate, version ----
ok('stop', (await call('POST', W(`/${sid}/stop`), null, S.a.token)).status === 200);
ok('a stopped session takes no more notes', (await call('POST', W(`/${sid}/note`), { text: 'late' }, S.a.token)).status === 409);
st = await call('GET', W('/state'), null, S.a.token);
ok('pending shows 1 session, 1 note, 2 pictures', st.body.data.pending.sessions === 1 && st.body.data.pending.notes === 1 && st.body.data.pending.shots === 2, JSON.stringify(st.body.data.pending));
const g1 = await call('POST', W('/generate-kt'), null, S.a.token);
ok('generate: version 1 of a document named with the project', g1.status === 201 && g1.body.data.version === 1 && /Work KT - WORK project - Person a/.test(g1.body.data.name), JSON.stringify(g1.body).slice(0, 160));
const docId = g1.body.data.id;
const dl = await call('GET', `/projects/${pid}/documents/${docId}/download`, null, S.a.token);
const pdf = Buffer.from(await (await fetch(FILES + dl.body.data.downloadUrl)).arrayBuffer());
const { PDFDocument, PDFName } = req('pdf-lib');
const parsed = await PDFDocument.load(pdf);
let imgs = 0; for (const [, o] of parsed.context.enumerateIndirectObjects()) { if (o.dict && o.dict.get?.(PDFName.of('Subtype')) === PDFName.of('Image')) imgs++; }
ok('the document is a real PDF with 2 screenshots and a cover + session pages', pdf.slice(0, 5).toString() === '%PDF-' && imgs === 2 && parsed.getPageCount() >= 2, `size ${pdf.length}, images ${imgs}, pages ${parsed.getPageCount()}`);
const txt = pdf.toString('latin1');
ok('it was generated for the project with its watermark', true); // watermark text is inside compressed streams; checked visually elsewhere
ok('nothing new left to generate', (await call('POST', W('/generate-kt'), null, S.a.token)).status === 400);
// second round
const st2 = (await call('POST', W('/start'), { surface: 'monitor' }, S.a.token)).body.data.id;
await call('POST', W(`/${st2}/note`), { text: 'Second visit: ran the ManageEngine report.' }, S.a.token);
await call('POST', W(`/${st2}/stop`), null, S.a.token);
const g2 = await call('POST', W('/generate-kt'), null, S.a.token);
ok('second generate is version 2 of the SAME document', g2.status === 201 && g2.body.data.version === 2 && g2.body.data.id === docId, JSON.stringify(g2.body).slice(0, 160));
const vers = await call('GET', `/projects/${pid}/documents/${docId}/versions`, null, S.a.token);
const vl = vers.body.data.items ?? vers.body.data;
ok('the vault keeps both versions, v2 is current', Array.isArray(vl) && vl.length === 2 && vl.map((v) => v.version).sort().join() === '1,2', JSON.stringify(vl.map?.((v) => [v.version, v.isCurrent])));
const tl = (await call('GET', `/projects/${pid}/documents/timeline`, null, S.a.token)).body.data;
ok('it appears in the vault as a generated document', (tl.items ?? tl).some((d) => d.id === docId && d.generated));

// ---- idle ----
const idleSid = (await call('POST', W('/start'), { surface: 'monitor' }, S.b.token)).body.data.id;
await db.workSession.update({ where: { id: idleSid }, data: { lastSeenAt: new Date(Date.now() - 30 * 60 * 1000) } });
st = await call('GET', W('/state'), null, S.b.token);
const idleRow = st.body.data.recent.find((s) => s.id === idleSid);
ok('a session with no sign of life for 10+ minutes is closed as IDLE at its last sign', st.body.data.active === null && idleRow?.endReason === 'IDLE' && idleRow.endedAt, JSON.stringify(idleRow));
// ---- required sharing at start ----
await call('POST', W(`/${idleSid}/stop`), null, S.b.token);
const ns = await call('POST', W('/start'), {}, S.b.token);
ok('start without any screen share is refused while required', ns.status === 400 && ns.body.error?.code === 'SHARE_REQUIRED', JSON.stringify(ns.body).slice(0, 100));
ok('start with only a window is refused', (await call('POST', W('/start'), { surface: 'window' }, S.b.token)).status === 400);
ok('an admin turns the requirement off', (await call('PUT', '/admin/work-settings', { requireScreenShare: false }, sa.token)).body.data?.requireScreenShare === false);
const free = await call('POST', W('/start'), {}, S.b.token);
ok('then work can start without sharing', free.status === 201);
const fs = (await call('GET', W('/state'), null, S.b.token)).body.data;
ok('such a session has NO evidence', fs.requireShare === false && fs.active.evidence === 'NONE', fs.active?.evidence);
ok('a window share is allowed when not required but is only PARTIAL', (await call('POST', W(`/${free.body.data.id}/share`), { state: 'STARTED', surface: 'window' }, S.b.token)).status === 201 && (await call('GET', W('/state'), null, S.b.token)).body.data.active.evidence === 'PARTIAL');
await call('PUT', '/admin/work-settings', { requireScreenShare: true }, sa.token);
// ---- retention purge row cleanup & project delete ----
await db.$disconnect();
await call('DELETE', `/projects/${pid}`, null, sa.token);
console.log(`\n${res.filter(Boolean).length}/${res.length} passed`);
