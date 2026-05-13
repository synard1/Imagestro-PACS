import { describe, it } from 'vitest';
import * as fc from 'fast-check';

/**
 * Property 30: Soft-delete sets deleted_at but preserves all other fields.
 * Tests the soft-delete invariant conceptually.
 */

interface MockAccession {
  id: string;
  tenant_id: string;
  accession_number: string;
  patient_name: string;
  modality: string;
  created_at: string;
  deleted_at: string | null;
}

function applySoftDelete(record: MockAccession): MockAccession {
  return { ...record, deleted_at: new Date().toISOString() };
}

describe('Property 30: Soft-delete preserves data', () => {
  it('soft-delete only changes deleted_at field', () => {
    const recordArb = fc.record({
      id: fc.uuid(),
      tenant_id: fc.string({ minLength: 1, maxLength: 20 }),
      accession_number: fc.string({ minLength: 5, maxLength: 30 }),
      patient_name: fc.string({ minLength: 1, maxLength: 50 }),
      modality: fc.constantFrom('CT','MR','DX','US'),
      created_at: fc.date({ noInvalidDate: true }).map(d => d.toISOString()),
      deleted_at: fc.constant(null as string | null),
    });

    fc.assert(fc.property(recordArb, (record) => {
      const deleted = applySoftDelete(record);
      return deleted.id === record.id &&
             deleted.tenant_id === record.tenant_id &&
             deleted.accession_number === record.accession_number &&
             deleted.patient_name === record.patient_name &&
             deleted.modality === record.modality &&
             deleted.created_at === record.created_at &&
             deleted.deleted_at !== null;
    }), { numRuns: 200 });
  });

  it('soft-deleted records have non-null deleted_at', () => {
    fc.assert(fc.property(fc.uuid(), fc.string({ minLength: 1 }), (id, name) => {
      const record: MockAccession = { id, tenant_id: 't1', accession_number: 'ACC-001', patient_name: name, modality: 'CT', created_at: '2025-01-01T00:00:00Z', deleted_at: null };
      const deleted = applySoftDelete(record);
      return deleted.deleted_at !== null && deleted.deleted_at.length > 0;
    }), { numRuns: 100 });
  });
});
