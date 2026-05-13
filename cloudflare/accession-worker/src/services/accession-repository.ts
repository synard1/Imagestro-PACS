/**
 * Accession repository — D1 CRUD, keyset pagination, audit, and soft delete.
 *
 * This is the main data access layer for accession records. All queries
 * include a mandatory `tenant_id` filter for multi-tenant isolation.
 *
 * Requirements: 3.5, 3.8, 5.2, 5.3, 5.5, 7.1-7.6, 7A.1-7A.7, 17.5, 17.8, 18.2, 18.3, 18.5
 */

import type { AccessionRecord } from '../models/accession';
import type { AuditRecord } from '../models/audit';
import type { DecodedCursor } from '../utils/cursor';
import { encodeCursor } from '../utils/cursor';
import { newUuidV7 } from '../utils/uuid';
import { ImmutableFieldError } from '../errors';
import type { IdempotencyRecord } from './idempotency';
import type { PaginatedResult } from '../types';

// ─── Types ───────────────────────────────────────────────────────────────────

/** Filters for the list accessions query. */
export interface ListAccessionFilters {
  source?: 'internal' | 'external';
  modality?: string;
  patientNationalId?: string;
  fromDate?: string; // ISO 8601, inclusive lower bound on created_at
  toDate?: string; // ISO 8601, exclusive upper bound on created_at
  includeDeleted?: boolean;
}

/** Result of a single-record lookup (404-safe). */
export interface GetAccessionResult {
  found: boolean;
  record?: AccessionRecord;
}

/** Fields allowed for PATCH updates. */
const ALLOWED_PATCH_FIELDS: ReadonlySet<string> = new Set([
  'patient_name',
  'patient_birth_date',
  'patient_sex',
  'medical_record_number',
  'procedure_code',
  'procedure_name',
  'scheduled_at',
  'note',
]);

/** Fields that are immutable and cannot be modified via PATCH. */
const IMMUTABLE_FIELDS: ReadonlySet<string> = new Set([
  'id',
  'tenant_id',
  'accession_number',
  'issuer',
  'patient_national_id',
  'facility_code',
  'modality',
  'source',
  'created_at',
  'deleted_at',
]);

// ─── Create ──────────────────────────────────────────────────────────────────

/**
 * Creates a single accession record atomically with its idempotency key.
 * Uses `db.batch()` to ensure both the accession INSERT and the idempotency
 * key INSERT commit together or not at all.
 *
 * Requirements: 3.5, 3.8, 5.2
 *
 * @param db - D1Database binding (primary, for writes)
 * @param record - The accession record to insert
 * @param idempotencyRecord - Optional idempotency record to store alongside
 */
export async function createAccession(
  db: D1Database,
  record: AccessionRecord,
  idempotencyRecord?: IdempotencyRecord,
): Promise<void> {
  const statements: D1PreparedStatement[] = [
    db
      .prepare(
        `INSERT INTO accessions
          (id, tenant_id, accession_number, issuer, facility_code, modality,
           patient_national_id, patient_name, patient_ihs_number, patient_birth_date,
           patient_sex, medical_record_number, procedure_code, procedure_name,
           scheduled_at, note, source, created_at, deleted_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(
        record.id,
        record.tenant_id,
        record.accession_number,
        record.issuer,
        record.facility_code,
        record.modality,
        record.patient_national_id,
        record.patient_name,
        record.patient_ihs_number,
        record.patient_birth_date,
        record.patient_sex,
        record.medical_record_number,
        record.procedure_code,
        record.procedure_name,
        record.scheduled_at,
        record.note,
        record.source,
        record.created_at,
        record.deleted_at,
      ),
  ];

  if (idempotencyRecord) {
    statements.push(
      db
        .prepare(
          `INSERT INTO idempotency_keys
            (tenant_id, key, accession_id, request_hash, payload_type, payload, created_at, expires_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .bind(
          idempotencyRecord.tenantId,
          idempotencyRecord.key,
          idempotencyRecord.accessionId,
          idempotencyRecord.requestHash,
          idempotencyRecord.payloadType,
          idempotencyRecord.payload,
          idempotencyRecord.createdAt,
          idempotencyRecord.expiresAt,
        ),
    );
  }

  await db.batch(statements);
}

// ─── Batch Create ────────────────────────────────────────────────────────────

/**
 * Creates multiple accession records in a single atomic `db.batch()` call.
 * Optionally includes an idempotency record for the entire batch.
 *
 * Requirements: 3.5, 3.8, 5.2, 16.4
 *
 * @param db - D1Database binding (primary, for writes)
 * @param records - Array of accession records to insert
 * @param idempotencyRecord - Optional idempotency record for the batch
 */
export async function createBatchAccessions(
  db: D1Database,
  records: AccessionRecord[],
  idempotencyRecord?: IdempotencyRecord,
): Promise<void> {
  const statements: D1PreparedStatement[] = records.map((record) =>
    db
      .prepare(
        `INSERT INTO accessions
          (id, tenant_id, accession_number, issuer, facility_code, modality,
           patient_national_id, patient_name, patient_ihs_number, patient_birth_date,
           patient_sex, medical_record_number, procedure_code, procedure_name,
           scheduled_at, note, source, created_at, deleted_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(
        record.id,
        record.tenant_id,
        record.accession_number,
        record.issuer,
        record.facility_code,
        record.modality,
        record.patient_national_id,
        record.patient_name,
        record.patient_ihs_number,
        record.patient_birth_date,
        record.patient_sex,
        record.medical_record_number,
        record.procedure_code,
        record.procedure_name,
        record.scheduled_at,
        record.note,
        record.source,
        record.created_at,
        record.deleted_at,
      ),
  );

  if (idempotencyRecord) {
    statements.push(
      db
        .prepare(
          `INSERT INTO idempotency_keys
            (tenant_id, key, accession_id, request_hash, payload_type, payload, created_at, expires_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .bind(
          idempotencyRecord.tenantId,
          idempotencyRecord.key,
          idempotencyRecord.accessionId,
          idempotencyRecord.requestHash,
          idempotencyRecord.payloadType,
          idempotencyRecord.payload,
          idempotencyRecord.createdAt,
          idempotencyRecord.expiresAt,
        ),
    );
  }

  await db.batch(statements);
}

// ─── Get ─────────────────────────────────────────────────────────────────────

/**
 * Retrieves a single accession by tenant and accession number.
 * Returns a 404-safe result (found: false) instead of throwing.
 *
 * Requirements: 5.2, 5.3, 7.1, 7.2, 7A.7, 18.2, 18.5
 *
 * @param db - D1Database binding (DB_READ for replica reads, DB for strong reads)
 * @param tenantId - Tenant identifier (mandatory filter)
 * @param accessionNumber - The accession number to look up
 * @param includeDeleted - Whether to include soft-deleted records (default: false)
 */
export async function getAccession(
  db: D1Database,
  tenantId: string,
  accessionNumber: string,
  includeDeleted = false,
): Promise<GetAccessionResult> {
  const deletedClause = includeDeleted ? '' : ' AND deleted_at IS NULL';

  const row = await db
    .prepare(
      `SELECT id, tenant_id, accession_number, issuer, facility_code, modality,
              patient_national_id, patient_name, patient_ihs_number, patient_birth_date,
              patient_sex, medical_record_number, procedure_code, procedure_name,
              scheduled_at, note, source, created_at, deleted_at
       FROM accessions
       WHERE tenant_id = ? AND accession_number = ?${deletedClause}`,
    )
    .bind(tenantId, accessionNumber)
    .first<AccessionRecord>();

  if (!row) {
    return { found: false };
  }

  return { found: true, record: row };
}

// ─── List ────────────────────────────────────────────────────────────────────

/**
 * Lists accessions for a tenant with filtering and keyset pagination.
 * Uses `(created_at DESC, id DESC)` ordering for stable pagination.
 * Leverages the partial index `idx_accessions_tenant_active` when
 * `include_deleted=false` (the default).
 *
 * Requirements: 5.2, 7.4, 7.5, 7.6, 7A.7, 18.2
 *
 * @param db - D1Database binding (DB_READ for replica reads, DB for strong reads)
 * @param tenantId - Tenant identifier (mandatory filter)
 * @param filters - Optional filters (source, modality, patient_national_id, date range)
 * @param cursor - Decoded cursor for keyset pagination (null for first page)
 * @param limit - Maximum number of records to return (1-100)
 */
export async function listAccessions(
  db: D1Database,
  tenantId: string,
  filters: ListAccessionFilters = {},
  cursor: DecodedCursor | null = null,
  limit = 50,
): Promise<PaginatedResult<AccessionRecord>> {
  const conditions: string[] = ['tenant_id = ?'];
  const bindings: unknown[] = [tenantId];

  // Soft-delete filter (uses partial index when false)
  if (!filters.includeDeleted) {
    conditions.push('deleted_at IS NULL');
  }

  // Optional filters
  if (filters.source) {
    conditions.push('source = ?');
    bindings.push(filters.source);
  }

  if (filters.modality) {
    conditions.push('modality = ?');
    bindings.push(filters.modality);
  }

  if (filters.patientNationalId) {
    conditions.push('patient_national_id = ?');
    bindings.push(filters.patientNationalId);
  }

  if (filters.fromDate) {
    conditions.push('created_at >= ?');
    bindings.push(filters.fromDate);
  }

  if (filters.toDate) {
    conditions.push('created_at < ?');
    bindings.push(filters.toDate);
  }

  // Keyset pagination: (created_at, id) < (cursor.createdAt, cursor.id)
  // Since we order DESC, "next page" means rows with smaller (created_at, id)
  if (cursor) {
    conditions.push('(created_at < ? OR (created_at = ? AND id < ?))');
    bindings.push(cursor.createdAt, cursor.createdAt, cursor.id);
  }

  const whereClause = conditions.join(' AND ');

  // Fetch limit + 1 to determine has_more
  const fetchLimit = limit + 1;
  bindings.push(fetchLimit);

  const query = `
    SELECT id, tenant_id, accession_number, issuer, facility_code, modality,
           patient_national_id, patient_name, patient_ihs_number, patient_birth_date,
           patient_sex, medical_record_number, procedure_code, procedure_name,
           scheduled_at, note, source, created_at, deleted_at
    FROM accessions
    WHERE ${whereClause}
    ORDER BY created_at DESC, id DESC
    LIMIT ?
  `;

  const result = await db
    .prepare(query)
    .bind(...bindings)
    .all<AccessionRecord>();

  const rows = result.results ?? [];
  const hasMore = rows.length > limit;
  const items = hasMore ? rows.slice(0, limit) : rows;

  // Build next cursor from the last item in the page
  let nextCursor: string | null = null;
  if (hasMore && items.length > 0) {
    const lastItem = items[items.length - 1]!;
    nextCursor = encodeCursor({
      createdAt: lastItem.created_at,
      id: lastItem.id,
    });
  }

  return {
    items,
    next_cursor: nextCursor,
    has_more: hasMore,
  };
}

// ─── Patch ───────────────────────────────────────────────────────────────────

/**
 * Partially updates an accession record and writes an audit log entry
 * in the same atomic `db.batch()` call.
 *
 * Requirements: 5.2, 7A.1, 7A.2, 7A.3, 7A.4
 *
 * @param db - D1Database binding (primary, for writes)
 * @param tenantId - Tenant identifier (mandatory filter)
 * @param accessionNumber - The accession number to update
 * @param changes - Object with field names and new values (only allowed fields)
 * @param actor - User ID or service name from JWT (sub claim)
 * @returns The updated accession record, or null if not found
 * @throws ImmutableFieldError if changes contain immutable fields
 */
export async function patchAccession(
  db: D1Database,
  tenantId: string,
  accessionNumber: string,
  changes: Record<string, unknown>,
  actor: string,
): Promise<AccessionRecord | null> {
  // Validate: reject immutable fields
  const immutableAttempts = Object.keys(changes).filter((key) =>
    IMMUTABLE_FIELDS.has(key),
  );
  if (immutableAttempts.length > 0) {
    throw new ImmutableFieldError(immutableAttempts);
  }

  // Filter to only allowed fields
  const allowedChanges: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(changes)) {
    if (ALLOWED_PATCH_FIELDS.has(key)) {
      allowedChanges[key] = value;
    }
  }

  // Nothing to update
  if (Object.keys(allowedChanges).length === 0) {
    // Still return the current record
    const result = await getAccession(db, tenantId, accessionNumber, false);
    return result.found ? result.record! : null;
  }

  // First, fetch the existing record to get its ID and verify it exists
  const existing = await getAccession(db, tenantId, accessionNumber, false);
  if (!existing.found || !existing.record) {
    return null;
  }

  // Build dynamic UPDATE statement
  const setClauses: string[] = [];
  const updateBindings: unknown[] = [];

  for (const [key, value] of Object.entries(allowedChanges)) {
    setClauses.push(`${key} = ?`);
    updateBindings.push(value ?? null);
  }

  // Add WHERE bindings
  updateBindings.push(tenantId, accessionNumber);

  const updateStmt = db
    .prepare(
      `UPDATE accessions
       SET ${setClauses.join(', ')}
       WHERE tenant_id = ? AND accession_number = ? AND deleted_at IS NULL`,
    )
    .bind(...updateBindings);

  // Create audit record
  const auditRecord: AuditRecord = {
    id: newUuidV7(),
    accession_id: existing.record.id,
    tenant_id: tenantId,
    actor,
    action: 'UPDATE',
    changes: JSON.stringify(allowedChanges),
    created_at: new Date().toISOString(),
  };

  const auditStmt = db
    .prepare(
      `INSERT INTO accession_audit
        (id, accession_id, tenant_id, actor, action, changes, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      auditRecord.id,
      auditRecord.accession_id,
      auditRecord.tenant_id,
      auditRecord.actor,
      auditRecord.action,
      auditRecord.changes,
      auditRecord.created_at,
    );

  // Execute both in a single batch for atomicity
  await db.batch([updateStmt, auditStmt]);

  // Return the updated record
  const updated = await getAccession(db, tenantId, accessionNumber, false);
  return updated.found ? updated.record! : null;
}

// ─── Soft Delete ─────────────────────────────────────────────────────────────

/**
 * Soft-deletes an accession by setting `deleted_at` and writing an audit entry.
 * Both operations are performed in a single `db.batch()` for atomicity.
 *
 * Requirements: 5.2, 7A.4, 7A.5
 *
 * @param db - D1Database binding (primary, for writes)
 * @param tenantId - Tenant identifier (mandatory filter)
 * @param accessionNumber - The accession number to soft-delete
 * @param actor - User ID or service name from JWT (sub claim)
 * @returns true if the record was soft-deleted, false if not found
 */
export async function softDeleteAccession(
  db: D1Database,
  tenantId: string,
  accessionNumber: string,
  actor: string,
): Promise<boolean> {
  // Fetch the existing record to get its ID and verify it exists
  const existing = await getAccession(db, tenantId, accessionNumber, false);
  if (!existing.found || !existing.record) {
    return false;
  }

  const now = new Date().toISOString();

  const deleteStmt = db
    .prepare(
      `UPDATE accessions
       SET deleted_at = ?
       WHERE tenant_id = ? AND accession_number = ? AND deleted_at IS NULL`,
    )
    .bind(now, tenantId, accessionNumber);

  // Create audit record for the deletion
  const auditRecord: AuditRecord = {
    id: newUuidV7(),
    accession_id: existing.record.id,
    tenant_id: tenantId,
    actor,
    action: 'DELETE',
    changes: JSON.stringify({ deleted_at: now }),
    created_at: now,
  };

  const auditStmt = db
    .prepare(
      `INSERT INTO accession_audit
        (id, accession_id, tenant_id, actor, action, changes, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      auditRecord.id,
      auditRecord.accession_id,
      auditRecord.tenant_id,
      auditRecord.actor,
      auditRecord.action,
      auditRecord.changes,
      auditRecord.created_at,
    );

  // Execute both in a single batch for atomicity
  await db.batch([deleteStmt, auditStmt]);

  return true;
}
