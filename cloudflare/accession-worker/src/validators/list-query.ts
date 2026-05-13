/**
 * Zod schema for list query parameters + cursor decode.
 *
 * Validates query parameters for GET /api/accessions listing endpoint.
 * Parses limit, cursor, source, modality, patient_national_id, from_date, to_date, include_deleted.
 *
 * Requirements: 7.4, 7.7, 7.8, 7A.7
 */

import { z } from 'zod';
import { decodeCursor, type DecodedCursor } from '../utils/cursor';
import { MODALITIES, type Modality } from '../types';

// ─── ISO Date Regex ──────────────────────────────────────────────────────────

const ISO_DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Validates that a string is a valid ISO date (YYYY-MM-DD) and represents a real date.
 */
function isValidIsoDate(value: string): boolean {
  if (!ISO_DATE_REGEX.test(value)) return false;
  const date = new Date(value + 'T00:00:00Z');
  if (isNaN(date.getTime())) return false;
  // Verify the date components match (catches invalid dates like 2024-02-30)
  const [year, month, day] = value.split('-').map(Number);
  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() + 1 === month &&
    date.getUTCDate() === day
  );
}

// ─── List Query Schema ───────────────────────────────────────────────────────

export const listQuerySchema = z
  .object({
    limit: z
      .string()
      .optional()
      .transform((val) => (val !== undefined ? parseInt(val, 10) : 50))
      .pipe(
        z
          .number()
          .int('limit must be an integer')
          .min(1, 'limit must be between 1 and 100')
          .max(100, 'limit must be between 1 and 100')
      ),

    cursor: z.string().optional(),

    source: z
      .enum(['internal', 'external'], {
        errorMap: () => ({
          message: "source must be 'internal' or 'external'",
        }),
      })
      .optional(),

    modality: z
      .enum(MODALITIES as unknown as [string, ...string[]], {
        errorMap: () => ({
          message: `modality must be one of: ${MODALITIES.join(', ')}`,
        }),
      })
      .optional() as z.ZodOptional<z.ZodType<Modality>>,

    patient_national_id: z.string().optional(),

    from_date: z
      .string()
      .optional()
      .refine((val) => val === undefined || isValidIsoDate(val), {
        message: 'from_date must be a valid ISO date (YYYY-MM-DD)',
      }),

    to_date: z
      .string()
      .optional()
      .refine((val) => val === undefined || isValidIsoDate(val), {
        message: 'to_date must be a valid ISO date (YYYY-MM-DD)',
      }),

    include_deleted: z
      .string()
      .optional()
      .transform((val) => val === 'true'),
  })
  .strict();

// ─── Parsed Query Result ─────────────────────────────────────────────────────

export interface ParsedListQuery {
  limit: number;
  cursor: DecodedCursor | undefined;
  source: 'internal' | 'external' | undefined;
  modality: Modality | undefined;
  patientNationalId: string | undefined;
  fromDate: string | undefined;
  toDate: string | undefined;
  includeDeleted: boolean;
}

// ─── Parse Function ──────────────────────────────────────────────────────────

/**
 * Parses and validates list query parameters.
 * Returns validated/parsed query params including the decoded cursor.
 *
 * @throws {z.ZodError} if validation fails
 * @throws {Error} with message 'Invalid cursor' if cursor cannot be decoded
 */
export function parseListQuery(
  query: Record<string, string | undefined>
): ParsedListQuery {
  const parsed = listQuerySchema.parse(query);

  // Decode cursor if provided
  let decodedCursor: DecodedCursor | undefined;
  if (parsed.cursor) {
    const decoded = decodeCursor(parsed.cursor);
    if (decoded === null) {
      throw new Error('Invalid cursor');
    }
    decodedCursor = decoded;
  }

  return {
    limit: parsed.limit,
    cursor: decodedCursor,
    source: parsed.source,
    modality: parsed.modality as Modality | undefined,
    patientNationalId: parsed.patient_national_id,
    fromDate: parsed.from_date,
    toDate: parsed.to_date,
    includeDeleted: parsed.include_deleted,
  };
}
