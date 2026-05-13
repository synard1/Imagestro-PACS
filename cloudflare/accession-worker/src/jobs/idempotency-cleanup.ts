/**
 * Scheduled job: Idempotency key cleanup.
 *
 * Batch deletes expired idempotency keys (up to 1000 per statement, max 100 batches).
 * Logs start/end with counts and elapsed time.
 * Emits Analytics Engine metric.
 *
 * Requirements: 4.8, 4.9, 4.10, 19.4, 19.5
 */

import type { Env } from '../types';
import { emitJobRun } from '../services/analytics';

const BATCH_SIZE = 1000;
const MAX_BATCHES = 100;

export interface CleanupResult {
  job: string;
  deleted_count: number;
  batches_run: number;
  elapsed_ms: number;
}

/**
 * Deletes expired idempotency keys in batches.
 * Called by the cron trigger at 03:00 UTC daily.
 */
export async function idempotencyCleanupJob(env: Env): Promise<CleanupResult> {
  const start = Date.now();
  let totalDeleted = 0;
  let batchesRun = 0;

  try {
    for (let batch = 0; batch < MAX_BATCHES; batch++) {
      const result = await env.DB
        .prepare(
          `DELETE FROM idempotency_keys WHERE rowid IN (SELECT rowid FROM idempotency_keys WHERE expires_at < datetime('now') LIMIT ?)`,
        )
        .bind(BATCH_SIZE)
        .run();

      const deleted = result.meta?.changes ?? 0;
      totalDeleted += deleted;
      batchesRun++;

      if (deleted < BATCH_SIZE) {
        break; // No more expired records
      }
    }

    const elapsed = Date.now() - start;

    console.log(JSON.stringify({
      job: 'idempotency_cleanup',
      deleted_count: totalDeleted,
      batches_run: batchesRun,
      elapsed_ms: elapsed,
    }));

    emitJobRun(env, {
      jobName: 'idempotency_cleanup',
      deletedCount: totalDeleted,
      elapsedMs: elapsed,
      success: true,
    });

    return { job: 'idempotency_cleanup', deleted_count: totalDeleted, batches_run: batchesRun, elapsed_ms: elapsed };
  } catch (error) {
    const elapsed = Date.now() - start;

    console.error(JSON.stringify({
      job: 'idempotency_cleanup',
      error: error instanceof Error ? error.message : String(error),
      deleted_count: totalDeleted,
      elapsed_ms: elapsed,
    }));

    emitJobRun(env, {
      jobName: 'idempotency_cleanup',
      deletedCount: totalDeleted,
      elapsedMs: elapsed,
      success: false,
    });

    return { job: 'idempotency_cleanup', deleted_count: totalDeleted, batches_run: batchesRun, elapsed_ms: elapsed };
  }
}
