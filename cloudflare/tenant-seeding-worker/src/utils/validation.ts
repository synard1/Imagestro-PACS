/**
 * Validation utilities for the Tenant Seeding Worker.
 *
 * Validates incoming event payloads against the TenantCreatedEvent schema.
 */

/** Result of validating a TenantCreatedEvent payload */
export interface ValidationResult {
  valid: boolean;
  errors: string[];
}

/**
 * Simple email format validation.
 * Checks for: non-empty local part, @ symbol, non-empty domain with at least one dot.
 */
function isValidEmail(value: string): boolean {
  // Basic structural check: local@domain.tld
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(value);
}

/**
 * Validates an unknown payload against the TenantCreatedEvent schema.
 *
 * Checks:
 * - tenant_id: non-empty string
 * - tenant_code: non-empty string
 * - tenant_name: non-empty string, max 255 characters
 * - tenant_email: non-empty string, valid email format
 *
 * @param payload - The unknown payload to validate
 * @returns ValidationResult with valid flag and array of field-level error messages
 */
export function validateTenantCreatedEvent(payload: unknown): ValidationResult {
  const errors: string[] = [];

  if (payload === null || payload === undefined || typeof payload !== 'object') {
    return { valid: false, errors: ['Payload must be a non-null object'] };
  }

  const data = payload as Record<string, unknown>;

  // Validate tenant_id
  if (typeof data.tenant_id !== 'string' || data.tenant_id.trim() === '') {
    errors.push('tenant_id must be a non-empty string');
  }

  // Validate tenant_code
  if (typeof data.tenant_code !== 'string' || data.tenant_code.trim() === '') {
    errors.push('tenant_code must be a non-empty string');
  }

  // Validate tenant_name
  if (typeof data.tenant_name !== 'string' || data.tenant_name.trim() === '') {
    errors.push('tenant_name must be a non-empty string');
  } else if (data.tenant_name.length > 255) {
    errors.push('tenant_name must not exceed 255 characters');
  }

  // Validate tenant_email
  if (typeof data.tenant_email !== 'string' || data.tenant_email.trim() === '') {
    errors.push('tenant_email must be a non-empty string');
  } else if (!isValidEmail(data.tenant_email)) {
    errors.push('tenant_email must be a valid email format');
  }

  return { valid: errors.length === 0, errors };
}
