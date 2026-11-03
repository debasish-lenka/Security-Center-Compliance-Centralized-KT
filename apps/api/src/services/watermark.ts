import { PDFDocument, StandardFonts, degrees, rgb } from 'pdf-lib';

// The standard PDF fonts only cover Latin-1; anything else would throw
const latin = (s: string) => s.replace(/[^\x20-\x7E\xA0-\xFF]/g, '?');

/**
 * Stamps every page with a diagonal text and a footer line, so a copy that
 * leaks can be traced to the person who downloaded it.
 */
export async function watermarkPdf(input: Buffer, text: string): Promise<Buffer> {
  const pdf = await PDFDocument.load(input, { ignoreEncryption: false });
  const font = await pdf.embedFont(StandardFonts.HelveticaBold);
  const small = await pdf.embedFont(StandardFonts.Helvetica);
  const label = latin(text);
  const pages = pdf.getPages();

  pages.forEach((page, i) => {
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

    const footer = `${label}  |  page ${i + 1} of ${pages.length}`;
    const fs = 7;
    page.drawText(footer, {
      x: Math.max(8, (width - small.widthOfTextAtSize(footer, fs)) / 2),
      y: 10,
      size: fs,
      font: small,
      color: rgb(0.4, 0.4, 0.4),
      opacity: 0.9,
    });
  });

  return Buffer.from(await pdf.save());
}
