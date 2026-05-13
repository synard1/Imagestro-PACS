/**
 * Request ID middleware — propagates or generates X-Request-ID.
 *
 * Accepts a valid UUID v4/v7 from the incoming X-Request-ID header.
 * If absent or malformed, generates a new UUID v7.
 * Sets the resolved value on the response header.
 *
 * Requirements: 15.4, 15.5
 */

import { createMiddleware } from 'hono/factory';
import type { Env } from '../types';
import { newUuidV7, isUuid } from '../utils/uuid';

type Variables = { requestId: string };

export const requestIdMiddleware = createMiddleware<{
  Bindings: Env;
  Variables: Variables;
}>(async (c, next) => {
  const incoming = c.req.header('X-Request-ID');
  const requestId = incoming && isUuid(incoming) ? incoming : newUuidV7();

  c.set('requestId', requestId);
  c.header('X-Request-ID', requestId);

  await next();
});
