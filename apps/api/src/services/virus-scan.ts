import { connect } from 'net';

// Virus scan of every uploaded file, by ClamAV (an offline antivirus that runs as the "clamav" container).
// The file is sent to clamd over the network (INSTREAM) before anything is written to disk.
//   VIRUS_SCAN=on|off     off by default on a developer machine, on in docker-compose
//   CLAMAV_HOST / CLAMAV_PORT   where clamd listens (default clamav:3310, inside the compose network)
// If the scanner cannot answer, the upload is REFUSED (never silently allowed): an unscanned file is not a clean file.

export const VIRUS_SCAN_ENABLED = /^(on|true|1|yes)$/i.test(process.env.VIRUS_SCAN ?? 'off');
const HOST = process.env.CLAMAV_HOST ?? 'clamav';
const PORT = Number(process.env.CLAMAV_PORT ?? 3310) || 3310;
const TIMEOUT_MS = Math.max(5000, Number(process.env.CLAMAV_TIMEOUT_MS ?? 90000) || 90000);
const CHUNK = 64 * 1024;

export type ScanResult =
  | { status: 'clean' }
  | { status: 'infected'; signature: string }
  | { status: 'unavailable'; reason: string };

// Sends the bytes to clamd with the INSTREAM command: "zINSTREAM\0", then [4-byte length][data] pieces, then a zero length.
export function scanBuffer(data: Buffer, opts: { host?: string; port?: number; timeoutMs?: number } = {}): Promise<ScanResult> {
  return new Promise((resolve) => {
    let done = false;
    const finish = (r: ScanResult) => { if (!done) { done = true; socket.destroy(); resolve(r); } };
    const socket = connect({ host: opts.host ?? HOST, port: opts.port ?? PORT });
    socket.setTimeout(opts.timeoutMs ?? TIMEOUT_MS, () => finish({ status: 'unavailable', reason: 'the scanner did not answer in time' }));
    let reply = '';
    socket.on('data', (d) => { reply += d.toString('latin1'); });
    socket.on('error', (e) => finish({ status: 'unavailable', reason: `the scanner cannot be reached (${(e as NodeJS.ErrnoException).code ?? e.message})` }));
    socket.on('close', () => {
      const text = reply.replace(/\0/g, '').trim();
      if (/\bFOUND$/.test(text)) return finish({ status: 'infected', signature: text.replace(/^stream:\s*/i, '').replace(/\s*FOUND$/, '') || 'unknown' });
      if (/\bOK$/.test(text)) return finish({ status: 'clean' });
      finish({ status: 'unavailable', reason: text ? `the scanner replied: ${text.slice(0, 120)}` : 'the scanner closed the connection without an answer' });
    });
    socket.on('connect', () => {
      socket.write('zINSTREAM\0');
      for (let i = 0; i < data.length; i += CHUNK) {
        const piece = data.subarray(i, i + CHUNK);
        const len = Buffer.alloc(4); len.writeUInt32BE(piece.length);
        socket.write(len); socket.write(piece);
      }
      socket.write(Buffer.alloc(4)); // zero length = end of file
    });
  });
}

export const scanUpload = (data: Buffer): Promise<ScanResult> => scanBuffer(data);
