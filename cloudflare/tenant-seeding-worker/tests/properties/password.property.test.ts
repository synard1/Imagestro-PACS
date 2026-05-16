/**
 * Property test 2.4: Password complexity.
 *
 * Property 5: For any generated password, it SHALL have exactly 16 characters
 * and contain at least one uppercase letter, at least one lowercase letter,
 * at least one digit, and at least one special character.
 *
 * Validates: Requirements 3.2
 */

import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { generatePassword } from '../../src/services/password-generator';

describe('Feature: tenant-user-seeding, Property 5: Password complexity', () => {
  it('always generates passwords of exactly 16 characters', () => {
    fc.assert(
      fc.property(fc.constant(null), () => {
        const password = generatePassword();
        expect(password).toHaveLength(16);
      }),
      { numRuns: 200 }
    );
  });

  it('always contains at least one uppercase letter', () => {
    fc.assert(
      fc.property(fc.constant(null), () => {
        const password = generatePassword();
        expect(password).toMatch(/[A-Z]/);
      }),
      { numRuns: 200 }
    );
  });

  it('always contains at least one lowercase letter', () => {
    fc.assert(
      fc.property(fc.constant(null), () => {
        const password = generatePassword();
        expect(password).toMatch(/[a-z]/);
      }),
      { numRuns: 200 }
    );
  });

  it('always contains at least one digit', () => {
    fc.assert(
      fc.property(fc.constant(null), () => {
        const password = generatePassword();
        expect(password).toMatch(/[0-9]/);
      }),
      { numRuns: 200 }
    );
  });

  it('always contains at least one special character', () => {
    fc.assert(
      fc.property(fc.constant(null), () => {
        const password = generatePassword();
        expect(password).toMatch(/[!@#$%^&*]/);
      }),
      { numRuns: 200 }
    );
  });

  it('only contains characters from the allowed character sets', () => {
    const allowedChars = /^[A-Za-z0-9!@#$%^&*]+$/;

    fc.assert(
      fc.property(fc.constant(null), () => {
        const password = generatePassword();
        expect(password).toMatch(allowedChars);
      }),
      { numRuns: 200 }
    );
  });

  it('generates different passwords on successive calls (non-deterministic)', () => {
    // Generate 50 passwords and verify they are not all the same
    const passwords = new Set<string>();
    for (let i = 0; i < 50; i++) {
      passwords.add(generatePassword());
    }
    // With 16 chars from a 70-char alphabet, collisions are astronomically unlikely
    expect(passwords.size).toBeGreaterThan(1);
  });
});
