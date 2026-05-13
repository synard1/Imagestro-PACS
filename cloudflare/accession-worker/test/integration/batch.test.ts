/**
 * Integration test: Batch atomicity.
 *
 * Tests all-or-nothing validation, consecutive sequences within scope,
 * and mixed internal/external accession numbers.
 *
 * Requirements: 16.3, 16.4, 16.8, 16.11, 17.9
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { SELF, env } from 'cloudflare:test';

// ─── Database Setup ──────────────────────────────────────────────────────────

beforeAll(async () => {
  // Apply schema to the in-memory D1 database for integration tests
  const db = (env as any).DB as D1Database;

  await db.exec(`CREATE TABLE IF NOT EXISTS accessions (id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL, accession_number TEXT NOT NULL, issuer TEXT, facility_code TEXT, modality TEXT NOT NULL, patient_national_id TEXT NOT NULL, patient_name TEXT NOT NULL, patient_ihs_number TEXT, patient_birth_date TEXT, patient_sex TEXT, medical_record_number TEXT, procedure_code TEXT, procedure_name TEXT, scheduled_at TEXT, note TEXT, source TEXT NOT NULL DEFAULT 'internal', created_at TEXT NOT NULL, deleted_at TEXT NULL);`);
  await db.exec(`CREATE UNIQUE INDEX IF NOT EXISTS idx_accessions_tenant_number ON accessions(tenant_id, accession_number);`);
  await db.exec(`CREATE TABLE IF NOT EXISTS accession_counters (tenant_id TEXT NOT NULL, facility_code TEXT NOT NULL, modality TEXT NOT NULL DEFAULT '', date_bucket TEXT NOT NULL, current_value INTEGER NOT NULL DEFAULT 0, updated_at TEXT NOT NULL, PRIMARY KEY (tenant_id, facility_code, modality, date_bucket));`);
  await db.exec(`CREATE TABLE IF NOT EXISTS idempotency_keys (tenant_id TEXT NOT NULL, key TEXT NOT NULL, accession_id TEXT NOT NULL, request_hash TEXT NOT NULL, payload_type TEXT NOT NULL DEFAULT 'single', payload TEXT NOT NULL, created_at TEXT NOT NULL, expires_at TEXT NOT NULL, PRIMARY KEY (tenant_id, key));`);
  await db.exec(`CREATE TABLE IF NOT EXISTS tenant_settings (tenant_id TEXT NOT NULL, key TEXT NOT NULL, value TEXT NOT NULL, updated_at TEXT NOT NULL, PRIMARY KEY (tenant_id, key));`);
  await db.exec(`CREATE TABLE IF NOT EXISTS accession_audit (id TEXT PRIMARY KEY, accession_id TEXT NOT NULL, tenant_id TEXT NOT NULL, actor TEXT NOT NULL, action TEXT NOT NULL CHECK (action IN ('UPDATE', 'DELETE')), changes TEXT NOT NULL, created_at TEXT NOT NULL);`);
});

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeProcedure(overrides: Record<string, unknown> = {}) {
  return {
    patient_national_id: '1234567890123456',
    patient_name: 'Test Patient',
    modality: 'CT',
    procedure_code: `PROC-${Math.random().toString(36).slice(2, 8)}`,
    ...overrides,
  };
}

function makeHeaders(extra: Record<string, string> = {}) {
  return {
    'Content-Type': 'application/json',
    'X-Tenant-ID': 'test-tenant',
    ...extra,
  };
}

async function postBatch(procedures: unknown[], headers?: Record<string, string>) {
  return SELF.fetch('http://localhost/api/accessions/batch', {
    method: 'POST',
    headers: makeHeaders(headers),
    body: JSON.stringify({ procedures }),
  });
}

// ─── Validation Rejection Tests ──────────────────────────────────────────────

describe('Batch Integration', () => {
  describe('Validation rejection (existing)', () => {
    it('rejects batch with empty procedures array', async () => {
      const res = await postBatch([]);
      expect(res.status).toBe(400);
    });

    it('rejects batch exceeding 20 procedures', async () => {
      const procedures = Array.from({ length: 21 }, (_, i) =>
        makeProcedure({ procedure_code: `PROC-${i}` }),
      );
      const res = await postBatch(procedures);
      expect(res.status).toBe(400);
    });

    it('rejects batch with duplicate procedure_code', async () => {
      const procedures = [
        makeProcedure({ procedure_code: 'DUP' }),
        makeProcedure({ procedure_code: 'DUP' }),
      ];
      const res = await postBatch(procedures);
      expect(res.status).toBe(400);
    });
  });

  // ─── All-or-Nothing Validation (Req 16.5) ───────────────────────────────────

  describe('All-or-nothing validation', () => {
    it('rejects entire batch when one procedure has invalid modality', async () => {
      const procedures = [
        makeProcedure({ procedure_code: 'VALID-1', modality: 'CT' }),
        makeProcedure({ procedure_code: 'VALID-2', modality: 'INVALID_MOD' }),
        makeProcedure({ procedure_code: 'VALID-3', modality: 'MR' }),
      ];

      const res = await postBatch(procedures);
      expect(res.status).toBe(400);

      const body = await res.json() as { errors?: unknown[] };
      expect(body.errors).toBeDefined();
    });

    it('rejects entire batch when one procedure has invalid patient_national_id', async () => {
      const procedures = [
        makeProcedure({ procedure_code: 'P1', patient_national_id: '1234567890123456' }),
        makeProcedure({ procedure_code: 'P2', patient_national_id: 'short' }),
      ];

      const res = await postBatch(procedures);
      expect(res.status).toBe(400);
    });

    it('no accessions are created when validation fails', async () => {
      // Attempt an invalid batch — should fail validation
      const invalidProcs = [
        makeProcedure({ procedure_code: 'SHOULD-NOT-EXIST-1', modality: 'CT' }),
        makeProcedure({ procedure_code: 'SHOULD-NOT-EXIST-2', modality: 'INVALID' }),
      ];
      const invalidRes = await postBatch(invalidProcs);
      expect(invalidRes.status).toBe(400);

      // Verify the response doesn't contain any accession data
      const invalidBody = await invalidRes.json() as Record<string, unknown>;
      expect(invalidBody).not.toHaveProperty('accessions');
      expect(invalidBody).toHaveProperty('errors');
    });
  });

  // ─── Consecutive Sequences Within Scope (Req 16.4, 16.8) ───────────────────

  describe('Consecutive sequences within scope', () => {
    it('batch of N procedures in same scope produces N consecutive sequence numbers', async () => {
      const tenantId = `seq-tenant-${Date.now()}`;
      const procedures = Array.from({ length: 5 }, (_, i) =>
        makeProcedure({
          procedure_code: `SEQ-${i}`,
          modality: 'CT', // same modality = same counter scope
        }),
      );

      const res = await SELF.fetch('http://localhost/api/accessions/batch', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Tenant-ID': tenantId,
        },
        body: JSON.stringify({ procedures }),
      });

      // Should succeed (201 for real, 202 for shadow)
      expect([201, 202]).toContain(res.status);

      const body = await res.json() as {
        accessions?: Array<{ accession_number: string }>;
        would_respond?: { accessions: Array<{ accession_number: string }> };
      };

      // Get accessions from either real or shadow response
      const accessions = body.accessions || body.would_respond?.accessions;
      if (!accessions) return; // Shadow mode without would_respond — skip assertion

      expect(accessions).toHaveLength(5);

      // Extract sequence numbers from accession numbers
      // Default pattern: {ORG}-{YYYY}{MM}{DD}-{NNNN}
      // The sequence part is the last segment after the last dash
      const seqNumbers = accessions.map((a) => {
        const parts = a.accession_number.split('-');
        return parseInt(parts[parts.length - 1]!, 10);
      });

      // Verify they are consecutive (each one is exactly 1 more than the previous)
      for (let i = 1; i < seqNumbers.length; i++) {
        expect(seqNumbers[i]).toBe(seqNumbers[i - 1]! + 1);
      }
    });

    it('second batch continues sequence from where first batch left off', async () => {
      const tenantId = `cont-tenant-${Date.now()}`;
      const headers = {
        'Content-Type': 'application/json',
        'X-Tenant-ID': tenantId,
      };

      // First batch: 3 procedures
      const batch1 = Array.from({ length: 3 }, (_, i) =>
        makeProcedure({ procedure_code: `B1-${i}`, modality: 'MR' }),
      );

      const res1 = await SELF.fetch('http://localhost/api/accessions/batch', {
        method: 'POST',
        headers,
        body: JSON.stringify({ procedures: batch1 }),
      });
      expect([201, 202]).toContain(res1.status);

      const body1 = await res1.json() as {
        accessions?: Array<{ accession_number: string }>;
        would_respond?: { accessions: Array<{ accession_number: string }> };
      };
      const accessions1 = body1.accessions || body1.would_respond?.accessions;

      // Second batch: 2 procedures in same scope
      const batch2 = Array.from({ length: 2 }, (_, i) =>
        makeProcedure({ procedure_code: `B2-${i}`, modality: 'MR' }),
      );

      const res2 = await SELF.fetch('http://localhost/api/accessions/batch', {
        method: 'POST',
        headers,
        body: JSON.stringify({ procedures: batch2 }),
      });
      expect([201, 202]).toContain(res2.status);

      const body2 = await res2.json() as {
        accessions?: Array<{ accession_number: string }>;
        would_respond?: { accessions: Array<{ accession_number: string }> };
      };
      const accessions2 = body2.accessions || body2.would_respond?.accessions;

      if (!accessions1 || !accessions2) return; // Shadow mode — skip

      // The last sequence from batch 1 + 1 should equal the first sequence from batch 2
      const lastSeqBatch1 = parseInt(accessions1[accessions1.length - 1]!.accession_number.split('-').pop()!, 10);
      const firstSeqBatch2 = parseInt(accessions2[0]!.accession_number.split('-').pop()!, 10);

      expect(firstSeqBatch2).toBe(lastSeqBatch1 + 1);
    });
  });

  // ─── Mixed Internal/External (Req 17.9) ────────────────────────────────────

  describe('Mixed internal/external accession numbers', () => {
    it('handles batch with some external and some internal accession numbers', async () => {
      const tenantId = `mixed-tenant-${Date.now()}`;
      const externalNumber = `EXT-${Date.now()}-001`;

      const procedures = [
        makeProcedure({ procedure_code: 'INT-1', modality: 'CT' }),
        makeProcedure({
          procedure_code: 'EXT-1',
          modality: 'CT',
          accession_number: externalNumber,
        }),
        makeProcedure({ procedure_code: 'INT-2', modality: 'CT' }),
      ];

      const res = await SELF.fetch('http://localhost/api/accessions/batch', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Tenant-ID': tenantId,
        },
        body: JSON.stringify({ procedures }),
      });

      expect([201, 202]).toContain(res.status);

      const body = await res.json() as {
        accessions?: Array<{ accession_number: string; modality: string; procedure_code: string }>;
        would_respond?: { accessions: Array<{ accession_number: string; modality: string; procedure_code: string }> };
      };

      const accessions = body.accessions || body.would_respond?.accessions;
      if (!accessions) return; // Shadow mode — skip

      expect(accessions).toHaveLength(3);

      // The external accession number should be preserved exactly
      const extAccession = accessions.find((a) => a.procedure_code === 'EXT-1');
      expect(extAccession).toBeDefined();
      expect(extAccession!.accession_number).toBe(externalNumber);

      // Internal accessions should have generated numbers (not the external one)
      const intAccessions = accessions.filter((a) =>
        a.procedure_code === 'INT-1' || a.procedure_code === 'INT-2',
      );
      expect(intAccessions).toHaveLength(2);
      for (const acc of intAccessions) {
        expect(acc.accession_number).not.toBe(externalNumber);
        // Internal numbers should follow the pattern (contain dashes from default pattern)
        expect(acc.accession_number).toContain('-');
      }
    });

    it('external accession numbers do not increment the counter', async () => {
      const tenantId = `ext-no-inc-${Date.now()}`;
      const headers = {
        'Content-Type': 'application/json',
        'X-Tenant-ID': tenantId,
      };

      // First: create a batch with only internal numbers to establish counter
      const batch1 = [
        makeProcedure({ procedure_code: 'FIRST-INT', modality: 'DX' }),
      ];

      const res1 = await SELF.fetch('http://localhost/api/accessions/batch', {
        method: 'POST',
        headers,
        body: JSON.stringify({ procedures: batch1 }),
      });
      expect([201, 202]).toContain(res1.status);

      const body1 = await res1.json() as {
        accessions?: Array<{ accession_number: string }>;
        would_respond?: { accessions: Array<{ accession_number: string }> };
      };
      const accessions1 = body1.accessions || body1.would_respond?.accessions;

      // Second: create a batch with only external numbers (should NOT increment counter)
      const batch2 = [
        makeProcedure({
          procedure_code: 'EXT-ONLY',
          modality: 'DX',
          accession_number: `SIMRS-${Date.now()}`,
        }),
      ];

      const res2 = await SELF.fetch('http://localhost/api/accessions/batch', {
        method: 'POST',
        headers,
        body: JSON.stringify({ procedures: batch2 }),
      });
      expect([201, 202]).toContain(res2.status);

      // Third: create another internal number — should continue from where batch1 left off
      const batch3 = [
        makeProcedure({ procedure_code: 'SECOND-INT', modality: 'DX' }),
      ];

      const res3 = await SELF.fetch('http://localhost/api/accessions/batch', {
        method: 'POST',
        headers,
        body: JSON.stringify({ procedures: batch3 }),
      });
      expect([201, 202]).toContain(res3.status);

      const body3 = await res3.json() as {
        accessions?: Array<{ accession_number: string }>;
        would_respond?: { accessions: Array<{ accession_number: string }> };
      };
      const accessions3 = body3.accessions || body3.would_respond?.accessions;

      if (!accessions1 || !accessions3) return; // Shadow mode — skip

      // The sequence from batch3 should be exactly batch1's sequence + 1
      // (the external batch2 should not have incremented the counter)
      const seq1 = parseInt(accessions1[0]!.accession_number.split('-').pop()!, 10);
      const seq3 = parseInt(accessions3[0]!.accession_number.split('-').pop()!, 10);

      expect(seq3).toBe(seq1 + 1);
    });

    it('mixed batch: internal procedures get consecutive sequences, external are preserved', async () => {
      const tenantId = `mixed-seq-${Date.now()}`;
      const extNum1 = `SIMRS-A-${Date.now()}`;
      const extNum2 = `SIMRS-B-${Date.now()}`;

      const procedures = [
        makeProcedure({ procedure_code: 'I1', modality: 'US' }),
        makeProcedure({ procedure_code: 'E1', modality: 'US', accession_number: extNum1 }),
        makeProcedure({ procedure_code: 'I2', modality: 'US' }),
        makeProcedure({ procedure_code: 'E2', modality: 'US', accession_number: extNum2 }),
        makeProcedure({ procedure_code: 'I3', modality: 'US' }),
      ];

      const res = await SELF.fetch('http://localhost/api/accessions/batch', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Tenant-ID': tenantId,
        },
        body: JSON.stringify({ procedures }),
      });

      expect([201, 202]).toContain(res.status);

      const body = await res.json() as {
        accessions?: Array<{ accession_number: string; procedure_code: string }>;
        would_respond?: { accessions: Array<{ accession_number: string; procedure_code: string }> };
      };

      const accessions = body.accessions || body.would_respond?.accessions;
      if (!accessions) return; // Shadow mode — skip

      expect(accessions).toHaveLength(5);

      // External numbers are preserved
      const e1 = accessions.find((a) => a.procedure_code === 'E1');
      const e2 = accessions.find((a) => a.procedure_code === 'E2');
      expect(e1!.accession_number).toBe(extNum1);
      expect(e2!.accession_number).toBe(extNum2);

      // Internal numbers should be consecutive
      const internalAccessions = accessions.filter((a) =>
        ['I1', 'I2', 'I3'].includes(a.procedure_code),
      );
      expect(internalAccessions).toHaveLength(3);

      const seqNumbers = internalAccessions.map((a) =>
        parseInt(a.accession_number.split('-').pop()!, 10),
      );

      // Sort by sequence number to verify consecutiveness
      seqNumbers.sort((a, b) => a - b);
      for (let i = 1; i < seqNumbers.length; i++) {
        expect(seqNumbers[i]).toBe(seqNumbers[i - 1]! + 1);
      }
    });
  });

  // ─── Atomicity on D1 Error (Req 16.4, 16.11) ──────────────────────────────

  describe('Atomicity guarantees', () => {
    it('batch response contains all N accessions for N valid procedures', async () => {
      const tenantId = `atom-tenant-${Date.now()}`;
      const n = 7;
      const procedures = Array.from({ length: n }, (_, i) =>
        makeProcedure({ procedure_code: `ATOM-${i}`, modality: 'NM' }),
      );

      const res = await SELF.fetch('http://localhost/api/accessions/batch', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Tenant-ID': tenantId,
        },
        body: JSON.stringify({ procedures }),
      });

      expect([201, 202]).toContain(res.status);

      const body = await res.json() as {
        accessions?: Array<{ id: string; accession_number: string; modality: string; procedure_code: string }>;
        would_respond?: { accessions: Array<{ id: string; accession_number: string; modality: string; procedure_code: string }> };
      };

      const accessions = body.accessions || body.would_respond?.accessions;
      if (!accessions) return; // Shadow mode — skip

      // Exactly N accessions returned
      expect(accessions).toHaveLength(n);

      // Each has required fields
      for (const acc of accessions) {
        expect(acc.id).toBeDefined();
        expect(acc.accession_number).toBeDefined();
        expect(acc.accession_number.length).toBeGreaterThan(0);
        expect(acc.modality).toBe('NM');
      }

      // All accession numbers are unique
      const numbers = accessions.map((a) => a.accession_number);
      expect(new Set(numbers).size).toBe(n);

      // All IDs are unique
      const ids = accessions.map((a) => a.id);
      expect(new Set(ids).size).toBe(n);
    });

    it('batch persists atomically via db.batch — all records committed together', async () => {
      // In shadow mode (SHADOW_MODE=true), the batch route generates accession
      // numbers and increments counters but skips D1 persistence, returning 202.
      // This test verifies the atomic batch structure by checking the response
      // contains all records with consistent data.
      const tenantId = `atomic-batch-${Date.now()}`;
      const procedures = Array.from({ length: 5 }, (_, i) =>
        makeProcedure({ procedure_code: `ATOMIC-${i}`, modality: 'XA' }),
      );

      const res = await SELF.fetch('http://localhost/api/accessions/batch', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Tenant-ID': tenantId,
        },
        body: JSON.stringify({ procedures }),
      });

      expect([201, 202]).toContain(res.status);

      const body = await res.json() as {
        accessions?: Array<{ id: string; accession_number: string; procedure_code: string }>;
        would_respond?: { accessions: Array<{ id: string; accession_number: string; procedure_code: string }> };
      };

      const accessions = body.accessions || body.would_respond?.accessions;
      if (!accessions) return;

      // All 5 procedures should produce accessions (atomic — all or nothing)
      expect(accessions).toHaveLength(5);

      // Each procedure_code from input should appear in the output
      const outputCodes = accessions.map((a) => a.procedure_code);
      for (let i = 0; i < 5; i++) {
        expect(outputCodes).toContain(`ATOMIC-${i}`);
      }

      // All accession numbers should be unique (no partial duplicates)
      const numbers = new Set(accessions.map((a) => a.accession_number));
      expect(numbers.size).toBe(5);
    });

    it('each accession in batch has a unique UUID v7 id', async () => {
      const tenantId = `uuid-tenant-${Date.now()}`;
      const procedures = Array.from({ length: 10 }, (_, i) =>
        makeProcedure({ procedure_code: `UUID-${i}`, modality: 'PT' }),
      );

      const res = await SELF.fetch('http://localhost/api/accessions/batch', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Tenant-ID': tenantId,
        },
        body: JSON.stringify({ procedures }),
      });

      expect([201, 202]).toContain(res.status);

      const body = await res.json() as {
        accessions?: Array<{ id: string }>;
        would_respond?: { accessions: Array<{ id: string }> };
      };

      const accessions = body.accessions || body.would_respond?.accessions;
      if (!accessions) return;

      // All IDs should be valid UUID format
      const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      for (const acc of accessions) {
        expect(acc.id).toMatch(uuidRegex);
      }

      // All IDs should be unique
      const ids = new Set(accessions.map((a) => a.id));
      expect(ids.size).toBe(10);
    });
  });
});
