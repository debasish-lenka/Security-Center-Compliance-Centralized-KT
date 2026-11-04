import 'dotenv/config';
import Fastify from 'fastify';
import { fastifyHelmet } from '@fastify/helmet';
import { fastifyCors } from '@fastify/cors';
import { fastifyCookie } from '@fastify/cookie';
import { fastifyRateLimit } from '@fastify/rate-limit';
import { fastifySensible } from '@fastify/sensible';
import { fastifySwagger } from '@fastify/swagger';
import { fastifySwaggerUi } from '@fastify/swagger-ui';
import { fastifyMultipart } from '@fastify/multipart';
import { fastifyJwt } from '@fastify/jwt';

import { env } from './utils/env.js';
import { prisma } from './db/client.js';
import { registerRoutes } from './routes/index.js';
import { errorHandler } from './middleware/error-handler.js';
import { authMiddleware } from './middleware/auth.js';
import { enforceProjectScope } from './middleware/project-scope.js';
import { AuditLogger } from './services/audit-logger.js';
import { authPlugin } from './plugins/auth.js';
import { startPurgeJob } from './services/recycle-bin.js';
import { startWorkShotPurge } from './routes/work-sessions.js';
import { startBackupJob } from './services/backup.js';
import { recordProjectActivity } from './services/project-progress.js';

const app = Fastify({
  // signed file links (/api/v1/files/<token>) are ~200 characters; the default limit is 100
  maxParamLength: 1000,
  trustProxy: true, // behind nginx: use X-Forwarded-For for client IPs (rate limit, audit log)
  logger: {
    level: env.LOG_LEVEL,
    transport: env.NODE_ENV === 'development' ? {
      target: 'pino-pretty',
      options: { colorize: true }
    } : undefined,
  },
  ajv: {
    customOptions: {
      coerceTypes: 'array',
      removeAdditional: true,
    },
  },
});

// Routes declare their request schemas with Zod; validate and coerce with it instead of Ajv
type ZodLike = { safeParse: (data: unknown) => { success: true; data: unknown } | { success: false; error: Error } };
const isZod = (schema: unknown): schema is ZodLike =>
  typeof schema === 'object' && schema !== null && typeof (schema as ZodLike).safeParse === 'function';

app.setValidatorCompiler(({ schema }) => {
  if (!isZod(schema)) {
    throw new Error('Route schemas must be Zod schemas');
  }
  return (data) => {
    const result = schema.safeParse(data);
    return result.success ? { value: result.data } : { error: result.error };
  };
});

// Security plugins
await app.register(fastifyHelmet, {
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      scriptSrc: ["'self'"],
      imgSrc: ["'self'", 'data:', 'https:'],
      connectSrc: ["'self'"],
      fontSrc: ["'self'"],
      objectSrc: ["'none'"],
      baseUri: ["'self'"],
      formAction: ["'self'"],
      frameAncestors: ["'none'"],
    },
  },
  crossOriginEmbedderPolicy: false,
});

await app.register(fastifyCors, {
  origin: env.CORS_ORIGIN,
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
});

await app.register(fastifyCookie, {
  secret: env.SESSION_SECRET,
  hook: 'onRequest',
  parseOptions: {
    httpOnly: true,
    secure: env.COOKIE_SECURE,
    sameSite: 'lax',
    path: '/',
  },
});

await app.register(fastifyRateLimit, {
  max: env.RATE_LIMIT_MAX,
  timeWindow: env.RATE_LIMIT_WINDOW_MS,
  allowList: ['127.0.0.1', '::1'],
  keyGenerator: (req) => req.ip,
});

await app.register(fastifySensible);

await app.register(fastifyJwt, {
  secret: env.JWT_SECRET,
  sign: { expiresIn: env.JWT_EXPIRES_IN },
  cookie: {
    cookieName: 'auth_token',
    signed: false,
  },
});

await app.register(fastifyMultipart, {
  limits: {
    fileSize: 50 * 1024 * 1024, // 50MB
    files: 10,
  },
});

// Swagger/OpenAPI
await app.register(fastifySwagger, {
  // Zod schemas aren't JSON Schema; drop them from the generated spec rather than crash it
  transform: ({ schema, url }) => {
    const clean: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(schema ?? {})) {
      if (!isZod(value)) clean[key] = value;
    }
    return { schema: clean, url };
  },
  openapi: {
    info: {
      title: 'DBI Security Center API',
      description: 'Centralized Security Operations, Knowledge Transfer & Compliance Management API',
      version: '1.0.0',
    },
    servers: [
      { url: `http://${env.HOST}:${env.PORT}`, description: 'Development server' },
    ],
    components: {
      securitySchemes: {
        bearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
        },
        cookieAuth: {
          type: 'apiKey',
          in: 'cookie',
          name: 'auth_token',
        },
      },
    },
    security: [{ bearerAuth: [], cookieAuth: [] }],
  },
});

await app.register(fastifySwaggerUi, {
  routePrefix: '/docs',
  uiConfig: {
    docExpansion: 'list',
    deepLinking: true,
  },
});

// Register auth plugin
await app.register(authPlugin);

// Global error handler
app.setErrorHandler(errorHandler);

// Decorate app with prisma and audit logger
app.decorate('prisma', prisma);
app.decorate('auditLogger', new AuditLogger(prisma));

// Auth middleware - runs on all routes except public ones
app.addHook('onRequest', authMiddleware);

// Project scope middleware - enforces project-level access
app.addHook('onRequest', enforceProjectScope);
// remember who changed what on a project (shown as "latest update"); hooks must be added before listen()
app.addHook('onResponse', async (request, reply) => { await recordProjectActivity(app, request, reply.statusCode); });

// Health check
app.get('/health', async () => ({
  status: 'ok',
  timestamp: new Date().toISOString(),
  uptime: process.uptime(),
}));

// API routes
await registerRoutes(app);

// 404 handler
app.setNotFoundHandler(async (request, reply) => {
  reply.code(404).send({
    success: false,
    error: { code: 'NOT_FOUND', message: 'Route not found' },
  });
});

// Graceful shutdown
const shutdown = async () => {
  app.log.info('Shutting down...');
  await app.close();
  await prisma.$disconnect();
  process.exit(0);
};

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

try {
  await app.listen({ port: env.PORT, host: env.HOST });
  startWorkShotPurge(app); // deletes work screenshots after the retention period
  startPurgeJob(app); // removes recycle-bin entries older than 30 days
  startBackupJob(app); // runs the scheduled backup set on the Backups page
  app.log.info(`🚀 DBI Security Center API running on http://${env.HOST}:${env.PORT}`);
  app.log.info(`📚 API Documentation available at http://${env.HOST}:${env.PORT}/docs`);
} catch (err) {
  app.log.error(err);
  process.exit(1);
}