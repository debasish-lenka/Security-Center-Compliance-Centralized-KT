import { createHmac, randomBytes, timingSafeEqual } from 'crypto';
import QRCode from 'qrcode';
import { sha256 } from './crypto.js';

// Roles that must use an authenticator app
export const MFA_ROLES = ['SUPER_ADMIN', 'ADMIN'];
export const requiresMfa = (role: string) => MFA_ROLES.includes(role);

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

function base32Encode(buf: Buffer): string {
  let bits = 0;
  let value = 0;
  let out = '';
  for (const byte of buf) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += ALPHABET[(value << (5 - bits)) & 31];
  return out;
}

function base32Decode(str: string): Buffer {
  let bits = 0;
  let value = 0;
  const out: number[] = [];
  for (const ch of str.replace(/=+$/, '').toUpperCase()) {
    const idx = ALPHABET.indexOf(ch);
    if (idx < 0) continue;
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(out);
}

export const generateTotpSecret = () => base32Encode(randomBytes(20));

// RFC 6238: HMAC-SHA1, 6 digits, 30 second step
function totpAt(secret: string, counter: number): string {
  const msg = Buffer.alloc(8);
  msg.writeBigUInt64BE(BigInt(counter));
  const hmac = createHmac('sha1', base32Decode(secret)).update(msg).digest();
  const offset = hmac[hmac.length - 1] & 0xf;
  const bin = ((hmac[offset] & 0x7f) << 24) | (hmac[offset + 1] << 16) | (hmac[offset + 2] << 8) | hmac[offset + 3];
  return String(bin % 1_000_000).padStart(6, '0');
}

export const currentTotp = (secret: string, now = Date.now()) => totpAt(secret, Math.floor(now / 30000));

// Accepts the previous/next step too, to tolerate clock drift
export function verifyTotp(secret: string, code: string, now = Date.now()): boolean {
  const clean = code.replace(/\s/g, '');
  if (!/^\d{6}$/.test(clean)) return false;
  const counter = Math.floor(now / 30000);
  return [-1, 0, 1].some((d) => {
    const expected = Buffer.from(totpAt(secret, counter + d));
    return timingSafeEqual(expected, Buffer.from(clean));
  });
}

export async function totpEnrollment(email: string, secret: string) {
  const otpauthUrl = `otpauth://totp/${encodeURIComponent(`DBI Security Center:${email}`)}?secret=${secret}&issuer=${encodeURIComponent('DBI Security Center')}&algorithm=SHA1&digits=6&period=30`;
  return { secret, otpauthUrl, qrDataUrl: await QRCode.toDataURL(otpauthUrl, { margin: 1, width: 220 }) };
}

// 10 single-use codes like "a1b2-c3d4"; only hashes are stored
export function generateRecoveryCodes(): { codes: string[]; hashes: string[] } {
  const codes = Array.from({ length: 10 }, () => {
    const hex = randomBytes(4).toString('hex');
    return `${hex.slice(0, 4)}-${hex.slice(4)}`;
  });
  return { codes, hashes: codes.map((c) => sha256(c)) };
}

// Returns the remaining hashes if the code matched, otherwise null
export function consumeRecoveryCode(hashes: string[], input: string): string[] | null {
  const hash = sha256(input.trim().toLowerCase());
  return hashes.includes(hash) ? hashes.filter((h) => h !== hash) : null;
}
