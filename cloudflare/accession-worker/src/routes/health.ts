/**
 * Health and readiness endpoints for the Accession Worker.
 *
 * - GET /healthz — Always returns 200. Runs a lightweight D1 probe (SELECT 1)
 *   with a 1-second timeout. Reports status as 'ok' or 'degraded'.
 * - GET /readyz — Returns 200 only when D1 is reachable AND JWT_SECRET is set.
 *   Otherwise returns 503 with {ready: false, missing: [...]}.
 *
 * Requirements: 11.6, 11.7, 11.8, 11.9
 */

import { Hono } from 'hono';
import type { Env } from '../types';

/** Captured at module load time (cold start) for uptime calculation. */
const startTime = Date.now();

const healthRoutes = new Hono<{ Bindings: Env }>();

// ─── /healthz ────────────────────────────────────────────────────────────────

healthRoutes.get('/healthz', async (c) => {
  const env = c.env;
  const dbCheck = await probeDb(env);

  const status = dbCheck.status === 'ok' ? 'ok' : 'degraded';

  return c.json(
    {
      status,
      service: 'accession-worker',
      version: env.BUILD_VERSION || 'dev',
      timestamp: new Date().toISOString(),
      uptime_ms: Date.now() - startTime,
      checks: {
        db: dbCheck,
      },
    },
    200,
  );
});

// ─── /readyz ─────────────────────────────────────────────────────────────────

healthRoutes.get('/readyz', async (c) => {
  const env = c.env;
  const missing: string[] = [];

  if (!env.DB) {
    missing.push('DB');
  }

  if (!env.JWT_SECRET) {
    missing.push('JWT_SECRET');
  }

  const ready = missing.length === 0;
  const httpStatus = ready ? 200 : 503;

  return c.json({ ready, ...(ready ? {} : { missing }) }, httpStatus);
});

// ─── D1 Probe ────────────────────────────────────────────────────────────────

interface DbCheckResult {
  status: 'ok' | 'error';
  latency_ms: number;
  error?: string;
}

/**
 * Runs `SELECT 1` against the D1 primary binding with a 1-second timeout.
 * Returns the check result with latency and optional error message.
 */
async function probeDb(env: Env): Promise<DbCheckResult> {
  const start = Date.now();

  // If DB binding is not available, report error immediately
  if (!env.DB) {
    return {
      status: 'error',
      latency_ms: Date.now() - start,
      error: 'DB binding not available',
    };
  }

  try {
    const result = await Promise.race([
      env.DB.prepare('SELECT 1').first(),
      timeout(1000),
    ]);

    // If timeout won the race, result will be the timeout sentinel
    if (result === TIMEOUT_SENTINEL) {
      return {
        status: 'error',
        latency_ms: Date.now() - start,
        error: 'D1 probe timed out (1s)',
      };
    }

    return {
      status: 'ok',
      latency_ms: Date.now() - start,
    };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return {
      status: 'error',
      latency_ms: Date.now() - start,
      error: message,
    };
  }
}

/** Sentinel value to distinguish timeout from a null DB result. */
const TIMEOUT_SENTINEL = Symbol('timeout');

/** Returns the timeout sentinel after the specified duration. */
function timeout(ms: number): Promise<typeof TIMEOUT_SENTINEL> {
  return new Promise((resolve) => setTimeout(() => resolve(TIMEOUT_SENTINEL), ms));
}

export { healthRoutes };
export default healthRoutes;
