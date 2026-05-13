/**
 * Zod schemas and validation for batch accession creation requests.
 *
 * Validates:
 * - procedures array length 1–20
 * - Each procedure has valid NIK (16 digits), valid modality, non-empty patient_name (1-200 chars)
 * - Each procedure may optionally carry an external accession_number
 * - No duplicate procedure_code values within the batch
 * - Returns per-index error objects
 *
 * Requirements: 16.1, 16.2, 16.5, 16.6
 */

import { z } from 'zod';
import { MODALITIES } from '../types';

// ─── Per-Index Error ─────────────────────────────────────────────────────────

export interface BatchValidationError {
  index: number;
  field?: string;
  message: string;
}

export interface BatchValidationResult {
  success: boolean;
  data?: z.infer<typeof batchSchema>;
  errors?: BatchValidationError[];
}

// ─── Procedure Item Schema ───────────────────────────────────────────────────

/** NIK: exactly 16 numeric digits */
const nikPattern = /^\d{16}$/;

const procedureItemSchema = z.object({
  patient_national_id: z
    .string({ required_error: 'patient_national_id is required' })
    .regex(nikPattern, 'patient_national_id must be exactly 16 numeric characters (NIK)'),
  patient_name: z
    .string({ required_error: 'patient_name is required' })
    .min(1, 'patient_name must not be empty')
    .max(200, 'patient_name must not exceed 200 characters')
    .refine((val) => val.trim().length > 0, 'patient_name must not be only whitespace'),
  modality: z.enum(MODALITIES as unknown as [string, ...string[]], {
    required_error: 'modality is required',
    invalid_type_error: `modality must be one of: ${MODALITIES.join(', ')}`,
  }),
  procedure_code: z
    .string({ required_error: 'procedure_code is required' })
    .min(1, 'procedure_code must not be empty'),
  procedure_name: z.string().min(1, 'procedure_name must not be empty').optional(),
  accession_number: z
    .string()
    .max(64, 'accession_number must not exceed 64 characters')
    .optional(),
  patient_ihs_number: z
    .string()
    .regex(/^P\d{11}$/, 'patient_ihs_number must match format P followed by 11 digits')
    .optional(),
  patient_birth_date: z.string().optional(),
  patient_sex: z.enum(['male', 'female', 'other', 'unknown']).optional(),
  medical_record_number: z.string().optional(),
  facility_code: z.string().optional(),
  scheduled_at: z.string().optional(),
  note: z.string().optional(),
});

// ─── Batch Request Schema ────────────────────────────────────────────────────

/**
 * Zod schema for the batch accession creation request body.
 *
 * Validates:
 * - `procedures` array with 1–20 items
 * - Each procedure has required patient_national_id (16-digit NIK), patient_name, modality, procedure_code
 * - Each procedure may optionally carry an external accession_number
 * - No duplicate procedure_code values within the batch (checked in validateBatchInput)
 */
export const batchSchema = z.object({
  procedures: z
    .array(procedureItemSchema, {
      required_error: 'procedures array is required',
      invalid_type_error: 'procedures must be an array',
    })
    .min(1, 'procedures array must contain at least 1 item')
    .max(20, 'procedures array must contain at most 20 items'),
});

// ─── Validation Function ─────────────────────────────────────────────────────

/**
 * Validates a batch accession creation request body.
 *
 * Returns per-index error objects when validation fails, including
 * duplicate procedure_code detection within the batch.
 */
export function validateBatchInput(body: unknown): BatchValidationResult {
  const parsed = batchSchema.safeParse(body);

  if (!parsed.success) {
    const errors: BatchValidationError[] = parsed.error.issues.map((issue) => {
      const path = issue.path;
      // Determine if the error is on a procedure item (path starts with ["procedures", index, ...])
      if (path[0] === 'procedures' && typeof path[1] === 'number') {
        const index = path[1] as number;
        const field = path.slice(2).join('.') || undefined;
        return {
          index,
          field,
          message: issue.message,
        };
      }
      // Top-level field error (procedures array itself)
      return {
        index: -1,
        field: path.join('.') || undefined,
        message: issue.message,
      };
    });

    return { success: false, errors };
  }

  // Check for duplicate procedure_code values within the batch
  const data = parsed.data;
  const seen = new Map<string, number>();
  const duplicateErrors: BatchValidationError[] = [];

  for (let i = 0; i < data.procedures.length; i++) {
    const code = data.procedures[i]!.procedure_code;
    const previousIndex = seen.get(code);
    if (previousIndex !== undefined) {
      duplicateErrors.push({
        index: i,
        field: 'procedure_code',
        message: `Duplicate procedure_code "${code}" (first seen at index ${previousIndex})`,
      });
    } else {
      seen.set(code, i);
    }
  }

  if (duplicateErrors.length > 0) {
    return { success: false, errors: duplicateErrors };
  }

  return { success: true, data };
}
