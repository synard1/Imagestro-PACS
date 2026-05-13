/**
 * Format pattern and accession config validation.
 *
 * Wraps the format pattern validation logic and adds timezone validation
 * using `validateTimezone` from `../utils/date-utils`.
 *
 * Requirements: 2.7, 2.8, 2.11, 2.13
 */

import { tokenize, Token } from '../utils/format-tokens';
import { validateTimezone } from '../utils/date-utils';
import { ValidationError, type ValidationErrorDetail } from '../errors';

// ─── Constants ───────────────────────────────────────────────────────────────

/** Maximum allowed length for a rendered accession number. */
const MAX_ACCESSION_LENGTH = 64;

/** Minimum allowed value for sequence_digits. */
const MIN_SEQUENCE_DIGITS = 1;

/** Maximum allowed value for sequence_digits. */
const MAX_SEQUENCE_DIGITS = 8;

/** Valid counter reset policies. */
const VALID_RESET_POLICIES = new Set(['DAILY', 'MONTHLY', 'NEVER']);

// ─── Types ───────────────────────────────────────────────────────────────────

export interface FormatPatternValidationResult {
  valid: boolean;
  errors: ValidationErrorDetail[];
}

export interface AccessionConfigInput {
  pattern: string;
  sequence_digits: number;
  timezone: string;
  counter_reset_policy: string;
  counter_backend?: string;
  orgCode?: string;
  siteCode?: string;
  useModalityInSeqScope?: boolean;
}

// ─── Format Pattern Validation ───────────────────────────────────────────────

/**
 * Validates a format pattern string.
 *
 * Checks:
 * 1. Pattern contains at least one sequence token ({N+} or {SEQn})
 * 2. The maximum possible rendered length does not exceed 64 characters
 *
 * @param pattern - The format pattern string to validate
 * @param sequenceDigits - The configured sequence digit count (used for max-length estimation)
 * @returns Validation result with errors array
 */
export function validateFormatPattern(
  pattern: string,
  sequenceDigits: number,
): FormatPatternValidationResult {
  const errors: ValidationErrorDetail[] = [];

  if (!pattern || pattern.trim().length === 0) {
    errors.push({ field: 'pattern', message: 'Format pattern must not be empty' });
    return { valid: false, errors };
  }

  const tokens = tokenize(pattern);

  // Check for at least one sequence token
  const hasSequenceToken = tokens.some((t) => t.isSequence);
  if (!hasSequenceToken) {
    errors.push({
      field: 'pattern',
      message: 'Format pattern must contain at least one sequence token ({N+} or {SEQn})',
    });
  }

  // Estimate maximum rendered length
  const maxLength = estimateMaxRenderedLength(tokens, sequenceDigits);
  if (maxLength > MAX_ACCESSION_LENGTH) {
    errors.push({
      field: 'pattern',
      message: `Format pattern would produce accession numbers exceeding ${MAX_ACCESSION_LENGTH} characters (estimated max: ${maxLength})`,
    });
  }

  return { valid: errors.length === 0, errors };
}

// ─── Full Config Validation ──────────────────────────────────────────────────

/**
 * Validates the full accession config object.
 *
 * Checks pattern validity, sequence_digits range, timezone validity,
 * and counter_reset_policy value.
 *
 * @param config - The accession config input to validate
 * @throws ValidationError if any validation checks fail
 */
export function validateAccessionConfig(config: AccessionConfigInput): void {
  const errors: ValidationErrorDetail[] = [];

  // Validate sequence_digits range
  if (
    config.sequence_digits == null ||
    !Number.isInteger(config.sequence_digits) ||
    config.sequence_digits < MIN_SEQUENCE_DIGITS ||
    config.sequence_digits > MAX_SEQUENCE_DIGITS
  ) {
    errors.push({
      field: 'sequence_digits',
      message: `sequence_digits must be an integer between ${MIN_SEQUENCE_DIGITS} and ${MAX_SEQUENCE_DIGITS}`,
    });
  }

  // Validate counter_reset_policy
  if (!config.counter_reset_policy || !VALID_RESET_POLICIES.has(config.counter_reset_policy)) {
    errors.push({
      field: 'counter_reset_policy',
      message: 'counter_reset_policy must be one of: DAILY, MONTHLY, NEVER',
    });
  }

  // Validate timezone (IANA identifier via Intl.DateTimeFormat)
  if (!config.timezone || config.timezone.trim().length === 0) {
    errors.push({
      field: 'timezone',
      message: 'timezone must not be empty',
    });
  } else {
    try {
      validateTimezone(config.timezone);
    } catch {
      errors.push({
        field: 'timezone',
        message: `Invalid IANA timezone: "${config.timezone}"`,
      });
    }
  }

  // Validate format pattern (only if sequence_digits is valid for estimation)
  if (config.pattern != null) {
    const digits =
      config.sequence_digits >= MIN_SEQUENCE_DIGITS &&
      config.sequence_digits <= MAX_SEQUENCE_DIGITS
        ? config.sequence_digits
        : 4; // fallback for estimation if digits invalid
    const patternResult = validateFormatPattern(config.pattern, digits);
    errors.push(...patternResult.errors);
  } else {
    errors.push({ field: 'pattern', message: 'pattern is required' });
  }

  // Validate counter_backend if provided
  if (config.counter_backend != null) {
    if (config.counter_backend !== 'D1' && config.counter_backend !== 'DURABLE_OBJECT') {
      errors.push({
        field: 'counter_backend',
        message: 'counter_backend must be either "D1" or "DURABLE_OBJECT"',
      });
    }
  }

  if (errors.length > 0) {
    throw new ValidationError(errors);
  }
}

// ─── Internal Helpers ────────────────────────────────────────────────────────

/**
 * Estimates the maximum possible rendered length of a format pattern.
 *
 * Uses worst-case lengths for each token type:
 * - Date tokens: fixed widths (YYYY=4, YY=2, MM=2, DD=2, DOY=3, HOUR=2, MIN=2, SEC=2)
 * - Context tokens: MOD=2, ORG=10, SITE=10 (reasonable upper bounds)
 * - Sequence tokens: uses sequenceDigits parameter
 * - Random tokens: uses the token's digit count
 * - Literals: exact length
 */
function estimateMaxRenderedLength(tokens: Token[], sequenceDigits: number): number {
  let length = 0;

  for (const token of tokens) {
    if (!token.isToken) {
      // Literal text — exact length
      length += token.text.length;
    } else if (token.isSequence) {
      // Sequence token — use configured sequence_digits or token's own digit count
      length += token.digits ?? sequenceDigits;
    } else if (token.isRandom) {
      // Random token — uses its own digit count
      length += token.digits ?? 3;
    } else {
      // Named token — use worst-case widths
      length += getTokenMaxWidth(token.normalized ?? '');
    }
  }

  return length;
}

/**
 * Returns the maximum rendered width for a known token name.
 */
function getTokenMaxWidth(normalized: string): number {
  switch (normalized) {
    case 'YYYY':
      return 4;
    case 'YY':
      return 2;
    case 'MM':
      return 2;
    case 'DD':
      return 2;
    case 'DOY':
      return 3;
    case 'HOUR':
      return 2;
    case 'MIN':
      return 2;
    case 'SEC':
      return 2;
    case 'MOD':
      return 2; // Modality codes are 2 chars (CT, MR, etc.)
    case 'ORG':
      return 10; // Reasonable upper bound for org codes
    case 'SITE':
      return 10; // Reasonable upper bound for site codes
    default:
      return 10; // Unknown tokens — conservative estimate
  }
}
