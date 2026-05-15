/**
 * Dynamic CORS middleware.
 * Reads ALLOWED_ORIGINS from env (comma-separated) and applies Hono CORS.
 */

import { cors } from 'hono/cors';
import type { MiddlewareHandler } from 'hono';
import type { AppContext } from '../types';

export const corsMiddleware: MiddlewareHandler<AppContext> = async (c, next) => {
  const allowedOrigins = (c.env.ALLOWED_ORIGINS || 'http://localhost:5173,http://localhost:3000').split(',');
  const handler = cors({
    origin: allowedOrigins,
    allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
    allowHeaders: [
      'Content-Type', 'Authorization', 'X-Tenant-ID', 'X-Hospital-ID',
      'X-API-Key', 'X-Request-ID', 'X-Turnstile-Token',
    ],
    exposeHeaders: ['Content-Length', 'X-Request-ID'],
    maxAge: 600,
    credentials: true,
  });
  return handler(c, next);
};
