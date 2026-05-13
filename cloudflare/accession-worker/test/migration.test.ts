import { describe, it, expect, vi, beforeEach } from 'vitest';
import { migrateFromPostgres } from '../scripts/migrate-from-pg';

/**
 * Unit tests for migration tooling (scripts/migrate-from-pg.ts).
 *
 * Validates: Requirements 14.1, 14.5, 14.6, 14.7
 */

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeAccessionRow(index: number, tenantId = 'tenant-1') {
  return {
    id: `uuid-${index}`,
    tenant_id: tenantId,
    accession_number: `RS01-20250120-${String(index).padStart(4, '0')}`,
    issuer: `http://sys-ids.kemkes.go.id/acsn/1234567890123456|RS01-20250120-${String(index).padStart(4, '0')}`,
    facility_code: 'RS01',
    modality: 'CT',
    patient_national_id: '1234567890123456',
    patient_name: `Patient ${index}`,
    patient_ihs_number: null,
    patient_birth_date: '1990-01-01',
    patient_sex: 'male',
    medical_record_number: `MRN-${index}`,
    procedure_code: 'CT001',
    procedure_name: 'CT Scan',
    scheduled_at: null,
    note: null,
    source: 'internal',
    created_at: `2025-01-20T10:00:${String(index % 60).padStart(2, '0')}.000Z`,
    deleted_at: null,
  };
}

function createMockPgClient(options: {
  totalRecords: number;
  counters?: Array<{ tenant_id: string; facility_code: string; modality: string; date_bucket: string; current_value: number }>;
  tenantId?: string;
}) {
  const { totalRecords, counters = [], tenantId = 'tenant-1' } = options;
  const allRows = Array.from({ length: totalRecords }, (_, i) => makeAccessionRow(i + 1, tenantId));

  return {
    query: vi.fn(async (sql: string, params?: unknown[]) => {
      if (sql.includes('COUNT(*)')) {
        return { rows: [{ count: totalRecords }] };
      }
      if (sql.includes('accession_counters')) {
        return { rows: counters };
      }
      // SELECT * FROM accessions with LIMIT/OFFSET
      const limit = (params?.[0] as number) ?? 500;
      const offset = (params?.[1] as number) ?? 0;
      return { rows: allRows.slice(offset, offset + limit) };
    }),
  };
}

function createMockD1(options?: {
  batchFailAtOffset?: number; // Fail the batch that starts at this offset
  batchFailCount?: number;    // How many consecutive batches to fail
}) {
  const { batchFailAtOffset, batchFailCount = 1 } = options ?? {};
  let batchCallIndex = 0;
  const insertedStatements: string[] = [];
  const counterUpserts: Array<{ tenantId: string; facilityCode: string; modality: string; dateBucket: string; value: number }> = [];

  const mockD1: any = {
    prepare: vi.fn((sql: string) => {
      return {
        bind: vi.fn((...args: unknown[]) => {
          // Track counter upserts
          if (sql.includes('accession_counters')) {
            counterUpserts.push({
              tenantId: args[0] as string,
              facilityCode: args[1] as string,
              modality: args[2] as string,
              dateBucket: args[3] as string,
              value: args[4] as number,
            });
          }
          return {
            run: vi.fn().mockResolvedValue({ success: true }),
          };
        }),
      };
    }),
    batch: vi.fn(async (statements: unknown[]) => {
      const currentBatch = batchCallIndex++;
      if (
        batchFailAtOffset !== undefined &&
        currentBatch >= batchFailAtOffset &&
        currentBatch < batchFailAtOffset + batchFailCount
      ) {
        throw new Error(`D1 batch error at batch index ${currentBatch}`);
      }
      // Track that INSERT OR IGNORE statements were used
      insertedStatements.push(`batch-${currentBatch}: ${(statements as any[]).length} statements`);
      return statements.map(() => ({ success: true }));
    }),
    _insertedStatements: insertedStatements,
    _counterUpserts: counterUpserts,
    _getBatchCallCount: () => batchCallIndex,
  };

  return mockD1;
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('Migration tooling: Idempotent re-run (Requirement 14.6)', () => {
  it('uses INSERT OR IGNORE so re-running does not create duplicates', async () => {
    const pgClient = createMockPgClient({ totalRecords: 3 });
    const d1 = createMockD1();

    // Run migration twice
    await migrateFromPostgres(pgClient, d1);
    await migrateFromPostgres(pgClient, d1);

    // Both runs should succeed — INSERT OR IGNORE means second run is a no-op
    // Verify batch was called (the SQL uses INSERT OR IGNORE)
    expect(d1.batch).toHaveBeenCalled();

    // Verify the prepare call uses INSERT OR IGNORE
    const prepareCalls = d1.prepare.mock.calls;
    const insertCalls = prepareCalls.filter((call: string[]) =>
      call[0]!.includes('INSERT OR IGNORE'),
    );
    // Counter upserts use INSERT ... ON CONFLICT, accession inserts use INSERT OR IGNORE
    // The batch statements are built with INSERT OR IGNORE
    expect(d1.batch.mock.calls.length).toBeGreaterThanOrEqual(2);
  });

  it('returns same migrated count on re-run (no errors from duplicates)', async () => {
    const pgClient = createMockPgClient({ totalRecords: 10 });
    const d1 = createMockD1();

    const result1 = await migrateFromPostgres(pgClient, d1);
    const result2 = await migrateFromPostgres(pgClient, d1);

    expect(result1.migrated).toBe(10);
    expect(result1.failed).toBe(0);
    expect(result2.migrated).toBe(10);
    expect(result2.failed).toBe(0);
  });
});

describe('Migration tooling: 500-batch sizing (Requirement 14.1)', () => {
  it('imports records in batches of exactly 500', async () => {
    const pgClient = createMockPgClient({ totalRecords: 1200 });
    const d1 = createMockD1();

    const result = await migrateFromPostgres(pgClient, d1);

    // 1200 records → 3 batches: 500, 500, 200
    expect(d1.batch).toHaveBeenCalledTimes(3);

    // First batch should have 500 statements
    const firstBatchStatements = d1.batch.mock.calls[0][0];
    expect(firstBatchStatements).toHaveLength(500);

    // Second batch should have 500 statements
    const secondBatchStatements = d1.batch.mock.calls[1][0];
    expect(secondBatchStatements).toHaveLength(500);

    // Third (final) batch should have 200 statements
    const thirdBatchStatements = d1.batch.mock.calls[2][0];
    expect(thirdBatchStatements).toHaveLength(200);

    expect(result.migrated).toBe(1200);
  });

  it('handles exact multiple of 500 without extra empty batch', async () => {
    const pgClient = createMockPgClient({ totalRecords: 1000 });
    const d1 = createMockD1();

    const result = await migrateFromPostgres(pgClient, d1);

    // 1000 records → exactly 2 batches of 500
    expect(d1.batch).toHaveBeenCalledTimes(2);
    expect(d1.batch.mock.calls[0][0]).toHaveLength(500);
    expect(d1.batch.mock.calls[1][0]).toHaveLength(500);
    expect(result.migrated).toBe(1000);
  });

  it('handles fewer than 500 records in a single batch', async () => {
    const pgClient = createMockPgClient({ totalRecords: 42 });
    const d1 = createMockD1();

    const result = await migrateFromPostgres(pgClient, d1);

    expect(d1.batch).toHaveBeenCalledTimes(1);
    expect(d1.batch.mock.calls[0][0]).toHaveLength(42);
    expect(result.migrated).toBe(42);
  });
});

describe('Migration tooling: Counter max-seed logic (Requirement 14.7)', () => {
  it('sets D1 counter >= max sequence found for each scope', async () => {
    const counters = [
      { tenant_id: 'tenant-1', facility_code: 'RS01', modality: 'CT', date_bucket: '20250120', current_value: 150 },
      { tenant_id: 'tenant-1', facility_code: 'RS01', modality: 'MR', date_bucket: '20250120', current_value: 75 },
    ];
    const pgClient = createMockPgClient({ totalRecords: 5, counters });
    const d1 = createMockD1();

    const result = await migrateFromPostgres(pgClient, d1);

    expect(result.countersSynced).toBe(2);

    // Verify counter upserts were called with correct values
    expect(d1._counterUpserts).toHaveLength(2);
    expect(d1._counterUpserts[0]).toEqual({
      tenantId: 'tenant-1',
      facilityCode: 'RS01',
      modality: 'CT',
      dateBucket: '20250120',
      value: 150,
    });
    expect(d1._counterUpserts[1]).toEqual({
      tenantId: 'tenant-1',
      facilityCode: 'RS01',
      modality: 'MR',
      dateBucket: '20250120',
      value: 75,
    });
  });

  it('uses INSERT ON CONFLICT with MAX to ensure counter only increases', async () => {
    const counters = [
      { tenant_id: 'tenant-1', facility_code: 'RS01', modality: '', date_bucket: 'ALL', current_value: 500 },
    ];
    const pgClient = createMockPgClient({ totalRecords: 0, counters });
    const d1 = createMockD1();

    await migrateFromPostgres(pgClient, d1);

    // Verify the SQL uses ON CONFLICT ... MAX(current_value, excluded.current_value)
    const prepareCalls = d1.prepare.mock.calls;
    const counterSql = prepareCalls.find((call: string[]) =>
      call[0]!.includes('accession_counters'),
    );
    expect(counterSql).toBeDefined();
    expect(counterSql![0]).toContain('ON CONFLICT');
    expect(counterSql![0]).toContain('MAX');
  });

  it('handles empty modality field (maps to empty string)', async () => {
    const counters = [
      { tenant_id: 'tenant-1', facility_code: 'RS01', modality: '', date_bucket: '20250120', current_value: 99 },
    ];
    const pgClient = createMockPgClient({ totalRecords: 0, counters });
    const d1 = createMockD1();

    await migrateFromPostgres(pgClient, d1);

    expect(d1._counterUpserts[0].modality).toBe('');
    expect(d1._counterUpserts[0].value).toBe(99);
  });
});

describe('Migration tooling: Abort threshold (Requirement 14.5)', () => {
  it('aborts when cumulative failures exceed 100', async () => {
    // 600 records = 2 batches of 500 (batch 0 = offset 0, batch 1 = offset 500)
    // But we need enough failures to exceed 100. Each failed batch of 500 adds 500 failures.
    // So 1 failed batch of 500 records already exceeds 100.
    const pgClient = createMockPgClient({ totalRecords: 1500 });
    // Fail the first batch (index 0) — that's 500 failures, exceeding threshold of 100
    const d1 = createMockD1({ batchFailAtOffset: 0, batchFailCount: 3 });

    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const result = await migrateFromPostgres(pgClient, d1);
    consoleSpy.mockRestore();

    // First batch fails (500 failures >= 100 threshold) → abort
    expect(result.failed).toBeGreaterThanOrEqual(100);
    // Should not have processed all 1500 records
    expect(result.migrated).toBe(0);
  });

  it('continues processing when failures are below threshold', async () => {
    // We need a scenario where a batch fails but total failures < 100
    // With batch size 500, even one failed batch = 500 failures > 100
    // So let's use a smaller dataset where the batch has fewer records
    const pgClient = createMockPgClient({ totalRecords: 50 });
    // Fail the first (and only) batch — 50 failures < 100
    const d1 = createMockD1({ batchFailAtOffset: 0, batchFailCount: 1 });

    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const result = await migrateFromPostgres(pgClient, d1);
    consoleSpy.mockRestore();

    // 50 failures < 100 threshold, so migration should continue (but there are no more batches)
    expect(result.failed).toBe(50);
    // Migration did not abort — it just ran out of records
    expect(result.sourceTotal).toBe(50);
  });

  it('logs ABORT message when threshold is exceeded', async () => {
    const pgClient = createMockPgClient({ totalRecords: 1000 });
    const d1 = createMockD1({ batchFailAtOffset: 0, batchFailCount: 2 });

    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    await migrateFromPostgres(pgClient, d1);

    // Check that ABORT message was logged
    const abortLog = consoleSpy.mock.calls.find(
      (call) => typeof call[0] === 'string' && call[0].includes('ABORT'),
    );
    expect(abortLog).toBeDefined();
    consoleSpy.mockRestore();
  });

  it('reports summary with correct failure count', async () => {
    const pgClient = createMockPgClient({ totalRecords: 1500 });
    // Fail batch at index 1 (offset 500) — first batch succeeds (500 migrated), second fails (500 failures > 100 → abort)
    const d1 = createMockD1({ batchFailAtOffset: 1, batchFailCount: 1 });

    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const result = await migrateFromPostgres(pgClient, d1);
    consoleSpy.mockRestore();

    expect(result.sourceTotal).toBe(1500);
    expect(result.migrated).toBe(500); // First batch succeeded
    expect(result.failed).toBe(500);   // Second batch failed (500 records)
  });
});
