/**
 * Security headers middleware.
 * Adds standard security headers to all responses.
 */

import type { MiddlewareHandler } from 'hono';
import type { AppContext } from '../types';
import { VERSION } from '../utils/constants';

export const securityHeadersMiddleware: MiddlewareHandler<AppContext> = async (c, next) => {
  await next();
  c.res.headers.set('X-Content-Type-Options', 'nosniff');
  c.res.headers.set('X-Frame-Options', 'DENY');
  c.res.headers.set('Referrer-Policy', 'no-referrer');
  c.res.headers.set('X-Gateway-Version', VERSION);
};
