/**
 * Validator for externally-supplied accession numbers (e.g., from SIMRS).
 *
 * Rules:
 * 1. Must not be empty or whitespace-only
 * 2. Must be ≤ 64 characters
 * 3. Must contain only printable ASCII (chars 0x20–0x7E), no control characters
 * 4. Must not be only whitespace
 *
 * Requirements: 17.7
 */

export interface ExternalAccessionValidationResult {
  valid: boolean;
  error?: string;
}

/**
 * Validates an externally-supplied accession number.
 *
 * @param value - The accession number string to validate
 * @returns An object with `valid: true` if the value passes all checks,
 *          or `valid: false` with an `error` message describing the failure.
 */
export function validateExternalAccessionNumber(
  value: string,
): ExternalAccessionValidationResult {
  // Rule 1: Must not be empty
  if (value.length === 0) {
    return { valid: false, error: 'External accession number must not be empty' };
  }

  // Rule 2: Must be ≤ 64 characters
  if (value.length > 64) {
    return {
      valid: false,
      error: `External accession number must not exceed 64 characters (got ${value.length})`,
    };
  }

  // Rule 3: Must contain only printable ASCII (0x20–0x7E)
  for (let i = 0; i < value.length; i++) {
    const code = value.charCodeAt(i);
    if (code < 0x20 || code > 0x7e) {
      return {
        valid: false,
        error: `External accession number contains invalid character at position ${i} (code ${code}). Only printable ASCII characters (0x20-0x7E) are allowed`,
      };
    }
  }

  // Rule 4: Must not be only whitespace (space is 0x20, which is printable,
  // so a string of only spaces passes rule 3 but should fail here)
  if (value.trim().length === 0) {
    return {
      valid: false,
      error: 'External accession number must not consist of only whitespace',
    };
  }

  return { valid: true };
}
