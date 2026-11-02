import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { createAuthService } from '../services/auth.js';
import { env } from '../utils/env.js';

const LoginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8).max(128),
});

const RegisterSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8).max(128),
  fullName: z.string().min(1).max(255),
  department: z.string().max(255).optional().nullable(),
});

const ChangePasswordSchema = z.object({
  currentPassword: z.string().min(8).max(128),
  newPassword: z.string().min(8).max(128),
});

const ForgotPasswordSchema = z.object({
  email: z.string().email(),
});

export async function authRoutes(app: FastifyInstance) {
  const authService = createAuthService(app);

  // Login
  app.post('/login', {
    schema: {
      body: LoginSchema,
      response: {
        200: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            data: {
              type: 'object',
              properties: {
                user: {
                  type: 'object',
                  properties: {
                    id: { type: 'string' },
                    email: { type: 'string' },
                    fullName: { type: 'string' },
                    department: { type: ['string', 'null'] },
                    role: { type: 'string' },
                    status: { type: 'string' },
                  },
                },
                token: { type: 'string' },
              },
            },
          },
        },
      },
    },
  }, async (request, reply) => {
    const { email, password } = request.body as z.infer<typeof LoginSchema>;
    const ipAddress = request.ip;
    const userAgent = request.headers['user-agent'];

    const result = await authService.login(email, password, ipAddress, userAgent);

    if (!result) {
      return reply.code(401).send({
        success: false,
        error: { code: 'INVALID_CREDENTIALS', message: 'Invalid email or password' },
      });
    }

    // Set cookie
    reply.setCookie('auth_token', result.token, {
      httpOnly: true,
      secure: env.COOKIE_SECURE,
      sameSite: 'lax',
      path: '/',
      maxAge: 7 * 24 * 60 * 60, // 7 days
    });

    return reply.send({
      success: true,
      data: result,
    });
  });

  // Register (only for first admin bootstrap or when enabled)
  app.post('/register', {
    schema: {
      body: RegisterSchema,
    },
  }, async (request, reply) => {
    const data = request.body as z.infer<typeof RegisterSchema>;

    // Check if registration is allowed (only if no users exist)
    const userCount = await app.prisma.profile.count();
    if (userCount > 0) {
      return reply.code(403).send({
        success: false,
        error: { code: 'REGISTRATION_DISABLED', message: 'Registration is disabled. Contact an administrator.' },
      });
    }

    const result = await authService.register(data);

    reply.setCookie('auth_token', result.token, {
      httpOnly: true,
      secure: env.COOKIE_SECURE,
      sameSite: 'lax',
      path: '/',
      maxAge: 7 * 24 * 60 * 60,
    });

    return reply.code(201).send({
      success: true,
      data: result,
    });
  });

  // Logout
  app.post('/logout', async (request, reply) => {
    if (request.userId) {
      const ipAddress = request.ip;
      const userAgent = request.headers['user-agent'];
      await authService.logout(request.userId, ipAddress, userAgent);
    }

    reply.clearCookie('auth_token', { path: '/' });

    return reply.send({ success: true, data: null });
  });

  // Get current user profile
  app.get('/me', async (request, reply) => {
    if (!request.userId) {
      return reply.code(401).send({
        success: false,
        error: { code: 'UNAUTHORIZED', message: 'Not authenticated' },
      });
    }

    const user = await authService.getProfile(request.userId);

    return reply.send({
      success: true,
      data: user,
    });
  });

  // Update profile
  app.patch('/me', {
    schema: {
      body: z.object({
        fullName: z.string().min(1).max(255).optional(),
        department: z.string().max(255).optional().nullable(),
      }),
    },
  }, async (request, reply) => {
    if (!request.userId) {
      return reply.code(401).send({
        success: false,
        error: { code: 'UNAUTHORIZED', message: 'Not authenticated' },
      });
    }

    const { fullName, department } = request.body as { fullName?: string; department?: string | null };
    const user = await authService.updateProfile(request.userId, { fullName, department });

    return reply.send({ success: true, data: user });
  });

  // Change password
  app.post('/change-password', {
    schema: {
      body: ChangePasswordSchema,
    },
  }, async (request, reply) => {
    if (!request.userId) {
      return reply.code(401).send({
        success: false,
        error: { code: 'UNAUTHORIZED', message: 'Not authenticated' },
      });
    }

    const { currentPassword, newPassword } = request.body as z.infer<typeof ChangePasswordSchema>;
    const success = await authService.changePassword(request.userId, currentPassword, newPassword);

    if (!success) {
      return reply.code(400).send({
        success: false,
        error: { code: 'INVALID_PASSWORD', message: 'Current password is incorrect' },
      });
    }

    return reply.send({ success: true, data: null });
  });

  // Forgot password
  app.post('/forgot-password', {
    schema: {
      body: ForgotPasswordSchema,
    },
  }, async (request, reply) => {
    const { email } = request.body as z.infer<typeof ForgotPasswordSchema>;
    const result = await authService.requestPasswordReset(email);

    // Always return success to prevent email enumeration
    return reply.send({
      success: true,
      data: env.NODE_ENV === 'development' ? { resetToken: result } : null,
    });
  });

  // Refresh token
  app.post('/refresh', async (request, reply) => {
    if (!request.userId) {
      return reply.code(401).send({
        success: false,
        error: { code: 'UNAUTHORIZED', message: 'Not authenticated' },
      });
    }

    const user = await authService.getProfile(request.userId);
    if (!user || user.status !== 'ACTIVE') {
      return reply.code(401).send({
        success: false,
        error: { code: 'UNAUTHORIZED', message: 'Account not active' },
      });
    }

    const token = app.jwt.sign({
      sub: user.id,
      email: user.email,
      role: user.role,
    });

    reply.setCookie('auth_token', token, {
      httpOnly: true,
      secure: env.COOKIE_SECURE,
      sameSite: 'lax',
      path: '/',
      maxAge: 7 * 24 * 60 * 60,
    });

    return reply.send({ success: true, data: { token } });
  });
}