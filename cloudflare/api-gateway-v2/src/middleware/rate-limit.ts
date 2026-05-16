/**
 * KV-based rate limiting for login endpoints and general API routes.
 * Tracks attempts per-IP and per-username with configurable windows.
 *
 * Also exports a Hono middleware factory for applying rate limits to
 * arbitrary route groups (e.g., Log Viewer API at /api/v2/logs/*).
 */

import type { MiddlewareHandler } from 'hono';

interface LoginRateLimitState {
  count: number;
  windowStart: number;
  blockedUntil: number;
}

interface RateLimitState {
  count: number;
  windowStart: number;
}

function toPositiveInt(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.floor(parsed);
}

export function getRateLimitConfig(c: any) {
  const enabledRaw = String(c.env.AUTH_RATE_LIMIT_ENABLED ?? 'true').toLowerCase();
  return {
    enabled: !['false', '0', 'off', 'no'].includes(enabledRaw),
    windowSeconds: toPositiveInt(c.env.AUTH_RATE_LIMIT_WINDOW_SECONDS, 60),
    maxAttemptsIp: toPositiveInt(c.env.AUTH_RATE_LIMIT_MAX_ATTEMPTS_IP, 10),
    maxAttemptsUser: toPositiveInt(c.env.AUTH_RATE_LIMIT_MAX_ATTEMPTS_USER, 5),
    blockSeconds: toPositiveInt(c.env.AUTH_RATE_LIMIT_BLOCK_SECONDS, 300),
  };
}

async function checkRateLimit(
  c: any,
  key: string,
  maxAttempts: number,
  windowSeconds: number,
  blockSeconds: number
) {
  const now = Math.floor(Date.now() / 1000);
  const raw = await c.env.API_CACHE.get(key);

  let state: LoginRateLimitState = raw
    ? JSON.parse(raw)
    : { count: 0, windowStart: now, blockedUntil: 0 };

  if (state.blockedUntil > now) {
    return { allowed: false, retryAfter: state.blockedUntil - now, remaining: 0 };
  }

  if (now - state.windowStart >= windowSeconds) {
    state = { count: 0, windowStart: now, blockedUntil: 0 };
  }

  state.count += 1;

  if (state.count > maxAttempts) {
    state.blockedUntil = now + blockSeconds;
    await c.env.API_CACHE.put(key, JSON.stringify(state), { expirationTtl: windowSeconds + blockSeconds });
    return { allowed: false, retryAfter: blockSeconds, remaining: 0 };
  }

  await c.env.API_CACHE.put(key, JSON.stringify(state), { expirationTtl: windowSeconds + blockSeconds });
  return { allowed: true, retryAfter: 0, remaining: Math.max(0, maxAttempts - state.count) };
}

/**
 * Apply login rate limiting. Returns a 429 Response if blocked, or null if allowed.
 */
export async function applyLoginRateLimit(c: any): Promise<Response | null> {
  const config = getRateLimitConfig(c);
  if (!config.enabled) return null;

  const clientIp = (c.req.header('CF-Connecting-IP') || c.req.header('X-Forwarded-For') || 'unknown')
    .split(',')[0].trim();

  // Per-IP check
  const ipResult = await checkRateLimit(
    c, `rl:login:ip:${clientIp}`, config.maxAttemptsIp, config.windowSeconds, config.blockSeconds
  );
  if (!ipResult.allowed) {
    return c.json(
      { success: false, error: { code: 'RATE_LIMITED', message: 'Too many login attempts from this IP. Please try again later.' } },
      429,
      { 'Retry-After': String(ipResult.retryAfter), 'X-RateLimit-Remaining': '0' }
    );
  }

  // Per-username check
  try {
    const contentType = (c.req.header('Content-Type') || '').toLowerCase();
    if (contentType.includes('application/json')) {
      const body = await c.req.raw.clone().json();
      const username = typeof body?.username === 'string' ? body.username.trim().toLowerCase() : '';
      if (username) {
        const userResult = await checkRateLimit(
          c, `rl:login:user:${username}`, config.maxAttemptsUser, config.windowSeconds, config.blockSeconds
        );
        if (!userResult.allowed) {
          return c.json(
            { success: false, error: { code: 'RATE_LIMITED', message: 'Too many login attempts for this account. Please try again later.' } },
            429,
            { 'Retry-After': String(userResult.retryAfter), 'X-RateLimit-Remaining': '0' }
          );
        }
      }
    }
  } catch { /* ignore parse errors */ }

  c.header('X-RateLimit-Limit', String(config.maxAttemptsIp));
  c.header('X-RateLimit-Remaining', String(ipResult.remaining));
  return null;
}


// ─── General-Purpose Rate Limiting Middleware ─────────────────────────────────

export interface RateLimitOptions {
  /** Maximum number of requests allowed within the window */
  limit: number;
  /** Window duration in seconds (default: 60) */
  windowSeconds: number;
  /** KV key prefix for namespacing (default: 'rl:api') */
  prefix: string;
  /**
   * Function to extract the rate-limit key from the request context.
   * Typically returns the user_id from auth headers.
   * If it returns null/undefined, rate limiting is skipped.
   */
  keyExtractor: (c: any) => string | null | undefined;
}

/**
 * Creates a Hono middleware that enforces a sliding-window rate limit
 * using the API_CACHE KV namespace.
 *
 * Usage:
 *   const logsRateLimit = createRateLimitMiddleware({
 *     limit: 60,
 *     windowSeconds: 60,
 *     prefix: 'rl:logs',
 *     keyExtractor: (c) => c.req.header('X-User-Id'),
 *   });
 *   logsRouter.use('*', logsRateLimit);
 *
 * Requirements: 12.8
 */
export function createRateLimitMiddleware(options: RateLimitOptions): MiddlewareHandler {
  const { limit, windowSeconds, prefix, keyExtractor } = options;

  return async (c, next) => {
    const key = keyExtractor(c);

    // If no key can be extracted (e.g., unauthenticated), skip rate limiting
    if (!key) {
      await next();
      return;
    }

    const kvKey = `${prefix}:${key}`;
    const now = Math.floor(Date.now() / 1000);

    const kv = c.env.API_CACHE as KVNamespace | undefined;
    if (!kv) {
      // No KV binding available — skip rate limiting gracefully
      await next();
      return;
    }

    const raw = await kv.get(kvKey);
    let state: RateLimitState = raw
      ? JSON.parse(raw)
      : { count: 0, windowStart: now };

    // Reset window if expired
    if (now - state.windowStart >= windowSeconds) {
      state = { count: 0, windowStart: now };
    }

    state.count += 1;

    // Set rate limit headers
    const remaining = Math.max(0, limit - state.count);
    c.header('X-RateLimit-Limit', String(limit));
    c.header('X-RateLimit-Remaining', String(remaining));
    c.header('X-RateLimit-Reset', String(state.windowStart + windowSeconds));

    if (state.count > limit) {
      const retryAfter = state.windowStart + windowSeconds - now;
      await kv.put(kvKey, JSON.stringify(state), { expirationTtl: windowSeconds });

      c.header('Retry-After', String(retryAfter));
      return c.json(
        {
          success: false,
          error: {
            code: 'RATE_LIMITED',
            message: 'Too many requests. Please try again later.',
          },
        },
        429,
      );
    }

    await kv.put(kvKey, JSON.stringify(state), { expirationTtl: windowSeconds });
    await next();
  };
}

// ─── Pre-configured Log Viewer Rate Limiter ───────────────────────────────────

/**
 * Rate limiter for the Log Viewer API routes (/api/v2/logs/*).
 * Enforces 60 requests per minute keyed on the authenticated user_id
 * (from the X-User-Id header injected by the auth middleware).
 *
 * Requirements: 12.8
 */
export const logsRateLimitMiddleware: MiddlewareHandler = createRateLimitMiddleware({
  limit: 60,
  windowSeconds: 60,
  prefix: 'rl:logs',
  keyExtractor: (c) => c.req.header('X-User-Id') ?? null,
});
