/**
 * Request ID propagation middleware.
 * Reads X-Request-ID from incoming request or generates a new UUID.
 * Sets it on the response header.
 */

import type { MiddlewareHandler } from 'hono';
import type { AppContext } from '../types';

export const requestIdMiddleware: MiddlewareHandler<AppContext> = async (c, next) => {
  const reqId = c.req.header('X-Request-ID') || crypto.randomUUID();
  c.set('requestId' as never, reqId);
  await next();
  c.res.headers.set('X-Request-ID', reqId);
};
