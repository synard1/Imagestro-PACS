/**
 * Batch accession creation route — POST /api/accessions/batch
 *
 * Validates array 1–20, rejects duplicate procedure_code,
 * groups by counter scope, reserves consecutive sequence numbers,
 * persists atomically, and enqueues MWL calls.
 *
 * Requirements: 16.1-16.11, 17.9
 */

import { Hono } from 'hono';
import type { Env, TenantContext, Modality } from '../types';
import type { AccessionRecord } from '../models/accession';
import type { AccessionConfig } from '../models/config';
import { DEFAULT_ACCESSION_CONFIG } from '../models/config';
import {
  renderAccessionNumber,
  computeCounterScope,
  computeDateBucket,
} from '../services/accession-generator';
import { incrementCounter } from '../services/sequence-counter-do';
import {
  checkIdempotency,
  computeBatchRequestHash,
  validateIdempotencyKey,
  type IdempotencyRecord,
} from '../services/idempotency';
import { createBatchAccessions } from '../services/accession-repository';
import { sendToMwlWriter } from '../services/mwl-writer';
import { validateBatchInput } from '../validators/batch-input';
import { validateExternalAccessionNumber } from '../validators/external-accession';
import { newUuidV7 } from '../utils/uuid';
import {
  ValidationError,
  IdempotencyConflictError,
} from '../errors';
import { createShadowResponse } from '../middleware/shadow-mode';
import type { D1Logger } from '../../../shared/logger';

type Variables = { tenant: TenantContext; shadowMode: boolean; logger: D1Logger };

const batchRoutes = new Hono<{ Bindings: Env; Variables: Variables }>();

batchRoutes.post('/api/accessions/batch', async (c) => {
  const tenant = c.get('tenant');
  const env = c.env;
  const requestId = c.req.header('X-Request-ID') || newUuidV7();

  // 1. Validate batch input
  const body = await c.req.json();
  const validation = validateBatchInput(body);
  if (!validation.success) {
    return c.json(
      { error: 'Validation failed', errors: validation.errors },
      400,
    );
  }

  const procedures = validation.data!.procedures;

  // 2. Idempotency check
  const idempotencyKey = c.req.header('X-Idempotency-Key');
  if (idempotencyKey) {
    const keyValidation = validateIdempotencyKey(idempotencyKey);
    if (!keyValidation.valid) {
      throw new ValidationError([{ message: keyValidation.error! }]);
    }

    const requestHash = await computeBatchRequestHash(procedures);
    const idempotencyCheck = await checkIdempotency(
      env.DB,
      tenant.tenantId,
      idempotencyKey,
      requestHash,
    );

    if (idempotencyCheck.status === 'hit') {
      return c.json(JSON.parse(idempotencyCheck.record!.payload), 200);
    }
    if (idempotencyCheck.status === 'conflict') {
      throw new IdempotencyConflictError(idempotencyKey);
    }
  }

  // 3. Load tenant config
  const config = await loadTenantConfig(env.DB, tenant.tenantId);
  const facilityCode = env.FACILITY_CODE || tenant.facilityCode || '';

  // 4. Group procedures by counter scope
  const now = new Date();
  const dateBucket = computeDateBucket(config.counter_reset_policy, now, config.timezone);

  // Separate internal (need counter) vs external (pre-supplied number)
  const internalIndices: number[] = [];
  const externalIndices: number[] = [];

  for (let i = 0; i < procedures.length; i++) {
    if (procedures[i]!.accession_number) {
      externalIndices.push(i);
    } else {
      internalIndices.push(i);
    }
  }

  // Group internal procedures by counter scope
  const scopeGroups = new Map<string, { scope: ReturnType<typeof computeCounterScope>; indices: number[] }>();

  for (const i of internalIndices) {
    const proc = procedures[i]!;
    const scope = computeCounterScope(
      tenant.tenantId,
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

  // 5. Reserve sequence numbers per scope
  const sequenceNumbers: (number | null)[] = new Array(procedures.length).fill(null);

  for (const [, group] of scopeGroups) {
    const count = group.indices.length;
    const result = await incrementCounter(env, config, group.scope, count);
    for (let i = 0; i < group.indices.length; i++) {
      sequenceNumbers[group.indices[i]!] = result.startValue + i;
    }
  }

  // 6. Build accession records
  const records: AccessionRecord[] = [];
  const accessionResults: Array<{ id: string; accession_number: string; issuer: string; modality: string; procedure_code: string }> = [];

  for (let i = 0; i < procedures.length; i++) {
    const proc = procedures[i]!;
    const procFacilityCode = proc.facility_code || facilityCode;
    let accessionNumber: string;
    let source: 'internal' | 'external';

    if (proc.accession_number) {
      // Validate external number
      const extVal = validateExternalAccessionNumber(proc.accession_number);
      if (!extVal.valid) {
        throw new ValidationError([{ field: `procedures[${i}].accession_number`, message: extVal.error! }]);
      }
      accessionNumber = proc.accession_number;
      source = 'external';
    } else {
      accessionNumber = renderAccessionNumber({
        config,
        modality: proc.modality,
        facilityCode: procFacilityCode,
        tenantId: tenant.tenantId,
        sequenceNumber: sequenceNumbers[i]!,
        date: now,
      });
      source = 'internal';
    }

    const issuer = `http://sys-ids.kemkes.go.id/acsn/${proc.patient_national_id}|${accessionNumber}`;
    const id = newUuidV7();

    const record: AccessionRecord = {
      id,
      tenant_id: tenant.tenantId,
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
      created_at: now.toISOString(),
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

  // 7. Persist atomically
  const batchResponse = { accessions: accessionResults };

  // ── Shadow Mode Check ──────────────────────────────────────────────────────
  // If shadow mode is active, return 202 with the would-be response without
  // persisting to D1 or triggering MWL side effects (Req 13.2, 13.3, 13.6)
  const isShadow = c.get('shadowMode');
  if (isShadow) {
    return createShadowResponse(batchResponse);
  }

  const idempotencyRecord: IdempotencyRecord | undefined = idempotencyKey
    ? {
        key: idempotencyKey,
        tenantId: tenant.tenantId,
        accessionId: records[0]!.id,
        requestHash: await computeBatchRequestHash(procedures),
        payloadType: 'batch',
        payload: JSON.stringify(batchResponse),
        createdAt: now.toISOString(),
        expiresAt: new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString(),
      }
    : undefined;

  await createBatchAccessions(env.DB, records, idempotencyRecord);

  // D1 audit emission — batch accession number generation (Req 4.5, 6.5)
  const logger = c.get('logger') as D1Logger;
  for (const result of accessionResults) {
    logger.audit({
      action: 'ACCESSION_GENERATE',
      resource_type: 'accession',
      resource_id: result.id,
      changes: {
        before: null,
        after: { accession_number: result.accession_number, source: 'batch', modality: result.modality },
      },
    });
  }

  // 8. Enqueue MWL calls
  if (env.ENABLE_MWL === 'true') {
    for (const record of records) {
      c.executionCtx.waitUntil(
        sendToMwlWriter(env, {
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
        }, requestId),
      );
    }
  }

  c.header('X-Request-ID', requestId);
  return c.json(batchResponse, 201);
});

async function loadTenantConfig(db: D1Database, tenantId: string): Promise<AccessionConfig> {
  const row = await db
    .prepare(`SELECT value FROM tenant_settings WHERE tenant_id = ? AND key = 'accession_config'`)
    .bind(tenantId)
    .first<{ value: string }>();

  if (!row) return DEFAULT_ACCESSION_CONFIG;
  try {
    return { ...DEFAULT_ACCESSION_CONFIG, ...JSON.parse(row.value) };
  } catch {
    return DEFAULT_ACCESSION_CONFIG;
  }
}

export { batchRoutes };
export default batchRoutes;
