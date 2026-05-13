/**
 * Security headers middleware.
 *
 * Sets standard security headers on every response:
 * - X-Content-Type-Options: nosniff
 * - X-Frame-Options: DENY
 * - Strict-Transport-Security: max-age=63072000; includeSubDomains
 * - Referrer-Policy: no-referrer
 *
 * Requirements: 12.10
 */

import { createMiddleware } from 'hono/factory';
import type { Env } from '../types';

export const securityHeadersMiddleware = createMiddleware<{ Bindings: Env }>(
  async (c, next) => {
    await next();

    c.header('X-Content-Type-Options', 'nosniff');
    c.header('X-Frame-Options', 'DENY');
    c.header('Strict-Transport-Security', 'max-age=63072000; includeSubDomains');
    c.header('Referrer-Policy', 'no-referrer');
  },
);
