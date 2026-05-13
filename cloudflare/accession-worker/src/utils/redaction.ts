/**
 * PII redaction utility for structured logging.
 * Recursively walks objects and masks sensitive fields to prevent
 * patient data from appearing in logs.
 *
 * Redaction rules (per Requirement 15.7):
 * - patient_national_id: show last 4 chars with `****` prefix (e.g., `1234567890123456` → `****3456`)
 * - patient_ihs_number: replace with `P***********` (P + 11 asterisks)
 * - password/token/secret (case-insensitive key match): replace value with `[REDACTED]`
 */

/** Keys that are fully redacted (case-insensitive match). */
const FULLY_REDACTED_KEYS = /^(password|token|secret)$/i;

/**
 * Recursively redacts sensitive fields from an object or array.
 * Returns a new structure — the original is never mutated.
 *
 * @param obj - The value to redact. Non-object/array values pass through unchanged.
 * @returns A deep copy with sensitive fields masked.
 */
export function redact(obj: unknown): unknown {
  // Primitives and null pass through as-is
  if (obj === null || obj === undefined) {
    return obj;
  }

  if (typeof obj !== "object") {
    return obj;
  }

  // Arrays: recursively redact each element
  if (Array.isArray(obj)) {
    return obj.map((item) => redact(item));
  }

  // Objects: iterate keys and apply redaction rules
  const result: Record<string, unknown> = {};

  for (const key of Object.keys(obj as Record<string, unknown>)) {
    const value = (obj as Record<string, unknown>)[key];

    if (key === "patient_national_id") {
      result[key] = redactNationalId(value);
    } else if (key === "patient_ihs_number") {
      result[key] = redactIhsNumber(value);
    } else if (FULLY_REDACTED_KEYS.test(key)) {
      result[key] = "[REDACTED]";
    } else {
      result[key] = redact(value);
    }
  }

  return result;
}

/**
 * Masks a patient_national_id value, showing only the last 4 characters
 * with a `****` prefix. Non-string values are replaced with `****`.
 */
function redactNationalId(value: unknown): string {
  if (typeof value !== "string" || value.length === 0) {
    return "****";
  }
  const last4 = value.slice(-4);
  return `****${last4}`;
}

/**
 * Replaces a patient_ihs_number with `P***********` (P + 11 asterisks).
 * The actual value is never exposed.
 */
function redactIhsNumber(_value: unknown): string {
  return "P***********";
}
