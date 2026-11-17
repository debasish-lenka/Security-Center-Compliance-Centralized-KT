import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';
import { env } from '../utils/env.js';

// Envelope encryption for the Secret Manager.
//  - every secret version gets its own random 256-bit data key; the value is sealed with it (AES-256-GCM)
//  - the data key is sealed with VAULT_MASTER_KEY, which lives only in the server's .env, never in the database or in backups
// A stolen database or backup therefore holds nothing readable. Format of each part: iv.tag.data (base64url).
export const KEY_ID = 'v1';

export const vaultEnabled = () => !!env.VAULT_MASTER_KEY;

function master(): Buffer {
  if (!env.VAULT_MASTER_KEY) throw Object.assign(new Error('The Secret Manager key is not set on the server'), { statusCode: 503 });
  return Buffer.from(env.VAULT_MASTER_KEY, 'hex');
}

function seal(key: Buffer, plain: Buffer, aad: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  cipher.setAAD(Buffer.from(aad));
  const data = Buffer.concat([cipher.update(plain), cipher.final()]);
  return [iv, cipher.getAuthTag(), data].map((b) => b.toString('base64url')).join('.');
}

function open(key: Buffer, payload: string, aad: string): Buffer {
  const [iv, tag, data] = payload.split('.').map((p) => Buffer.from(p, 'base64url'));
  const decipher = createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAAD(Buffer.from(aad));
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(data), decipher.final()]);
}

export interface SecretPayload { username?: string; url?: string; value: string }

// aad ties the ciphertext to its secret and version: a row copied onto another secret will not decrypt
export function sealSecret(p: SecretPayload, secretId: string, version: number) {
  const dek = randomBytes(32);
  const aad = `${secretId}:${version}`;
  return {
    valueEnc: seal(dek, Buffer.from(JSON.stringify(p), 'utf8'), aad),
    dekEnc: seal(master(), dek, `dek:${aad}`),
    keyId: KEY_ID,
  };
}

export function openSecret(row: { valueEnc: string; dekEnc: string }, secretId: string, version: number): SecretPayload {
  const aad = `${secretId}:${version}`;
  const dek = open(master(), row.dekEnc, `dek:${aad}`);
  return JSON.parse(open(dek, row.valueEnc, aad).toString('utf8'));
}
