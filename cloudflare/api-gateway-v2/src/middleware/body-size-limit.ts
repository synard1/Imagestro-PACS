/**
 * Body size limit middleware.
 * Rejects non-GET/HEAD/OPTIONS requests with Content-Length exceeding MAX_BODY_SIZE.
 */

import type { MiddlewareHandler } from 'hono';
import type { AppContext } from '../types';
import { MAX_BODY_SIZE } from '../utils/constants';

export const bodySizeLimitMiddleware: MiddlewareHandler<AppContext> = async (c, next) => {
  if (['GET', 'HEAD', 'OPTIONS'].includes(c.req.method)) {
    return next();
  }

  const contentLength = c.req.header('Content-Length');
  if (contentLength && parseInt(contentLength, 10) > MAX_BODY_SIZE) {
    return c.json({
      success: false,
      error: {
        code: 'PAYLOAD_TOO_LARGE',
        message: `Request body exceeds ${MAX_BODY_SIZE / 1024 / 1024} MB limit`,
      },
    }, 413);
  }

  return next();
};
