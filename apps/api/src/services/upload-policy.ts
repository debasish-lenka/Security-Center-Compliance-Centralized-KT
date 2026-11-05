import { extname } from 'path';

// What may be uploaded. Three checks, all on the server (the browser's own checks are only a courtesy):
//   1. the file name's ending must be on the allowed list (everything else, such as .exe .js .html .svg .bat, is refused),
//   2. the first bytes of the file must really be that kind of file (a program renamed to .pdf is refused),
//   3. the size must be within the limit.

export const MAX_UPLOAD_MB = Math.max(1, Number(process.env.UPLOAD_MAX_MB ?? 50) || 50);
export const MAX_UPLOAD_BYTES = MAX_UPLOAD_MB * 1024 * 1024;

type Kind = 'pdf' | 'png' | 'jpg' | 'gif' | 'webp' | 'bmp' | 'tiff' | 'zip' | 'ole' | 'rtf' | 'text';

const KIND: Record<string, Kind> = {
  pdf: 'pdf',
  png: 'png', jpg: 'jpg', jpeg: 'jpg', gif: 'gif', webp: 'webp', bmp: 'bmp', tif: 'tiff', tiff: 'tiff',
  docx: 'zip', xlsx: 'zip', pptx: 'zip', odt: 'zip', ods: 'zip', odp: 'zip', zip: 'zip',
  doc: 'ole', xls: 'ole', ppt: 'ole',
  rtf: 'rtf',
  txt: 'text', md: 'text', csv: 'text', log: 'text', json: 'text', xml: 'text', yaml: 'text', yml: 'text', conf: 'text', cfg: 'text', ini: 'text',
};

export const ALLOWED_EXTENSIONS = Object.keys(KIND);

export const POLICY_GROUPS = [
  { label: 'Documents', extensions: ['pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'odt', 'ods', 'odp', 'rtf', 'txt', 'md', 'csv'] },
  { label: 'Pictures', extensions: ['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'tif', 'tiff'] },
  { label: 'Archives', extensions: ['zip'] },
  { label: 'Technical text', extensions: ['json', 'xml', 'yaml', 'yml', 'log', 'conf', 'cfg', 'ini'] },
];

export const extensionOf = (name: string) => extname(name).replace('.', '').toLowerCase();

export function checkName(name: string): string | null {
  const ext = extensionOf(name);
  if (!ext) return 'This file has no ending (like .pdf), so its type cannot be checked. Rename it and try again.';
  if (!KIND[ext]) return `Files of type .${ext.slice(0, 12)} are not allowed. Allowed: ${ALLOWED_EXTENSIONS.map((e) => `.${e}`).join(' ')}`;
  return null;
}

const startsWith = (b: Buffer, sig: number[], at = 0) => b.length >= at + sig.length && sig.every((v, i) => b[at + i] === v);
const ascii = (b: Buffer, from: number, to: number) => b.subarray(from, to).toString('latin1');

// `head` is the start of the file (a few KB are enough)
export function checkContent(ext: string, head: Buffer, totalSize: number): string | null {
  if (totalSize <= 0 || head.length === 0) return 'The file is empty.';
  const kind = KIND[ext.toLowerCase()];
  if (!kind) return `Files of type .${ext.slice(0, 12)} are not allowed.`;
  const ok =
    kind === 'pdf' ? ascii(head, 0, 1024).includes('%PDF-')
    : kind === 'png' ? startsWith(head, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
    : kind === 'jpg' ? startsWith(head, [0xff, 0xd8, 0xff])
    : kind === 'gif' ? ascii(head, 0, 4) === 'GIF8'
    : kind === 'webp' ? ascii(head, 0, 4) === 'RIFF' && ascii(head, 8, 12) === 'WEBP'
    : kind === 'bmp' ? ascii(head, 0, 2) === 'BM'
    : kind === 'tiff' ? startsWith(head, [0x49, 0x49, 0x2a, 0x00]) || startsWith(head, [0x4d, 0x4d, 0x00, 0x2a])
    : kind === 'zip' ? startsWith(head, [0x50, 0x4b, 0x03, 0x04]) || startsWith(head, [0x50, 0x4b, 0x05, 0x06])
    : kind === 'ole' ? startsWith(head, [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1])
    : kind === 'rtf' ? ascii(head, 0, 5) === '{\\rtf'
    : !head.subarray(0, 8192).includes(0); // plain text never contains a zero byte
  return ok ? null : `The content of this file is not a real .${ext} file (it may have been renamed).`;
}

export function checkSize(size: number): string | null {
  return size > MAX_UPLOAD_BYTES ? `The file is larger than ${MAX_UPLOAD_MB} MB.` : null;
}

export const policySummary = () => ({
  maxMb: MAX_UPLOAD_MB,
  extensions: ALLOWED_EXTENSIONS,
  groups: POLICY_GROUPS,
  accept: ALLOWED_EXTENSIONS.map((e) => `.${e}`).join(','),
});
