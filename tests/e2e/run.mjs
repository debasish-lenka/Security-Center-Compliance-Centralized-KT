// Runs the end-to-end tests one after another, each after a clean reset, and prints one summary.
//   node e2e/run.mjs --list              what there is
//   node e2e/run.mjs --all               everything (takes a while)
//   node e2e/run.mjs sv-api work-api     only these
//   node e2e/run.mjs --api               only the ones that need no browser
// Needs the local API (:3001), the web app (:5173) and the database running. See tests/README.md.
import { spawn } from 'child_process';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { CHROME } from './config.mjs';

const here = dirname(fileURLToPath(import.meta.url));

// name, what it covers, whether it needs a browser
const TESTS = [
  ['upload-check', 'upload rules: types, real content, 50 MB, a document cannot point at another project\'s file', true],
  ['open-check', 'Open shows a file in the browser, Download saves it', true],
  ['work-api', 'work sessions: start/stop, notes, screenshots, evidence, the versioned work KT', false],
  ['work-web', 'work log screen: links, start, screen share, notes, generate KT, team table', true],
  ['ocr-api', 'screenshot check: tool seen / rarely / not seen, no text kept', false],
  ['ocr-web', 'screenshot check on the screen', true],
  ['rem-api', 'reminders: stalled tasks, not started, escalation, admin days', false],
  ['rem-web', 'reminders page and the admin switches', true],
  ['sv-api', 'submit and verify tasks, proof, blocked, history, who may verify', false],
  ['sv-web', 'submit and verify on the screen', true],
  ['att-api', 'needs attention, reminders to people, reassign, hand over a leaving person\'s work', false],
  ['att-web', 'needs attention, reassign and hand over on the screen', true],
  ['progress', 'project progress, per person, task edit, the audit log', true],
  ['startflow', 'start project, who started, latest update, colours', true],
  ['ktpack', 'Create KT: images and documents together, watermark, uploader and date', true],
  ['timeline', 'document timeline', true],
  ['uploads', 'uploads per person and all uploads', true],
  ['dt-check', 'every time shows date and time (IST)', true],
  ['edit-links', 'editing a project\'s work links', true],
];

const args = process.argv.slice(2);
if (args.includes('--list')) { for (const [n, d, b] of TESTS) console.log(`${n.padEnd(14)} ${b ? '[browser]' : '[api]    '} ${d}`); process.exit(0); }
const wanted = args.includes('--all') ? TESTS.map((t) => t[0]) : args.includes('--api') ? TESTS.filter((t) => !t[2]).map((t) => t[0]) : args.filter((a) => !a.startsWith('--'));
if (wanted.length === 0) { console.log('Say what to run: --all, --api, or test names (see --list).'); process.exit(2); }
const unknown = wanted.filter((w) => !TESTS.some((t) => t[0] === w));
if (unknown.length) { console.log(`Unknown test(s): ${unknown.join(', ')}. See --list.`); process.exit(2); }
if (!CHROME && wanted.some((w) => TESTS.find((t) => t[0] === w)[2])) {
  console.log('No Chrome or Edge was found for the browser tests. Install one, or set CHROME_PATH=<path to chrome>. (--api needs no browser.)');
  process.exit(2);
}

const runNode = (file, timeoutMs) => new Promise((resolve) => {
  const child = spawn(process.execPath, [file], { cwd: here, env: process.env });
  let out = '';
  const timer = setTimeout(() => { out += '\nTIMED OUT\n'; child.kill(); }, timeoutMs);
  child.stdout.on('data', (d) => (out += d)); child.stderr.on('data', (d) => (out += d));
  child.on('close', (code) => { clearTimeout(timer); resolve({ code, out }); });
});

const rows = [];
for (const name of wanted) {
  process.stdout.write(`${name.padEnd(14)} ... `);
  const reset = await runNode(join(here, 'reset.mjs'), 60_000);
  if (reset.code !== 0) { console.log('COULD NOT RESET'); console.log(reset.out.split('\n').slice(-8).join('\n')); rows.push({ name, ok: false, note: 'reset failed' }); continue; }
  const t0 = Date.now();
  const r = await runNode(join(here, `${name}.mjs`), 10 * 60_000);
  const m = r.out.match(/(\d+)\/(\d+) passed/);
  const failed = r.out.split('\n').filter((l) => l.startsWith('FAIL'));
  const ok = !!m && m[1] === m[2] && failed.length === 0 && r.code === 0;
  console.log(`${m ? `${m[1]}/${m[2]}` : 'no result'} ${ok ? 'OK' : 'FAILED'} (${Math.round((Date.now() - t0) / 1000)}s)`);
  if (!ok) { for (const l of failed.slice(0, 12)) console.log(`     ${l.slice(0, 200)}`); if (!m) console.log(r.out.split('\n').slice(-12).join('\n')); }
  rows.push({ name, ok, note: m ? `${m[1]}/${m[2]}` : 'no result' });
}
const bad = rows.filter((r) => !r.ok);
console.log(`\n${rows.length - bad.length} of ${rows.length} test file(s) passed${bad.length ? `. FAILED: ${bad.map((b) => b.name).join(', ')}` : '.'}`);
process.exit(bad.length ? 1 : 0);
