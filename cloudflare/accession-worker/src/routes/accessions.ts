/**
 * Accession CRUD routes — POST / GET / PATCH / DELETE.
 *
 * POST /api/accessions — Create a new accession (internal or external number)
 * GET /api/accessions/:accession_number — Retrieve a single accession
 * GET /api/accessions — List accessions with keyset pagination and filters
 * PATCH /api/accessions/:accession_number — Partial update (allowed fields only)
 * DELETE /api/accessions/:accession_number — Soft delete (admin/data_steward only)
 *
 * Requirements: 1.1, 1.3, 1.4, 1.5, 1.6, 5.3, 7.1-7.5, 7A.1-7A.8, 9.1, 9.2, 17.1-17.8, 18.2-18.5
 */

import { Hono } from 'hono';
import type { Env, TenantContext } from '../types';
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
  computeRequestHash,
  validateIdempotencyKey,
  type IdempotencyRecord,
} from '../services/idempotency';
import {
  createAccession,
  getAccession,
  listAccessions,
  patchAccession,
  softDeleteAccession,
} from '../services/accession-repository';
import { sendToMwlWriter, type MwlPayload } from '../services/mwl-writer';
import {
  parseNestedFormat,
  type NormalizedAccessionInput,
} from '../validators/accession-input';
import { validateExternalAccessionNumber } from '../validators/external-accession';
import { parseListQuery } from '../validators/list-query';
import { newUuidV7 } from '../utils/uuid';
import {
  ValidationError,
  IdempotencyConflictError,
  DuplicateAccessionError,
  ForbiddenError,
  AppError,
} from '../errors';
import { createShadowResponse } from '../middleware/shadow-mode';
import type { D1Logger } from '../../../shared/logger';

// ─── Hono Variable Types ─────────────────────────────────────────────────────

type Variables = {
  tenant: TenantContext;
  shadowMode: boolean;
  logger: D1Logger;
};

// ─── Router ──────────────────────────────────────────────────────────────────

const accessionRoutes = new Hono<{ Bindings: Env; Variables: Variables }>();

// ─── POST /api/accessions ────────────────────────────────────────────────────

accessionRoutes.post('/api/accessions', async (c) => {
  const tenant = c.get('tenant');
  const env = c.env;
  const requestId = c.req.header('X-Request-ID') || newUuidV7();

  // 1. Parse and validate request body
  const body = await c.req.json();
  const parseResult = parseNestedFormat(body);
  if (!parseResult.success) {
    throw new ValidationError(parseResult.errors);
  }
  const input: NormalizedAccessionInput = parseResult.data;

  // 2. Check idempotency (if X-Idempotency-Key header is present)
  const idempotencyKey = c.req.header('X-Idempotency-Key');
  if (idempotencyKey !== undefined && idempotencyKey !== null) {
    const keyValidation = validateIdempotencyKey(idempotencyKey);
    if (!keyValidation.valid) {
      throw new ValidationError([{ message: keyValidation.error! }]);
    }

    const requestHash = await computeRequestHash(
      input.modality,
      input.patientNationalId,
    );
    const idempotencyResult = await checkIdempotency(
      env.DB,
      tenant.tenantId,
      idempotencyKey,
      requestHash,
    );

    if (idempotencyResult.status === 'hit') {
      // Return cached response with HTTP 200
      const cachedPayload = JSON.parse(idempotencyResult.record!.payload);
      return c.json(cachedPayload, 200);
    }

    if (idempotencyResult.status === 'conflict') {
      throw new IdempotencyConflictError(idempotencyKey);
    }
  }

  // 3. Load tenant accession config from tenant_settings
  const config = await loadTenantConfig(env.DB, tenant.tenantId);

  // 4. Determine facility code
  const facilityCode = input.facilityCode || tenant.facilityCode || env.FACILITY_CODE || '';

  // 5. Determine if external or internal accession number
  const isExternal = !!(input.accessionNumber && input.accessionNumber.trim().length > 0);
  let accessionNumber: string;
  let source: 'internal' | 'external';

  if (isExternal) {
    // Validate external accession number
    const extValidation = validateExternalAccessionNumber(input.accessionNumber!);
    if (!extValidation.valid) {
      throw new ValidationError([{ field: 'accession_number', message: extValidation.error! }]);
    }
    accessionNumber = input.accessionNumber!;
    source = 'external';
  } else {
    // 6. Compute counter scope and increment
    const now = new Date();
    const dateBucket = computeDateBucket(
      config.counter_reset_policy,
      now,
      config.timezone,
    );
    const counterScope = computeCounterScope(
      tenant.tenantId,
      facilityCode,
      input.modality,
      dateBucket,
      config.useModalityInSeqScope ?? false,
    );

    const incrementResult = await incrementCounter(env, config, counterScope);

    // 7. Render accession number
    accessionNumber = renderAccessionNumber({
      config,
      modality: input.modality,
      facilityCode,
      tenantId: tenant.tenantId,
      sequenceNumber: incrementResult.startValue,
      date: now,
    });
    source = 'internal';
  }

  // 8. Create issuer string (SATUSEHAT format)
  const issuer = `http://sys-ids.kemkes.go.id/acsn/${input.patientNationalId}|${accessionNumber}`;

  // ── Shadow Mode Check ──────────────────────────────────────────────────────
  // If shadow mode is active, return 202 with the would-be response without
  // persisting to D1 or triggering MWL side effects (Req 13.2, 13.3, 13.6)
  const isShadow = c.get('shadowMode');
  if (isShadow) {
    const wouldRespond = {
      id: newUuidV7(),
      accession_number: accessionNumber,
      issuer,
      facility: facilityCode || undefined,
      source,
    };
    return createShadowResponse(wouldRespond);
  }

  // 9. Build accession record
  const id = newUuidV7();
  const now = new Date().toISOString();
  const record: AccessionRecord = {
    id,
    tenant_id: tenant.tenantId,
    accession_number: accessionNumber,
    issuer,
    facility_code: facilityCode || null,
    modality: input.modality,
    patient_national_id: input.patientNationalId,
    patient_name: input.patientName,
    patient_ihs_number: input.patientIhsNumber || null,
    patient_birth_date: input.patientBirthDate || null,
    patient_sex: input.patientSex || null,
    medical_record_number: input.medicalRecordNumber || null,
    procedure_code: input.procedureCode || null,
    procedure_name: input.procedureName || null,
    scheduled_at: input.scheduledAt || null,
    note: input.note || null,
    source,
    created_at: now,
    deleted_at: null,
  };

  // 10. Build idempotency record (if key was provided)
  let idempotencyRecord: IdempotencyRecord | undefined;
  if (idempotencyKey) {
    const requestHash = await computeRequestHash(
      input.modality,
      input.patientNationalId,
    );
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
    const responsePayload = {
      id,
      accession_number: accessionNumber,
      issuer,
      facility: facilityCode || undefined,
      source,
    };
    idempotencyRecord = {
      key: idempotencyKey,
      tenantId: tenant.tenantId,
      accessionId: id,
      requestHash,
      payloadType: 'single',
      payload: JSON.stringify(responsePayload),
      createdAt: now,
      expiresAt,
    };
  }

  // 11. Persist via repository (atomic batch: accession + idempotency key)
  try {
    await createAccession(env.DB, record, idempotencyRecord);
  } catch (err: unknown) {
    // Handle UNIQUE constraint violation (duplicate accession number)
    if (isDuplicateError(err)) {
      throw new DuplicateAccessionError(accessionNumber);
    }
    throw err;
  }

  // 12. Enqueue MWL via ctx.waitUntil (non-blocking)
  if (env.ENABLE_MWL === 'true') {
    const mwlPayload: MwlPayload = {
      accession_number: accessionNumber,
      patient_national_id: input.patientNationalId,
      patient_name: input.patientName,
      patient_ihs_number: input.patientIhsNumber,
      patient_birth_date: input.patientBirthDate,
      patient_sex: input.patientSex,
      modality: input.modality,
      procedure_code: input.procedureCode,
      procedure_name: input.procedureName,
      scheduled_at: input.scheduledAt,
    };
    c.executionCtx.waitUntil(sendToMwlWriter(env, mwlPayload, requestId));
  }

  // 13. D1 audit emission — accession number generation (Req 4.5, 6.5)
  const logger = c.get('logger') as D1Logger;
  logger.audit({
    action: 'ACCESSION_GENERATE',
    resource_type: 'accession',
    resource_id: id,
    changes: {
      before: null,
      after: { accession_number: accessionNumber, source, modality: input.modality },
    },
  });

  // 14. Return 201 response
  const responseBody = {
    id,
    accession_number: accessionNumber,
    issuer,
    facility: facilityCode || undefined,
    source,
  };

  c.header('X-Request-ID', requestId);
  return c.json(responseBody, 201);
});

// ─── GET /api/accessions/:accession_number ───────────────────────────────────

accessionRoutes.get('/api/accessions/:accession_number', async (c) => {
  const tenant = c.get('tenant');
  const env = c.env;
  const accessionNumber = c.req.param('accession_number');
  const requestId = c.req.header('X-Request-ID') || newUuidV7();

  // Determine which DB binding to use (Req 18.2, 18.3)
  const consistency = c.req.header('X-Consistency');
  const useReplica = consistency !== 'strong';
  const db = useReplica && env.DB_READ ? env.DB_READ : env.DB;

  // Check include_deleted query param (Req 7A.7)
  const includeDeleted = c.req.query('include_deleted') === 'true';

  const result = await getAccession(db, tenant.tenantId, accessionNumber, includeDeleted);

  if (!result.found) {
    c.header('X-Request-ID', requestId);
    return c.json({ error: 'Accession not found' }, 404);
  }

  // Add replica indicator header (Req 18.4)
  c.header('X-D1-Replica', useReplica && env.DB_READ ? 'true' : 'false');
  c.header('X-Request-ID', requestId);
  return c.json(result.record, 200);
});

// ─── GET /api/accessions (list) ──────────────────────────────────────────────

accessionRoutes.get('/api/accessions', async (c) => {
  const tenant = c.get('tenant');
  const env = c.env;
  const requestId = c.req.header('X-Request-ID') || newUuidV7();

  // Determine which DB binding to use (Req 18.2)
  const consistency = c.req.header('X-Consistency');
  const useReplica = consistency !== 'strong';
  const db = useReplica && env.DB_READ ? env.DB_READ : env.DB;

  // Parse and validate query parameters
  let parsedQuery;
  try {
    const queryParams: Record<string, string | undefined> = {
      limit: c.req.query('limit'),
      cursor: c.req.query('cursor'),
      source: c.req.query('source'),
      modality: c.req.query('modality'),
      patient_national_id: c.req.query('patient_national_id'),
      from_date: c.req.query('from_date'),
      to_date: c.req.query('to_date'),
      include_deleted: c.req.query('include_deleted'),
    };
    parsedQuery = parseListQuery(queryParams);
  } catch (err: unknown) {
    if (err instanceof Error && err.message === 'Invalid cursor') {
      throw new ValidationError([{ field: 'cursor', message: 'Invalid pagination cursor' }]);
    }
    // Zod validation error
    if (err && typeof err === 'object' && 'issues' in err) {
      const zodErr = err as { issues: Array<{ path: (string | number)[]; message: string }> };
      const errors = zodErr.issues.map((issue) => ({
        field: issue.path.join('.') || undefined,
        message: issue.message,
      }));
      throw new ValidationError(errors);
    }
    throw err;
  }

  // Execute list query
  const result = await listAccessions(
    db,
    tenant.tenantId,
    {
      source: parsedQuery.source,
      modality: parsedQuery.modality,
      patientNationalId: parsedQuery.patientNationalId,
      fromDate: parsedQuery.fromDate,
      toDate: parsedQuery.toDate,
      includeDeleted: parsedQuery.includeDeleted,
    },
    parsedQuery.cursor ?? null,
    parsedQuery.limit,
  );

  // Add replica indicator header (Req 18.4)
  c.header('X-D1-Replica', useReplica && env.DB_READ ? 'true' : 'false');
  c.header('X-Request-ID', requestId);
  return c.json(result, 200);
});

// ─── PATCH /api/accessions/:accession_number ─────────────────────────────────

accessionRoutes.patch('/api/accessions/:accession_number', async (c) => {
  const tenant = c.get('tenant');
  const env = c.env;
  const accessionNumber = c.req.param('accession_number');
  const requestId = c.req.header('X-Request-ID') || newUuidV7();

  // Parse request body
  const body = await c.req.json();
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    throw new ValidationError([{ message: 'Request body must be a JSON object' }]);
  }

  // Determine actor from JWT claims
  const actor = tenant.jwtClaims?.sub || tenant.tenantId;

  // Call patchAccession (handles immutable field rejection and audit)
  const updated = await patchAccession(
    env.DB,
    tenant.tenantId,
    accessionNumber,
    body as Record<string, unknown>,
    actor,
  );

  if (!updated) {
    c.header('X-Request-ID', requestId);
    return c.json({ error: 'Accession not found' }, 404);
  }

  c.header('X-Request-ID', requestId);
  return c.json(updated, 200);
});

// ─── DELETE /api/accessions/:accession_number ────────────────────────────────

accessionRoutes.delete('/api/accessions/:accession_number', async (c) => {
  const tenant = c.get('tenant');
  const env = c.env;
  const accessionNumber = c.req.param('accession_number');
  const requestId = c.req.header('X-Request-ID') || newUuidV7();

  // Require ?confirm=true (Req 7A.6)
  const confirm = c.req.query('confirm');
  if (confirm !== 'true') {
    c.header('X-Request-ID', requestId);
    throw new ValidationError([{
      field: 'confirm',
      message: 'DELETE requires query parameter ?confirm=true',
    }]);
  }

  // Check role: admin or data_steward required (Req 7A.8)
  const roles = tenant.roles || [];
  const hasPermission = roles.includes('admin') || roles.includes('data_steward');
  if (!hasPermission) {
    throw new ForbiddenError(
      'DELETE operations require admin or data_steward role',
    );
  }

  // Determine actor from JWT claims
  const actor = tenant.jwtClaims?.sub || tenant.tenantId;

  // Perform soft delete
  const deleted = await softDeleteAccession(
    env.DB,
    tenant.tenantId,
    accessionNumber,
    actor,
  );

  if (!deleted) {
    c.header('X-Request-ID', requestId);
    return c.json({ error: 'Accession not found' }, 404);
  }

  c.header('X-Request-ID', requestId);
  return c.body(null, 204);
});

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Loads the tenant's accession configuration from tenant_settings.
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
      pattern: parsed.pattern ?? DEFAULT_ACCESSION_CONFIG.pattern,
      counter_reset_policy:
        parsed.counter_reset_policy ?? DEFAULT_ACCESSION_CONFIG.counter_reset_policy,
      sequence_digits: parsed.sequence_digits ?? DEFAULT_ACCESSION_CONFIG.sequence_digits,
      timezone: parsed.timezone ?? DEFAULT_ACCESSION_CONFIG.timezone,
      counter_backend: parsed.counter_backend ?? DEFAULT_ACCESSION_CONFIG.counter_backend,
      orgCode: parsed.orgCode,
      siteCode: parsed.siteCode,
      useModalityInSeqScope: parsed.useModalityInSeqScope,
    };
  } catch {
    return DEFAULT_ACCESSION_CONFIG;
  }
}

/**
 * Checks if a D1 error is a UNIQUE constraint violation (duplicate accession number).
 */
function isDuplicateError(err: unknown): boolean {
  if (err instanceof Error) {
    const msg = err.message.toLowerCase();
    return msg.includes('unique') || msg.includes('constraint');
  }
  return false;
}

export { accessionRoutes };
export default accessionRoutes;
