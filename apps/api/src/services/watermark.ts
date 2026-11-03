import { PDFDocument, StandardFonts, degrees, rgb } from 'pdf-lib';
import { env } from '../utils/env.js';

// The standard PDF fonts only cover Latin-1; anything else would throw
export const latin = (s: string) => s.replace(/[^\x20-\x7E\xA0-\xFF]/g, '?');

// "03/11/2026 17:12 IST": date and time in the configured time zone (Indian Standard Time by default)
export function formatWhen(d: Date): string {
  const opts: Intl.DateTimeFormatOptions = { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false, timeZoneName: 'short' };
  let tz = env.APP_TIMEZONE;
  try {
    new Intl.DateTimeFormat('en-GB', { timeZone: tz });
  } catch {
    tz = 'Asia/Kolkata';
  }
  const text = new Intl.DateTimeFormat('en-GB', { ...opts, timeZone: tz }).format(d).replace(',', '');
  return /^Asia\/(Kolkata|Calcutta)$/.test(tz) ? text.replace('GMT+5:30', 'IST') : text;
}

/**
 * Stamps every page with one diagonal text ("CONFIDENTIAL - <project name>"). The optional `note` is a plain
 * line at the bottom (who uploaded the document and when). Nothing else is printed.
 */
export async function watermarkPdf(input: Buffer, text: string, note?: string): Promise<Buffer> {
  const pdf = await PDFDocument.load(input, { ignoreEncryption: false });
  const font = await pdf.embedFont(StandardFonts.HelveticaBold);
  const small = await pdf.embedFont(StandardFonts.Helvetica);
  const label = latin(text);
  const pages = pdf.getPages();

  pages.forEach((page) => {
    const { width, height } = page.getSize();

    // diagonal, sized so the whole text fits across the page
    const size = Math.max(10, Math.min(34, (Math.min(width, height) * 0.9) / (font.widthOfTextAtSize(label, 1) * 0.72)));
    const textWidth = font.widthOfTextAtSize(label, size);
    const angle = 40;
    const rad = (angle * Math.PI) / 180;
    page.drawText(label, {
      x: width / 2 - (textWidth / 2) * Math.cos(rad),
      y: height / 2 - (textWidth / 2) * Math.sin(rad),
      size,
      font,
      color: rgb(0.55, 0.55, 0.55),
      opacity: 0.28,
      rotate: degrees(angle),
    });

    // who made the document and when, printed on every page
    if (note) {
      const n = latin(note);
      page.drawText(n, { x: Math.max(8, (width - small.widthOfTextAtSize(n, 7)) / 2), y: 12, size: 7, font: small, color: rgb(0.25, 0.25, 0.25) });
    }
  });

  return Buffer.from(await pdf.save());
}
