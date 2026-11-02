import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'crypto';
import { env } from '../utils/env.js';

// AES-256-GCM with the server's ENCRYPTION_KEY. Used for secrets stored in the DB
// (mail passwords, TOTP seeds). Format: iv.tag.ciphertext (base64url).
const key = () => createHash('sha256').update(env.ENCRYPTION_KEY).digest();

export function encryptSecret(plain: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key(), iv);
  const data = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  return [iv, cipher.getAuthTag(), data].map((b) => b.toString('base64url')).join('.');
}

export function decryptSecret(payload: string): string {
  const [iv, tag, data] = payload.split('.').map((p) => Buffer.from(p, 'base64url'));
  const decipher = createDecipheriv('aes-256-gcm', key(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(data), decipher.final()]).toString('utf8');
}

export const sha256 = (value: string) => createHash('sha256').update(value).digest('hex');
