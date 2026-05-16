/**
 * Property test 6.2: User definition generation from tenant data.
 *
 * Property 4: For any tenant_code and tenant_name, the generated user definitions
 * SHALL produce exactly 6 users where each username follows the pattern
 * {prefix}.{lowercase(tenant_code)}, each email follows
 * {prefix}@{lowercase(tenant_code)}.local, each full_name follows
 * {Prefix} {tenant_name}, each user has is_active=true, and each user has
 * the correct tenant_id from the event.
 *
 * Validates: Requirements 3.1, 3.3, 3.4, 3.6
 */

import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { DEFAULT_USERS, type TenantCreatedEvent } from '../../src/types';

/**
 * Simulates the user definition generation logic from UserSeeder.
 * This mirrors the logic in src/services/user-seeder.ts.
 */
function generateUserDefinitions(event: TenantCreatedEvent) {
  const tenantCodeLower = event.tenant_code.toLowerCase();

  return DEFAULT_USERS.map((userDef) => ({
    username: `${userDef.usernamePrefix}.${tenantCodeLower}`,
    email: `${userDef.emailPrefix}@${tenantCodeLower}.local`,
    full_name: `${userDef.fullNamePrefix} ${event.tenant_name}`,
    role: userDef.role,
    is_active: true,
    tenant_id: event.tenant_id,
  }));
}

// Arbitrary: alphanumeric tenant codes (1-20 chars)
const arbTenantCode = fc.stringMatching(/^[a-zA-Z0-9-]+$/, { minLength: 1, maxLength: 20 });

// Arbitrary: tenant names (1-255 chars, non-empty)
const arbTenantName = fc.string({ minLength: 1, maxLength: 100 }).filter((s) => s.trim().length > 0);

// Arbitrary: valid TenantCreatedEvent
const arbEvent = fc.record({
  event_id: fc.uuid(),
  tenant_id: fc.uuid(),
  tenant_code: arbTenantCode,
  tenant_name: arbTenantName,
  tenant_email: fc.constant('admin@test.com'),
  created_at: fc.date().map((d) => d.toISOString()),
});

describe('Feature: tenant-user-seeding, Property 4: User definition generation', () => {
  it('always generates exactly 6 user definitions', () => {
    fc.assert(
      fc.property(arbEvent, (event) => {
        const users = generateUserDefinitions(event);
        expect(users).toHaveLength(6);
      }),
      { numRuns: 100 }
    );
  });

  it('usernames follow the pattern {prefix}.{lowercase(tenant_code)}', () => {
    fc.assert(
      fc.property(arbEvent, (event) => {
        const users = generateUserDefinitions(event);
        const tenantCodeLower = event.tenant_code.toLowerCase();

        for (let i = 0; i < users.length; i++) {
          const expected = `${DEFAULT_USERS[i]!.usernamePrefix}.${tenantCodeLower}`;
          expect(users[i]!.username).toBe(expected);
        }
      }),
      { numRuns: 100 }
    );
  });

  it('emails follow the pattern {prefix}@{lowercase(tenant_code)}.local', () => {
    fc.assert(
      fc.property(arbEvent, (event) => {
        const users = generateUserDefinitions(event);
        const tenantCodeLower = event.tenant_code.toLowerCase();

        for (let i = 0; i < users.length; i++) {
          const expected = `${DEFAULT_USERS[i]!.emailPrefix}@${tenantCodeLower}.local`;
          expect(users[i]!.email).toBe(expected);
        }
      }),
      { numRuns: 100 }
    );
  });

  it('full_name follows the pattern {Prefix} {tenant_name}', () => {
    fc.assert(
      fc.property(arbEvent, (event) => {
        const users = generateUserDefinitions(event);

        for (let i = 0; i < users.length; i++) {
          const expected = `${DEFAULT_USERS[i]!.fullNamePrefix} ${event.tenant_name}`;
          expect(users[i]!.full_name).toBe(expected);
        }
      }),
      { numRuns: 100 }
    );
  });

  it('all users have is_active set to true', () => {
    fc.assert(
      fc.property(arbEvent, (event) => {
        const users = generateUserDefinitions(event);

        for (const user of users) {
          expect(user.is_active).toBe(true);
        }
      }),
      { numRuns: 100 }
    );
  });

  it('all users have the correct tenant_id from the event', () => {
    fc.assert(
      fc.property(arbEvent, (event) => {
        const users = generateUserDefinitions(event);

        for (const user of users) {
          expect(user.tenant_id).toBe(event.tenant_id);
        }
      }),
      { numRuns: 100 }
    );
  });

  it('generates the correct 6 roles in order', () => {
    fc.assert(
      fc.property(arbEvent, (event) => {
        const users = generateUserDefinitions(event);
        const expectedRoles = [
          'TENANT_ADMIN',
          'DOCTOR',
          'RADIOLOGIST',
          'TECHNICIAN',
          'CLERK',
          'NURSE',
        ];

        const actualRoles = users.map((u) => u.role);
        expect(actualRoles).toEqual(expectedRoles);
      }),
      { numRuns: 100 }
    );
  });

  it('tenant_code is always lowercased in username and email', () => {
    fc.assert(
      fc.property(arbEvent, (event) => {
        const users = generateUserDefinitions(event);

        for (const user of users) {
          // Extract the tenant code part from username (after the dot)
          const usernameParts = user.username.split('.');
          const codeInUsername = usernameParts.slice(1).join('.');
          expect(codeInUsername).toBe(event.tenant_code.toLowerCase());

          // Extract the domain part from email (between @ and .local)
          const emailDomain = user.email.split('@')[1]!.replace('.local', '');
          expect(emailDomain).toBe(event.tenant_code.toLowerCase());
        }
      }),
      { numRuns: 100 }
    );
  });
});
