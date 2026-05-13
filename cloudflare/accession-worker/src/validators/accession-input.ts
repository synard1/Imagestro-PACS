/**
 * Zod schemas and normalizers for accession creation input validation.
 *
 * Supports two input formats:
 * - Nested format (POST /api/accessions): patient object with nested fields
 * - Flat format (POST /accession/create): flat field names with patient_ prefix
 *
 * Both formats are validated and normalized to a unified `NormalizedAccessionInput`
 * interface for downstream processing.
 *
 * Requirements: 6.1, 6.2, 6.3, 6.4, 6.5, 6.6, 6.7, 6.8, 10.1, 10.2, 10.3, 10.6, 10.7
 */

import { z } from 'zod';
import { type Modality, MODALITIES } from '../types';

// ─── Shared Validation Patterns ──────────────────────────────────────────────

/** NIK: exactly 16 numeric digits */
const nikPattern = /^\d{16}$/;

/** IHS Number: P followed by exactly 11 numeric digits */
const ihsPattern = /^P\d{11}$/;

/** ISO date format: YYYY-MM-DD */
const isoDatePattern = /^\d{4}-\d{2}-\d{2}$/;

/** Patient sex enum values */
const patientSexValues = ['male', 'female', 'other', 'unknown'] as const;

// ─── Shared Refinements ──────────────────────────────────────────────────────

/**
 * Validates that a date string is a valid ISO date (YYYY-MM-DD) and not in the future.
 */
function isValidBirthDate(value: string): boolean {
  if (!isoDatePattern.test(value)) return false;
  const date = new Date(value + 'T00:00:00Z');
  if (isNaN(date.getTime())) return false;
  // Verify the parsed date matches the input (catches invalid dates like 2024-02-30)
  const [year, month, day] = value.split('-').map(Number);
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() + 1 !== month ||
    date.getUTCDate() !== day
  ) {
    return false;
  }
  // Must not be in the future
  const today = new Date();
  today.setUTCHours(23, 59, 59, 999);
  return date <= today;
}

// ─── Nested Format Schema (POST /api/accessions) ────────────────────────────

const patientSchema = z.object({
  id: z
    .string({ required_error: 'patient.id is required' })
    .regex(nikPattern, {
      message: 'patient.id must be exactly 16 numeric characters (NIK)',
    }),
  name: z
    .string({ required_error: 'patient.name is required' })
    .min(1, { message: 'patient.name must not be empty' })
    .max(200, { message: 'patient.name must not exceed 200 characters' })
    .refine((val) => val.trim().length > 0, {
      message: 'patient.name must not contain only whitespace',
    }),
  ihs_number: z
    .string()
    .regex(ihsPattern, {
      message:
        'patient.ihs_number must match format P followed by 11 digits (e.g., P12345678901)',
    })
    .optional(),
  birth_date: z
    .string()
    .refine(isValidBirthDate, {
      message:
        'patient.birth_date must be a valid ISO date (YYYY-MM-DD) and not in the future',
    })
    .optional(),
  sex: z.enum(patientSexValues).optional(),
});

export const nestedFormatSchema = z.object({
  patient: patientSchema,
  modality: z.enum(MODALITIES as unknown as [string, ...string[]], {
    errorMap: () => ({
      message: `modality must be one of: ${MODALITIES.join(', ')}`,
    }),
  }),
  medical_record_number: z.string().optional(),
  procedure_code: z.string().optional(),
  procedure_name: z.string().optional(),
  facility_code: z.string().optional(),
  scheduled_at: z.string().optional(),
  note: z.string().optional(),
  accession_number: z.string().optional(),
});

// ─── Flat Format Schema (POST /accession/create) ─────────────────────────────

export const flatFormatSchema = z.object({
  patient_national_id: z
    .string({ required_error: 'patient_national_id is required' })
    .regex(nikPattern, {
      message:
        'patient_national_id must be exactly 16 numeric characters (NIK)',
    }),
  patient_name: z
    .string({ required_error: 'patient_name is required' })
    .min(1, { message: 'patient_name must not be empty' })
    .max(200, { message: 'patient_name must not exceed 200 characters' })
    .refine((val) => val.trim().length > 0, {
      message: 'patient_name must not contain only whitespace',
    }),
  patient_ihs_number: z
    .string()
    .regex(ihsPattern, {
      message:
        'patient_ihs_number must match format P followed by 11 digits (e.g., P12345678901)',
    })
    .optional(),
  patient_birth_date: z
    .string()
    .refine(isValidBirthDate, {
      message:
        'patient_birth_date must be a valid ISO date (YYYY-MM-DD) and not in the future',
    })
    .optional(),
  patient_sex: z.enum(patientSexValues).optional(),
  modality: z.enum(MODALITIES as unknown as [string, ...string[]], {
    errorMap: () => ({
      message: `modality must be one of: ${MODALITIES.join(', ')}`,
    }),
  }),
  medical_record_number: z.string().optional(),
  procedure_code: z.string().optional(),
  procedure_name: z.string().optional(),
  facility_code: z.string().optional(),
  scheduled_at: z.string().optional(),
  note: z.string().optional(),
  accession_number: z.string().optional(),
});

// ─── Normalized Output Interface ─────────────────────────────────────────────

export interface NormalizedAccessionInput {
  patientNationalId: string;
  patientName: string;
  patientIhsNumber?: string;
  patientBirthDate?: string;
  patientSex?: 'male' | 'female' | 'other' | 'unknown';
  medicalRecordNumber?: string;
  modality: Modality;
  procedureCode?: string;
  procedureName?: string;
  facilityCode?: string;
  scheduledAt?: string;
  note?: string;
  accessionNumber?: string;
  idempotencyKey?: string;
}

// ─── Validation Result Type ──────────────────────────────────────────────────

export interface ValidationSuccess {
  success: true;
  data: NormalizedAccessionInput;
}

export interface ValidationFailure {
  success: false;
  errors: Array<{ field?: string; message: string }>;
}

export type ValidationResult = ValidationSuccess | ValidationFailure;

// ─── Normalizers ─────────────────────────────────────────────────────────────

/**
 * Normalizes a validated nested format input to the unified internal representation.
 */
export function normalizeNestedFormat(
  input: z.infer<typeof nestedFormatSchema>,
): NormalizedAccessionInput {
  return {
    patientNationalId: input.patient.id,
    patientName: input.patient.name,
    patientIhsNumber: input.patient.ihs_number,
    patientBirthDate: input.patient.birth_date,
    patientSex: input.patient.sex,
    modality: input.modality as Modality,
    medicalRecordNumber: input.medical_record_number,
    procedureCode: input.procedure_code,
    procedureName: input.procedure_name,
    facilityCode: input.facility_code,
    scheduledAt: input.scheduled_at,
    note: input.note,
    accessionNumber: input.accession_number,
  };
}

/**
 * Normalizes a validated flat format input to the unified internal representation.
 */
export function normalizeFlatFormat(
  input: z.infer<typeof flatFormatSchema>,
): NormalizedAccessionInput {
  return {
    patientNationalId: input.patient_national_id,
    patientName: input.patient_name,
    patientIhsNumber: input.patient_ihs_number,
    patientBirthDate: input.patient_birth_date,
    patientSex: input.patient_sex,
    modality: input.modality as Modality,
    medicalRecordNumber: input.medical_record_number,
    procedureCode: input.procedure_code,
    procedureName: input.procedure_name,
    facilityCode: input.facility_code,
    scheduledAt: input.scheduled_at,
    note: input.note,
    accessionNumber: input.accession_number,
  };
}

// ─── Parse + Normalize Helpers ───────────────────────────────────────────────

/**
 * Maps Zod issue paths to human-readable field names for the nested format.
 */
function mapNestedFieldPath(path: (string | number)[]): string {
  if (path.length === 0) return '';
  if (path[0] === 'patient' && path.length > 1) {
    return `patient.${path.slice(1).join('.')}`;
  }
  return path.join('.');
}

/**
 * Maps Zod issue paths to human-readable field names for the flat format.
 */
function mapFlatFieldPath(path: (string | number)[]): string {
  if (path.length === 0) return '';
  return path.join('.');
}

/**
 * Validates and normalizes a nested format request body.
 * Returns all validation errors aggregated (Requirement 6.6).
 */
export function parseNestedFormat(body: unknown): ValidationResult {
  const result = nestedFormatSchema.safeParse(body);
  if (!result.success) {
    const errors = result.error.issues.map((issue) => ({
      field: mapNestedFieldPath(issue.path) || undefined,
      message: issue.message,
    }));
    return { success: false, errors };
  }
  return { success: true, data: normalizeNestedFormat(result.data) };
}

/**
 * Validates and normalizes a flat format request body.
 * Returns all validation errors aggregated (Requirement 6.6).
 */
export function parseFlatFormat(body: unknown): ValidationResult {
  const result = flatFormatSchema.safeParse(body);
  if (!result.success) {
    const errors = result.error.issues.map((issue) => ({
      field: mapFlatFieldPath(issue.path) || undefined,
      message: issue.message,
    }));
    return { success: false, errors };
  }
  return { success: true, data: normalizeFlatFormat(result.data) };
}
