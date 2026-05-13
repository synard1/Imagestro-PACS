/**
 * Integration test: Shadow mode.
 *
 * Tests SHADOW_MODE global, CANARY_TENANT_IDS cohort routing,
 * GETs never shadowed, no D1 mutation, and MWL suppression.
 *
 * Uses the full Hono app with middleware chain to test shadow mode behavior
 * at the integration level, with controlled env bindings.
 *
 * Requirements: 13.2, 13.3, 13.6, 13.8, 13.9
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { Hono } from 'hono';
import { shadowModeMiddleware, createShadowResponse } from '../../src/middleware/shadow-mode';
import { authMiddleware } from '../../src/middleware/auth';
import type { Env, TenantContext } from '../../src/types';

// ─── Test App Setup ──────────────────────────────────────────────────────────
// Creates a minimal Hono app with the full middleware chain relevant to shadow mode:
// auth → shadow-mode → route handlers
// Route handlers check `shadowMode` and respond accordingly.

interface AppVariables {
  tenant: TenantContext;
  shadowMode: boolean;
}

/**
 * Tracks D1 mutations and MWL calls for assertion purposes.
 */
interface SideEffectTracker {
  d1Writes: Array<{ table: string; data: Record<string, unknown> }>;
  mwlCalls: Array<Record<string, unknown>>;
}

function createTestApp(envOverrides: Partial<Env> = {}) {
  const tracker: SideEffectTracker = { d1Writes: [], mwlCalls: [] };

  const app = new Hono<{
    Bindings: Env;
    Variables: AppVariables;
  }>();

  // Auth middleware (simplified: trust X-Tenant-ID as Service Binding)
  app.use('*', authMiddleware);

  // Shadow mode middleware
  app.use('*', shadowModeMiddleware);

  // ─── Route Handlers ──────────────────────────────────────────────────────

  // GET /healthz — always passes through
  app.get('/healthz', (c) => {
    return c.json({ status: 'ok', timestamp: new Date().toISOString() });
  });

  // GET /api/accessions — list (never shadowed)
  app.get('/api/accessions', (c) => {
    return c.json({ data: [], next_cursor: null });
  });

  // GET /api/accessions/:accession_number — get single (never shadowed)
  app.get('/api/accessions/:accession_number', (c) => {
    return c.json({ error: 'Accession not found' }, 404);
  });

  // POST /api/accessions — create (shadow mode intercepts)
  app.post('/api/accessions', async (c) => {
    const isShadow = c.get('shadowMode');

    // Simulate validation
    const body = await c.req.json();
    if (!body?.patient?.id || !body?.modality) {
      return c.json({ error: 'Validation failed' }, 400);
    }

    if (isShadow) {
      // Shadow mode: return 202 without D1 writes or MWL calls
      const wouldRespond = {
        id: 'shadow-uuid-001',
        accession_number: 'RS01-20250120-0001',
        issuer: `http://sys-ids.kemkes.go.id/acsn/${body.patient.id}|RS01-20250120-0001`,
        facility: 'RS01',
        source: 'internal',
      };
      return createShadowResponse(wouldRespond);
    }

    // Real mode: write to D1 and trigger MWL
    tracker.d1Writes.push({
      table: 'accessions',
      data: { patient_id: body.patient.id, modality: body.modality },
    });

    if (c.env.ENABLE_MWL === 'true') {
      tracker.mwlCalls.push({ patient_id: body.patient.id });
    }

    return c.json(
      {
        id: 'real-uuid-001',
        accession_number: 'RS01-20250120-0001',
        issuer: `http://sys-ids.kemkes.go.id/acsn/${body.patient.id}|RS01-20250120-0001`,
        facility: 'RS01',
        source: 'internal',
      },
      201,
    );
  });

  // POST /accession/create — legacy create (shadow mode intercepts)
  app.post('/accession/create', async (c) => {
    const isShadow = c.get('shadowMode');

    const body = await c.req.json();
    if (!body?.patient_national_id || !body?.modality) {
      return c.json({ error: 'Validation failed' }, 400);
    }

    if (isShadow) {
      return createShadowResponse({
        id: 'shadow-uuid-002',
        accession_number: 'RS01-20250120-0002',
        issuer: `http://sys-ids.kemkes.go.id/acsn/${body.patient_national_id}|RS01-20250120-0002`,
      });
    }

    tracker.d1Writes.push({
      table: 'accessions',
      data: { patient_id: body.patient_national_id, modality: body.modality },
    });

    return c.json(
      {
        id: 'real-uuid-002',
        accession_number: 'RS01-20250120-0002',
        issuer: `http://sys-ids.kemkes.go.id/acsn/${body.patient_national_id}|RS01-20250120-0002`,
      },
      201,
    );
  });

  // POST /api/accessions/batch — batch create (shadow mode intercepts)
  app.post('/api/accessions/batch', async (c) => {
    const isShadow = c.get('shadowMode');

    const body = await c.req.json();
    if (!body?.procedures || !Array.isArray(body.procedures) || body.procedures.length === 0) {
      return c.json({ error: 'Validation failed' }, 400);
    }

    const accessions = body.procedures.map((proc: any, i: number) => ({
      id: `uuid-${i}`,
      accession_number: `RS01-20250120-${String(i + 1).padStart(4, '0')}`,
      issuer: `http://sys-ids.kemkes.go.id/acsn/${proc.patient_national_id}|RS01-20250120-${String(i + 1).padStart(4, '0')}`,
      modality: proc.modality,
      procedure_code: proc.procedure_code,
    }));

    if (isShadow) {
      return createShadowResponse({ accessions });
    }

    // Real mode: write to D1
    for (const proc of body.procedures) {
      tracker.d1Writes.push({
        table: 'accessions',
        data: { patient_id: proc.patient_national_id, modality: proc.modality },
      });
    }

    if (c.env.ENABLE_MWL === 'true') {
      for (const proc of body.procedures) {
        tracker.mwlCalls.push({ patient_id: proc.patient_national_id });
      }
    }

    return c.json({ accessions }, 201);
  });

  return { app, tracker };
}

function makeEnv(overrides: Partial<Env> = {}): Env {
  return {
    DB: {} as any,
    CIRCUIT_BREAKER_DO: {} as any,
    METRICS: {} as any,
    RATE_LIMIT_EVENTS: {} as any,
    CIRCUIT_EVENTS: {} as any,
    JOB_RUNS: {} as any,
    RATE_LIMITER_WRITE: {} as any,
    RATE_LIMITER_READ: {} as any,
    JWT_SECRET: 'test-secret',
    ENABLE_MWL: 'true',
    FACILITY_CODE: 'RS01',
    SHADOW_MODE: 'true',
    ...overrides,
  } as Env;
}

// ─── Valid request bodies ────────────────────────────────────────────────────

const VALID_NESTED_BODY = {
  patient: { id: '1234567890123456', name: 'Test Patient' },
  modality: 'CT',
};

const VALID_FLAT_BODY = {
  patient_national_id: '1234567890123456',
  patient_name: 'Test Patient',
  modality: 'CT',
};

const VALID_BATCH_BODY = {
  procedures: [
    { patient_national_id: '1234567890123456', patient_name: 'Test', modality: 'CT', procedure_code: 'CT-HEAD' },
    { patient_national_id: '1234567890123456', patient_name: 'Test', modality: 'MR', procedure_code: 'MR-BRAIN' },
  ],
};

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('Shadow Mode Integration', () => {
  // ─── Requirement 13.9: GET requests are NEVER shadowed ───────────────────

  describe('GETs never shadowed (Requirement 13.9)', () => {
    it('GET /api/accessions is never shadowed even when SHADOW_MODE=true', async () => {
      const { app } = createTestApp();
      const env = makeEnv({ SHADOW_MODE: 'true' });

      const res = await app.request('/api/accessions', {
        method: 'GET',
        headers: { 'X-Tenant-ID': 'test-tenant' },
      }, env);

      expect(res.status).not.toBe(202);
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body).toEqual({ data: [], next_cursor: null });
    });

    it('GET /api/accessions/:accession_number is never shadowed', async () => {
      const { app } = createTestApp();
      const env = makeEnv({ SHADOW_MODE: 'true' });

      const res = await app.request('/api/accessions/NONEXISTENT-001', {
        method: 'GET',
        headers: { 'X-Tenant-ID': 'test-tenant' },
      }, env);

      expect(res.status).not.toBe(202);
      expect(res.status).toBe(404);
    });

    it('GET /healthz is not affected by shadow mode', async () => {
      const { app } = createTestApp();
      const env = makeEnv({ SHADOW_MODE: 'true' });

      const res = await app.request('/healthz', { method: 'GET' }, env);
      expect(res.status).toBe(200);
      const body = await res.json() as { status: string };
      expect(body.status).toBe('ok');
    });

    it('GET requests pass through even when tenant is NOT in canary list', async () => {
      const { app } = createTestApp();
      const env = makeEnv({
        SHADOW_MODE: undefined,
        CANARY_TENANT_IDS: 'canary-tenant-a',
      });

      const res = await app.request('/api/accessions', {
        method: 'GET',
        headers: { 'X-Tenant-ID': 'non-canary-tenant' },
      }, env);

      expect(res.status).not.toBe(202);
      expect(res.status).toBe(200);
    });
  });

  // ─── Requirement 13.2, 13.3: SHADOW_MODE=true write interception ─────────

  describe('SHADOW_MODE=true write interception (Requirements 13.2, 13.3)', () => {
    it('POST /api/accessions returns 202 with shadow response', async () => {
      const { app } = createTestApp();
      const env = makeEnv({ SHADOW_MODE: 'true' });

      const res = await app.request('/api/accessions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Tenant-ID': 'shadow-test-tenant',
        },
        body: JSON.stringify(VALID_NESTED_BODY),
      }, env);

      expect(res.status).toBe(202);
      const body = await res.json() as { status: string; would_respond: Record<string, unknown> };
      expect(body.status).toBe('shadow');
      expect(body.would_respond).toBeDefined();
      expect(body.would_respond.accession_number).toBeDefined();
      expect(body.would_respond.issuer).toBeDefined();
      expect(body.would_respond.id).toBeDefined();
    });

    it('POST /accession/create returns 202 with shadow response (legacy endpoint)', async () => {
      const { app } = createTestApp();
      const env = makeEnv({ SHADOW_MODE: 'true' });

      const res = await app.request('/accession/create', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Tenant-ID': 'shadow-test-tenant',
        },
        body: JSON.stringify(VALID_FLAT_BODY),
      }, env);

      expect(res.status).toBe(202);
      const body = await res.json() as { status: string; would_respond: Record<string, unknown> };
      expect(body.status).toBe('shadow');
      expect(body.would_respond).toBeDefined();
    });

    it('POST /api/accessions/batch returns 202 with shadow response', async () => {
      const { app } = createTestApp();
      const env = makeEnv({ SHADOW_MODE: 'true' });

      const res = await app.request('/api/accessions/batch', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Tenant-ID': 'shadow-test-tenant',
        },
        body: JSON.stringify(VALID_BATCH_BODY),
      }, env);

      expect(res.status).toBe(202);
      const body = await res.json() as { status: string; would_respond: { accessions: unknown[] } };
      expect(body.status).toBe('shadow');
      expect(body.would_respond).toBeDefined();
      expect(body.would_respond.accessions).toHaveLength(2);
    });

    it('shadow response includes would_respond with expected payload shape', async () => {
      const { app } = createTestApp();
      const env = makeEnv({ SHADOW_MODE: 'true' });

      const res = await app.request('/api/accessions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Tenant-ID': 'shadow-test-tenant',
        },
        body: JSON.stringify(VALID_NESTED_BODY),
      }, env);

      expect(res.status).toBe(202);
      const body = await res.json() as {
        status: string;
        would_respond: {
          id: string;
          accession_number: string;
          issuer: string;
          facility?: string;
          source?: string;
        };
      };

      expect(typeof body.would_respond.id).toBe('string');
      expect(typeof body.would_respond.accession_number).toBe('string');
      expect(typeof body.would_respond.issuer).toBe('string');
      // Issuer should follow SATUSEHAT format
      expect(body.would_respond.issuer).toContain('http://sys-ids.kemkes.go.id/acsn/');
    });

    it('SHADOW_MODE=false does NOT shadow writes', async () => {
      const { app } = createTestApp();
      const env = makeEnv({ SHADOW_MODE: 'false' });

      const res = await app.request('/api/accessions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Tenant-ID': 'test-tenant',
        },
        body: JSON.stringify(VALID_NESTED_BODY),
      }, env);

      expect(res.status).toBe(201);
      const body = await res.json() as { id: string };
      expect(body.id).toBeDefined();
    });
  });

  // ─── Requirement 13.6: No D1 mutation during shadow mode ─────────────────

  describe('No D1 mutation during shadow mode (Requirement 13.6)', () => {
    it('shadow POST does not write to D1', async () => {
      const { app, tracker } = createTestApp();
      const env = makeEnv({ SHADOW_MODE: 'true' });

      const res = await app.request('/api/accessions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Tenant-ID': 'shadow-no-mutation-tenant',
        },
        body: JSON.stringify(VALID_NESTED_BODY),
      }, env);

      expect(res.status).toBe(202);
      // Verify no D1 writes occurred
      expect(tracker.d1Writes).toHaveLength(0);
    });

    it('shadow batch POST does not write to D1', async () => {
      const { app, tracker } = createTestApp();
      const env = makeEnv({ SHADOW_MODE: 'true' });

      const res = await app.request('/api/accessions/batch', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Tenant-ID': 'shadow-batch-tenant',
        },
        body: JSON.stringify(VALID_BATCH_BODY),
      }, env);

      expect(res.status).toBe(202);
      // Verify no D1 writes occurred
      expect(tracker.d1Writes).toHaveLength(0);
    });

    it('non-shadow POST DOES write to D1', async () => {
      const { app, tracker } = createTestApp();
      const env = makeEnv({ SHADOW_MODE: 'false' });

      const res = await app.request('/api/accessions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Tenant-ID': 'real-tenant',
        },
        body: JSON.stringify(VALID_NESTED_BODY),
      }, env);

      expect(res.status).toBe(201);
      // Verify D1 write occurred
      expect(tracker.d1Writes).toHaveLength(1);
      expect(tracker.d1Writes[0]!.table).toBe('accessions');
    });
  });

  // ─── Requirement 13.8: CANARY_TENANT_IDS cohort routing ──────────────────

  describe('CANARY_TENANT_IDS cohort routing (Requirement 13.8)', () => {
    it('tenant NOT in canary list gets shadowed', async () => {
      const { app, tracker } = createTestApp();
      const env = makeEnv({
        SHADOW_MODE: undefined,
        CANARY_TENANT_IDS: 'canary-tenant-a,canary-tenant-b',
      });

      const res = await app.request('/api/accessions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Tenant-ID': 'non-canary-tenant',
        },
        body: JSON.stringify(VALID_NESTED_BODY),
      }, env);

      expect(res.status).toBe(202);
      const body = await res.json() as { status: string };
      expect(body.status).toBe('shadow');
      expect(tracker.d1Writes).toHaveLength(0);
    });

    it('tenant IN canary list passes through (real processing)', async () => {
      const { app, tracker } = createTestApp();
      const env = makeEnv({
        SHADOW_MODE: undefined,
        CANARY_TENANT_IDS: 'canary-tenant-a,canary-tenant-b',
      });

      const res = await app.request('/api/accessions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Tenant-ID': 'canary-tenant-a',
        },
        body: JSON.stringify(VALID_NESTED_BODY),
      }, env);

      expect(res.status).toBe(201);
      expect(tracker.d1Writes).toHaveLength(1);
    });

    it('SHADOW_MODE=true takes precedence over canary list membership', async () => {
      const { app } = createTestApp();
      const env = makeEnv({
        SHADOW_MODE: 'true',
        CANARY_TENANT_IDS: 'canary-tenant-a',
      });

      // Even though tenant IS in canary list, SHADOW_MODE=true overrides
      const res = await app.request('/api/accessions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Tenant-ID': 'canary-tenant-a',
        },
        body: JSON.stringify(VALID_NESTED_BODY),
      }, env);

      expect(res.status).toBe(202);
      const body = await res.json() as { status: string };
      expect(body.status).toBe('shadow');
    });

    it('handles whitespace in CANARY_TENANT_IDS', async () => {
      const { app } = createTestApp();
      const env = makeEnv({
        SHADOW_MODE: undefined,
        CANARY_TENANT_IDS: ' canary-tenant-a , canary-tenant-b ',
      });

      const res = await app.request('/api/accessions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Tenant-ID': 'canary-tenant-a',
        },
        body: JSON.stringify(VALID_NESTED_BODY),
      }, env);

      // Tenant is in canary list (after trim), so real processing
      expect(res.status).toBe(201);
    });
  });

  // ─── MWL side effects suppressed ──────────────────────────────────────────

  describe('MWL side effects suppressed (Requirement 13.6)', () => {
    it('shadow mode POST does not trigger MWL writer', async () => {
      const { app, tracker } = createTestApp();
      const env = makeEnv({ SHADOW_MODE: 'true', ENABLE_MWL: 'true' });

      const res = await app.request('/api/accessions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Tenant-ID': 'mwl-shadow-tenant',
        },
        body: JSON.stringify(VALID_NESTED_BODY),
      }, env);

      expect(res.status).toBe(202);
      // MWL should NOT be called in shadow mode
      expect(tracker.mwlCalls).toHaveLength(0);
    });

    it('non-shadow POST with ENABLE_MWL=true DOES trigger MWL writer', async () => {
      const { app, tracker } = createTestApp();
      const env = makeEnv({ SHADOW_MODE: 'false', ENABLE_MWL: 'true' });

      const res = await app.request('/api/accessions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Tenant-ID': 'mwl-real-tenant',
        },
        body: JSON.stringify(VALID_NESTED_BODY),
      }, env);

      expect(res.status).toBe(201);
      // MWL should be called in real mode
      expect(tracker.mwlCalls).toHaveLength(1);
    });

    it('shadow batch POST does not trigger MWL writer', async () => {
      const { app, tracker } = createTestApp();
      const env = makeEnv({ SHADOW_MODE: 'true', ENABLE_MWL: 'true' });

      const res = await app.request('/api/accessions/batch', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Tenant-ID': 'mwl-batch-shadow-tenant',
        },
        body: JSON.stringify(VALID_BATCH_BODY),
      }, env);

      expect(res.status).toBe(202);
      expect(tracker.mwlCalls).toHaveLength(0);
    });
  });

  // ─── Validation still runs in shadow mode ──────────────────────────────────

  describe('Validation still runs in shadow mode', () => {
    it('invalid POST body still returns 400 even in shadow mode', async () => {
      const { app } = createTestApp();
      const env = makeEnv({ SHADOW_MODE: 'true' });

      const res = await app.request('/api/accessions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Tenant-ID': 'shadow-validation-tenant',
        },
        body: JSON.stringify({ invalid: true }),
      }, env);

      expect(res.status).toBe(400);
    });

    it('invalid batch body still returns 400 even in shadow mode', async () => {
      const { app } = createTestApp();
      const env = makeEnv({ SHADOW_MODE: 'true' });

      const res = await app.request('/api/accessions/batch', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Tenant-ID': 'shadow-validation-tenant',
        },
        body: JSON.stringify({ procedures: [] }),
      }, env);

      expect(res.status).toBe(400);
    });
  });
});
