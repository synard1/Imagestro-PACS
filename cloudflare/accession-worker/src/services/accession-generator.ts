/**
 * Accession number generation service.
 *
 * Responsible for:
 * - Rendering accession numbers from configurable format patterns
 * - Computing counter scopes for sequence isolation
 * - Validating format patterns before persistence
 *
 * Requirements: 1.1, 1.2, 1.4, 2.1, 2.2, 2.6, 2.7, 2.8, 2.14, 5.4
 */

import { tokenize, type Token } from '../utils/format-tokens';
import {
  computeDatePartsInTimezone,
  computeDateBucket,
  type DateParts,
} from '../utils/date-utils';
import type { AccessionConfig } from '../models/config';
import type { CounterScope } from '../models/counter';

// ─── Re-exports ──────────────────────────────────────────────────────────────

export { computeDateBucket, computeDatePartsInTimezone };

// ─── Types ───────────────────────────────────────────────────────────────────

/**
 * Input required to render a complete accession number.
 */
export interface GenerateAccessionInput {
  /** Tenant's accession configuration (pattern, timezone, orgCode, etc.) */
  config: AccessionConfig;
  /** Modality code (e.g., "CT", "MR") */
  modality: string;
  /** Facility code */
  facilityCode: string;
  /** Tenant identifier */
  tenantId: string;
  /** Sequence number obtained from the counter */
  sequenceNumber: number;
  /** Date to use for date tokens; defaults to current time */
  date?: Date;
}

/**
 * Result of format pattern validation.
 */
export interface ValidationResult {
  valid: boolean;
  errors: string[];
}

// ─── Rendering ───────────────────────────────────────────────────────────────

/**
 * Renders an accession number by replacing tokens in the configured pattern
 * with their computed values.
 *
 * - Date tokens use the tenant's configured timezone
 * - Sequence tokens are zero-padded to their digit count
 * - Random tokens produce random digits
 * - MOD = modality, ORG = config.orgCode, SITE = config.siteCode
 *
 * @param input - All values needed to render the accession number
 * @returns The fully rendered accession number string
 */
export function renderAccessionNumber(input: GenerateAccessionInput): string {
  const { config, modality, sequenceNumber, date = new Date() } = input;
  const tokens = tokenize(config.pattern);
  const dp = computeDatePartsInTimezone(date, config.timezone);

  let result = '';
  for (const token of tokens) {
    if (!token.isToken) {
      result += token.text;
      continue;
    }
    switch (token.normalized) {
      case 'YYYY':
        result += dp.year;
        break;
      case 'YY':
        result += dp.year.slice(2);
        break;
      case 'MM':
        result += dp.month;
        break;
      case 'DD':
        result += dp.day;
        break;
      case 'DOY':
        result += dp.dayOfYear;
        break;
      case 'HOUR':
        result += dp.hour;
        break;
      case 'MIN':
        result += dp.minute;
        break;
      case 'SEC':
        result += dp.second;
        break;
      case 'MOD':
        result += modality;
        break;
      case 'ORG':
        result += config.orgCode ?? '';
        break;
      case 'SITE':
        result += config.siteCode ?? '';
        break;
      default:
        if (token.isSequence) {
          result += String(sequenceNumber).padStart(token.digits!, '0');
        } else if (token.isRandom) {
          result += randomDigits(token.digits!);
        }
        break;
    }
  }
  return result;
}

// ─── Counter Scope ───────────────────────────────────────────────────────────

/**
 * Computes the counter scope that determines sequence number isolation.
 *
 * When `useModalityInSeqScope` is false, the modality field is set to an
 * empty string so all modalities share the same counter within the scope.
 *
 * @param tenantId - Tenant identifier
 * @param facilityCode - Facility code
 * @param modality - Modality code (e.g., "CT")
 * @param dateBucket - Date bucket string from computeDateBucket
 * @param useModalityInSeqScope - Whether to include modality in the scope
 * @returns A CounterScope object for counter lookup/increment
 */
export function computeCounterScope(
  tenantId: string,
  facilityCode: string,
  modality: string,
  dateBucket: string,
  useModalityInSeqScope: boolean,
): CounterScope {
  return {
    tenantId,
    facilityCode,
    modality: useModalityInSeqScope ? modality : '',
    dateBucket,
  };
}

// ─── Pattern Validation ──────────────────────────────────────────────────────

/** Maximum allowed length for a rendered accession number */
const MAX_ACCESSION_LENGTH = 64;

/**
 * Validates a format pattern to ensure it meets the following constraints:
 * 1. Contains at least one sequence token ({NNN...} or {SEQn})
 * 2. The maximum possible rendered length does not exceed 64 characters
 *
 * The max length is computed by assuming worst-case values for each token:
 * - Date tokens: fixed widths (YYYY=4, YY=2, MM=2, DD=2, DOY=3, HOUR=2, MIN=2, SEC=2)
 * - MOD: max modality length (2 chars, e.g., "CT", "MR")
 * - ORG/SITE: estimated max 20 chars each
 * - Sequence: sequenceDigits parameter
 * - Random: digit count from token
 * - Literals: exact length
 *
 * @param pattern - The format pattern string to validate
 * @param sequenceDigits - The configured sequence_digits value (padding length)
 * @returns ValidationResult with valid flag and any error messages
 */
export function validateFormatPattern(
  pattern: string,
  sequenceDigits: number,
): ValidationResult {
  const errors: string[] = [];
  const tokens = tokenize(pattern);

  // Check for at least one sequence token
  const hasSequenceToken = tokens.some((t) => t.isToken && t.isSequence);
  if (!hasSequenceToken) {
    errors.push(
      'Format pattern must contain at least one sequence token ({NNN...} or {SEQn})',
    );
  }

  // Compute maximum possible rendered length
  const maxLength = computeMaxRenderedLength(tokens, sequenceDigits);
  if (maxLength > MAX_ACCESSION_LENGTH) {
    errors.push(
      `Format pattern may produce accession numbers up to ${maxLength} characters, exceeding the maximum of ${MAX_ACCESSION_LENGTH}`,
    );
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

// ─── Internal Helpers ────────────────────────────────────────────────────────

/**
 * Generates a string of random decimal digits.
 */
function randomDigits(count: number): string {
  let result = '';
  for (let i = 0; i < count; i++) {
    result += Math.floor(Math.random() * 10).toString();
  }
  return result;
}

/**
 * Computes the maximum possible rendered length of a token array.
 * Uses worst-case assumptions for variable-length tokens.
 */
function computeMaxRenderedLength(tokens: Token[], sequenceDigits: number): number {
  let length = 0;
  for (const token of tokens) {
    if (!token.isToken) {
      length += token.text.length;
      continue;
    }
    switch (token.normalized) {
      case 'YYYY':
        length += 4;
        break;
      case 'YY':
        length += 2;
        break;
      case 'MM':
        length += 2;
        break;
      case 'DD':
        length += 2;
        break;
      case 'DOY':
        length += 3;
        break;
      case 'HOUR':
        length += 2;
        break;
      case 'MIN':
        length += 2;
        break;
      case 'SEC':
        length += 2;
        break;
      case 'MOD':
        // Modality codes are 2 characters (CT, MR, CR, DX, US, XA, RF, MG, NM, PT)
        length += 2;
        break;
      case 'ORG':
        // Org codes: assume max 20 characters
        length += 20;
        break;
      case 'SITE':
        // Site codes: assume max 20 characters
        length += 20;
        break;
      default:
        if (token.isSequence) {
          // Use the configured sequenceDigits for the max width
          length += Math.max(token.digits!, sequenceDigits);
        } else if (token.isRandom) {
          length += token.digits!;
        }
        break;
    }
  }
  return length;
}
