// Runs the whole two-user flow (member, lead, newbie) against a REAL server. Not part of run.mjs --all.
// First, on the server:   docker compose exec -T api node dist/scripts/e2e-world.js seed     (prints the password)
// Then here:              E2E_BASE=https://<server>:8443 E2E_PASSWORD=<that password> node e2e/e2e-server.mjs
// Afterwards, on the server:   docker compose exec -T api node dist/scripts/e2e-world.js clean
import { CHROME } from './config.mjs';
import puppeteer from 'puppeteer-core';
const BASE = process.env.E2E_BASE;   // e.g. https://192.168.31.158:8443
const PW = process.env.E2E_PASSWORD ?? process.argv[2];
if (!BASE || !PW) { console.log('usage: E2E_BASE=https://<server>:8443 E2E_PASSWORD=<password printed by e2e-world.js seed> node e2e/e2e-server.mjs'); process.exit(1); }
const wait = (ms) => new Promise((x) => setTimeout(x, ms));
const res = []; const ok = (n, c, x = '') => { res.push(c); console.log(`${c ? 'PASS' : 'FAIL'}  ${n} ${x}`); };
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--ignore-certificate-errors'] });

const person = async (name, email) => {
  const ctx = await browser.createBrowserContext();
  const p = await ctx.newPage(); await p.setViewport({ width: 1500, height: 1200 });
  const errs = []; p.on('pageerror', (e) => errs.push(e.message.slice(0, 100)));
  await p.goto(BASE + '/login', { waitUntil: 'load' }); await wait(1500);
  await p.type('#email', email); await p.type('#password', PW);
  await p.evaluate(() => [...document.querySelectorAll('button')].find((b) => /^Sign in$/.test(b.textContent.trim()))?.click());
  await wait(3500);
  const token = await p.evaluate(() => localStorage.getItem('dbi_auth_token'));
  return { name, p, errs, token };
};
const api = async (who, path) => (await (await fetch(BASE.replace('https', 'https') + '/api/v1' + path, { headers: { authorization: 'Bearer ' + who.token } }).catch(() => null))?.json().catch(() => null));
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

const text = (p) => p.evaluate(() => document.body.innerText);
const compact = async (p) => (await text(p)).replace(/\s+/g, ' ');
const clickBtn = async (p, re, root = 'body') => { const h = await p.evaluateHandle((r, rt) => [...document.querySelector(rt).querySelectorAll('button,a')].find((b) => new RegExp(r, 'i').test((b.textContent.trim() || b.getAttribute('aria-label') || '')) && !b.disabled), re.source, root); const el = h.asElement(); if (!el) return false; await el.evaluate((e) => e.scrollIntoView({ block: 'center' })); await wait(150); const bb = await el.boundingBox(); await p.mouse.click(bb.x + bb.width / 2, bb.y + bb.height / 2); return true; };
const rowOf = (title) => (t) => [...document.querySelectorAll('div')].filter((d) => d.className.toString().includes('bg-dbi-elevated/60') && d.textContent.includes(t)).pop();
const rowText = (p, title) => p.evaluate((t) => { const rows = [...document.querySelectorAll('div')].filter((d) => d.className.toString().includes('bg-dbi-elevated/60') && d.textContent.includes(t)); const r = rows[rows.length - 1]; return r ? r.innerText.replace(/\s+/g, ' ') : ''; }, title);
const clickRow = async (p, title, re) => { const h = await p.evaluateHandle((t, r) => { const rows = [...document.querySelectorAll('div')].filter((d) => d.className.toString().includes('bg-dbi-elevated/60') && d.textContent.includes(t)); const row = rows[rows.length - 1]; return row ? [...row.querySelectorAll('button,a')].find((b) => new RegExp(r, 'i').test(b.textContent.trim() || b.getAttribute('aria-label') || '')) : null; }, title, re.source); const el = h.asElement(); if (!el) return false; await el.evaluate((e) => e.scrollIntoView({ block: 'center' })); await wait(150); const bb = await el.boundingBox(); await p.mouse.click(bb.x + bb.width / 2, bb.y + bb.height / 2); return true; };
const rowTitles = (p) => p.evaluate(() => [...document.querySelectorAll('div')].filter((d) => d.className.toString().includes('bg-dbi-elevated/60') && d.querySelector('button[aria-label^="Edit "]')).map((d) => d.querySelector('p')?.textContent.trim()));
const typeIn = async (p, sel, v) => { await p.click(sel); await p.keyboard.type(v); };
const projectId = async (who) => { const r = await api(who, '/projects?limit=100'); const list = r?.data?.items ?? r?.data ?? []; return list.find((x) => x.name === 'TWO USER TEST')?.id; };
const openTasks = async (who, pid) => { await who.p.goto(`${BASE}/projects/${pid}?tab=work`, { waitUntil: 'load' }); await wait(3500); };

// ================= PHASE 1: Test Member =================
console.log('\n--- PHASE 1: Test Member ---');
const M = await person('Test Member', 'test.member@test.local');
const mName = await M.p.evaluate(() => document.body.innerText.includes('Test Member'));
ok('1.0 the login page signs Test Member in (real form, no 2FA asked)', !!M.token && mName);
const pid = await projectId(M);
ok('1.0 Test Member sees the project in the list', !!pid);
await M.p.goto(BASE + '/assignments', { waitUntil: 'load' }); await wait(3000);
const startBtn = await clickBtn(M.p, /Start project/); await wait(2500);
const proj = await api(M, `/projects/${pid}`);
ok('1.1 Start project is offered on My Assignments and works', startBtn && (proj?.data?.startInfo?.iStarted === true || (proj?.data?.startInfo?.started ?? 0) >= 1), JSON.stringify(proj?.data?.startInfo)?.slice(0, 120));
await openTasks(M, pid);
const titles1 = await rowTitles(M.p);
ok('1.2 the member sees only his two tasks, not the overdue one', titles1.length === 2 && titles1.includes('Member task 1') && titles1.includes('Member task 2') && !titles1.includes('Overdue task'), JSON.stringify(titles1));
const opts = await M.p.evaluate(() => [...document.querySelectorAll('select[aria-label="Task status"]')].map((s) => [...s.options].map((o) => o.value).join('|')));
const r1 = await rowText(M.p, 'Member task 1');
ok('1.3 the status list has only To do and In progress', opts.length >= 1 && opts.every((o) => o === 'TODO|IN_PROGRESS'), JSON.stringify(opts));
ok('1.3 buttons on the row: Submit for review, Blocked?, no Verify, no Give', /Submit for review/.test(r1) && /Blocked\?/.test(r1) && !/Verify/.test(r1) && (await M.p.evaluate(() => !document.querySelector('button[aria-label^="Give "]'))), r1.slice(0, 110));
await clickRow(M.p, 'Member task 1', /Submit for review/); await wait(2200);
let d = await compact(M.p);
ok('1.4 the submit dialog offers his finished work session ("Test console")', /Work session/.test(d) && /Test console/.test(d), d.slice(d.indexOf('Your finished'), d.indexOf('Your finished') + 150));
await typeIn(M.p, '#submit-summary', 'Finished the review and wrote it up in a short report.'); await wait(300);
await clickBtn(M.p, /^Submit for verification$/, '[role=dialog]'); await wait(2000);
ok('1.4 without proof the server refuses with a clear message', /Add at least one proof/.test(await compact(M.p)));
await M.p.evaluate(() => { const l = [...document.querySelectorAll('[role=dialog] label')].find((x) => /Work session/.test(x.textContent)); l?.querySelector('input')?.click(); }); await wait(300);
await clickBtn(M.p, /^Submit for verification$/, '[role=dialog]'); await wait(3000);
const r1b = await rowText(M.p, 'Member task 1');
ok('1.4 with proof it goes to "Waiting for verification"', /Waiting for verification/.test(r1b) && !/Submit for review/.test(r1b), r1b.slice(0, 120));
await clickRow(M.p, 'Member task 2', /Blocked\?/); await wait(1800);
await typeIn(M.p, 'textarea[aria-label="Why is it blocked"]', 'no'); await wait(200);
ok('1.5 a too-short reason keeps "Mark as blocked" off', await M.p.evaluate(() => [...document.querySelectorAll('[role=dialog] button')].find((b) => /^Mark as blocked$/.test(b.textContent.trim()))?.disabled));
await M.p.keyboard.type(' longer reason: Waiting for access to the test server.'); await wait(200);
await M.p.evaluate(() => { const t = document.querySelector('textarea[aria-label="Why is it blocked"]'); const set = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set; set.call(t, 'Waiting for access to the test server.'); t.dispatchEvent(new Event('input', { bubbles: true })); }); await wait(300);
await clickBtn(M.p, /^Mark as blocked$/, '[role=dialog]'); await wait(3000);
const r2 = await rowText(M.p, 'Member task 2');
ok('1.5 the task shows Blocked with the reason and an Unblock button', /Blocked: Waiting for access to the test server/.test(r2) && /Unblock/.test(r2), r2.slice(0, 140));
await M.p.goto(BASE + '/attention', { waitUntil: 'load' }); await wait(3000);
ok('1.6 Needs attention is empty for a member', /Nothing needs your attention right now/.test(await compact(M.p)));

// ================= PHASE 2: Test Lead =================
console.log('\n--- PHASE 2: Test Lead ---');
const L = await person('Test Lead', 'test.lead@test.local');
ok('2.0 Test Lead signs in', !!L.token);
await L.p.goto(BASE + '/attention', { waitUntil: 'load' }); await wait(3500);
let a = await compact(L.p);
ok('2.1 counts: waiting 1, overdue 1, blocked 1, not moving 0', /Waiting for your verification: 1/.test(a) && /Overdue: 1/.test(a) && /Blocked: 1/.test(a) && /Not moving: 0/.test(a), a.slice(a.indexOf('Waiting'), a.indexOf('Waiting') + 150));
ok('2.2 entries: the waiting task, the overdue task with its person, the blocked reason', /Member task 1/.test(a) && /Overdue task/.test(a) && /Test Newbie/.test(a) && /Waiting for access to the test server/.test(a));
await clickRow(L.p, 'Overdue task', /Remind/); await wait(2000);
ok('2.3 Remind says "Reminder sent"', /Reminder sent/.test(await compact(L.p)));
await clickRow(L.p, 'Overdue task', /Remind/); await wait(2000);
ok('2.3 the second Remind is refused (24 hours)', /already sent in the last 24 hours/.test(await compact(L.p)));
await clickRow(L.p, 'Member task 2', /Give to someone else/); await wait(2000);
const people = await L.p.evaluate(() => { const s = document.querySelector('select[aria-label="Give the task to"]'); return s ? [...s.options].map((o) => o.textContent) : []; });
ok('2.4 the list has Test Newbie and not Test Member (the current assignee)', people.some((x) => /Test Newbie/.test(x)) && !people.some((x) => /Test Member/.test(x)), JSON.stringify(people));
const newbieId = await L.p.evaluate(() => [...document.querySelector('select[aria-label="Give the task to"]').options].find((o) => /Test Newbie/.test(o.textContent))?.value);
await L.p.select('select[aria-label="Give the task to"]', newbieId); await wait(300);
await clickBtn(L.p, /^Give the task$/, '[role=dialog]'); await wait(3000);
a = await compact(L.p);
ok('2.4 the task is given away and leaves the Blocked list', /Task given to someone else|given to someone else/i.test(a) || !/Waiting for access to the test server/.test(a), '');
ok('2.4 Blocked now shows 0', /Blocked: 0/.test(a));
await openTasks(L, pid);
const lead1 = await rowTitles(L.p);
ok('2.6 the lead sees all three tasks', lead1.length === 3, JSON.stringify(lead1));
await clickRow(L.p, 'Member task 1', /^Verify$/); await wait(2500);
d = await compact(L.p);
ok('2.5 the verify dialog shows what was written and the proof (work session with its badges)', /Finished the review and wrote it up/.test(d) && /Proof \(1\)/.test(d) && /Work session/.test(d) && /evidence/i.test(d), d.slice(d.indexOf('Submitted'), d.indexOf('Submitted') + 260));
ok('2.5 "Send back" is off while the note is empty', await L.p.evaluate(() => [...document.querySelectorAll('[role=dialog] button')].find((b) => /^Send back$/.test(b.textContent.trim()))?.disabled));
await typeIn(L.p, '#verify-note', 'Please add the date of the review.'); await wait(300);
await clickBtn(L.p, /^Send back$/, '[role=dialog]'); await wait(3000);
ok('2.5 "Sent back for changes"', /Sent back for changes|Sent back/.test(await compact(L.p)));
const lrows = await Promise.all(['Member task 1', 'Overdue task', 'Member task 2'].map((t) => rowText(L.p, t)));
console.log('   task rows seen by the lead:', JSON.stringify(lrows.map((r) => r.slice(0, 150))));
const icons = await L.p.evaluate(() => ['Member task 1', 'Overdue task', 'Member task 2'].map((t) => { const rows = [...document.querySelectorAll('div')].filter((d) => d.className.toString().includes('bg-dbi-elevated/60') && d.textContent.includes(t)); const r = rows[rows.length - 1]; return r ? [...r.querySelectorAll('button')].map((b) => b.getAttribute('aria-label') || '').filter(Boolean).join(' | ') : ''; }));
ok('2.6 every open task has "Give to someone else", History, Edit, Delete', icons.every((i) => /Give /.test(i) && /History of/.test(i) && /Edit /.test(i) && /Delete task/.test(i)), JSON.stringify(icons).slice(0, 300));

// ================= PHASE 3: Test Member again =================
console.log('\n--- PHASE 3: Test Member again ---');
await openTasks(M, pid);
const titles3 = await rowTitles(M.p);
ok('3.1 "Member task 2" is gone from the member (given to someone else)', titles3.length === 1 && titles3[0] === 'Member task 1', JSON.stringify(titles3));
const r3 = await rowText(M.p, 'Member task 1');
ok('3.1 "Sent back by Test Lead: Please add the date of the review."', /Sent back by Test Lead: Please add the date of the review/.test(r3), r3.slice(0, 160));
await M.p.goto(BASE + '/notifications', { waitUntil: 'load' }); await wait(3000);
const n3 = await compact(M.p);
ok('3.2 notifications: "A task was moved to someone else" and "Task sent back"', /A task was moved to someone else/.test(n3) && /Task sent back/.test(n3));
await openTasks(M, pid);
await clickRow(M.p, 'Member task 1', /Submit for review/); await wait(2200);
await typeIn(M.p, '#submit-summary', 'Added the date of the review: 5 November.'); await wait(300);
await M.p.evaluate(() => { const l = [...document.querySelectorAll('[role=dialog] label')].find((x) => /Work session/.test(x.textContent)); l?.querySelector('input')?.click(); }); await wait(300);
await clickBtn(M.p, /^Submit for verification$/, '[role=dialog]'); await wait(3000);
ok('3.3 submitted again: Waiting for verification', /Waiting for verification/.test(await rowText(M.p, 'Member task 1')));

// ================= PHASE 4: Test Lead again =================
console.log('\n--- PHASE 4: Test Lead again ---');
await L.p.goto(BASE + '/attention', { waitUntil: 'load' }); await wait(3500);
a = await compact(L.p);
ok('4.1 waiting 1 (Member task 1) and overdue 1 (Overdue task)', /Waiting for your verification: 1/.test(a) && /Overdue: 1/.test(a) && /Member task 1/.test(a));
await openTasks(L, pid);
await clickRow(L.p, 'Member task 1', /^Verify$/); await wait(2500);
await clickBtn(L.p, /^Approve/, '[role=dialog]'); await wait(3000);
const done = await rowText(L.p, 'Member task 1');
ok('4.2 "Done (verified)" with a date and time in IST', /Done \(verified\)/.test(done) && /verified \d{2} \w{3} \d{4}.*IST/.test(done), done.slice(0, 160));
await clickRow(L.p, 'Member task 1', /History of/); await wait(2500);
d = await compact(L.p);
const order = [...d.matchAll(/Submitted for verification|Sent back for changes|Verified: done/g)].map((m) => m[0]);
ok('4.3 history: Submitted, Sent back, Submitted, Verified: done', order.join(',') === 'Submitted for verification,Sent back for changes,Submitted for verification,Verified: done', order.join(','));
ok('4.3 each entry names the person and a date and time (IST)', /Test Member · \d{2} \w{3} \d{4}.*IST/.test(d) && /Test Lead · \d{2} \w{3} \d{4}.*IST/.test(d));
const pj = await api(L, `/projects/${pid}`);
ok('4.4 the project is 33% (one of three tasks verified)', pj?.data?.progress === 33, String(pj?.data?.progress));

// ================= PHASE 5: Test Newbie =================
console.log('\n--- PHASE 5: Test Newbie ---');
const N = await person('Test Newbie', 'test.newbie@test.local');
ok('5.0 Test Newbie signs in', !!N.token);
await openTasks(N, pid);
const tn = await rowTitles(N.p);
ok('5.1 Newbie has "Overdue task" and "Member task 2", not "Member task 1"', tn.includes('Overdue task') && tn.includes('Member task 2') && !tn.includes('Member task 1'), JSON.stringify(tn));
const t2n = await rowText(N.p, 'Member task 2');
ok('5.1 "Member task 2" is To do and has no Blocked line', /To do/.test(t2n) && !/Blocked:/.test(t2n), t2n.slice(0, 130));
await N.p.goto(BASE + '/notifications', { waitUntil: 'load' }); await wait(3000);
const nn = await compact(N.p);
ok('5.2 notifications: a reminder about "Overdue task" and "A task was given to you"', /Reminder: "Overdue task"/.test(nn) && /A task was given to you/.test(nn));
await N.p.goto(BASE + '/attention', { waitUntil: 'load' }); await wait(3000);
ok('5.3 Needs attention is empty for Newbie', /Nothing needs your attention right now/.test(await compact(N.p)));
ok('5.4 Newbie cannot see "Member task 1"', !tn.includes('Member task 1'));

const allErrs = [...M.errs, ...L.errs, ...N.errs];
ok('G.1 no page crashed for anyone', allErrs.length === 0, allErrs.join(' ; '));
await browser.close();
console.log(`\n${res.filter(Boolean).length}/${res.length} passed`);
