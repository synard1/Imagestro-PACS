/**
 * Scheduled job: Soft-delete purge.
 *
 * Physically deletes accession records that have been soft-deleted for more than 30 days.
 * Runs weekly via cron trigger at 04:00 UTC on Sundays.
 *
 * Requirements: 19.3, 19.4, 19.5
 */

import type { Env } from '../types';
import { emitJobRun } from '../services/analytics';

export interface PurgeResult {
  job: string;
  deleted_count: number;
  elapsed_ms: number;
}

/**
 * Purges accession records soft-deleted more than 30 days ago.
 */
export async function softDeletePurgeJob(env: Env): Promise<PurgeResult> {
  const start = Date.now();

  try {
    const result = await env.DB
      .prepare(
        `DELETE FROM accessions WHERE deleted_at IS NOT NULL AND deleted_at < datetime('now', '-30 days')`,
      )
      .run();

    const deleted = result.meta?.changes ?? 0;
    const elapsed = Date.now() - start;

    console.log(JSON.stringify({
      job: 'soft_delete_purge',
      deleted_count: deleted,
      elapsed_ms: elapsed,
    }));

    emitJobRun(env, {
      jobName: 'soft_delete_purge',
      deletedCount: deleted,
      elapsedMs: elapsed,
      success: true,
    });

    return { job: 'soft_delete_purge', deleted_count: deleted, elapsed_ms: elapsed };
  } catch (error) {
    const elapsed = Date.now() - start;

    console.error(JSON.stringify({
      job: 'soft_delete_purge',
      error: error instanceof Error ? error.message : String(error),
      elapsed_ms: elapsed,
    }));

    emitJobRun(env, {
      jobName: 'soft_delete_purge',
      deletedCount: 0,
      elapsedMs: elapsed,
      success: false,
    });

    return { job: 'soft_delete_purge', deleted_count: 0, elapsed_ms: elapsed };
  }
}
