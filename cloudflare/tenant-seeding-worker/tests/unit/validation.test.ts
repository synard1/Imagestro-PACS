import { describe, it, expect } from 'vitest';
import { validateTenantCreatedEvent } from '../../src/utils/validation';

describe('validateTenantCreatedEvent', () => {
  const validPayload = {
    tenant_id: '550e8400-e29b-41d4-a716-446655440000',
    tenant_code: 'hospital-a',
    tenant_name: 'Hospital A',
    tenant_email: 'admin@hospital-a.com',
    event_id: '660e8400-e29b-41d4-a716-446655440001',
    created_at: '2025-01-15T10:00:00Z',
  };

  it('accepts a valid payload', () => {
    const result = validateTenantCreatedEvent(validPayload);
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('rejects null payload', () => {
    const result = validateTenantCreatedEvent(null);
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('Payload must be a non-null object');
  });

  it('rejects undefined payload', () => {
    const result = validateTenantCreatedEvent(undefined);
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('Payload must be a non-null object');
  });

  it('rejects non-object payload', () => {
    const result = validateTenantCreatedEvent('string');
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('Payload must be a non-null object');
  });

  it('rejects missing tenant_id', () => {
    const { tenant_id, ...payload } = validPayload;
    const result = validateTenantCreatedEvent(payload);
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('tenant_id must be a non-empty string');
  });

  it('rejects empty tenant_id', () => {
    const result = validateTenantCreatedEvent({ ...validPayload, tenant_id: '' });
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('tenant_id must be a non-empty string');
  });

  it('rejects whitespace-only tenant_id', () => {
    const result = validateTenantCreatedEvent({ ...validPayload, tenant_id: '   ' });
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('tenant_id must be a non-empty string');
  });

  it('rejects missing tenant_code', () => {
    const { tenant_code, ...payload } = validPayload;
    const result = validateTenantCreatedEvent(payload);
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('tenant_code must be a non-empty string');
  });

  it('rejects empty tenant_code', () => {
    const result = validateTenantCreatedEvent({ ...validPayload, tenant_code: '' });
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('tenant_code must be a non-empty string');
  });

  it('rejects missing tenant_name', () => {
    const { tenant_name, ...payload } = validPayload;
    const result = validateTenantCreatedEvent(payload);
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('tenant_name must be a non-empty string');
  });

  it('rejects empty tenant_name', () => {
    const result = validateTenantCreatedEvent({ ...validPayload, tenant_name: '' });
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('tenant_name must be a non-empty string');
  });

  it('rejects tenant_name exceeding 255 characters', () => {
    const longName = 'A'.repeat(256);
    const result = validateTenantCreatedEvent({ ...validPayload, tenant_name: longName });
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('tenant_name must not exceed 255 characters');
  });

  it('accepts tenant_name at exactly 255 characters', () => {
    const maxName = 'A'.repeat(255);
    const result = validateTenantCreatedEvent({ ...validPayload, tenant_name: maxName });
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('rejects missing tenant_email', () => {
    const { tenant_email, ...payload } = validPayload;
    const result = validateTenantCreatedEvent(payload);
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('tenant_email must be a non-empty string');
  });

  it('rejects empty tenant_email', () => {
    const result = validateTenantCreatedEvent({ ...validPayload, tenant_email: '' });
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('tenant_email must be a non-empty string');
  });

  it('rejects invalid email format (no @)', () => {
    const result = validateTenantCreatedEvent({ ...validPayload, tenant_email: 'invalid-email' });
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('tenant_email must be a valid email format');
  });

  it('rejects invalid email format (no domain dot)', () => {
    const result = validateTenantCreatedEvent({ ...validPayload, tenant_email: 'user@domain' });
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('tenant_email must be a valid email format');
  });

  it('rejects invalid email format (no local part)', () => {
    const result = validateTenantCreatedEvent({ ...validPayload, tenant_email: '@domain.com' });
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('tenant_email must be a valid email format');
  });

  it('collects multiple errors at once', () => {
    const result = validateTenantCreatedEvent({});
    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThanOrEqual(4);
  });

  it('rejects non-string tenant_id (number)', () => {
    const result = validateTenantCreatedEvent({ ...validPayload, tenant_id: 123 });
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('tenant_id must be a non-empty string');
  });

  it('accepts valid email formats', () => {
    const emails = ['user@example.com', 'a@b.co', 'test+tag@sub.domain.org'];
    for (const email of emails) {
      const result = validateTenantCreatedEvent({ ...validPayload, tenant_email: email });
      expect(result.valid).toBe(true);
    }
  });
});
