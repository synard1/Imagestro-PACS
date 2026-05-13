/**
 * Gateway authentication middleware.
 *
 * Validates the `X-Gateway-Secret` header against the configured
 * GATEWAY_SHARED_SECRET using constant-time comparison to prevent
 * timing attacks.
 *
 * Requirements: 7.4, 7.5
 */

import { createMiddleware } from 'hono/factory';
import type { Env } from '../types';

/**
 * Performs a constant-time comparison of two strings using
 * crypto.subtle.timingSafeEqual (available in Cloudflare Workers runtime).
 *
 * Returns false if either value is empty or if lengths differ,
 * but still performs work to avoid leaking length information
 * through timing.
 */
async function timingSafeEqual(a: string, b: string): Promise<boolean> {
  const encoder = new TextEncoder();
  const aBuf = encoder.encode(a);
  const bBuf = encoder.encode(b);

  if (aBuf.byteLength !== bBuf.byteLength) {
    // Compare against itself to burn constant time, then return false.
    // This prevents leaking length differences through timing.
    crypto.subtle.timingSafeEqual(aBuf, aBuf);
    return false;
  }

  return crypto.subtle.timingSafeEqual(aBuf, bBuf);
}

/**
 * Hono middleware that validates the X-Gateway-Secret header.
 *
 * - If the header is missing or does not match GATEWAY_SHARED_SECRET,
 *   returns 401 Unauthorized with a JSON error body.
 * - If the header matches, calls next() to continue the request chain.
 */
export const gatewayAuth = createMiddleware<{ Bindings: Env }>(async (c, next) => {
  const headerValue = c.req.header('X-Gateway-Secret');

  if (!headerValue) {
    return c.json({ error: 'Unauthorized' }, 401);
  }

  const secret = c.env.GATEWAY_SHARED_SECRET;

  if (!secret) {
    return c.json({ error: 'Unauthorized' }, 401);
  }

  const isValid = await timingSafeEqual(headerValue, secret);

  if (!isValid) {
    return c.json({ error: 'Unauthorized' }, 401);
  }

  await next();
});
