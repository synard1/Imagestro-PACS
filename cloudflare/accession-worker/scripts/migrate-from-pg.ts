/**
 * PostgreSQL → D1 Migration Script
 *
 * Exports accessions from Postgres and imports into D1 in batches of 500.
 * Also migrates counter values to ensure continuity.
 *
 * Usage: npx tsx scripts/migrate-from-pg.ts
 *
 * Requirements: 14.1, 14.2, 14.3, 14.4, 14.5, 14.6, 14.7
 */

// NOTE: This script is designed to be run locally with wrangler d1 execute
// or via a custom migration runner. It requires:
// - PG_CONNECTION_STRING env var for source Postgres
// - D1 database binding via wrangler

const BATCH_SIZE = 500;
const FAILURE_THRESHOLD = 100;

interface MigrationSummary {
  sourceTotal: number;
  migrated: number;
  failed: number;
  countersSynced: number;
  elapsedMs: number;
}

interface AccessionRow {
  id: string;
  tenant_id: string;
  accession_number: string;
  issuer: string | null;
  facility_code: string | null;
  modality: string;
  patient_national_id: string;
  patient_name: string;
  patient_ihs_number: string | null;
  patient_birth_date: string | null;
  patient_sex: string | null;
  medical_record_number: string | null;
  procedure_code: string | null;
  procedure_name: string | null;
  scheduled_at: string | null;
  note: string | null;
  source: string;
  created_at: string;
  deleted_at: string | null;
}

interface CounterRow {
  tenant_id: string;
  facility_code: string;
  modality: string;
  date_bucket: string;
  current_value: number;
}

/**
 * Main migration function.
 * 
 * @param pgClient - PostgreSQL client (e.g., from 'pg' package)
 * @param d1 - D1Database binding
 */
export async function migrateFromPostgres(
  pgClient: { query: (sql: string, params?: unknown[]) => Promise<{ rows: unknown[] }> },
  d1: D1Database,
): Promise<MigrationSummary> {
  const start = Date.now();
  let migrated = 0;
  let failed = 0;
  let cumulativeFailures = 0;

  // Step 1: Count source records
  const countResult = await pgClient.query('SELECT COUNT(*) as count FROM accessions');
  const sourceTotal = parseInt(String((countResult.rows[0] as any).count), 10);

  console.log(`[migrate] Source total: ${sourceTotal} accessions`);

  // Step 2: Migrate accessions in batches
  let offset = 0;
  while (offset < sourceTotal) {
    const batchResult = await pgClient.query(
      'SELECT * FROM accessions ORDER BY created_at ASC LIMIT $1 OFFSET $2',
      [BATCH_SIZE, offset],
    );

    const rows = batchResult.rows as AccessionRow[];
    if (rows.length === 0) break;

    // Build batch INSERT statements
    const statements: D1PreparedStatement[] = [];
    for (const row of rows) {
      statements.push(
        d1.prepare(
          `INSERT OR IGNORE INTO accessions (id, tenant_id, accession_number, issuer, facility_code, modality, patient_national_id, patient_name, patient_ihs_number, patient_birth_date, patient_sex, medical_record_number, procedure_code, procedure_name, scheduled_at, note, source, created_at, deleted_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        ).bind(
          row.id, row.tenant_id, row.accession_number, row.issuer,
          row.facility_code, row.modality, row.patient_national_id,
          row.patient_name, row.patient_ihs_number, row.patient_birth_date,
          row.patient_sex, row.medical_record_number, row.procedure_code,
          row.procedure_name, row.scheduled_at, row.note, row.source,
          row.created_at, row.deleted_at,
        ),
      );
    }

    try {
      await d1.batch(statements);
      migrated += rows.length;
    } catch (error) {
      failed += rows.length;
      cumulativeFailures += rows.length;
      console.error(`[migrate] Batch at offset ${offset} failed:`, error);

      if (cumulativeFailures >= FAILURE_THRESHOLD) {
        console.error(`[migrate] ABORT: Cumulative failures (${cumulativeFailures}) exceeded threshold (${FAILURE_THRESHOLD})`);
        break;
      }
    }

    offset += BATCH_SIZE;
    if (offset % 5000 === 0) {
      console.log(`[migrate] Progress: ${offset}/${sourceTotal}`);
    }
  }

  // Step 3: Migrate counters
  let countersSynced = 0;
  try {
    const counterResult = await pgClient.query(
      'SELECT tenant_id, facility_code, modality, date_bucket, current_value FROM accession_counters',
    );

    const counters = counterResult.rows as CounterRow[];
    for (const counter of counters) {
      // Set D1 counter >= max sequence found for its scope
      await d1.prepare(
        `INSERT INTO accession_counters (tenant_id, facility_code, modality, date_bucket, current_value, updated_at) VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT(tenant_id, facility_code, modality, date_bucket) DO UPDATE SET current_value = MAX(current_value, excluded.current_value), updated_at = excluded.updated_at`,
      ).bind(
        counter.tenant_id, counter.facility_code, counter.modality || '',
        counter.date_bucket, counter.current_value, new Date().toISOString(),
      ).run();

      countersSynced++;
    }
  } catch (error) {
    console.error('[migrate] Counter migration failed:', error);
  }

  const elapsed = Date.now() - start;

  // Step 4: Output summary
  const summary: MigrationSummary = {
    sourceTotal,
    migrated,
    failed,
    countersSynced,
    elapsedMs: elapsed,
  };

  console.log('[migrate] === MIGRATION SUMMARY ===');
  console.log(JSON.stringify(summary, null, 2));

  return summary;
}
