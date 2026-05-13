import { describe, it, expect } from 'vitest';
import { batchSchema, validateBatchInput } from '../src/validators/batch-input';

// ─── Valid Test Data ─────────────────────────────────────────────────────────

const validProcedure = {
  patient_national_id: '3201234567890123',
  patient_name: 'John Doe',
  modality: 'CT',
  procedure_code: 'CT-HEAD',
  procedure_name: 'CT Head Without Contrast',
  facility_code: 'RS01',
  scheduled_at: '2025-01-20T10:00:00Z',
  note: 'Urgent',
};

const validBatchInput = {
  procedures: [
    { ...validProcedure, procedure_code: 'CT-HEAD' },
    { ...validProcedure, procedure_code: 'CT-CHEST', modality: 'CT' },
  ],
};

// ─── batchSchema Tests ───────────────────────────────────────────────────────

describe('batchSchema', () => {
  it('accepts a valid batch with multiple procedures', () => {
    const result = batchSchema.safeParse(validBatchInput);
    expect(result.success).toBe(true);
  });

  it('accepts minimal required fields per procedure', () => {
    const result = batchSchema.safeParse({
      procedures: [
        {
          patient_national_id: '1234567890123456',
          patient_name: 'A',
          modality: 'MR',
          procedure_code: 'MR-BRAIN',
        },
      ],
    });
    expect(result.success).toBe(true);
  });

  it('accepts procedure with optional accession_number', () => {
    const result = batchSchema.safeParse({
      procedures: [
        {
          ...validProcedure,
          accession_number: 'EXT-2025-001',
        },
      ],
    });
    expect(result.success).toBe(true);
  });

  describe('procedures array size', () => {
    it('rejects empty procedures array', () => {
      const result = batchSchema.safeParse({ procedures: [] });
      expect(result.success).toBe(false);
    });

    it('accepts exactly 1 procedure', () => {
      const result = batchSchema.safeParse({
        procedures: [validProcedure],
      });
      expect(result.success).toBe(true);
    });

    it('accepts exactly 20 procedures', () => {
      const procedures = Array.from({ length: 20 }, (_, i) => ({
        ...validProcedure,
        procedure_code: `PROC-${i}`,
      }));
      const result = batchSchema.safeParse({ procedures });
      expect(result.success).toBe(true);
    });

    it('rejects more than 20 procedures', () => {
      const procedures = Array.from({ length: 21 }, (_, i) => ({
        ...validProcedure,
        procedure_code: `PROC-${i}`,
      }));
      const result = batchSchema.safeParse({ procedures });
      expect(result.success).toBe(false);
    });

    it('rejects missing procedures field', () => {
      const result = batchSchema.safeParse({});
      expect(result.success).toBe(false);
    });

    it('rejects non-array procedures', () => {
      const result = batchSchema.safeParse({ procedures: 'not-an-array' });
      expect(result.success).toBe(false);
    });
  });

  describe('patient_national_id (NIK) validation', () => {
    it('rejects NIK with less than 16 digits', () => {
      const result = batchSchema.safeParse({
        procedures: [{ ...validProcedure, patient_national_id: '123456789012345' }],
      });
      expect(result.success).toBe(false);
    });

    it('rejects NIK with more than 16 digits', () => {
      const result = batchSchema.safeParse({
        procedures: [{ ...validProcedure, patient_national_id: '12345678901234567' }],
      });
      expect(result.success).toBe(false);
    });

    it('rejects NIK with non-numeric characters', () => {
      const result = batchSchema.safeParse({
        procedures: [{ ...validProcedure, patient_national_id: '320123456789ABCD' }],
      });
      expect(result.success).toBe(false);
    });

    it('rejects missing patient_national_id', () => {
      const { patient_national_id, ...rest } = validProcedure;
      const result = batchSchema.safeParse({ procedures: [rest] });
      expect(result.success).toBe(false);
    });
  });

  describe('patient_name validation', () => {
    it('rejects empty patient_name', () => {
      const result = batchSchema.safeParse({
        procedures: [{ ...validProcedure, patient_name: '' }],
      });
      expect(result.success).toBe(false);
    });

    it('rejects whitespace-only patient_name', () => {
      const result = batchSchema.safeParse({
        procedures: [{ ...validProcedure, patient_name: '   ' }],
      });
      expect(result.success).toBe(false);
    });

    it('rejects patient_name exceeding 200 characters', () => {
      const result = batchSchema.safeParse({
        procedures: [{ ...validProcedure, patient_name: 'A'.repeat(201) }],
      });
      expect(result.success).toBe(false);
    });

    it('accepts patient_name at exactly 200 characters', () => {
      const result = batchSchema.safeParse({
        procedures: [{ ...validProcedure, patient_name: 'A'.repeat(200) }],
      });
      expect(result.success).toBe(true);
    });
  });

  describe('modality validation', () => {
    it('accepts all valid modalities', () => {
      const modalities = ['CT', 'MR', 'CR', 'DX', 'US', 'XA', 'RF', 'MG', 'NM', 'PT'];
      for (const mod of modalities) {
        const result = batchSchema.safeParse({
          procedures: [{ ...validProcedure, modality: mod }],
        });
        expect(result.success).toBe(true);
      }
    });

    it('rejects invalid modality', () => {
      const result = batchSchema.safeParse({
        procedures: [{ ...validProcedure, modality: 'INVALID' }],
      });
      expect(result.success).toBe(false);
    });

    it('rejects lowercase modality', () => {
      const result = batchSchema.safeParse({
        procedures: [{ ...validProcedure, modality: 'ct' }],
      });
      expect(result.success).toBe(false);
    });
  });

  describe('procedure_code validation', () => {
    it('rejects empty procedure_code', () => {
      const result = batchSchema.safeParse({
        procedures: [{ ...validProcedure, procedure_code: '' }],
      });
      expect(result.success).toBe(false);
    });
  });

  describe('accession_number validation', () => {
    it('rejects accession_number exceeding 64 characters', () => {
      const result = batchSchema.safeParse({
        procedures: [{ ...validProcedure, accession_number: 'A'.repeat(65) }],
      });
      expect(result.success).toBe(false);
    });

    it('accepts accession_number at exactly 64 characters', () => {
      const result = batchSchema.safeParse({
        procedures: [{ ...validProcedure, accession_number: 'A'.repeat(64) }],
      });
      expect(result.success).toBe(true);
    });
  });
});

// ─── validateBatchInput Tests ────────────────────────────────────────────────

describe('validateBatchInput', () => {
  it('returns success for valid input', () => {
    const result = validateBatchInput(validBatchInput);
    expect(result.success).toBe(true);
    expect(result.data).toBeDefined();
  });

  it('returns per-index errors for invalid procedure fields', () => {
    const result = validateBatchInput({
      procedures: [
        { ...validProcedure, procedure_code: 'A' },
        { ...validProcedure, patient_national_id: 'bad', procedure_code: 'B' },
      ],
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      const indexErrors = result.errors!.filter((e) => e.index === 1);
      expect(indexErrors.length).toBeGreaterThan(0);
      expect(indexErrors[0]!.field).toBe('patient_national_id');
    }
  });

  describe('duplicate procedure_code detection', () => {
    it('rejects duplicate procedure_code values within the batch', () => {
      const result = validateBatchInput({
        procedures: [
          { ...validProcedure, procedure_code: 'CT-HEAD' },
          { ...validProcedure, procedure_code: 'CT-HEAD' },
        ],
      });
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.errors!.length).toBe(1);
        expect(result.errors![0]!.index).toBe(1);
        expect(result.errors![0]!.field).toBe('procedure_code');
        expect(result.errors![0]!.message).toContain('Duplicate');
      }
    });

    it('reports all duplicate indices', () => {
      const result = validateBatchInput({
        procedures: [
          { ...validProcedure, procedure_code: 'A' },
          { ...validProcedure, procedure_code: 'A' },
          { ...validProcedure, procedure_code: 'A' },
        ],
      });
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.errors!.length).toBe(2);
        expect(result.errors![0]!.index).toBe(1);
        expect(result.errors![1]!.index).toBe(2);
      }
    });

    it('allows different procedure_code values', () => {
      const result = validateBatchInput({
        procedures: [
          { ...validProcedure, procedure_code: 'A' },
          { ...validProcedure, procedure_code: 'B' },
          { ...validProcedure, procedure_code: 'C' },
        ],
      });
      expect(result.success).toBe(true);
    });
  });

  describe('per-index error reporting', () => {
    it('reports index -1 for top-level errors', () => {
      const result = validateBatchInput({ procedures: [] });
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.errors![0]!.index).toBe(-1);
      }
    });

    it('reports correct index for procedure-level errors', () => {
      const result = validateBatchInput({
        procedures: [
          { ...validProcedure, procedure_code: 'A' },
          { patient_national_id: 'bad', patient_name: '', modality: 'ZZ', procedure_code: 'B' },
        ],
      });
      expect(result.success).toBe(false);
      if (!result.success) {
        const errorsAtIndex1 = result.errors!.filter((e) => e.index === 1);
        expect(errorsAtIndex1.length).toBeGreaterThan(0);
      }
    });
  });
});
