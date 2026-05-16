/**
 * Property test 7.4: Manual trigger skipping existing roles.
 *
 * Property 9: For any tenant with an existing set of users covering a subset
 * of the 6 default roles, the manual trigger SHALL create users only for
 * roles not already present, and the count of created users SHALL equal
 * 6 - count(existing_roles).
 *
 * Validates: Requirements 8.4
 */

import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { DEFAULT_USERS } from '../../src/types';

const ALL_ROLES = DEFAULT_USERS.map((u) => u.role);

/**
 * Simulates the manual trigger's role-skipping logic.
 * Given a set of existing roles, determines which roles to create.
 */
function computeRolesToCreate(existingRoles: string[]): {
  rolesToCreate: string[];
  rolesToSkip: string[];
} {
  const existingSet = new Set(existingRoles.map((r) => r.toUpperCase()));

  const rolesToSkip: string[] = [];
  const rolesToCreate: string[] = [];

  for (const userDef of DEFAULT_USERS) {
    if (existingSet.has(userDef.role)) {
      rolesToSkip.push(userDef.role);
    } else {
      rolesToCreate.push(userDef.role);
    }
  }

  return { rolesToCreate, rolesToSkip };
}

// Arbitrary: subset of the 6 default roles
const arbExistingRoles = fc.subarray(ALL_ROLES, { minLength: 0, maxLength: 6 });

describe('Feature: tenant-user-seeding, Property 9: Manual trigger skips existing roles', () => {
  it('roles to create + roles to skip always equals 6 (total default roles)', () => {
    fc.assert(
      fc.property(arbExistingRoles, (existingRoles) => {
        const { rolesToCreate, rolesToSkip } = computeRolesToCreate(existingRoles);
        expect(rolesToCreate.length + rolesToSkip.length).toBe(6);
      }),
      { numRuns: 100 }
    );
  });

  it('roles to create equals 6 - count(existing_roles)', () => {
    fc.assert(
      fc.property(arbExistingRoles, (existingRoles) => {
        const uniqueExisting = new Set(existingRoles);
        const { rolesToCreate } = computeRolesToCreate(existingRoles);
        expect(rolesToCreate.length).toBe(6 - uniqueExisting.size);
      }),
      { numRuns: 100 }
    );
  });

  it('existing roles are always in the skipped set', () => {
    fc.assert(
      fc.property(arbExistingRoles, (existingRoles) => {
        const { rolesToSkip } = computeRolesToCreate(existingRoles);
        for (const role of existingRoles) {
          expect(rolesToSkip).toContain(role);
        }
      }),
      { numRuns: 100 }
    );
  });

  it('roles to create never overlap with existing roles', () => {
    fc.assert(
      fc.property(arbExistingRoles, (existingRoles) => {
        const existingSet = new Set(existingRoles);
        const { rolesToCreate } = computeRolesToCreate(existingRoles);
        for (const role of rolesToCreate) {
          expect(existingSet.has(role)).toBe(false);
        }
      }),
      { numRuns: 100 }
    );
  });

  it('when no roles exist, all 6 roles are created', () => {
    const { rolesToCreate, rolesToSkip } = computeRolesToCreate([]);
    expect(rolesToCreate).toHaveLength(6);
    expect(rolesToSkip).toHaveLength(0);
    expect(rolesToCreate).toEqual(ALL_ROLES);
  });

  it('when all roles exist, no roles are created', () => {
    const { rolesToCreate, rolesToSkip } = computeRolesToCreate(ALL_ROLES);
    expect(rolesToCreate).toHaveLength(0);
    expect(rolesToSkip).toHaveLength(6);
  });

  it('role matching is case-insensitive', () => {
    fc.assert(
      fc.property(arbExistingRoles, (existingRoles) => {
        // Test with lowercase versions
        const lowercaseRoles = existingRoles.map((r) => r.toLowerCase());
        const { rolesToCreate: fromLower } = computeRolesToCreate(lowercaseRoles);

        // Test with uppercase versions
        const { rolesToCreate: fromUpper } = computeRolesToCreate(existingRoles);

        // Both should produce the same result since we uppercase in the function
        expect(fromLower.length).toBe(fromUpper.length);
      }),
      { numRuns: 50 }
    );
  });

  it('roles to create are always valid default roles', () => {
    fc.assert(
      fc.property(arbExistingRoles, (existingRoles) => {
        const { rolesToCreate } = computeRolesToCreate(existingRoles);
        for (const role of rolesToCreate) {
          expect(ALL_ROLES).toContain(role);
        }
      }),
      { numRuns: 100 }
    );
  });
});
