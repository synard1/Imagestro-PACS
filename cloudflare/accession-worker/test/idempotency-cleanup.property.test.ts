/**
 * Property test: Scheduled idempotency cleanup deletes only expired records.
 *
 * **Property 11A: Scheduled idempotency cleanup removes only expired records**
 * **Validates: Requirements 4.8, 4.9**
 *
 * Verifies:
 * - Records with expires_at < CURRENT_TIMESTAMP are deleted
 * - Records with expires_at in the future are NOT deleted
 * - Cleanup processes in batches of up to 1000 records per statement
 * - Cleanup stops after max 100 batches per invocation
 */

import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { idempotencyCleanupJob } from '../src/jobs/idempotency-cleanup';
import type { Env } from '../src/types';

// ─── Helpers ─────────────────────────────────────────────────────────────────

interface MockRecord {
  key: string;
  tenant_id: string;
  expires_at: string;
}

/**
 * Creates a mock Env with a D1 database that simulates the idempotency_keys table.
 * Tracks which records are deleted based on the SQL WHERE clause logic.
 */
function createMockEnv(records: MockRecord[]): {
  env: Env;
  getDeletedRecords: () => MockRecord[];
  getRemainingRecords: () => MockRecord[];
  getBatchCount: () => number;
} {
  const remaining = [...records];
  const deleted: MockRecord[] = [];
  let batchCount = 0;

  const mockDb = {
    prepare: (_sql: string) => ({
      bind: (batchSize: number) => ({
        run: async () => {
          batchCount++;
          const now = new Date();
          // Find expired records (expires_at < now), limited by batchSize
          const expiredIndices: number[] = [];
          for (let i = 0; i < remaining.length && expiredIndices.length < batchSize; i++) {
            if (new Date(remaining[i]!.expires_at) < now) {
              expiredIndices.push(i);
            }
          }

          // Remove expired records from remaining (in reverse to preserve indices)
          const removedThisBatch: MockRecord[] = [];
          for (let i = expiredIndices.length - 1; i >= 0; i--) {
            const [removed] = remaining.splice(expiredIndices[i]!, 1);
            removedThisBatch.push(removed!);
          }
          deleted.push(...removedThisBatch);

          return { meta: { changes: removedThisBatch.length } };
        },
      }),
    }),
  } as unknown as D1Database;

  const mockEnv = {
    DB: mockDb,
    JOB_RUNS: { writeDataPoint: () => {} },
  } as unknown as Env;

  return {
    env: mockEnv,
    getDeletedRecords: () => deleted,
    getRemainingRecords: () => remaining,
    getBatchCount: () => batchCount,
  };
}

// ─── Arbitraries ─────────────────────────────────────────────────────────────

// Generate a timestamp in the past (expired)
const pastDateArb = fc
  .integer({ min: 1, max: 365 * 24 * 60 * 60 * 1000 }) // 1ms to 1 year in the past
  .map((offset) => new Date(Date.now() - offset).toISOString());

// Generate a timestamp in the future (not expired)
const futureDateArb = fc
  .integer({ min: 60_000, max: 365 * 24 * 60 * 60 * 1000 }) // 1 minute to 1 year in the future
  .map((offset) => new Date(Date.now() + offset).toISOString());

// Generate a mock idempotency record
const expiredRecordArb = fc
  .record({
    key: fc.string({ minLength: 1, maxLength: 128 }),
    tenant_id: fc.string({ minLength: 1, maxLength: 36 }),
    expires_at: pastDateArb,
  });

const activeRecordArb = fc
  .record({
    key: fc.string({ minLength: 1, maxLength: 128 }),
    tenant_id: fc.string({ minLength: 1, maxLength: 36 }),
    expires_at: futureDateArb,
  });

// ─── Property 11A: Scheduled idempotency cleanup removes only expired records ─

describe('Property 11A: Scheduled idempotency cleanup removes only expired records', () => {
  it('deletes all expired records and preserves all non-expired records', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(expiredRecordArb, { minLength: 0, maxLength: 50 }),
        fc.array(activeRecordArb, { minLength: 0, maxLength: 50 }),
        async (expiredRecords, activeRecords) => {
          const allRecords = [...expiredRecords, ...activeRecords];
          const { env, getDeletedRecords, getRemainingRecords } = createMockEnv(allRecords);

          await idempotencyCleanupJob(env);

          const deletedRecords = getDeletedRecords();
          const remainingRecords = getRemainingRecords();

          // All expired records should be deleted
          for (const expired of expiredRecords) {
            const wasDeleted = deletedRecords.some(
              (d) => d.key === expired.key && d.tenant_id === expired.tenant_id && d.expires_at === expired.expires_at,
            );
            if (!wasDeleted) return false;
          }

          // All active records should remain
          for (const active of activeRecords) {
            const stillRemains = remainingRecords.some(
              (r) => r.key === active.key && r.tenant_id === active.tenant_id && r.expires_at === active.expires_at,
            );
            if (!stillRemains) return false;
          }

          // No active record should have been deleted
          for (const d of deletedRecords) {
            const isActive = activeRecords.some(
              (a) => a.key === d.key && a.tenant_id === d.tenant_id && a.expires_at === d.expires_at,
            );
            if (isActive) return false;
          }

          return true;
        },
      ),
      { numRuns: 100 },
    );
  });

  it('returns correct deleted_count matching actual expired records removed', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(expiredRecordArb, { minLength: 0, maxLength: 30 }),
        fc.array(activeRecordArb, { minLength: 0, maxLength: 30 }),
        async (expiredRecords, activeRecords) => {
          const allRecords = [...expiredRecords, ...activeRecords];
          const { env, getDeletedRecords } = createMockEnv(allRecords);

          const result = await idempotencyCleanupJob(env);

          return result.deleted_count === getDeletedRecords().length;
        },
      ),
      { numRuns: 100 },
    );
  });

  it('processes in batches of up to 1000 records per statement', async () => {
    // Create more than 1000 expired records to force multiple batches
    const manyExpiredRecords: MockRecord[] = Array.from({ length: 2500 }, (_, i) => ({
      key: `key-${i}`,
      tenant_id: 'tenant-1',
      expires_at: new Date(Date.now() - 3600_000).toISOString(), // 1 hour ago
    }));

    const { env, getBatchCount, getDeletedRecords } = createMockEnv(manyExpiredRecords);

    const result = await idempotencyCleanupJob(env);

    // Should have processed in multiple batches
    expect(getBatchCount()).toBeGreaterThan(1);
    // All 2500 expired records should be deleted
    expect(getDeletedRecords().length).toBe(2500);
    expect(result.deleted_count).toBe(2500);
  });

  it('stops after max 100 batches per invocation', async () => {
    // Create a mock that always returns BATCH_SIZE (1000) deletions to simulate
    // an extremely large backlog that would exceed 100 batches
    let batchCount = 0;

    const mockDb = {
      prepare: (_sql: string) => ({
        bind: (_batchSize: number) => ({
          run: async () => {
            batchCount++;
            // Always report full batch to keep the loop going
            return { meta: { changes: 1000 } };
          },
        }),
      }),
    } as unknown as D1Database;

    const mockEnv = {
      DB: mockDb,
      JOB_RUNS: { writeDataPoint: () => {} },
    } as unknown as Env;

    const result = await idempotencyCleanupJob(mockEnv);

    // Should stop at exactly 100 batches
    expect(batchCount).toBe(100);
    expect(result.batches_run).toBe(100);
    // Total deleted should be 100 * 1000 = 100,000
    expect(result.deleted_count).toBe(100_000);
  });

  it('with no expired records, deletes nothing and runs exactly 1 batch', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(activeRecordArb, { minLength: 1, maxLength: 50 }),
        async (activeRecords) => {
          const { env, getDeletedRecords, getRemainingRecords, getBatchCount } = createMockEnv(activeRecords);

          const result = await idempotencyCleanupJob(env);

          // No records deleted
          return (
            result.deleted_count === 0 &&
            getDeletedRecords().length === 0 &&
            getRemainingRecords().length === activeRecords.length &&
            getBatchCount() === 1 // Runs one batch that finds 0 expired, then stops
          );
        },
      ),
      { numRuns: 50 },
    );
  });

  it('with empty table, returns zero deleted and runs exactly 1 batch', async () => {
    const { env, getBatchCount } = createMockEnv([]);

    const result = await idempotencyCleanupJob(env);

    expect(result.deleted_count).toBe(0);
    expect(result.batches_run).toBe(1);
    expect(getBatchCount()).toBe(1);
  });

  it('job name in result is always "idempotency_cleanup"', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(expiredRecordArb, { minLength: 0, maxLength: 10 }),
        async (records) => {
          const { env } = createMockEnv(records);
          const result = await idempotencyCleanupJob(env);
          return result.job === 'idempotency_cleanup';
        },
      ),
      { numRuns: 50 },
    );
  });

  it('elapsed_ms is non-negative', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(expiredRecordArb, { minLength: 0, maxLength: 20 }),
        async (records) => {
          const { env } = createMockEnv(records);
          const result = await idempotencyCleanupJob(env);
          return result.elapsed_ms >= 0;
        },
      ),
      { numRuns: 50 },
    );
  });
});
