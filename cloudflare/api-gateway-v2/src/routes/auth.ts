/**
 * Auth Worker routes.
 * Routes /auth/* to auth-worker via Service Binding (when ROUTE_AUTH_TO_WORKER=true)
 * or falls back to Flask AUTH_SERVICE_URL via BACKBONE.
 */

import { Hono } from 'hono';
import type { AppContext } from '../types';
import { dispatchToWorker, proxyRequest } from '../services/proxy';
import { getAuthContext, verifyTurnstile } from '../utils/auth';
import { applyLoginRateLimit } from '../middleware/rate-limit';

export const authRoutes = new Hono<AppContext>();

/** Dispatch to auth-worker or Flask based on feature flag */
async function dispatchAuth(c: any): Promise<Response> {
  const url = new URL(c.req.url);
  const targetPath = url.pathname + url.search;

  if (c.env.ROUTE_AUTH_TO_WORKER !== 'true') {
    return proxyRequest(c, c.env.AUTH_SERVICE_URL, c.req.path.replace(/^\/api/, '').replace(/^\/v1/, ''), {}, 'auth-flask');
  }

  return dispatchToWorker(c, c.env.AUTH_WORKER, 'auth-worker', targetPath, { forwardIp: true });
}

// Login with Turnstile + Rate Limiting (only when routing to Flask)
authRoutes.post('/auth/login', async (c) => {
  if (c.env.ROUTE_AUTH_TO_WORKER === 'true') {
    return dispatchAuth(c);
  }

  // Turnstile verification
  const turnstileToken = c.req.header('X-Turnstile-Token');
  const ip = c.req.header('CF-Connecting-IP') || '';
  if (c.env.TURNSTILE_SECRET_KEY) {
    const isValid = await verifyTurnstile(turnstileToken || '', c.env.TURNSTILE_SECRET_KEY, ip);
    if (!isValid) {
      return c.json({ success: false, error: { code: 'SECURITY_CHECK_FAILED', message: 'Bot detection failed' } }, 403);
    }
  }

  // Rate limiting
  const rateLimited = await applyLoginRateLimit(c);
  if (rateLimited) return rateLimited;

  return proxyRequest(c, c.env.AUTH_SERVICE_URL, 'auth/login', {}, 'auth-flask');
});

// All other auth routes
authRoutes.all('/auth/*', (c) => dispatchAuth(c));
