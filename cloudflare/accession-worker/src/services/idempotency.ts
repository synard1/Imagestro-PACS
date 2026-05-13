/**
 * Idempotency key management service.
 *
 * Provides check/store operations for idempotency keys, request hash
 * computation using Web Crypto API (SHA-256), and key validation.
 *
 * Requirements: 4.1, 4.2, 4.3, 4.4, 4.5, 4.6, 4.7, 16.7
 */

// ─── Types ───────────────────────────────────────────────────────────────────

/**
 * Represents a stored idempotency record in the `idempotency_keys` table.
 */
export interface IdempotencyRecord {
  /** Client-supplied idempotency key */
  key: string;
  /** Tenant identifier */
  tenantId: string;
  /** Associated accession ID (or batch_id for batch operations) */
  accessionId: string;
  /** SHA-256 hex of the request payload signature */
  requestHash: string;
  /** Whether this is a single or batch operation */
  payloadType: 'single' | 'batch';
  /** JSON-serialized result to return on replay */
  payload: string;
  /** ISO 8601 creation timestamp */
  createdAt: string;
  /** ISO 8601 expiration timestamp (24h after creation) */
  expiresAt: string;
}

/**
 * Result of an idempotency check.
 */
export interface IdempotencyCheckResult {
  /** 'hit' = cached record found with matching hash, 'miss' = no record, 'conflict' = hash mismatch */
  status: 'hit' | 'miss' | 'conflict';
  /** The existing record (present when status is 'hit' or 'conflict') */
  record?: IdempotencyRecord;
}

/**
 * Result of idempotency key validation.
 */
export interface IdempotencyKeyValidation {
  valid: boolean;
  error?: string;
}

// ─── Constants ───────────────────────────────────────────────────────────────

/** Minimum allowed key length */
const MIN_KEY_LENGTH = 1;

/** Maximum allowed key length */
const MAX_KEY_LENGTH = 128;

/** TTL for idempotency records: 24 hours in milliseconds */
const IDEMPOTENCY_TTL_MS = 24 * 60 * 60 * 1000;

// ─── Key Validation ──────────────────────────────────────────────────────────

/**
 * Validates an idempotency key for length constraints (1-128 characters).
 *
 * Requirement 4.7: key must be between 1 and 128 characters.
 *
 * @param key - The idempotency key to validate
 * @returns Validation result with optional error message
 */
export function validateIdempotencyKey(key: string): IdempotencyKeyValidation {
  if (!key || key.length < MIN_KEY_LENGTH) {
    return {
      valid: false,
      error: `Idempotency key must be at least ${MIN_KEY_LENGTH} character(s)`,
    };
  }

  if (key.length > MAX_KEY_LENGTH) {
    return {
      valid: false,
      error: `Idempotency key must not exceed ${MAX_KEY_LENGTH} characters`,
    };
  }

  return { valid: true };
}

// ─── Request Hash Computation ────────────────────────────────────────────────

/**
 * Computes a SHA-256 hex digest of the given input string using Web Crypto API.
 *
 * @param input - The string to hash
 * @returns Hex-encoded SHA-256 digest
 */
async function sha256Hex(input: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(input);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = new Uint8Array(hashBuffer);
  return Array.from(hashArray)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * Computes the request hash for a single accession request.
 * Hash = SHA-256(modality + patient_national_id).
 *
 * Requirement 4.3: detect payload mismatch using modality + patient_national_id.
 *
 * @param modality - The modality code (e.g., "CT", "MR")
 * @param patientNationalId - The patient's national ID (NIK)
 * @returns Hex-encoded SHA-256 hash
 */
export async function computeRequestHash(
  modality: string,
  patientNationalId: string,
): Promise<string> {
  return sha256Hex(`${modality}${patientNationalId}`);
}

/**
 * Computes the request hash for a batch accession request.
 * Hash = SHA-256 of sorted batch signature (modality + patient_national_id + procedure_code per item).
 *
 * Requirement 16.7: idempotency applies to the entire batch as a unit.
 *
 * @param procedures - Array of procedure items with modality, patient_national_id, and procedure_code
 * @returns Hex-encoded SHA-256 hash
 */
export async function computeBatchRequestHash(
  procedures: Array<{
    modality: string;
    patient_national_id: string;
    procedure_code: string;
  }>,
): Promise<string> {
  // Sort by a deterministic key to ensure consistent hashing regardless of array order
  const sorted = [...procedures].sort((a, b) => {
    const keyA = `${a.modality}|${a.patient_national_id}|${a.procedure_code}`;
    const keyB = `${b.modality}|${b.patient_national_id}|${b.procedure_code}`;
    return keyA.localeCompare(keyB);
  });

  const signature = sorted
    .map((p) => `${p.modality}|${p.patient_national_id}|${p.procedure_code}`)
    .join('\n');

  return sha256Hex(signature);
}

// ─── Idempotency Check ───────────────────────────────────────────────────────

/**
 * Checks whether an idempotency key already exists for the given tenant.
 *
 * Requirements:
 * - 4.1: Look up idempotency_keys table scoped by tenant_id and key
 * - 4.2: If record exists with matching hash, return cached result (hit)
 * - 4.3: If record exists with different hash, signal conflict
 * - 4.4: Records expire after 24h (checked via expires_at)
 *
 * @param db - D1Database binding (primary)
 * @param tenantId - Tenant identifier
 * @param key - The idempotency key from X-Idempotency-Key header
 * @param requestHash - SHA-256 hash of the current request payload
 * @returns Check result: hit (cached), miss (no record), or conflict (hash mismatch)
 */
export async function checkIdempotency(
  db: D1Database,
  tenantId: string,
  key: string,
  requestHash: string,
): Promise<IdempotencyCheckResult> {
  const row = await db
    .prepare(
      `SELECT key, tenant_id, accession_id, request_hash, payload_type, payload, created_at, expires_at
       FROM idempotency_keys
       WHERE tenant_id = ? AND key = ? AND expires_at > datetime('now')`,
    )
    .bind(tenantId, key)
    .first<{
      key: string;
      tenant_id: string;
      accession_id: string;
      request_hash: string;
      payload_type: string;
      payload: string;
      created_at: string;
      expires_at: string;
    }>();

  if (!row) {
    return { status: 'miss' };
  }

  const record: IdempotencyRecord = {
    key: row.key,
    tenantId: row.tenant_id,
    accessionId: row.accession_id,
    requestHash: row.request_hash,
    payloadType: row.payload_type as 'single' | 'batch',
    payload: row.payload,
    createdAt: row.created_at,
    expiresAt: row.expires_at,
  };

  // Requirement 4.3: hash mismatch → conflict
  if (row.request_hash !== requestHash) {
    return { status: 'conflict', record };
  }

  // Requirement 4.2: matching hash → return cached result
  return { status: 'hit', record };
}

// ─── Idempotency Store ───────────────────────────────────────────────────────

/**
 * Stores an idempotency record with a 24-hour TTL.
 *
 * Requirements:
 * - 4.4: Store with 24h TTL (expires_at = createdAt + 24h)
 * - 4.6: Unique constraint on (tenant_id, key) prevents duplicates
 *
 * @param db - D1Database binding (primary)
 * @param record - The idempotency record to store
 */
export async function storeIdempotency(
  db: D1Database,
  record: IdempotencyRecord,
): Promise<void> {
  // Compute expires_at as 24h after createdAt
  const createdDate = new Date(record.createdAt);
  const expiresAt =
    record.expiresAt ||
    new Date(createdDate.getTime() + IDEMPOTENCY_TTL_MS).toISOString();

  await db
    .prepare(
      `INSERT INTO idempotency_keys
        (tenant_id, key, accession_id, request_hash, payload_type, payload, created_at, expires_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      record.tenantId,
      record.key,
      record.accessionId,
      record.requestHash,
      record.payloadType,
      record.payload,
      record.createdAt,
      expiresAt,
    )
    .run();
}
