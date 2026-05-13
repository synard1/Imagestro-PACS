/**
 * Body size limit middleware.
 *
 * Rejects request bodies exceeding 1 MB with HTTP 413.
 *
 * Requirements: 12.11
 */

import { createMiddleware } from 'hono/factory';
import type { Env } from '../types';
import { PayloadTooLargeError } from '../errors';

/** Maximum allowed body size: 1 MB */
const MAX_BODY_SIZE = 1_048_576;

export const bodySizeLimitMiddleware = createMiddleware<{ Bindings: Env }>(
  async (c, next) => {
    const contentLength = c.req.header('Content-Length');

    if (contentLength) {
      const size = parseInt(contentLength, 10);
      if (!isNaN(size) && size > MAX_BODY_SIZE) {
        throw new PayloadTooLargeError();
      }
    }

    await next();
  },
);
