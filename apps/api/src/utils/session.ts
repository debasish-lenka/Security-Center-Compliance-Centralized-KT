import { env } from './env.js';

// How long a login token lasts (JWT_EXPIRES_IN, e.g. "8h", "30m", "7d" or plain seconds) and how it is renewed.
// A token is short-lived, but a person who keeps working gets a fresh one now and then (see authMiddleware),
// so only someone who stops working is signed out. A stolen token therefore dies soon after the owner stops.

const UNIT: Record<string, number> = { s: 1, m: 60, h: 3600, d: 86400 };

export function parseSeconds(value: string, fallback = 8 * 3600): number {
  const m = /^\s*(\d+)\s*([smhd]?)\s*$/i.exec(value);
  if (!m) return fallback;
  const n = Number(m[1]) * (UNIT[(m[2] || 's').toLowerCase()] ?? 1);
  return n > 0 ? n : fallback;
}

export const SESSION_SECONDS = parseSeconds(env.JWT_EXPIRES_IN);
// A token older than this (and still valid) is swapped for a new one on the next request
export const RENEW_AFTER_SECONDS = Math.max(30, Math.floor(SESSION_SECONDS / 8));

export const sessionCookie = {
  httpOnly: true,
  secure: env.COOKIE_SECURE,
  sameSite: 'lax' as const,
  path: '/',
  maxAge: SESSION_SECONDS,
};
