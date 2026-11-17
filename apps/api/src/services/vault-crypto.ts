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

export interface SecretPayload { username?: string; url?: string; value: string; file?: { name: string } }

// aad ties the ciphertext to its secret and version: a row copied onto another secret will not decrypt
// With fileBytes, the file is sealed under the same data key and returned as fileBlob (iv.tag.data in one buffer) to be written to disk.
export function sealSecret(p: SecretPayload, secretId: string, version: number, fileBytes?: Buffer) {
  const dek = randomBytes(32);
  const aad = `${secretId}:${version}`;
  const out = {
    valueEnc: seal(dek, Buffer.from(JSON.stringify(p), 'utf8'), aad),
    dekEnc: seal(master(), dek, `dek:${aad}`),
    keyId: KEY_ID,
    fileBlob: undefined as Buffer | undefined,
  };
  if (fileBytes) {
    const iv = randomBytes(12);
    const c = createCipheriv('aes-256-gcm', dek, iv);
    c.setAAD(Buffer.from(`${aad}:file`));
    const data = Buffer.concat([c.update(fileBytes), c.final()]);
    out.fileBlob = Buffer.concat([iv, c.getAuthTag(), data]);
  }
  return out;
}

export function openSecretFile(row: { dekEnc: string }, blob: Buffer, secretId: string, version: number): Buffer {
  const aad = `${secretId}:${version}`;
  const dek = open(master(), row.dekEnc, `dek:${aad}`);
  const d = createDecipheriv('aes-256-gcm', dek, blob.subarray(0, 12));
  d.setAAD(Buffer.from(`${aad}:file`));
  d.setAuthTag(blob.subarray(12, 28));
  return Buffer.concat([d.update(blob.subarray(28)), d.final()]);
}

export function openSecret(row: { valueEnc: string; dekEnc: string }, secretId: string, version: number): SecretPayload {
  const aad = `${secretId}:${version}`;
  const dek = open(master(), row.dekEnc, `dek:${aad}`);
  return JSON.parse(open(dek, row.valueEnc, aad).toString('utf8'));
}
