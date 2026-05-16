/**
 * Property test 2.2: Event validation accepts valid and rejects invalid payloads.
 *
 * Property 2: For any JSON payload, the validation function SHALL accept it
 * if and only if it contains a non-empty tenant_id string, a non-empty
 * tenant_code string, a non-empty tenant_name string (max 255 chars),
 * and a non-empty tenant_email string in valid email format.
 *
 * Validates: Requirements 2.1, 2.2
 */

import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { validateTenantCreatedEvent } from '../../src/utils/validation';

// Arbitrary: non-empty string (no whitespace-only)
const arbNonEmptyString = fc.string({ minLength: 1 }).filter((s) => s.trim().length > 0);

// Arbitrary: valid email format (local@domain.tld)
const arbValidEmail = fc
  .tuple(
    fc.stringMatching(/^[a-zA-Z0-9._%+-]+$/, { minLength: 1, maxLength: 20 }),
    fc.stringMatching(/^[a-zA-Z0-9-]+$/, { minLength: 1, maxLength: 15 }),
    fc.stringMatching(/^[a-zA-Z]{2,6}$/, { minLength: 2, maxLength: 6 })
  )
  .map(([local, domain, tld]) => `${local}@${domain}.${tld}`);

// Arbitrary: valid tenant_name (1-255 chars, non-empty after trim)
const arbTenantName = fc
  .string({ minLength: 1, maxLength: 255 })
  .filter((s) => s.trim().length > 0);

// Arbitrary: valid TenantCreatedEvent payload
const arbValidPayload = fc.record({
  event_id: fc.uuid(),
  tenant_id: arbNonEmptyString,
  tenant_code: arbNonEmptyString,
  tenant_name: arbTenantName,
  tenant_email: arbValidEmail,
  created_at: fc.date().map((d) => d.toISOString()),
});

describe('Feature: tenant-user-seeding, Property 2: Event validation', () => {
  it('accepts all valid payloads', () => {
    fc.assert(
      fc.property(arbValidPayload, (payload) => {
        const result = validateTenantCreatedEvent(payload);
        expect(result.valid).toBe(true);
        expect(result.errors).toHaveLength(0);
      }),
      { numRuns: 100 }
    );
  });

  it('rejects payloads with empty tenant_id', () => {
    fc.assert(
      fc.property(arbValidPayload, (payload) => {
        const invalid = { ...payload, tenant_id: '' };
        const result = validateTenantCreatedEvent(invalid);
        expect(result.valid).toBe(false);
        expect(result.errors).toContain('tenant_id must be a non-empty string');
      }),
      { numRuns: 100 }
    );
  });

  it('rejects payloads with empty tenant_code', () => {
    fc.assert(
      fc.property(arbValidPayload, (payload) => {
        const invalid = { ...payload, tenant_code: '' };
        const result = validateTenantCreatedEvent(invalid);
        expect(result.valid).toBe(false);
        expect(result.errors).toContain('tenant_code must be a non-empty string');
      }),
      { numRuns: 100 }
    );
  });

  it('rejects payloads with empty tenant_name', () => {
    fc.assert(
      fc.property(arbValidPayload, (payload) => {
        const invalid = { ...payload, tenant_name: '' };
        const result = validateTenantCreatedEvent(invalid);
        expect(result.valid).toBe(false);
        expect(result.errors).toContain('tenant_name must be a non-empty string');
      }),
      { numRuns: 100 }
    );
  });

  it('rejects payloads with tenant_name exceeding 255 chars', () => {
    fc.assert(
      fc.property(
        arbValidPayload,
        fc.string({ minLength: 256, maxLength: 500 }).filter((s) => s.trim().length > 0),
        (payload, longName) => {
          const invalid = { ...payload, tenant_name: longName };
          const result = validateTenantCreatedEvent(invalid);
          expect(result.valid).toBe(false);
          expect(result.errors).toContain('tenant_name must not exceed 255 characters');
        }
      ),
      { numRuns: 100 }
    );
  });

  it('rejects payloads with invalid email format', () => {
    fc.assert(
      fc.property(
        arbValidPayload,
        fc.string({ minLength: 1, maxLength: 50 }).filter((s) => !s.includes('@') || !s.includes('.')),
        (payload, badEmail) => {
          const invalid = { ...payload, tenant_email: badEmail };
          const result = validateTenantCreatedEvent(invalid);
          // Either invalid email format or empty string
          expect(result.valid).toBe(false);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('rejects non-object payloads', () => {
    fc.assert(
      fc.property(
        fc.oneof(fc.string(), fc.integer(), fc.boolean(), fc.constant(null), fc.constant(undefined)),
        (payload) => {
          const result = validateTenantCreatedEvent(payload);
          expect(result.valid).toBe(false);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('rejects payloads with non-string tenant_id', () => {
    fc.assert(
      fc.property(
        arbValidPayload,
        fc.oneof(fc.integer(), fc.boolean(), fc.constant(null), fc.constant(undefined)),
        (payload, badValue) => {
          const invalid = { ...payload, tenant_id: badValue };
          const result = validateTenantCreatedEvent(invalid);
          expect(result.valid).toBe(false);
          expect(result.errors).toContain('tenant_id must be a non-empty string');
        }
      ),
      { numRuns: 100 }
    );
  });
});
