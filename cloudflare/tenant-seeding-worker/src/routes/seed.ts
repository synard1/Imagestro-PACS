/**
 * POST /seed route handler for the Tenant Seeding Worker.
 *
 * Receives tenant creation events, validates them, checks idempotency
 * via KV, and initiates asynchronous user seeding via waitUntil().
 *
 * Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 5.3, 5.4, 6.1, 6.2, 6.3,
 *              6.4, 6.5, 6.6, 6.7, 7.3, 7.6, 9.2
 */

import { Hono } from 'hono';
import { gatewayAuth } from '../middleware/gateway-auth';
import { validateTenantCreatedEvent } from '../utils/validation';
import { determineStatus, truncateErrorDetails } from '../utils/status';
import { AuthClient } from '../services/auth-client';
import { UserSeeder } from '../services/user-seeder';
import type { Env, SeedingStatus, TenantCreatedEvent } from '../types';
import type { D1Logger } from '../../../shared/logger';

/** KV TTL: 30 days in seconds */
const KV_TTL_SECONDS = 2_592_000;

/** VPC tunnel retry configuration: 2 retries with 2s, 4s backoff */
const VPC_TUNNEL_RETRY = { maxRetries: 2, delays: [2000, 4000] };

const seedRoute = new Hono<{ Bindings: Env }>();

seedRoute.post('/seed', gatewayAuth, async (c) => {
  const logger = (c as any).get('logger') as D1Logger | undefined;

  // Parse JSON body
  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: 'Invalid JSON body' }, 400);
  }

  // Validate event payload
  const validation = validateTenantCreatedEvent(body);
  if (!validation.valid) {
    console.error(JSON.stringify({
      event: 'validation_error',
      errors: validation.errors,
    }));
    return c.json({ error: 'Invalid event payload', details: validation.errors }, 400);
  }

  const event = body as TenantCreatedEvent;
  const kvKey = `seed:${event.tenant_id}`;

  // Idempotency check via KV
  try {
    const existing = await c.env.API_CACHE.get(kvKey);
    if (existing !== null) {
      // Already processing or processed — return 202 without re-initiating
      return c.json({ message: 'Event already received', tenant_id: event.tenant_id }, 202);
    }
  } catch (error) {
    // KV unavailable — return 500 to allow sender to retry
    console.error(JSON.stringify({
      event: 'kv_error',
      operation: 'idempotency_check',
      tenant_id: event.tenant_id,
      error: error instanceof Error ? error.message : String(error),
    }));
    return c.json({ error: 'Service unavailable' }, 500);
  }

  // Emit audit log for tenant seed initiation
  if (logger) {
    logger.audit({
      action: 'TENANT_SEED',
      resource_type: 'tenant',
      resource_id: event.tenant_id,
      changes: { before: null, after: { tenant_id: event.tenant_id, tenant_code: event.tenant_code, event_id: event.event_id } },
    });
  }

  // Return 202 Accepted immediately, process asynchronously
  c.executionCtx.waitUntil(processSeeding(c.env, event, kvKey));

  return c.json({ message: 'Accepted', tenant_id: event.tenant_id }, 202);
});

/**
 * Asynchronous seeding process executed via waitUntil().
 *
 * Sets KV status to "in_progress", authenticates with auth-service,
 * creates users, determines final status, and stores result in KV.
 * Applies VPC tunnel retry logic if auth-service is unreachable.
 */
async function processSeeding(env: Env, event: TenantCreatedEvent, kvKey: string): Promise<void> {
  const startedAt = new Date().toISOString();
  const startTime = Date.now();

  // Set initial "in_progress" status in KV
  const inProgressStatus: SeedingStatus = {
    tenant_id: event.tenant_id,
    event_id: event.event_id,
    status: 'in_progress',
    users_created: 0,
    users_failed: 0,
    error_details: [],
    started_at: startedAt,
    completed_at: null,
  };

  try {
    await env.API_CACHE.put(kvKey, JSON.stringify(inProgressStatus), {
      expirationTtl: KV_TTL_SECONDS,
    });
  } catch (error) {
    console.error(JSON.stringify({
      event: 'kv_error',
      operation: 'set_in_progress',
      tenant_id: event.tenant_id,
      error: error instanceof Error ? error.message : String(error),
    }));
    // Continue processing even if KV write fails for in_progress
  }

  // Authenticate with auth-service, applying VPC tunnel retry logic
  const authClient = new AuthClient(env);
  let authSuccess = false;

  for (let attempt = 0; attempt <= VPC_TUNNEL_RETRY.maxRetries; attempt++) {
    try {
      await authClient.login();
      authSuccess = true;
      break;
    } catch (error) {
      const isLastAttempt = attempt === VPC_TUNNEL_RETRY.maxRetries;

      if (isLastAttempt) {
        // All retry attempts exhausted — mark as failed
        const completedAt = new Date().toISOString();
        const failedStatus: SeedingStatus = {
          tenant_id: event.tenant_id,
          event_id: event.event_id,
          status: 'failed',
          users_created: 0,
          users_failed: 6,
          error_details: [{
            username: '',
            role: '',
            error: `Auth service unreachable after ${VPC_TUNNEL_RETRY.maxRetries + 1} attempts: ${error instanceof Error ? error.message : String(error)}`.slice(0, 500),
            timestamp: completedAt,
          }],
          started_at: startedAt,
          completed_at: completedAt,
        };

        try {
          await env.API_CACHE.put(kvKey, JSON.stringify(failedStatus), {
            expirationTtl: KV_TTL_SECONDS,
          });
        } catch {
          // Best effort KV write
        }

        const totalDurationMs = Date.now() - startTime;
        console.error(JSON.stringify({
          event: 'seeding_complete',
          tenant_id: event.tenant_id,
          total_users_attempted: 6,
          total_users_created: 0,
          total_users_failed: 6,
          total_duration_ms: totalDurationMs,
          status: 'failed',
          reason: 'auth_service_unreachable',
        }));
        return;
      }

      // Wait before retrying (5s, 10s, 20s)
      const delayMs = VPC_TUNNEL_RETRY.delays[attempt];
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }

  if (!authSuccess) {
    return; // Should not reach here, but guard
  }

  // Create users via UserSeeder
  const seeder = new UserSeeder(authClient, event);
  const result = await seeder.seedUsers();

  // Determine final status
  const finalStatusValue = determineStatus(result.users_created, result.users_failed);
  const completedAt = new Date().toISOString();
  const truncatedErrors = truncateErrorDetails(result.error_details);

  const finalStatus: SeedingStatus = {
    tenant_id: event.tenant_id,
    event_id: event.event_id,
    status: finalStatusValue,
    users_created: result.users_created,
    users_failed: result.users_failed,
    error_details: truncatedErrors,
    started_at: startedAt,
    completed_at: completedAt,
  };

  // Store final status in KV with 30-day TTL
  try {
    await env.API_CACHE.put(kvKey, JSON.stringify(finalStatus), {
      expirationTtl: KV_TTL_SECONDS,
    });
  } catch (error) {
    console.error(JSON.stringify({
      event: 'kv_error',
      operation: 'set_final_status',
      tenant_id: event.tenant_id,
      error: error instanceof Error ? error.message : String(error),
    }));
  }

  // Log structured JSON summary
  const totalDurationMs = Date.now() - startTime;
  console.log(JSON.stringify({
    event: 'seeding_complete',
    tenant_id: event.tenant_id,
    total_users_attempted: result.users_created + result.users_failed,
    total_users_created: result.users_created,
    total_users_failed: result.users_failed,
    total_duration_ms: totalDurationMs,
    status: finalStatusValue,
  }));
}

export { seedRoute };
