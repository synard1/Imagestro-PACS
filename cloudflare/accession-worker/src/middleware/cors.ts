/**
 * CORS middleware.
 *
 * Parses ALLOWED_ORIGINS comma-separated list from env vars.
 * Sets Access-Control-Allow-Origin only for allowed origins; omits header otherwise.
 * Handles preflight OPTIONS requests.
 *
 * Requirements: 12.5
 */

import { createMiddleware } from 'hono/factory';
import type { Env } from '../types';

export const corsMiddleware = createMiddleware<{ Bindings: Env }>(
  async (c, next) => {
    const origin = c.req.header('Origin');
    const allowedOriginsRaw = c.env.ALLOWED_ORIGINS || '';
    const allowedOrigins = allowedOriginsRaw
      .split(',')
      .map((o) => o.trim())
      .filter(Boolean);

    // Determine if origin is allowed
    const isAllowed = origin && allowedOrigins.length > 0 && allowedOrigins.includes(origin);

    // Handle preflight OPTIONS
    if (c.req.method === 'OPTIONS') {
      const headers: Record<string, string> = {
        'Access-Control-Allow-Methods': 'GET, POST, PATCH, DELETE, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Request-ID, X-Idempotency-Key, X-Tenant-ID, X-Gateway-Signature, X-Consistency',
        'Access-Control-Max-Age': '86400',
      };

      if (isAllowed) {
        headers['Access-Control-Allow-Origin'] = origin!;
      }

      return new Response(null, { status: 204, headers });
    }

    await next();

    // Set CORS header on actual responses only for allowed origins
    if (isAllowed) {
      c.header('Access-Control-Allow-Origin', origin!);
    }
  },
);
