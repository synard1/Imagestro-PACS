/**
 * Accession Worker — Hono app entry point.
 *
 * Applies middleware chain in order:
 * request-id → D1 logger → security-headers → body-size-limit → CORS →
 * auth/tenant → rate-limit → shadow-mode → route → error-handler
 *
 * Exports Durable Object classes and scheduled handler.
 *
 * Requirements: 11.1, 11.2, 12.1, 13.8, 13.9, 15.1, 19.1, 19.2, 6.5, 16.4
 */

import { Hono } from 'hono';
import type { Env, TenantContext } from './types';
import type { D1Logger } from '../../shared/logger';

// Middleware
import { requestIdMiddleware } from './middleware/request-id';
import { createLoggerMiddleware } from '../../shared/logger-middleware';
import { securityHeadersMiddleware } from './middleware/security-headers';
import { bodySizeLimitMiddleware } from './middleware/body-size-limit';
import { corsMiddleware } from './middleware/cors';
import { authMiddleware } from './middleware/auth';
import { rateLimitMiddleware } from './middleware/rate-limit';
import { shadowModeMiddleware } from './middleware/shadow-mode';
import { errorHandlerMiddleware } from './middleware/error-handler'; // kept for reference

// Routes
import { healthRoutes } from './routes/health';
import { accessionRoutes } from './routes/accessions';
import { legacyRoutes } from './routes/accessions-legacy';
import { batchRoutes } from './routes/batch';
import { settingsRoutes } from './routes/settings';
import { adminRoutes } from './routes/admin';

// Jobs
import { idempotencyCleanupJob } from './jobs/idempotency-cleanup';
import { softDeletePurgeJob } from './jobs/soft-delete-purge';

// Durable Objects
export { CounterDurableObject } from './durable-objects/counter-do';
export { CircuitBreakerDurableObject } from './durable-objects/circuit-breaker-do';

// ─── App Setup ───────────────────────────────────────────────────────────────

type Variables = {
  tenant: TenantContext;
  requestId: string;
  logger: D1Logger;
  shadowMode: boolean;
};

const app = new Hono<{ Bindings: Env; Variables: Variables }>();

// ─── Global Error Handler ────────────────────────────────────────────────────

app.onError((err, c) => {
  const requestId = c.req.header('X-Request-ID') || '';

  // Handle known AppError subclasses (check by property)
  if (err && 'statusCode' in err && 'code' in err) {
    const appErr = err as any;

    if ('errors' in appErr && Array.isArray(appErr.errors)) {
      return c.json(
        { request_id: requestId, error: appErr.message, code: appErr.code, errors: appErr.errors },
        appErr.statusCode,
      );
    }

    return c.json(
      { request_id: requestId, error: appErr.message, code: appErr.code, ...(appErr.details ? { details: appErr.details } : {}) },
      appErr.statusCode,
    );
  }

  // Unknown error
  console.error('[error-handler] Unhandled error', {
    request_id: requestId,
    error: err instanceof Error ? err.message : String(err),
    stack: err instanceof Error ? err.stack : undefined,
  });

  return c.json({ request_id: requestId, error: 'Internal server error' }, 500);
});

// ─── Middleware Chain ─────────────────────────────────────────────────────────

// 1. Request ID (propagate or generate)
app.use('*', requestIdMiddleware);

// 2. Logger (D1-backed centralized logger via shared module)
app.use('*', createLoggerMiddleware('accession-worker') as any);

// 4. Security headers
app.use('*', securityHeadersMiddleware);

// 5. Body size limit (reject > 1 MB)
app.use('*', bodySizeLimitMiddleware);

// 6. CORS
app.use('*', corsMiddleware);

// 7. Auth/Tenant (skips /healthz and /readyz)
app.use('*', authMiddleware);

// 8. Rate limit (per-tenant)
app.use('*', rateLimitMiddleware);

// 9. Shadow mode (write interception)
app.use('*', shadowModeMiddleware);

// ─── Route Mounting ──────────────────────────────────────────────────────────

// Health/readiness (no auth required — handled by auth middleware skip)
app.route('/', healthRoutes);

// Accession CRUD
app.route('/', accessionRoutes);

// Batch endpoint
app.route('/', batchRoutes);

// Legacy endpoints (backward compatibility)
app.route('/', legacyRoutes);

// Settings
app.route('/', settingsRoutes);

// Admin
app.route('/', adminRoutes);

// ─── Scheduled Handler ───────────────────────────────────────────────────────

export default {
  fetch: app.fetch,

  async scheduled(event: ScheduledEvent, env: Env, ctx: ExecutionContext): Promise<void> {
    switch (event.cron) {
      case '0 3 * * *':
        // Daily at 03:00 UTC — idempotency key cleanup
        ctx.waitUntil(idempotencyCleanupJob(env));
        break;
      case '0 4 * * 0':
        // Weekly on Sunday at 04:00 UTC — soft-delete purge
        ctx.waitUntil(softDeletePurgeJob(env));
        break;
      default:
        console.warn(`[scheduled] Unknown cron trigger: ${event.cron}`);
    }
  },
};
