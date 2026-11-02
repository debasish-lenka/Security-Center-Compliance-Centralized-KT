import nodemailer from 'nodemailer';
import type { PrismaClient, MailSettings } from '@prisma/client';
import { decryptSecret } from './crypto.js';

export interface MailMessage {
  to: string;
  subject: string;
  html: string;
  text?: string;
}

export async function getMailSettings(prisma: PrismaClient): Promise<MailSettings | null> {
  return prisma.mailSettings.findUnique({ where: { id: 'default' } });
}

export function isMailConfigured(s: MailSettings | null): s is MailSettings {
  if (!s || !s.fromEmail) return false;
  if (s.provider === 'SMTP') return !!(s.smtpHost && s.smtpPort);
  return !!(s.tenantId && s.clientId && s.clientSecretEnc);
}

async function sendViaSmtp(s: MailSettings, msg: MailMessage) {
  const transport = nodemailer.createTransport({
    host: s.smtpHost!,
    port: s.smtpPort!,
    secure: s.smtpSecure,
    requireTLS: !s.smtpSecure, // Office 365 (587) needs STARTTLS
    auth: s.smtpUser ? { user: s.smtpUser, pass: s.smtpPassEnc ? decryptSecret(s.smtpPassEnc) : '' } : undefined,
    connectionTimeout: 10000,
    greetingTimeout: 10000,
    socketTimeout: 15000,
  });
  await transport.sendMail({
    from: `"${s.fromName}" <${s.fromEmail}>`,
    to: msg.to,
    subject: msg.subject,
    html: msg.html,
    text: msg.text,
  });
}

// Microsoft Graph with an Entra ID app (client credentials). Needs the Mail.Send application permission.
async function sendViaGraph(s: MailSettings, msg: MailMessage) {
  const tokenRes = await fetch(`https://login.microsoftonline.com/${encodeURIComponent(s.tenantId!)}/oauth2/v2.0/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: s.clientId!,
      client_secret: decryptSecret(s.clientSecretEnc!),
      scope: 'https://graph.microsoft.com/.default',
      grant_type: 'client_credentials',
    }),
    signal: AbortSignal.timeout(15000),
  });
  const tokenBody = (await tokenRes.json().catch(() => ({}))) as { access_token?: string; error_description?: string };
  if (!tokenRes.ok || !tokenBody.access_token) {
    throw new Error(`Microsoft sign-in failed: ${tokenBody.error_description?.split('\r')[0] ?? tokenRes.statusText}`);
  }

  const res = await fetch(`https://graph.microsoft.com/v1.0/users/${encodeURIComponent(s.fromEmail)}/sendMail`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${tokenBody.access_token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      message: {
        subject: msg.subject,
        body: { contentType: 'HTML', content: msg.html },
        toRecipients: [{ emailAddress: { address: msg.to } }],
      },
      saveToSentItems: false,
    }),
    signal: AbortSignal.timeout(15000),
  });
  if (!res.ok) {
    const err = (await res.json().catch(() => ({}))) as { error?: { message?: string } };
    throw new Error(`Microsoft Graph rejected the message: ${err.error?.message ?? res.statusText}`);
  }
}

export async function sendMail(prisma: PrismaClient, msg: MailMessage): Promise<void> {
  const settings = await getMailSettings(prisma);
  if (!isMailConfigured(settings)) throw new Error('Email is not configured. A super admin can set it up under Mail Settings.');
  if (settings.provider === 'GRAPH') await sendViaGraph(settings, msg);
  else await sendViaSmtp(settings, msg);
}

const escapeHtml = (v: string) => v.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

export function inviteEmail(opts: { fullName: string; url: string; hours: number; mfa: boolean }): { subject: string; html: string; text: string } {
  const name = escapeHtml(opts.fullName);
  const mfaLine = opts.mfa ? ' You will also set up an authenticator app (Microsoft or Google Authenticator).' : '';
  return {
    subject: 'Activate your DBI Security Center account',
    text: `Hi ${opts.fullName},\n\nAn account was created for you. Open this link to set your password:\n${opts.url}\n\nThe link works once and expires in ${opts.hours} hours. It only opens on the office network.${mfaLine}`,
    html: `<div style="font-family:Segoe UI,Arial,sans-serif;max-width:520px;margin:auto">
      <h2 style="color:#0e7490">DBI Security Center</h2>
      <p>Hi ${name},</p>
      <p>An account was created for you. Click the button to set your password.${mfaLine}</p>
      <p><a href="${opts.url}" style="background:#0891b2;color:#fff;padding:12px 22px;border-radius:8px;text-decoration:none;display:inline-block">Activate account</a></p>
      <p style="color:#475569;font-size:13px">This link works once and expires in ${opts.hours} hours. It only opens on the office network. If you weren't expecting this, ignore this email.</p>
    </div>`,
  };
}
