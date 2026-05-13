/**
 * Durable-Object-backed counter dispatcher for hot counter scopes.
 *
 * Provides `incrementCounterDO` for direct DO invocation and `incrementCounter`
 * as the unified dispatcher that selects D1 or Durable Object based on
 * the tenant's `counter_backend` configuration.
 *
 * Requirements: 3A.1, 3A.2, 3A.5, 3A.6
 */

import { incrementCounterD1 } from './sequence-counter-d1';
import type { CounterScope, IncrementResult } from '../models/counter';
import type { AccessionConfig } from '../models/config';
import type { Env } from '../types';
import { SequenceExhaustedError } from '../errors';

/**
 * Computes the SHA-256 hex hash of the counter scope key.
 * Used to derive a deterministic Durable Object name per scope.
 */
async function hashScope(scope: CounterScope): Promise<string> {
  const scopeKey = `${scope.tenantId}|${scope.facilityCode}|${scope.modality}|${scope.dateBucket}`;
  const encoder = new TextEncoder();
  const data = encoder.encode(scopeKey);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = new Uint8Array(hashBuffer);
  return Array.from(hashArray)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * Increments the counter via a Durable Object instance keyed by the
 * SHA-256 hash of the Counter_Scope.
 *
 * @param env      - Worker environment bindings (must have COUNTER_DO)
 * @param scope    - Counter scope identifying the DO instance
 * @param maxValue - Maximum allowed counter value (10^sequence_digits - 1)
 * @param count    - Number of sequence values to reserve (default 1)
 * @returns        - The reserved range { startValue, endValue }
 * @throws SequenceExhaustedError when the DO returns HTTP 409
 * @throws Error for any other DO communication failure
 */
export async function incrementCounterDO(
  env: Env,
  scope: CounterScope,
  maxValue: number,
  count: number = 1,
): Promise<IncrementResult> {
  const hash = await hashScope(scope);
  const id = env.COUNTER_DO!.idFromName(hash);
  const stub = env.COUNTER_DO!.get(id);

  const response = await stub.fetch('http://counter-do/increment', {
    method: 'POST',
    body: JSON.stringify({ maxValue, count }),
    headers: { 'Content-Type': 'application/json' },
  });

  if (response.status === 409) {
    throw new SequenceExhaustedError(scope, maxValue);
  }

  if (!response.ok) {
    const text = await response.text();
    throw new Error(
      `Durable Object counter error (HTTP ${response.status}): ${text}`,
    );
  }

  const result = await response.json<IncrementResult>();
  return result;
}

/**
 * Unified counter dispatcher that selects D1 or Durable Object based on
 * the tenant's `counter_backend` configuration.
 *
 * Fallback logic (Requirement 3A.5):
 * - If counter_backend is 'DURABLE_OBJECT' but the COUNTER_DO binding is
 *   missing (undefined), falls back to D1 with a console.warn.
 * - If counter_backend is 'DURABLE_OBJECT' and the binding exists but the
 *   DO call fails for any other reason, the error propagates as-is (HTTP 500).
 * - If counter_backend is 'D1', uses incrementCounterD1 directly.
 *
 * @param env    - Worker environment bindings
 * @param config - Tenant accession configuration
 * @param scope  - Counter scope
 * @param count  - Number of sequence values to reserve (default 1)
 * @returns      - The reserved range { startValue, endValue }
 */
export async function incrementCounter(
  env: Env,
  config: AccessionConfig,
  scope: CounterScope,
  count: number = 1,
): Promise<IncrementResult> {
  const maxValue = Math.pow(10, config.sequence_digits) - 1;

  if (config.counter_backend === 'DURABLE_OBJECT') {
    // Check if the DO binding is available
    if (!env.COUNTER_DO) {
      console.warn(
        '[sequence-counter-do] COUNTER_DO binding is not configured. ' +
          'Falling back to D1 counter for scope: ' +
          `${scope.tenantId}/${scope.facilityCode}/${scope.modality || '*'}/${scope.dateBucket}`,
      );
      return incrementCounterD1(env.DB, scope, maxValue, count);
    }

    // DO binding exists — call it and propagate any errors (no fallback)
    return incrementCounterDO(env, scope, maxValue, count);
  }

  // Default: D1 backend
  return incrementCounterD1(env.DB, scope, maxValue, count);
}
