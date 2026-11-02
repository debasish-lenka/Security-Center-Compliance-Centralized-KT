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

  // true only when served over HTTPS (Secure cookies are dropped on plain HTTP)
  COOKIE_SECURE: z.enum(['true', 'false']).default('false').transform((v) => v === 'true'),

  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z.coerce.number().default(587),
  SMTP_USER: z.string().optional(),
  SMTP_PASS: z.string().optional(),
  SMTP_FROM: z.string().min(3).default('DBI Security Center <noreply@dbi.example.com>'),

  FRONTEND_URL: z.string().url().default('http://localhost:5173'),

  RATE_LIMIT_MAX: z.coerce.number().default(100),
  RATE_LIMIT_WINDOW_MS: z.coerce.number().default(60000),

  ENCRYPTION_KEY: z.string().length(32),
});

const parsed = EnvSchema.safeParse(process.env);

if (!parsed.success) {
  console.error('❌ Invalid environment variables:');
  console.error(parsed.error.flatten().fieldErrors);
  process.exit(1);
}

export const env = parsed.data;