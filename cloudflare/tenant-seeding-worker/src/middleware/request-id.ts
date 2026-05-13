import { createMiddleware } from 'hono/factory';
import type { Env } from '../types';

/**
 * Variables added to the Hono context by the request-id middleware.
 */
export type RequestIdVariables = {
  requestId: string;
};

/**
 * Middleware that generates or propagates a request ID for traceability.
 *
 * - If the incoming request has an `X-Request-ID` header, that value is used.
 * - Otherwise, a new UUID v4 is generated via `crypto.randomUUID()`.
 * - The request ID is set on the Hono context (`c.get('requestId')`) for downstream handlers.
 * - After the response is produced, the `X-Request-ID` header is added to the response.
 */
export const requestIdMiddleware = createMiddleware<{
  Bindings: Env;
  Variables: RequestIdVariables;
}>(async (c, next) => {
  const requestId = c.req.header('X-Request-ID') || crypto.randomUUID();

  c.set('requestId', requestId);

  await next();

  c.res.headers.set('X-Request-ID', requestId);
});
