import { createHash, randomBytes } from 'crypto';
import type { PrismaClient, SsoSettings } from '@prisma/client';
import { env } from '../utils/env.js';
import { decryptSecret } from './crypto.js';

const GUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const isGuid = (v: string) => GUID.test(v);

// Where Microsoft sends the browser back. Must match the Redirect URI registered in Entra ID exactly.
export const ssoRedirectUri = () => `${env.FRONTEND_URL.replace(/\/$/, '')}/api/v1/auth/microsoft/callback`;

export const getSsoSettings = (prisma: PrismaClient) => prisma.ssoSettings.findUnique({ where: { id: 'default' } });

export function isSsoReady(s: SsoSettings | null): s is SsoSettings & { tenantId: string; clientId: string; clientSecretEnc: string } {
  return !!(s?.enabled && s.tenantId && s.clientId && s.clientSecretEnc);
}

const b64url = (buf: Buffer) => buf.toString('base64url');

// PKCE + nonce + state for one sign-in attempt
export function newAuthRequest() {
  const verifier = b64url(randomBytes(32));
  return {
    state: b64url(randomBytes(16)),
    nonce: b64url(randomBytes(16)),
    verifier,
    challenge: b64url(createHash('sha256').update(verifier).digest()),
  };
}

export function authorizeUrl(s: { tenantId: string; clientId: string }, req: { state: string; nonce: string; challenge: string }) {
  const params = new URLSearchParams({
    client_id: s.clientId,
    response_type: 'code',
    redirect_uri: ssoRedirectUri(),
    response_mode: 'query',
    scope: 'openid profile email',
    state: req.state,
    nonce: req.nonce,
    code_challenge: req.challenge,
    code_challenge_method: 'S256',
    prompt: 'select_account',
  });
  return `https://login.microsoftonline.com/${s.tenantId}/oauth2/v2.0/authorize?${params}`;
}

export interface MicrosoftIdentity {
  email: string;
  oid: string;
  name?: string;
}

// Exchanges the code for tokens. The ID token comes straight from Microsoft's token endpoint over TLS,
// which OpenID Connect Core 3.1.3.7 accepts in place of signature checks; we still verify its claims.
export async function completeSignIn(
  s: { tenantId: string; clientId: string; clientSecretEnc: string },
  code: string,
  verifier: string,
  expectedNonce: string
): Promise<MicrosoftIdentity> {
  const res = await fetch(`https://login.microsoftonline.com/${s.tenantId}/oauth2/v2.0/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: s.clientId,
      client_secret: decryptSecret(s.clientSecretEnc),
      grant_type: 'authorization_code',
      code,
      redirect_uri: ssoRedirectUri(),
      code_verifier: verifier,
      scope: 'openid profile email',
    }),
    signal: AbortSignal.timeout(15000),
  });
  const body = (await res.json().catch(() => ({}))) as { id_token?: string; error_description?: string };
  if (!res.ok || !body.id_token) {
    throw new Error(body.error_description?.split('\r')[0] ?? 'Microsoft did not accept the sign-in');
  }

  const claims = JSON.parse(Buffer.from(body.id_token.split('.')[1], 'base64url').toString()) as Record<string, any>;
  const now = Math.floor(Date.now() / 1000);
  if (claims.aud !== s.clientId) throw new Error('Token was issued for a different application');
  if (claims.tid !== s.tenantId || claims.iss !== `https://login.microsoftonline.com/${s.tenantId}/v2.0`) {
    throw new Error('Token was issued by a different directory');
  }
  if (!claims.exp || claims.exp < now) throw new Error('Token has expired');
  if (claims.nonce !== expectedNonce) throw new Error('Sign-in response did not match the request');

  const email = String(claims.email ?? claims.preferred_username ?? claims.upn ?? '').trim().toLowerCase();
  if (!email || !claims.oid) throw new Error('Microsoft did not return an email address');
  return { email, oid: String(claims.oid), name: claims.name };
}
