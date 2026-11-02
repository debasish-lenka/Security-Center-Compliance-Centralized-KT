import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { createAuditLogger } from '../services/audit-logger.js';
import { encryptSecret } from '../services/crypto.js';
import { getMailSettings, isMailConfigured, sendMail } from '../services/mail.js';

const blank = (v: unknown) => (typeof v === 'string' && v.trim() === '' ? undefined : v);
const optionalText = z.preprocess(blank, z.string().trim().max(255).optional());

const MailSettingsSchema = z.object({
  provider: z.enum(['SMTP', 'GRAPH']),
  fromName: z.string().trim().min(1).max(100),
  fromEmail: z.string().trim().email().max(255),
  // SMTP (Office 365: smtp.office365.com, 587, STARTTLS off = false)
  smtpHost: optionalText,
  smtpPort: z.coerce.number().int().min(1).max(65535).optional(),
  smtpSecure: z.boolean().optional(),
  smtpUser: optionalText,
  // Secrets: leave empty to keep the stored value
  smtpPassword: z.preprocess(blank, z.string().max(500).optional()),
  // Microsoft Graph (Entra ID app registration)
  tenantId: optionalText,
  clientId: optionalText,
  clientSecret: z.preprocess(blank, z.string().max(500).optional()),
});

const TestSchema = z.object({ to: z.string().trim().email() });

export async function mailSettingsRoutes(app: FastifyInstance) {
  const auditLogger = createAuditLogger(app);
  const superAdminOnly = [app.authenticate, app.requireRole(['SUPER_ADMIN'])];

  // Never returns secrets, only whether they are set
  app.get('/mail-settings', { preHandler: superAdminOnly }, async (_request, reply) => {
    const s = await getMailSettings(app.prisma);
    return reply.send({
      success: true,
      data: {
        configured: isMailConfigured(s),
        provider: s?.provider ?? 'SMTP',
        fromName: s?.fromName ?? 'DBI Security Center',
        fromEmail: s?.fromEmail ?? '',
        smtpHost: s?.smtpHost ?? 'smtp.office365.com',
        smtpPort: s?.smtpPort ?? 587,
        smtpSecure: s?.smtpSecure ?? false,
        smtpUser: s?.smtpUser ?? '',
        hasSmtpPassword: !!s?.smtpPassEnc,
        tenantId: s?.tenantId ?? '',
        clientId: s?.clientId ?? '',
        hasClientSecret: !!s?.clientSecretEnc,
        updatedAt: s?.updatedAt ?? null,
      },
    });
  });

  app.put('/mail-settings', { preHandler: superAdminOnly, schema: { body: MailSettingsSchema } }, async (request, reply) => {
    const b = request.body as z.infer<typeof MailSettingsSchema>;
    const existing = await getMailSettings(app.prisma);

    if (b.provider === 'SMTP' && !(b.smtpHost && b.smtpPort)) {
      return reply.code(400).send({ success: false, error: { code: 'VALIDATION_ERROR', message: 'SMTP host and port are required' } });
    }
    if (b.provider === 'GRAPH' && !(b.tenantId && b.clientId && (b.clientSecret || existing?.clientSecretEnc))) {
      return reply.code(400).send({ success: false, error: { code: 'VALIDATION_ERROR', message: 'Tenant ID, client ID and client secret are required' } });
    }

    const data = {
      provider: b.provider,
      fromName: b.fromName,
      fromEmail: b.fromEmail,
      smtpHost: b.smtpHost ?? null,
      smtpPort: b.smtpPort ?? 587,
      smtpSecure: b.smtpSecure ?? false,
      smtpUser: b.smtpUser ?? null,
      tenantId: b.tenantId ?? null,
      clientId: b.clientId ?? null,
      updatedBy: request.userId!,
      ...(b.smtpPassword ? { smtpPassEnc: encryptSecret(b.smtpPassword) } : {}),
      ...(b.clientSecret ? { clientSecretEnc: encryptSecret(b.clientSecret) } : {}),
    };
    await app.prisma.mailSettings.upsert({ where: { id: 'default' }, update: data, create: { id: 'default', ...data } });

    // Log what changed, never the secrets
    await auditLogger.logConfigChange(
      request.userId!, 'mail_settings',
      existing ? { provider: existing.provider, fromEmail: existing.fromEmail } : null,
      { provider: b.provider, fromEmail: b.fromEmail, smtpHost: b.smtpHost, tenantId: b.tenantId },
      request.ip, request.headers['user-agent']
    );
    return reply.send({ success: true, data: null });
  });

  // Sends a real message with the saved settings, so problems show up before inviting anyone
  app.post('/mail-settings/test', { preHandler: superAdminOnly, schema: { body: TestSchema } }, async (request, reply) => {
    const { to } = request.body as z.infer<typeof TestSchema>;
    try {
      await sendMail(app.prisma, {
        to,
        subject: 'DBI Security Center: test email',
        html: '<p>This is a test message. Your mail settings work.</p>',
        text: 'This is a test message. Your mail settings work.',
      });
      return reply.send({ success: true, data: { sent: true } });
    } catch (err) {
      return reply.code(422).send({
        success: false,
        error: { code: 'MAIL_FAILED', message: err instanceof Error ? err.message : 'Sending failed' },
      });
    }
  });
}
