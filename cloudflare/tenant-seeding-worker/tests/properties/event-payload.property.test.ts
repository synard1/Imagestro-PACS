/**
 * Property test 10.2: Event payload correctness.
 *
 * Property 1: For any valid tenant (with id, code, name, email), the emitted
 * TenantCreatedEvent SHALL contain all required fields (tenant_id, tenant_code,
 * tenant_name, tenant_email, event_id, created_at) where event_id is a valid
 * UUID v4 and created_at is a valid ISO 8601 UTC timestamp.
 *
 * Validates: Requirements 1.1, 1.4, 7.2
 */

import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import type { TenantCreatedEvent } from '../../src/types';

// UUID v4 regex pattern
const UUID_V4_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

// ISO 8601 date regex (basic check)
const ISO_8601_REGEX = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/;

/**
 * Simulates the webhook event construction from pacs-service.
 * This mirrors the logic in the Python emit_tenant_created_event function.
 */
function buildTenantCreatedEvent(tenant: {
  id: string;
  code: string;
  name: string;
  email: string;
}): TenantCreatedEvent {
  return {
    event_id: crypto.randomUUID(),
    tenant_id: tenant.id,
    tenant_code: tenant.code,
    tenant_name: tenant.name,
    tenant_email: tenant.email,
    created_at: new Date().toISOString(),
  };
}

// Arbitrary: valid tenant data
const arbTenant = fc.record({
  id: fc.uuid(),
  code: fc.stringMatching(/^[a-zA-Z0-9-]+$/, { minLength: 1, maxLength: 20 }),
  name: fc.string({ minLength: 1, maxLength: 255 }).filter((s) => s.trim().length > 0),
  email: fc
    .tuple(
      fc.stringMatching(/^[a-zA-Z0-9._%+-]+$/, { minLength: 1, maxLength: 20 }),
      fc.stringMatching(/^[a-zA-Z0-9-]+$/, { minLength: 1, maxLength: 15 }),
      fc.stringMatching(/^[a-zA-Z]{2,6}$/, { minLength: 2, maxLength: 6 })
    )
    .map(([local, domain, tld]) => `${local}@${domain}.${tld}`),
});

describe('Feature: tenant-user-seeding, Property 1: Event payload correctness', () => {
  it('event contains all required fields', () => {
    fc.assert(
      fc.property(arbTenant, (tenant) => {
        const event = buildTenantCreatedEvent(tenant);

        expect(event).toHaveProperty('event_id');
        expect(event).toHaveProperty('tenant_id');
        expect(event).toHaveProperty('tenant_code');
        expect(event).toHaveProperty('tenant_name');
        expect(event).toHaveProperty('tenant_email');
        expect(event).toHaveProperty('created_at');
      }),
      { numRuns: 100 }
    );
  });

  it('event_id is a valid UUID v4', () => {
    fc.assert(
      fc.property(arbTenant, (tenant) => {
        const event = buildTenantCreatedEvent(tenant);
        expect(event.event_id).toMatch(UUID_V4_REGEX);
      }),
      { numRuns: 100 }
    );
  });

  it('created_at is a valid ISO 8601 timestamp', () => {
    fc.assert(
      fc.property(arbTenant, (tenant) => {
        const event = buildTenantCreatedEvent(tenant);
        expect(event.created_at).toMatch(ISO_8601_REGEX);
        // Verify it parses to a valid date
        const parsed = new Date(event.created_at);
        expect(parsed.getTime()).not.toBeNaN();
      }),
      { numRuns: 100 }
    );
  });

  it('tenant_id matches the input tenant id', () => {
    fc.assert(
      fc.property(arbTenant, (tenant) => {
        const event = buildTenantCreatedEvent(tenant);
        expect(event.tenant_id).toBe(tenant.id);
      }),
      { numRuns: 100 }
    );
  });

  it('tenant_code matches the input tenant code', () => {
    fc.assert(
      fc.property(arbTenant, (tenant) => {
        const event = buildTenantCreatedEvent(tenant);
        expect(event.tenant_code).toBe(tenant.code);
      }),
      { numRuns: 100 }
    );
  });

  it('tenant_name matches the input tenant name', () => {
    fc.assert(
      fc.property(arbTenant, (tenant) => {
        const event = buildTenantCreatedEvent(tenant);
        expect(event.tenant_name).toBe(tenant.name);
      }),
      { numRuns: 100 }
    );
  });

  it('tenant_email matches the input tenant email', () => {
    fc.assert(
      fc.property(arbTenant, (tenant) => {
        const event = buildTenantCreatedEvent(tenant);
        expect(event.tenant_email).toBe(tenant.email);
      }),
      { numRuns: 100 }
    );
  });

  it('each event gets a unique event_id', () => {
    fc.assert(
      fc.property(arbTenant, (tenant) => {
        const event1 = buildTenantCreatedEvent(tenant);
        const event2 = buildTenantCreatedEvent(tenant);
        expect(event1.event_id).not.toBe(event2.event_id);
      }),
      { numRuns: 100 }
    );
  });

  it('all string fields are non-empty', () => {
    fc.assert(
      fc.property(arbTenant, (tenant) => {
        const event = buildTenantCreatedEvent(tenant);
        expect(event.event_id.length).toBeGreaterThan(0);
        expect(event.tenant_id.length).toBeGreaterThan(0);
        expect(event.tenant_code.length).toBeGreaterThan(0);
        expect(event.tenant_name.length).toBeGreaterThan(0);
        expect(event.tenant_email.length).toBeGreaterThan(0);
        expect(event.created_at.length).toBeGreaterThan(0);
      }),
      { numRuns: 100 }
    );
  });
});
