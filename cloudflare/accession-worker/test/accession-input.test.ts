import { describe, it, expect } from 'vitest';
import {
  nestedFormatSchema,
  flatFormatSchema,
  normalizeNestedFormat,
  normalizeFlatFormat,
  parseNestedFormat,
  parseFlatFormat,
} from '../src/validators/accession-input';

// ─── Valid Test Data ─────────────────────────────────────────────────────────

const validNestedInput = {
  patient: {
    id: '3201234567890123',
    name: 'John Doe',
    ihs_number: 'P12345678901',
    birth_date: '1990-05-15',
    sex: 'male' as const,
  },
  modality: 'CT',
  procedure_code: 'CT-HEAD',
  procedure_name: 'CT Head Without Contrast',
  facility_code: 'RS01',
  scheduled_at: '2025-01-20T10:00:00Z',
  note: 'Urgent',
};

const validFlatInput = {
  patient_national_id: '3201234567890123',
  patient_name: 'John Doe',
  patient_ihs_number: 'P12345678901',
  patient_birth_date: '1990-05-15',
  patient_sex: 'male' as const,
  modality: 'CT',
  procedure_code: 'CT-HEAD',
  procedure_name: 'CT Head Without Contrast',
  facility_code: 'RS01',
  scheduled_at: '2025-01-20T10:00:00Z',
  note: 'Urgent',
};

// ─── Nested Format Schema Tests ──────────────────────────────────────────────

describe('nestedFormatSchema', () => {
  it('accepts a valid complete input', () => {
    const result = nestedFormatSchema.safeParse(validNestedInput);
    expect(result.success).toBe(true);
  });

  it('accepts minimal required fields only', () => {
    const result = nestedFormatSchema.safeParse({
      patient: { id: '1234567890123456', name: 'A' },
      modality: 'MR',
    });
    expect(result.success).toBe(true);
  });

  describe('patient.id (NIK) validation', () => {
    it('rejects missing patient.id', () => {
      const result = nestedFormatSchema.safeParse({
        patient: { name: 'John' },
        modality: 'CT',
      });
      expect(result.success).toBe(false);
    });

    it('rejects NIK with less than 16 digits', () => {
      const result = nestedFormatSchema.safeParse({
        patient: { id: '123456789012345', name: 'John' },
        modality: 'CT',
      });
      expect(result.success).toBe(false);
    });

    it('rejects NIK with more than 16 digits', () => {
      const result = nestedFormatSchema.safeParse({
        patient: { id: '12345678901234567', name: 'John' },
        modality: 'CT',
      });
      expect(result.success).toBe(false);
    });

    it('rejects NIK with non-numeric characters', () => {
      const result = nestedFormatSchema.safeParse({
        patient: { id: '320123456789ABCD', name: 'John' },
        modality: 'CT',
      });
      expect(result.success).toBe(false);
    });
  });

  describe('patient.name validation', () => {
    it('rejects empty name', () => {
      const result = nestedFormatSchema.safeParse({
        patient: { id: '1234567890123456', name: '' },
        modality: 'CT',
      });
      expect(result.success).toBe(false);
    });

    it('rejects whitespace-only name', () => {
      const result = nestedFormatSchema.safeParse({
        patient: { id: '1234567890123456', name: '   ' },
        modality: 'CT',
      });
      expect(result.success).toBe(false);
    });

    it('rejects name exceeding 200 characters', () => {
      const result = nestedFormatSchema.safeParse({
        patient: { id: '1234567890123456', name: 'A'.repeat(201) },
        modality: 'CT',
      });
      expect(result.success).toBe(false);
    });

    it('accepts name at exactly 200 characters', () => {
      const result = nestedFormatSchema.safeParse({
        patient: { id: '1234567890123456', name: 'A'.repeat(200) },
        modality: 'CT',
      });
      expect(result.success).toBe(true);
    });
  });

  describe('patient.ihs_number validation', () => {
    it('accepts valid IHS number', () => {
      const result = nestedFormatSchema.safeParse({
        patient: { id: '1234567890123456', name: 'John', ihs_number: 'P12345678901' },
        modality: 'CT',
      });
      expect(result.success).toBe(true);
    });

    it('rejects IHS without P prefix', () => {
      const result = nestedFormatSchema.safeParse({
        patient: { id: '1234567890123456', name: 'John', ihs_number: '123456789012' },
        modality: 'CT',
      });
      expect(result.success).toBe(false);
    });

    it('rejects IHS with wrong digit count', () => {
      const result = nestedFormatSchema.safeParse({
        patient: { id: '1234567890123456', name: 'John', ihs_number: 'P1234567890' },
        modality: 'CT',
      });
      expect(result.success).toBe(false);
    });
  });

  describe('patient.birth_date validation', () => {
    it('accepts valid past date', () => {
      const result = nestedFormatSchema.safeParse({
        patient: { id: '1234567890123456', name: 'John', birth_date: '2000-01-01' },
        modality: 'CT',
      });
      expect(result.success).toBe(true);
    });

    it('rejects future date', () => {
      const result = nestedFormatSchema.safeParse({
        patient: { id: '1234567890123456', name: 'John', birth_date: '2099-12-31' },
        modality: 'CT',
      });
      expect(result.success).toBe(false);
    });

    it('rejects invalid date format', () => {
      const result = nestedFormatSchema.safeParse({
        patient: { id: '1234567890123456', name: 'John', birth_date: '01-01-2000' },
        modality: 'CT',
      });
      expect(result.success).toBe(false);
    });

    it('rejects invalid calendar date', () => {
      const result = nestedFormatSchema.safeParse({
        patient: { id: '1234567890123456', name: 'John', birth_date: '2024-02-30' },
        modality: 'CT',
      });
      expect(result.success).toBe(false);
    });
  });

  describe('modality validation', () => {
    it('accepts all valid modalities', () => {
      const modalities = ['CT', 'MR', 'CR', 'DX', 'US', 'XA', 'RF', 'MG', 'NM', 'PT'];
      for (const mod of modalities) {
        const result = nestedFormatSchema.safeParse({
          patient: { id: '1234567890123456', name: 'John' },
          modality: mod,
        });
        expect(result.success).toBe(true);
      }
    });

    it('rejects invalid modality', () => {
      const result = nestedFormatSchema.safeParse({
        patient: { id: '1234567890123456', name: 'John' },
        modality: 'INVALID',
      });
      expect(result.success).toBe(false);
    });

    it('rejects lowercase modality', () => {
      const result = nestedFormatSchema.safeParse({
        patient: { id: '1234567890123456', name: 'John' },
        modality: 'ct',
      });
      expect(result.success).toBe(false);
    });
  });
});

// ─── Flat Format Schema Tests ────────────────────────────────────────────────

describe('flatFormatSchema', () => {
  it('accepts a valid complete input', () => {
    const result = flatFormatSchema.safeParse(validFlatInput);
    expect(result.success).toBe(true);
  });

  it('accepts minimal required fields only', () => {
    const result = flatFormatSchema.safeParse({
      patient_national_id: '1234567890123456',
      patient_name: 'A',
      modality: 'MR',
    });
    expect(result.success).toBe(true);
  });

  it('rejects invalid NIK in flat format', () => {
    const result = flatFormatSchema.safeParse({
      patient_national_id: '123',
      patient_name: 'John',
      modality: 'CT',
    });
    expect(result.success).toBe(false);
  });

  it('rejects empty patient_name', () => {
    const result = flatFormatSchema.safeParse({
      patient_national_id: '1234567890123456',
      patient_name: '',
      modality: 'CT',
    });
    expect(result.success).toBe(false);
  });
});

// ─── Error Aggregation Tests ─────────────────────────────────────────────────

describe('error aggregation (Requirement 6.6)', () => {
  it('returns multiple errors for multiple invalid fields in nested format', () => {
    const result = parseNestedFormat({
      patient: { id: '123', name: '' },
      modality: 'INVALID',
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.errors.length).toBeGreaterThanOrEqual(2);
    }
  });

  it('returns multiple errors for multiple invalid fields in flat format', () => {
    const result = parseFlatFormat({
      patient_national_id: 'abc',
      patient_name: '',
      modality: 'ZZ',
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.errors.length).toBeGreaterThanOrEqual(2);
    }
  });

  it('includes field identifiers in error objects', () => {
    const result = parseNestedFormat({
      patient: { id: '123', name: 'John' },
      modality: 'CT',
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.errors[0]!.field).toBe('patient.id');
    }
  });
});

// ─── Normalizer Tests ────────────────────────────────────────────────────────

describe('normalizeNestedFormat', () => {
  it('maps nested fields to normalized interface', () => {
    const parsed = nestedFormatSchema.parse(validNestedInput);
    const normalized = normalizeNestedFormat(parsed);

    expect(normalized.patientNationalId).toBe('3201234567890123');
    expect(normalized.patientName).toBe('John Doe');
    expect(normalized.patientIhsNumber).toBe('P12345678901');
    expect(normalized.patientBirthDate).toBe('1990-05-15');
    expect(normalized.patientSex).toBe('male');
    expect(normalized.modality).toBe('CT');
    expect(normalized.procedureCode).toBe('CT-HEAD');
    expect(normalized.procedureName).toBe('CT Head Without Contrast');
    expect(normalized.facilityCode).toBe('RS01');
    expect(normalized.scheduledAt).toBe('2025-01-20T10:00:00Z');
    expect(normalized.note).toBe('Urgent');
  });

  it('handles optional fields as undefined', () => {
    const parsed = nestedFormatSchema.parse({
      patient: { id: '1234567890123456', name: 'John' },
      modality: 'CT',
    });
    const normalized = normalizeNestedFormat(parsed);

    expect(normalized.patientIhsNumber).toBeUndefined();
    expect(normalized.patientBirthDate).toBeUndefined();
    expect(normalized.patientSex).toBeUndefined();
    expect(normalized.procedureCode).toBeUndefined();
    expect(normalized.facilityCode).toBeUndefined();
  });
});

describe('normalizeFlatFormat', () => {
  it('maps flat fields to normalized interface', () => {
    const parsed = flatFormatSchema.parse(validFlatInput);
    const normalized = normalizeFlatFormat(parsed);

    expect(normalized.patientNationalId).toBe('3201234567890123');
    expect(normalized.patientName).toBe('John Doe');
    expect(normalized.patientIhsNumber).toBe('P12345678901');
    expect(normalized.patientBirthDate).toBe('1990-05-15');
    expect(normalized.patientSex).toBe('male');
    expect(normalized.modality).toBe('CT');
    expect(normalized.procedureCode).toBe('CT-HEAD');
    expect(normalized.procedureName).toBe('CT Head Without Contrast');
    expect(normalized.facilityCode).toBe('RS01');
    expect(normalized.scheduledAt).toBe('2025-01-20T10:00:00Z');
    expect(normalized.note).toBe('Urgent');
  });
});

// ─── Normalization Equivalence ───────────────────────────────────────────────

describe('normalization equivalence (Requirement 10.3)', () => {
  it('produces identical normalized output from equivalent nested and flat inputs', () => {
    const nestedParsed = nestedFormatSchema.parse(validNestedInput);
    const flatParsed = flatFormatSchema.parse(validFlatInput);

    const nestedNormalized = normalizeNestedFormat(nestedParsed);
    const flatNormalized = normalizeFlatFormat(flatParsed);

    expect(nestedNormalized).toEqual(flatNormalized);
  });
});

// ─── parseNestedFormat / parseFlatFormat Integration ──────────────────────────

describe('parseNestedFormat', () => {
  it('returns success with normalized data for valid input', () => {
    const result = parseNestedFormat(validNestedInput);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.patientNationalId).toBe('3201234567890123');
      expect(result.data.modality).toBe('CT');
    }
  });

  it('returns failure with errors for invalid input', () => {
    const result = parseNestedFormat({ patient: {}, modality: 'ZZ' });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.errors.length).toBeGreaterThan(0);
    }
  });
});

describe('parseFlatFormat', () => {
  it('returns success with normalized data for valid input', () => {
    const result = parseFlatFormat(validFlatInput);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.patientNationalId).toBe('3201234567890123');
      expect(result.data.modality).toBe('CT');
    }
  });

  it('returns failure with errors for invalid input', () => {
    const result = parseFlatFormat({ patient_national_id: 'bad', modality: 'ZZ' });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.errors.length).toBeGreaterThan(0);
    }
  });
});

// ─── Accession Number (External) ─────────────────────────────────────────────

describe('accession_number field', () => {
  it('accepts optional accession_number in nested format', () => {
    const result = nestedFormatSchema.safeParse({
      ...validNestedInput,
      accession_number: 'EXT-2025-001',
    });
    expect(result.success).toBe(true);
  });

  it('accepts optional accession_number in flat format', () => {
    const result = flatFormatSchema.safeParse({
      ...validFlatInput,
      accession_number: 'EXT-2025-001',
    });
    expect(result.success).toBe(true);
  });

  it('normalizes accession_number from nested format', () => {
    const parsed = nestedFormatSchema.parse({
      ...validNestedInput,
      accession_number: 'EXT-001',
    });
    const normalized = normalizeNestedFormat(parsed);
    expect(normalized.accessionNumber).toBe('EXT-001');
  });
});
