import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from 'pdf-lib';
import { formatWhen, latin, watermarkPdf } from './watermark.js';

// The work KT: what a person did on a project (notes, screenshots, sessions) as one PDF.
// Every "Generate KT" adds a new version of the same document.

export interface KtEntry { kind: string; text: string | null; reason: string | null; createdAt: Date; image?: Buffer | null }
export type Evidence = 'FULL' | 'PARTIAL' | 'NONE';

// How well a session is backed by the screen: the whole screen was shared the whole time and pictures were taken (FULL),
// sharing was cut, a window / tab was shared, or no picture exists (PARTIAL), or nothing was ever shared (NONE).
export function evidenceOf(s: { shareStarts: number; shareStops: number; surface: string | null }, shots: number): Evidence {
  if (s.shareStarts === 0) return 'NONE';
  if (s.shareStops > 0 || s.surface !== 'monitor' || shots === 0) return 'PARTIAL';
  return 'FULL';
}
export const evidenceText = (e: Evidence) => (e === 'FULL' ? 'Full (whole screen shared, pictures taken)' : e === 'PARTIAL' ? 'Partial (sharing was interrupted, not the whole screen, or no pictures)' : 'None (the screen was never shared)');

export const toolText = (check: string | null, seen: number, checked: number) =>
  check === 'SEEN' ? `Seen on screen (${seen} of ${checked} screenshots show it)`
  : check === 'LOW' ? `Rarely seen on screen (${seen} of ${checked} screenshots show it)`
  : check === 'NOT_SEEN' ? `NOT seen on screen (0 of ${checked} screenshots show it)`
  : check === 'NO_LINK' ? 'Not checked (no tool address was set for this project)'
  : 'Not checked yet';

export interface KtSession {
  toolCheck: string | null; ocrSeen: number; ocrChecked: number;
  evidence: Evidence; startedAt: Date; endedAt: Date | null; endReason: string | null; linkLabel: string | null; linkUrl: string | null; entries: KtEntry[];
}

const W = 595, H = 842, M = 48;
const ink = rgb(0.1, 0.1, 0.15), grey = rgb(0.4, 0.4, 0.45), teal = rgb(0.05, 0.45, 0.55), red = rgb(0.7, 0.15, 0.15);

export const minutesBetween = (a: Date, b: Date | null) => Math.max(0, Math.round(((b ?? new Date()).getTime() - new Date(a).getTime()) / 60000));
export const lengthOf = (m: number) => (m >= 60 ? `${Math.floor(m / 60)} h ${m % 60} min` : `${m} min`);

export async function workKtPdf(opts: { project: string; person: string; email: string; version: number; sessions: KtSession[] }): Promise<Buffer> {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  let page: PDFPage = pdf.addPage([W, H]);
  let y = H - 70;

  const ensure = (need: number) => { if (y - need < 50) { page = pdf.addPage([W, H]); y = H - 60; } };
  const wrap = (text: string, f: PDFFont, size: number, width: number) => {
    const out: string[] = [];
    for (const para of latin(text).split(/\r?\n/)) {
      let line = '';
      for (const word of para.split(/\s+/)) {
        const t = line ? `${line} ${word}` : word;
        if (f.widthOfTextAtSize(t, size) > width && line) { out.push(line); line = word; } else line = t;
      }
      out.push(line);
    }
    return out;
  };
  const para = (text: string, size = 10, f = font, color = ink, indent = 0) => {
    for (const l of wrap(text, f, size, W - 2 * M - indent)) { ensure(size + 4); page.drawText(l, { x: M + indent, y, size, font: f, color }); y -= size + 4; }
  };

  const minutes = opts.sessions.reduce((n, s) => n + minutesBetween(s.startedAt, s.endedAt), 0);
  const all = opts.sessions.flatMap((s) => s.entries);
  const shots = all.filter((e) => e.kind === 'SHOT').length;
  const notes = all.filter((e) => e.kind === 'NOTE').length;
  const shareStops = all.filter((e) => e.kind === 'EVENT' && /stopped sharing/i.test(e.text ?? '')).length;
  const idle = opts.sessions.filter((s) => s.endReason === 'IDLE').length;
  const from = opts.sessions.map((s) => s.startedAt).sort((a, b) => +a - +b)[0];
  const to = opts.sessions.map((s) => s.endedAt ?? s.startedAt).sort((a, b) => +b - +a)[0];

  para('Work KT', 26, bold);
  para(opts.project, 15, font, teal);
  y -= 6;
  para(`Version ${opts.version}`, 11, bold);
  para(`Prepared by ${opts.person} (${opts.email})`, 10);
  para(`Generated on ${formatWhen(new Date())}`, 10);
  if (from) para(`Covers work from ${formatWhen(from)} to ${formatWhen(to)}`, 10);
  y -= 8;
  para('Summary', 13, bold);
  para(`${opts.sessions.length} work session${opts.sessions.length === 1 ? '' : 's'}, ${lengthOf(minutes)} in total`, 10);
  para(`${notes} note${notes === 1 ? '' : 's'}, ${shots} screenshot${shots === 1 ? '' : 's'}`, 10);
  const weak = opts.sessions.filter((s) => s.evidence !== 'FULL').length;
  if (weak) para(`Screen evidence: ${opts.sessions.length - weak} of ${opts.sessions.length} sessions are fully backed by the screen; ${weak} are not.`, 10, font, red);
  const notSeen = opts.sessions.filter((s) => s.toolCheck === 'NOT_SEEN').length;
  if (notSeen) para(`Tool check: in ${notSeen} session(s) the tool was not seen on any screenshot.`, 10, font, red);
  if (shareStops || idle) para(`Note: screen sharing was stopped ${shareStops} time(s); ${idle} session(s) ended because there was no sign of activity.`, 10, font, grey);

  for (const [i, s] of opts.sessions.entries()) {
    ensure(170); // a new page only when the session heading would not fit
    if (i > 0) y -= 10;
    page.drawLine({ start: { x: M, y: y + 6 }, end: { x: W - M, y: y + 6 }, thickness: 0.5, color: rgb(0.8, 0.8, 0.85) });
    y -= 8;
    para(`Session ${i + 1}`, 15, bold, teal);
    para(`${formatWhen(s.startedAt)}  to  ${s.endedAt ? formatWhen(s.endedAt) : 'still running'}   (${lengthOf(minutesBetween(s.startedAt, s.endedAt))})`, 10, bold);
    if (s.linkUrl) para(`Tool: ${s.linkLabel ? `${s.linkLabel} - ` : ''}${s.linkUrl}`, 9, font, grey);
    para(`Screen evidence: ${evidenceText(s.evidence)}`, 9, font, s.evidence === 'FULL' ? teal : red);
    para(`Tool on screen: ${toolText(s.toolCheck, s.ocrSeen, s.ocrChecked)}`, 9, font, s.toolCheck === 'NOT_SEEN' || s.toolCheck === 'LOW' ? red : grey);
    if (s.endReason === 'IDLE') para('This session ended by itself: no sign of activity for a while.', 9, font, red);
    y -= 6;
    if (s.entries.length === 0) para('Nothing was written or captured in this session.', 10, font, grey);
    for (const e of s.entries) {
      if (e.kind === 'NOTE') {
        para(`${formatWhen(e.createdAt)}  -  Note`, 9, bold, grey);
        para(e.text ?? '', 10, font, ink, 8);
        y -= 4;
      } else if (e.kind === 'EVENT') {
        para(`${formatWhen(e.createdAt)}  -  ${e.text ?? ''}`, 9, font, /stopped|ended/i.test(e.text ?? '') ? red : grey);
        y -= 2;
      } else if (e.kind === 'SHOT') {
        para(`${formatWhen(e.createdAt)}  -  Screenshot${e.reason ? ` (${e.reason.toLowerCase()})` : ''}`, 9, bold, grey);
        if (!e.image) { para('(the picture is no longer stored)', 9, font, grey, 8); continue; }
        try {
          const img = await pdf.embedJpg(new Uint8Array(e.image)); // a copy: a small Buffer lives in a shared pool and pdf-lib reads the whole pool
          const scale = Math.min((W - 2 * M) / img.width, 300 / img.height, 1.5);
          const w = img.width * scale, h = img.height * scale;
          ensure(h + 14);
          page.drawImage(img, { x: M, y: y - h, width: w, height: h });
          y -= h + 12;
        } catch {
          para('(the picture could not be placed in this report)', 9, font, grey, 8);
        }
      }
    }
  }

  return watermarkPdf(Buffer.from(await pdf.save()), `CONFIDENTIAL - ${opts.project}`);
}
