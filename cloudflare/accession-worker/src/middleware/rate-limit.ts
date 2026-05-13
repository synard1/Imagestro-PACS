/**
 * Rate limiting middleware using Cloudflare Rate Limiting bindings.
 *
 * Applies per-tenant rate limits:
 * - Write endpoints (POST/PATCH/DELETE): RATE_LIMITER_WRITE (100/10s)
 * - Read endpoints (GET): RATE_LIMITER_READ (500/10s)
 *
 * Keys rate limits by tenant_id. On 429, sets Retry-After header and
 * emits a rate limit event to Analytics Engine.
 *
 * Gracefully degrades if rate limiter bindings are not available.
 *
 * Requirements: 12.8, 12.9
 */

import { createMiddleware } from 'hono/factory';
import type { Env, TenantContext } from '../types';
import { RateLimitedError } from '../errors';
import { emitRateLimitEvent } from '../services/analytics';

// ─── Constants ───────────────────────────────────────────────────────────────

/** Default Retry-After value in seconds */
const RETRY_AFTER_SECONDS = 10;

/** HTTP methods considered as write operations */
const WRITE_METHODS = new Set(['POST', 'PATCH', 'DELETE', 'PUT']);

// ─── Hono Variable Types ─────────────────────────────────────────────────────

type Variables = {
  tenant: TenantContext;
};

// ─── Rate Limit Middleware ───────────────────────────────────────────────────

export const rateLimitMiddleware = createMiddleware<{
  Bindings: Env;
  Variables: Variables;
}>(async (c, next) => {
  // Get tenant context (set by auth middleware upstream)
  const tenant = c.get('tenant');
  if (!tenant) {
    // No tenant context means auth middleware hasn't run or this is a public path
    return next();
  }

  const method = c.req.method.toUpperCase();
  const isWrite = WRITE_METHODS.has(method);

  // Select the appropriate rate limiter binding
  const limiter = isWrite ? c.env.RATE_LIMITER_WRITE : c.env.RATE_LIMITER_READ;

  // Graceful degradation: skip rate limiting if binding is not available
  if (!limiter) {
    return next();
  }

  // Key the rate limit by tenant_id
  const outcome = await limiter.limit({ key: tenant.tenantId });

  if (!outcome.success) {
    // Emit rate limit event to Analytics Engine
    const endpoint = new URL(c.req.url).pathname;
    emitRateLimitEvent(c.env, {
      tenantId: tenant.tenantId,
      endpoint,
      statusCode: 429,
    });

    // Return 429 with Retry-After header
    const error = new RateLimitedError(RETRY_AFTER_SECONDS);
    return c.json(
      {
        error: error.message,
        code: error.code,
        details: error.details,
      },
      {
        status: 429,
        headers: {
          'Retry-After': String(RETRY_AFTER_SECONDS),
        },
      },
    );
  }

  return next();
});
