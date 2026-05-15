/**
 * KV-based rate limiting for login endpoints.
 * Tracks attempts per-IP and per-username with configurable windows.
 */

interface LoginRateLimitState {
  count: number;
  windowStart: number;
  blockedUntil: number;
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
