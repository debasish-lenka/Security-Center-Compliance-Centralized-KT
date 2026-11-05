import type { FastifyError, FastifyReply, FastifyRequest } from 'fastify';
import { ZodError } from 'zod';
import { Prisma } from '@prisma/client';
import { MAX_UPLOAD_MB } from '../services/upload-policy.js';

export function errorHandler(
  error: FastifyError,
  request: FastifyRequest,
  reply: FastifyReply
) {
  // Log error
  request.log.error({ err: error, url: request.url }, 'Request error');

  // Zod validation errors
  if (error instanceof ZodError) {
    return reply.code(400).send({
      success: false,
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Invalid request data',
        details: error.flatten().fieldErrors,
      },
    });
  }

  // Prisma errors
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    if (error.code === 'P2002') {
      const target = (error.meta?.target as string[])?.join(', ') || 'field';
      return reply.code(409).send({
        success: false,
        error: {
          code: 'CONFLICT',
          message: `A record with this ${target} already exists`,
        },
      });
    }
    if (error.code === 'P2025') {
      return reply.code(404).send({
        success: false,
        error: {
          code: 'NOT_FOUND',
          message: 'Record not found',
        },
      });
    }
    if (error.code === 'P2003') {
      return reply.code(400).send({
        success: false,
        error: {
          code: 'FOREIGN_KEY_CONSTRAINT',
          message: 'Referenced record does not exist',
        },
      });
    }
  }

  // Fastify validation errors
  if (error.validation) {
    return reply.code(400).send({
      success: false,
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Invalid request',
        details: error.validation,
      },
    });
  }

  // A request body above the limit (a file that is too large)
  if (error.statusCode === 413) {
    return reply.code(413).send({ success: false, error: { code: 'TOO_LARGE', message: `The file is larger than ${MAX_UPLOAD_MB} MB.` } });
  }

  // Unauthorized
  if (error.statusCode === 401 || error.message?.includes('Unauthorized')) {
    return reply.code(401).send({
      success: false,
      error: {
        code: 'UNAUTHORIZED',
        message: 'Authentication required',
      },
    });
  }

  // Forbidden
  if (error.statusCode === 403 || error.message?.includes('Forbidden')) {
    return reply.code(403).send({
      success: false,
      error: {
        code: 'FORBIDDEN',
        message: 'Insufficient permissions',
      },
    });
  }

  // Not found
  if (error.statusCode === 404) {
    return reply.code(404).send({
      success: false,
      error: {
        code: 'NOT_FOUND',
        message: 'Resource not found',
      },
    });
  }

  // Rate limit
  if (error.statusCode === 429) {
    return reply.code(429).send({
      success: false,
      error: {
        code: 'RATE_LIMITED',
        message: 'Too many requests',
      },
    });
  }

  // Internal server error
  const statusCode = error.statusCode || 500;
  const message = statusCode === 500 ? 'Internal server error' : error.message;

  return reply.code(statusCode).send({
    success: false,
    error: {
      code: 'INTERNAL_ERROR',
      message,
    },
  });
}