import { z } from 'zod';

const EnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  HOST: z.string().default('0.0.0.0'),
  PORT: z.coerce.number().default(3001),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),

  DATABASE_URL: z.string().url(),

  JWT_SECRET: z.string().min(32),
  JWT_EXPIRES_IN: z.string().default('7d'),

  SESSION_SECRET: z.string().min(32),

  CORS_ORIGIN: z.string().default('http://localhost:5173'),

  // Uploaded files are stored on local disk here
  STORAGE_DIR: z.string().default('./Documents'),

  // Backups (database dump + Documents) are written here; PG_DUMP_PATH only needs setting when pg_dump is not on PATH
  BACKUP_DIR: z.string().default('./backups'),
  PG_DUMP_PATH: z.string().default('pg_dump'),

  // Time zone used for the dates and times printed on PDFs (e.g. Asia/Kolkata)
  APP_TIMEZONE: z.string().default('Asia/Kolkata'),

  // true only when served over HTTPS (Secure cookies are dropped on plain HTTP)
  COOKIE_SECURE: z.enum(['true', 'false']).default('false').transform((v) => v === 'true'),

  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z.coerce.number().default(587),
  SMTP_USER: z.string().optional(),
  SMTP_PASS: z.string().optional(),
  SMTP_FROM: z.string().min(3).default('DBI Security Center <noreply@dbi.example.com>'),

  FRONTEND_URL: z.string().url().default('http://localhost:5173'),

  // per IP per window; a dashboard page alone makes dozens of calls. Login and 2FA have their own strict limits.
  RATE_LIMIT_MAX: z.coerce.number().default(1000),
  RATE_LIMIT_WINDOW_MS: z.coerce.number().default(60000),

  ENCRYPTION_KEY: z.string().length(32),
});

const parsed = EnvSchema.safeParse(process.env);

if (!parsed.success) {
  console.error('❌ Invalid environment variables:');
  console.error(parsed.error.flatten().fieldErrors);
  process.exit(1);
}

// The repo is public, so the placeholder secrets in .env.example are known to everyone
const PLACEHOLDER = /change-me|your-|here-12345/i;
if (parsed.data.NODE_ENV === 'production') {
  const weak = (['JWT_SECRET', 'SESSION_SECRET', 'ENCRYPTION_KEY'] as const).filter((k) => PLACEHOLDER.test(parsed.data[k]));
  if (weak.length) {
    console.error(`❌ Replace placeholder values before running in production: ${weak.join(', ')}`);
    process.exit(1);
  }
}

export const env = parsed.data;