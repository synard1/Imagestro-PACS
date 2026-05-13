/**
 * Legacy accession endpoints for backward compatibility with existing consumers
 * (order-management, pacs-service).
 *
 * - POST /accession/create — Flat format input, returns { id, accession_number, issuer }
 * - POST /accession/batch  — Batch flat format input, returns { accessions: [...] }
 *
 * These endpoints share the same normalization layer and underlying services as
 * the nested-format routes (POST /api/accessions, POST /api/accessions/batch).
 *
 * Requirements: 1.2, 10.2, 10.4, 10.6, 10.7, 16.10
 */

import { Hono } from 'hono';
import type { Env, Modality } from '../types';
import { parseFlatFormat } from '../validators/accession-input';
import { validateBatchInput } from '../validators/batch-input';
import {
  renderAccessionNumber,
  computeCounterScope,
  computeDateBucket,
} from '../services/accession-generator';
import { incrementCounter } from '../services/sequence-counter-do';
import {
  checkIdempotency,
  computeRequestHash,
  computeBatchRequestHash,
  validateIdempotencyKey,
} from '../services/idempotency';
import {
  createAccession,
  createBatchAccessions,
} from '../services/accession-repository';
import { sendToMwlWriter } from '../services/mwl-writer';
import { DEFAULT_ACCESSION_CONFIG } from '../models/config';
import type { AccessionConfig } from '../models/config';
import type { AccessionRecord } from '../models/accession';
import type { IdempotencyRecord } from '../services/idempotency';
import { newUuidV7 } from '../utils/uuid';
import {
  ValidationError,
  IdempotencyConflictError,
  DuplicateAccessionError,
} from '../errors';
import { createShadowResponse } from '../middleware/shadow-mode';

const legacyRoutes = new Hono<{ Bindings: Env }>();

// ─── POST /accession/create ──────────────────────────────────────────────────

legacyRoutes.post('/accession/create', async (c) => {
  const body = await c.req.json();
  const tenantId = c.req.header('X-Tenant-ID') ?? '';
  const requestId = c.req.header('X-Request-ID') ?? newUuidV7();

  // Step 1: Validate and normalize flat format input
  const validation = parseFlatFormat(body);
  if (!validation.success) {
    throw new ValidationError(validation.errors);
  }

  const input = validation.data;
  const facilityCode = input.facilityCode || c.env.FACILITY_CODE || '';

  // Step 2: Idempotency check
  const idempotencyKey = c.req.header('X-Idempotency-Key');
  if (idempotencyKey) {
    const keyValidation = validateIdempotencyKey(idempotencyKey);
    if (!keyValidation.valid) {
      throw new ValidationError([{ message: keyValidation.error! }]);
    }

    const requestHash = await computeRequestHash(
      input.modality,
      input.patientNationalId,
    );
    const idempotencyCheck = await checkIdempotency(
      c.env.DB,
      tenantId,
      idempotencyKey,
      requestHash,
    );

    if (idempotencyCheck.status === 'hit') {
      const cached = JSON.parse(idempotencyCheck.record!.payload);
      return c.json(cached, 200);
    }

    if (idempotencyCheck.status === 'conflict') {
      throw new IdempotencyConflictError(idempotencyKey);
    }
  }

  // Step 3: Load tenant config (default if absent)
  const config = await loadTenantConfig(c.env.DB, tenantId);

  // Step 4: Handle external accession number (SIMRS-supplied)
  if (input.accessionNumber) {
    const record = buildAccessionRecord({
      tenantId,
      accessionNumber: input.accessionNumber,
      facilityCode,
      input,
      source: 'external',
    });

    // Shadow mode check (Req 13.2, 13.3, 13.6)
    const isShadow = (c as any).get('shadowMode');
    if (isShadow) {
      return createShadowResponse({
        id: record.id,
        accession_number: record.accession_number,
        issuer: record.issuer,
      });
    }

    const idempotencyRecord = idempotencyKey
      ? await buildIdempotencyRecord(tenantId, idempotencyKey, record, input)
      : undefined;

    try {
      await createAccession(c.env.DB, record, idempotencyRecord);
    } catch (err: unknown) {
      if (isDuplicateError(err)) {
        throw new DuplicateAccessionError(input.accessionNumber);
      }
      throw err;
    }

    const response = {
      id: record.id,
      accession_number: record.accession_number,
      issuer: record.issuer,
    };

    // Trigger MWL asynchronously
    triggerMwl(c, record, requestId);

    return c.json(response, 201);
  }

  // Step 5: Generate accession number (internal)
  const dateBucket = computeDateBucket(
    config.counter_reset_policy,
    new Date(),
    config.timezone,
  );

  const scope = computeCounterScope(
    tenantId,
    facilityCode,
    input.modality,
    dateBucket,
    config.useModalityInSeqScope ?? false,
  );

  const counterResult = await incrementCounter(c.env, config, scope);

  const accessionNumber = renderAccessionNumber({
    config,
    modality: input.modality,
    facilityCode,
    tenantId,
    sequenceNumber: counterResult.startValue,
  });

  const record = buildAccessionRecord({
    tenantId,
    accessionNumber,
    facilityCode,
    input,
    source: 'internal',
  });

  // Shadow mode check (Req 13.2, 13.3, 13.6)
  const isShadow = (c as any).get('shadowMode');
  if (isShadow) {
    return createShadowResponse({
      id: record.id,
      accession_number: record.accession_number,
      issuer: record.issuer,
    });
  }

  const idempotencyRecord = idempotencyKey
    ? await buildIdempotencyRecord(tenantId, idempotencyKey, record, input)
    : undefined;

  try {
    await createAccession(c.env.DB, record, idempotencyRecord);
  } catch (err: unknown) {
    if (isDuplicateError(err)) {
      throw new DuplicateAccessionError(accessionNumber);
    }
    throw err;
  }

  const response = {
    id: record.id,
    accession_number: record.accession_number,
    issuer: record.issuer,
  };

  // Trigger MWL asynchronously
  triggerMwl(c, record, requestId);

  return c.json(response, 201);
});

// ─── POST /accession/batch ───────────────────────────────────────────────────

legacyRoutes.post('/accession/batch', async (c) => {
  const body = await c.req.json();
  const tenantId = c.req.header('X-Tenant-ID') ?? '';
  const requestId = c.req.header('X-Request-ID') ?? newUuidV7();

  // Step 1: Validate batch input
  const validation = validateBatchInput(body);
  if (!validation.success) {
    return c.json(
      {
        error: 'Validation failed',
        errors: validation.errors,
      },
      400,
    );
  }

  const procedures = validation.data!.procedures;

  // Step 2: Idempotency check
  const idempotencyKey = c.req.header('X-Idempotency-Key');
  if (idempotencyKey) {
    const keyValidation = validateIdempotencyKey(idempotencyKey);
    if (!keyValidation.valid) {
      throw new ValidationError([{ message: keyValidation.error! }]);
    }

    const requestHash = await computeBatchRequestHash(procedures);
    const idempotencyCheck = await checkIdempotency(
      c.env.DB,
      tenantId,
      idempotencyKey,
      requestHash,
    );

    if (idempotencyCheck.status === 'hit') {
      const cached = JSON.parse(idempotencyCheck.record!.payload);
      return c.json(cached, 200);
    }

    if (idempotencyCheck.status === 'conflict') {
      throw new IdempotencyConflictError(idempotencyKey);
    }
  }

  // Step 3: Load tenant config
  const config = await loadTenantConfig(c.env.DB, tenantId);
  const facilityCode = c.env.FACILITY_CODE || '';

  // Step 4: Group procedures by counter scope and reserve sequence numbers
  const now = new Date();
  const dateBucket = computeDateBucket(
    config.counter_reset_policy,
    now,
    config.timezone,
  );

  // Group procedures by their counter scope key
  const scopeGroups = new Map<
    string,
    { scope: ReturnType<typeof computeCounterScope>; indices: number[] }
  >();

  for (let i = 0; i < procedures.length; i++) {
    const proc = procedures[i]!;
    const scope = computeCounterScope(
      tenantId,
      proc.facility_code || facilityCode,
      proc.modality,
      dateBucket,
      config.useModalityInSeqScope ?? false,
    );
    const key = `${scope.tenantId}|${scope.facilityCode}|${scope.modality}|${scope.dateBucket}`;

    if (!scopeGroups.has(key)) {
      scopeGroups.set(key, { scope, indices: [] });
    }
    scopeGroups.get(key)!.indices.push(i);
  }

  // Reserve sequence numbers for each scope group
  const sequenceNumbers: number[] = new Array(procedures.length);

  for (const [, group] of scopeGroups) {
    const count = group.indices.length;
    const result = await incrementCounter(c.env, config, group.scope, count);

    // Assign consecutive sequence numbers to each procedure in this group
    for (let i = 0; i < group.indices.length; i++) {
      sequenceNumbers[group.indices[i]!] = result.startValue + i;
    }
  }

  // Step 5: Build accession records
  const records: AccessionRecord[] = [];
  const accessionResults: Array<{
    id: string;
    accession_number: string;
    issuer: string;
    modality: string;
    procedure_code: string;
  }> = [];

  for (let i = 0; i < procedures.length; i++) {
    const proc = procedures[i]!;
    const procFacilityCode = proc.facility_code || facilityCode;

    let accessionNumber: string;
    let source: 'internal' | 'external';

    if (proc.accession_number) {
      // External accession number
      accessionNumber = proc.accession_number;
      source = 'external';
    } else {
      // Generate accession number
      accessionNumber = renderAccessionNumber({
        config,
        modality: proc.modality,
        facilityCode: procFacilityCode,
        tenantId,
        sequenceNumber: sequenceNumbers[i]!,
      });
      source = 'internal';
    }

    const issuer = `http://sys-ids.kemkes.go.id/acsn/${proc.patient_national_id}|${accessionNumber}`;
    const id = newUuidV7();
    const createdAt = now.toISOString();

    const record: AccessionRecord = {
      id,
      tenant_id: tenantId,
      accession_number: accessionNumber,
      issuer,
      facility_code: procFacilityCode || null,
      modality: proc.modality as Modality,
      patient_national_id: proc.patient_national_id,
      patient_name: proc.patient_name,
      patient_ihs_number: proc.patient_ihs_number || null,
      patient_birth_date: proc.patient_birth_date || null,
      patient_sex: (proc.patient_sex as AccessionRecord['patient_sex']) || null,
      medical_record_number: proc.medical_record_number || null,
      procedure_code: proc.procedure_code || null,
      procedure_name: proc.procedure_name || null,
      scheduled_at: proc.scheduled_at || null,
      note: proc.note || null,
      source,
      created_at: createdAt,
      deleted_at: null,
    };

    records.push(record);
    accessionResults.push({
      id,
      accession_number: accessionNumber,
      issuer,
      modality: proc.modality,
      procedure_code: proc.procedure_code,
    });
  }

  // Step 6: Persist all records atomically
  const batchResponse = { accessions: accessionResults };

  // Shadow mode check (Req 13.2, 13.3, 13.6)
  const isShadowBatch = (c as any).get('shadowMode');
  if (isShadowBatch) {
    return createShadowResponse(batchResponse);
  }

  const idempotencyRecord: IdempotencyRecord | undefined = idempotencyKey
    ? {
        key: idempotencyKey,
        tenantId,
        accessionId: records[0]!.id, // Use first record's ID as batch reference
        requestHash: await computeBatchRequestHash(procedures),
        payloadType: 'batch',
        payload: JSON.stringify(batchResponse),
        createdAt: now.toISOString(),
        expiresAt: new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString(),
      }
    : undefined;

  await createBatchAccessions(c.env.DB, records, idempotencyRecord);

  // Step 7: Trigger MWL for each accession asynchronously
  if (c.env.ENABLE_MWL === 'true') {
    for (const record of records) {
      c.executionCtx.waitUntil(
        sendToMwlWriter(
          c.env,
          {
            accession_number: record.accession_number,
            patient_national_id: record.patient_national_id,
            patient_name: record.patient_name,
            patient_ihs_number: record.patient_ihs_number ?? undefined,
            patient_birth_date: record.patient_birth_date ?? undefined,
            patient_sex: record.patient_sex ?? undefined,
            modality: record.modality,
            procedure_code: record.procedure_code ?? undefined,
            procedure_name: record.procedure_name ?? undefined,
            scheduled_at: record.scheduled_at ?? undefined,
          },
          requestId,
        ),
      );
    }
  }

  return c.json(batchResponse, 201);
});

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Loads the tenant's accession configuration from the tenant_settings table.
 * Falls back to DEFAULT_ACCESSION_CONFIG if no config is stored.
 */
async function loadTenantConfig(
  db: D1Database,
  tenantId: string,
): Promise<AccessionConfig> {
  const row = await db
    .prepare(
      `SELECT value FROM tenant_settings WHERE tenant_id = ? AND key = 'accession_config'`,
    )
    .bind(tenantId)
    .first<{ value: string }>();

  if (!row) {
    return DEFAULT_ACCESSION_CONFIG;
  }

  try {
    const parsed = JSON.parse(row.value) as Partial<AccessionConfig>;
    return {
      ...DEFAULT_ACCESSION_CONFIG,
      ...parsed,
    };
  } catch {
    return DEFAULT_ACCESSION_CONFIG;
  }
}

/**
 * Builds an AccessionRecord from normalized input.
 */
function buildAccessionRecord(params: {
  tenantId: string;
  accessionNumber: string;
  facilityCode: string;
  input: {
    patientNationalId: string;
    patientName: string;
    patientIhsNumber?: string;
    patientBirthDate?: string;
    patientSex?: string;
    medicalRecordNumber?: string;
    modality: string;
    procedureCode?: string;
    procedureName?: string;
    scheduledAt?: string;
    note?: string;
  };
  source: 'internal' | 'external';
}): AccessionRecord {
  const { tenantId, accessionNumber, facilityCode, input, source } = params;
  const issuer = `http://sys-ids.kemkes.go.id/acsn/${input.patientNationalId}|${accessionNumber}`;

  return {
    id: newUuidV7(),
    tenant_id: tenantId,
    accession_number: accessionNumber,
    issuer,
    facility_code: facilityCode || null,
    modality: input.modality as Modality,
    patient_national_id: input.patientNationalId,
    patient_name: input.patientName,
    patient_ihs_number: input.patientIhsNumber || null,
    patient_birth_date: input.patientBirthDate || null,
    patient_sex: (input.patientSex as AccessionRecord['patient_sex']) || null,
    medical_record_number: input.medicalRecordNumber || null,
    procedure_code: input.procedureCode || null,
    procedure_name: input.procedureName || null,
    scheduled_at: input.scheduledAt || null,
    note: input.note || null,
    source,
    created_at: new Date().toISOString(),
    deleted_at: null,
  };
}

/**
 * Builds an IdempotencyRecord for a single accession creation.
 */
async function buildIdempotencyRecord(
  tenantId: string,
  key: string,
  record: AccessionRecord,
  input: { modality: string; patientNationalId: string },
): Promise<IdempotencyRecord> {
  const now = new Date();
  return {
    key,
    tenantId,
    accessionId: record.id,
    requestHash: await computeRequestHash(input.modality, input.patientNationalId),
    payloadType: 'single',
    payload: JSON.stringify({
      id: record.id,
      accession_number: record.accession_number,
      issuer: record.issuer,
    }),
    createdAt: now.toISOString(),
    expiresAt: new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString(),
  };
}

/**
 * Triggers MWL Writer asynchronously via ctx.waitUntil().
 */
function triggerMwl(
  c: { env: Env; executionCtx: ExecutionContext },
  record: AccessionRecord,
  requestId: string,
): void {
  if (c.env.ENABLE_MWL === 'true') {
    c.executionCtx.waitUntil(
      sendToMwlWriter(
        c.env,
        {
          accession_number: record.accession_number,
          patient_national_id: record.patient_national_id,
          patient_name: record.patient_name,
          patient_ihs_number: record.patient_ihs_number ?? undefined,
          patient_birth_date: record.patient_birth_date ?? undefined,
          patient_sex: record.patient_sex ?? undefined,
          modality: record.modality,
          procedure_code: record.procedure_code ?? undefined,
          procedure_name: record.procedure_name ?? undefined,
          scheduled_at: record.scheduled_at ?? undefined,
        },
        requestId,
      ),
    );
  }
}

/**
 * Checks if a D1 error is a UNIQUE constraint violation (duplicate accession).
 */
function isDuplicateError(err: unknown): boolean {
  const msg = String((err as Error)?.message ?? '').toLowerCase();
  return msg.includes('unique') || msg.includes('constraint');
}

export { legacyRoutes };
export default legacyRoutes;
