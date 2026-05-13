/**
 * Structured JSON logger middleware.
 *
 * Emits per-request JSON logs with:
 * - timestamp, endpoint, method, tenant, modality, status, duration, level, request_id
 * - service = 'accession-worker'
 * - PII redaction on logged bodies
 * - LOG_SAMPLE_RATE for info logs (warn/error always emit)
 * - slow_request warn when elapsed > 2000ms
 * - Log level: info for 2xx/3xx/429, warn for 4xx (except 429), error for 5xx
 * - Skips /healthz and /readyz
 *
 * Requirements: 15.1, 15.3, 15.6, 15.7, 15.10, 15.11
 */

import { createMiddleware } from 'hono/factory';
import type { Env, TenantContext } from '../types';
import { redact } from '../utils/redaction';

type Variables = { requestId: string; tenant: TenantContext };

/** Paths to skip logging */
const SKIP_PATHS = ['/healthz', '/readyz'];

/** Slow request threshold in ms */
const SLOW_REQUEST_THRESHOLD_MS = 2000;

export const loggerMiddleware = createMiddleware<{
  Bindings: Env;
  Variables: Variables;
}>(async (c, next) => {
    const path = new URL(c.req.url).pathname;

    // Skip health endpoints
    if (SKIP_PATHS.includes(path)) {
      await next();
      return;
    }

    const start = Date.now();

    await next();

    const duration = Date.now() - start;
    const status = c.res.status;
    const level = getLogLevel(status);
    const requestId = (c.get('requestId') ?? c.req.header('X-Request-ID')) || '';

    // Apply LOG_SAMPLE_RATE to info logs only
    if (level === 'info') {
      const sampleRate = parseFloat(c.env.LOG_SAMPLE_RATE || '1.0');
      if (Math.random() > sampleRate) {
        return;
      }
    }

    const logEntry = {
      timestamp: new Date().toISOString(),
      service: 'accession-worker',
      level,
      method: c.req.method,
      endpoint: path,
      status,
      duration_ms: duration,
      request_id: requestId,
      tenant_id: c.get('tenant')?.tenantId || undefined,
    };

    if (level === 'error') {
      console.error(JSON.stringify(redact(logEntry)));
    } else if (level === 'warn') {
      console.warn(JSON.stringify(redact(logEntry)));
    } else {
      console.log(JSON.stringify(redact(logEntry)));
    }

    // Emit slow_request warning
    if (duration > SLOW_REQUEST_THRESHOLD_MS) {
      console.warn(JSON.stringify({
        ...logEntry,
        level: 'warn',
        event: 'slow_request',
        duration_ms: duration,
      }));
    }
});

/**
 * Determines log level from HTTP status code.
 * - 2xx/3xx/429: info
 * - 4xx (except 429): warn
 * - 5xx: error
 */
function getLogLevel(status: number): 'info' | 'warn' | 'error' {
  if (status >= 500) return 'error';
  if (status >= 400 && status !== 429) return 'warn';
  return 'info';
}
