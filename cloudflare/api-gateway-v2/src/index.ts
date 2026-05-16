/**
 * API Gateway v2 — Cloudflare Workers + Hono
 */

import { Hono } from 'hono';
import { logger } from 'hono/logger';
import { ZodError } from 'zod';
import type { AppContext } from './types';
import type { D1Logger } from '../../shared/logger';
import type { Severity } from '../../shared/log-types';
import { AppError } from './errors';

// Middleware
import { corsMiddleware } from './middleware/cors';
import { requestIdMiddleware } from './middleware/request-id';
import { createLoggerMiddleware } from '../../shared/logger-middleware';
import { bodySizeLimitMiddleware } from './middleware/body-size-limit';
import { securityHeadersMiddleware } from './middleware/security-headers';

// Routes
import { healthRoutes } from './routes/health';
import { logsRoutes } from './routes/logs';
import { accessionRoutes } from './routes/accession';
import { authRoutes } from './routes/auth';
import { masterDataRoutes } from './routes/master-data';
import { orderRoutes } from './routes/orders';
import { thumbnailRoutes } from './routes/thumbnails';
import { legacyRoutes } from './routes/legacy';

// Durable Objects
export { InfrastructureHealthSQLite } from './objects/InfrastructureHealthDO';
export { ThumbnailGeneratorSQLite } from './objects/ThumbnailGeneratorDO';

// ─── Error Severity Mapping ───────────────────────────────────────────────────

/**
 * Map an uncaught error to a severity level for error_events records.
 * Based on the design "Error Event Severity Mapping" table.
 *
 * - ValidationError, ZodError → 'low'
 * - NotFoundError, 404 → 'low'
 * - AuthenticationError, 401 → 'medium'
 * - ForbiddenError, 403 → 'medium'
 * - RateLimitError, 429 → 'medium'
 * - DatabaseError, ConflictError (DB) → 'high'
 * - Unknown/unhandled → 'high'
 * - Critical infrastructure failures → 'critical'
 */
function mapErrorToSeverity(err: Error): Severity {
  const name = err.name || '';
  const statusCode = (err as any).statusCode ?? (err as any).status ?? 500;

  // AppError subclasses — map by statusCode for consistent severity
  if (err instanceof AppError) {
    if (statusCode === 400 || statusCode === 404) return 'low';
    if (statusCode === 403 || statusCode === 429) return 'medium';
    if (statusCode >= 500) return 'high';
    return 'low';
  }

  // Validation errors → low
  if (
    name === 'ValidationError' ||
    name === 'ZodError' ||
    err instanceof ZodError
  ) {
    return 'low';
  }

  // Not found → low
  if (name === 'NotFoundError' || statusCode === 404) {
    return 'low';
  }

  // Authentication errors → medium
  if (
    name === 'AuthenticationError' ||
    name === 'UnauthorizedError' ||
    statusCode === 401
  ) {
    return 'medium';
  }

  // Forbidden errors → medium
  if (name === 'ForbiddenError' || statusCode === 403) {
    return 'medium';
  }

  // Rate limit errors → medium
  if (
    name === 'RateLimitedError' ||
    name === 'RateLimitError' ||
    statusCode === 429
  ) {
    return 'medium';
  }

  // Database / conflict errors → high
  if (
    name === 'DatabaseError' ||
    name === 'ConflictError' ||
    name === 'DBConflict' ||
    statusCode === 409
  ) {
    return 'high';
  }

  // Critical infrastructure failures (e.g. binding missing, service unavailable)
  if (
    name === 'TypeError' &&
    (err.message?.includes('binding') || err.message?.includes('undefined'))
  ) {
    return 'critical';
  }

  // Default: unhandled/unknown → high
  return 'high';
}

/**
 * Derive an HTTP status code from an error object.
 */
function getStatusCode(err: Error): number {
  const statusCode = (err as any).statusCode ?? (err as any).status;
  if (typeof statusCode === 'number' && statusCode >= 400 && statusCode < 600) {
    return statusCode;
  }
  if (err instanceof ZodError) return 400;
  return 500;
}

// ─── App Setup ────────────────────────────────────────────────────────────────

const app = new Hono<AppContext>();

// ─── Middleware Chain ──────────────────────────────────────────────────────────

app.use('*', logger());
app.use('*', corsMiddleware);
app.use('*', requestIdMiddleware);
app.use('*', createLoggerMiddleware('api-gateway-v2'));
app.use('*', bodySizeLimitMiddleware);
app.use('*', securityHeadersMiddleware);

// ─── Route Mounting ───────────────────────────────────────────────────────────

// Health & gateway admin
app.route('', healthRoutes);

// Log Viewer API (handles its own auth/permission checks internally)
app.route('/api/v2/logs', logsRoutes);

// Thumbnail Orchestration
app.route('', thumbnailRoutes);

// Worker routes (Service Bindings)
app.route('', accessionRoutes);
app.route('', authRoutes);
app.route('', masterDataRoutes);
app.route('', orderRoutes);

// Legacy backend proxies (VPC tunnel)
app.route('', legacyRoutes);

// ─── Explicit 404 ──────────────────────────────────────────────────────────────

app.all('*', (c) => {
  return c.json({
    success: false,
    error: {
      code: 'NOT_FOUND',
      message: `Route ${c.req.method} ${c.req.path} not found`,
    },
  }, 404);
});

// ─── Global Error Handler ──────────────────────────────────────────────────────

/**
 * Emit an error_events record for every uncaught exception before returning
 * the error response. Maps known error classes to severity per the design
 * "Error Event Severity Mapping" table.
 *
 * The logger may be undefined if the error occurs before the logger middleware
 * runs (e.g. during CORS or request-id middleware). In that case, we fall back
 * to console.error and still return a proper JSON response.
 *
 * Requirements: 3.3
 */
app.onError((err, c) => {
  const severity = mapErrorToSeverity(err);
  const statusCode = getStatusCode(err);
  const errorMessage = err.message || 'Internal server error';

  // Attempt to get the logger from context — may be undefined if the error
  // occurred before the logger middleware ran (Req 11.1 graceful handling)
  try {
    const loggerInstance = c.get('logger') as D1Logger | undefined;
    if (loggerInstance) {
      loggerInstance.error(errorMessage, err, severity, {
        method: c.req.method,
        path: c.req.path,
        status: statusCode,
        error_code: (err as any).code ?? err.name,
      });
    } else {
      // Logger not available — fall back to console.error
      console.error(
        JSON.stringify({
          level: 'error',
          worker: 'api-gateway-v2',
          message: errorMessage,
          error_type: err.name,
          severity,
          status: statusCode,
          method: c.req.method,
          path: c.req.path,
          stack: err.stack,
        }),
      );
    }
  } catch {
    // Never let logging failures interfere with the error response (Req 11.2)
    console.error('[onError] Logger emission failed:', err.message);
  }

  // Return structured JSON error response
  return c.json(
    {
      success: false,
      error: {
        code: (err as any).code ?? err.name ?? 'INTERNAL_ERROR',
        message: statusCode >= 500 ? 'Internal server error' : errorMessage,
        ...(statusCode < 500 && (err as any).details
          ? { details: (err as any).details }
          : {}),
      },
    },
    statusCode as any,
  );
});

export default app;
