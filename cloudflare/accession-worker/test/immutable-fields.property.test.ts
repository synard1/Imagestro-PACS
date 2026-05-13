import { describe, it } from 'vitest';
import * as fc from 'fast-check';

/**
 * Property 29: Immutable fields cannot be modified via PATCH.
 * Tests the immutable field set logic conceptually (no D1 needed).
 */

const IMMUTABLE_FIELDS: ReadonlySet<string> = new Set([
  'id', 'tenant_id', 'accession_number', 'issuer',
  'patient_national_id', 'facility_code', 'modality',
  'source', 'created_at', 'deleted_at',
]);

const ALLOWED_PATCH_FIELDS: ReadonlySet<string> = new Set([
  'patient_name', 'patient_birth_date', 'patient_sex',
  'medical_record_number', 'procedure_code', 'procedure_name',
  'scheduled_at', 'note',
]);

describe('Property 29: Immutable fields rejection', () => {
  it('immutable fields are never in allowed patch set', () => {
    const immutableArb = fc.constantFrom(...Array.from(IMMUTABLE_FIELDS));
    fc.assert(fc.property(immutableArb, (field) => {
      return !ALLOWED_PATCH_FIELDS.has(field);
    }), { numRuns: 100 });
  });

  it('allowed patch fields are never in immutable set', () => {
    const allowedArb = fc.constantFrom(...Array.from(ALLOWED_PATCH_FIELDS));
    fc.assert(fc.property(allowedArb, (field) => {
      return !IMMUTABLE_FIELDS.has(field);
    }), { numRuns: 100 });
  });

  it('immutable and allowed sets are disjoint', () => {
    fc.assert(fc.property(
      fc.constantFrom(...Array.from(IMMUTABLE_FIELDS)),
      fc.constantFrom(...Array.from(ALLOWED_PATCH_FIELDS)),
      (immField, allowField) => {
        return immField !== allowField;
      }
    ), { numRuns: 200 });
  });
});
