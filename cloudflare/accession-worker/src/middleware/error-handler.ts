/**
 * Global error handler middleware.
 *
 * Catches AppError subclasses and returns structured JSON responses.
 * Catches unknown errors and returns sanitized 500 response.
 * Never exposes stack traces, paths, or variable state in 500 responses.
 *
 * Requirements: 15.2
 */

import { createMiddleware } from 'hono/factory';
import type { Env } from '../types';
import { AppError, ValidationError } from '../errors';

type Variables = { requestId: string };

export const errorHandlerMiddleware = createMiddleware<{
  Bindings: Env;
  Variables: Variables;
}>(async (c, next) => {
    try {
      await next();
    } catch (err: unknown) {
      const requestId = c.req.header('X-Request-ID') || '';

      // Handle known AppError subclasses (check by property instead of instanceof)
      if (err && typeof err === 'object' && 'statusCode' in err && 'code' in err) {
        const appErr = err as AppError;

        if ('errors' in appErr && Array.isArray((appErr as ValidationError).errors)) {
          return c.json(
            {
              request_id: requestId,
              error: appErr.message,
              code: appErr.code,
              errors: (appErr as ValidationError).errors,
            },
            appErr.statusCode as any,
          );
        }

        return c.json(
          {
            request_id: requestId,
            error: appErr.message,
            code: appErr.code,
            ...(appErr.details ? { details: appErr.details } : {}),
          },
          appErr.statusCode as any,
        );
      }

      // Unknown error — log full stack internally, return sanitized 500
      console.error('[error-handler] Unhandled error', {
        request_id: requestId,
        error: err instanceof Error ? err.message : String(err),
        stack: err instanceof Error ? err.stack : undefined,
      });

      return c.json(
        {
          request_id: requestId,
          error: 'Internal server error',
        },
        500,
      );
    }
});
