import { randomBytes } from 'crypto';
import type { PrismaClient } from '@prisma/client';
import { env } from '../utils/env.js';
import { sha256 } from './crypto.js';
import { inviteEmail, sendMail } from './mail.js';
import { requiresMfa } from './mfa.js';

export const INVITE_HOURS = 24;

// Creates a fresh link and voids any earlier unused ones. Returns the raw token (never stored).
export async function createInvite(prisma: PrismaClient, userId: string) {
  const token = randomBytes(32).toString('base64url');
  const expiresAt = new Date(Date.now() + INVITE_HOURS * 3600 * 1000);
  await prisma.$transaction([
    prisma.inviteToken.deleteMany({ where: { userId, usedAt: null } }),
    prisma.inviteToken.create({ data: { userId, tokenHash: sha256(token), expiresAt } }),
  ]);
  return { token, expiresAt, url: `${env.FRONTEND_URL.replace(/\/$/, '')}/activate/${token}` };
}

export async function findValidInvite(prisma: PrismaClient, token: string) {
  const invite = await prisma.inviteToken.findUnique({
    where: { tokenHash: sha256(token) },
    include: { user: { select: { id: true, email: true, fullName: true, role: true, status: true } } },
  });
  if (!invite || invite.usedAt || invite.expiresAt < new Date() || invite.user.status !== 'PENDING') return null;
  return invite;
}

// Creates the invite and emails it. Never throws: the caller decides what to show if email failed.
export async function inviteAndEmail(prisma: PrismaClient, user: { id: string; email: string; fullName: string; role: string }) {
  const invite = await createInvite(prisma, user.id);
  try {
    await sendMail(prisma, {
      to: user.email,
      ...inviteEmail({ fullName: user.fullName, url: invite.url, hours: INVITE_HOURS, mfa: requiresMfa(user.role) }),
    });
    return { sent: true as const, expiresAt: invite.expiresAt, url: invite.url };
  } catch (err) {
    return { sent: false as const, expiresAt: invite.expiresAt, url: invite.url, error: err instanceof Error ? err.message : 'Email failed' };
  }
}
