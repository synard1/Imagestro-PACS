import { describe, it } from 'vitest';
import * as fc from 'fast-check';
import { validateBatchInput } from '../src/validators/batch-input';

/**
 * Properties 13/14: Batch N-to-N — N procedures produce N accession numbers,
 * and duplicate procedure_codes within a batch are rejected.
 */

describe('Property 13: Batch N procedures produce N results', () => {
  const validProcedure = (index: number) => ({
    patient_national_id: '1234567890123456',
    patient_name: 'Test Patient',
    modality: 'CT' as const,
    procedure_code: `PROC-${index}`,
  });

  it('batch of N valid procedures passes validation with N items', () => {
    fc.assert(fc.property(fc.integer({ min: 1, max: 20 }), (n) => {
      const procedures = Array.from({ length: n }, (_, i) => validProcedure(i));
      const result = validateBatchInput({ procedures });
      return result.success && result.data!.procedures.length === n;
    }), { numRuns: 100 });
  });

  it('batch > 20 items fails validation', () => {
    fc.assert(fc.property(fc.integer({ min: 21, max: 30 }), (n) => {
      const procedures = Array.from({ length: n }, (_, i) => validProcedure(i));
      const result = validateBatchInput({ procedures });
      return !result.success;
    }), { numRuns: 100 });
  });

  it('empty batch fails validation', () => {
    const result = validateBatchInput({ procedures: [] });
    return !result.success;
  });
});

describe('Property 14: Duplicate procedure_codes in batch are rejected', () => {
  it('batch with duplicate procedure_code fails', () => {
    fc.assert(fc.property(fc.integer({ min: 2, max: 10 }), (n) => {
      const procedures = Array.from({ length: n }, () => ({
        patient_national_id: '1234567890123456',
        patient_name: 'Test',
        modality: 'CT' as const,
        procedure_code: 'SAME-CODE', // all same = duplicates
      }));
      const result = validateBatchInput({ procedures });
      return !result.success;
    }), { numRuns: 100 });
  });

  it('batch with unique procedure_codes passes', () => {
    fc.assert(fc.property(fc.integer({ min: 1, max: 20 }), (n) => {
      const procedures = Array.from({ length: n }, (_, i) => ({
        patient_national_id: '1234567890123456',
        patient_name: 'Test',
        modality: 'CT' as const,
        procedure_code: `UNIQUE-${i}`,
      }));
      const result = validateBatchInput({ procedures });
      return result.success;
    }), { numRuns: 100 });
  });
});
