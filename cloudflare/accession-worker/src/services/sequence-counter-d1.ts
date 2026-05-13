/**
 * D1-backed atomic sequence counter using single-statement UPSERT with
 * exponential backoff on write contention.
 *
 * Requirements: 1.5, 1.6, 3.1, 3.2, 3.4, 3.6, 3.7, 16.8
 */

import { sleep, backoffSchedule, isContentionError } from '../utils/backoff';
import { SequenceExhaustedError, WriteContentionError } from '../errors';
import type { CounterScope, IncrementResult } from '../models/counter';

/**
 * Atomically increments (or creates) a sequence counter row in D1.
 *
 * Uses a single `INSERT ... ON CONFLICT DO UPDATE ... RETURNING` statement
 * to combine create-or-increment into one D1 roundtrip. The WHERE guard on
 * the UPDATE branch ensures the counter never exceeds `maxValue`.
 *
 * Retries on contention errors (busy/locked) using the backoff schedule
 * [10, 40, 160] ms. Non-contention errors (network, schema) propagate
 * immediately without retry.
 *
 * @param db       - D1Database binding (primary, not read replica)
 * @param scope    - Counter scope (tenant, facility, modality, date bucket)
 * @param maxValue - Maximum allowed counter value (10^sequence_digits - 1)
 * @param count    - Number of sequence values to reserve (default 1, >1 for batch)
 * @returns        - The reserved range { startValue, endValue } (both inclusive)
 * @throws SequenceExhaustedError when the counter has reached maxValue
 * @throws WriteContentionError when all retry attempts are exhausted
 */
export async function incrementCounterD1(
  db: D1Database,
  scope: CounterScope,
  maxValue: number,
  count: number = 1,
): Promise<IncrementResult> {
  const now = new Date().toISOString();

  for (let attempt = 0; attempt <= backoffSchedule.length; attempt++) {
    try {
      const row = await db
        .prepare(
          `INSERT INTO accession_counters
            (tenant_id, facility_code, modality, date_bucket, current_value, updated_at)
          VALUES (?, ?, ?, ?, ?, ?)
          ON CONFLICT(tenant_id, facility_code, modality, date_bucket) DO UPDATE
            SET current_value = current_value + ?,
                updated_at = excluded.updated_at
            WHERE current_value + ? <= ?
          RETURNING current_value`,
        )
        .bind(
          scope.tenantId,
          scope.facilityCode,
          scope.modality,
          scope.dateBucket,
          count,
          now,
          count,
          count,
          maxValue,
        )
        .first<{ current_value: number }>();

      if (row) {
        return {
          startValue: row.current_value - count + 1,
          endValue: row.current_value,
        };
      }

      // UPDATE was blocked by WHERE clause → sequence exhausted
      throw new SequenceExhaustedError(scope, maxValue);
    } catch (e: unknown) {
      // SequenceExhaustedError is not a contention error — propagate immediately
      if (e instanceof SequenceExhaustedError) {
        throw e;
      }

      // Only retry on contention errors; propagate all others immediately
      const delay = backoffSchedule[attempt];
      if (isContentionError(e) && delay !== undefined) {
        await sleep(delay);
        continue;
      }

      throw e;
    }
  }

  // All retry attempts exhausted due to contention
  throw new WriteContentionError(scope, backoffSchedule.length + 1);
}
