/**
 * Property test 2.6: Retry classification by HTTP status code.
 *
 * Property 7: For any HTTP response from the auth-service user creation endpoint:
 * - If status is 5xx, the request SHALL be retried
 * - If status is 409, the user SHALL be treated as successfully created
 * - If status is any other 4xx, the request SHALL NOT be retried
 *
 * Validates: Requirements 5.1, 5.5, 5.6
 */

import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { shouldRetry, isConflict } from '../../src/utils/retry';

// Arbitrary: 5xx status codes (500-599)
const arb5xx = fc.integer({ min: 500, max: 599 });

// Arbitrary: 409 Conflict
const arb409 = fc.constant(409);

// Arbitrary: 4xx status codes excluding 409 (400-408, 410-499)
const arb4xxNon409 = fc.integer({ min: 400, max: 499 }).filter((s) => s !== 409);

// Arbitrary: 2xx status codes (200-299)
const arb2xx = fc.integer({ min: 200, max: 299 });

// Arbitrary: 3xx status codes (300-399)
const arb3xx = fc.integer({ min: 300, max: 399 });

describe('Feature: tenant-user-seeding, Property 7: Retry classification', () => {
  it('5xx status codes are always retryable', () => {
    fc.assert(
      fc.property(arb5xx, (status) => {
        expect(shouldRetry(status)).toBe(true);
      }),
      { numRuns: 100 }
    );
  });

  it('409 is always identified as conflict (treated as success)', () => {
    fc.assert(
      fc.property(arb409, (status) => {
        expect(isConflict(status)).toBe(true);
      }),
      { numRuns: 10 }
    );
  });

  it('4xx status codes (non-409) are never retryable', () => {
    fc.assert(
      fc.property(arb4xxNon409, (status) => {
        expect(shouldRetry(status)).toBe(false);
      }),
      { numRuns: 100 }
    );
  });

  it('4xx status codes (non-409) are never conflict', () => {
    fc.assert(
      fc.property(arb4xxNon409, (status) => {
        expect(isConflict(status)).toBe(false);
      }),
      { numRuns: 100 }
    );
  });

  it('2xx status codes are never retryable', () => {
    fc.assert(
      fc.property(arb2xx, (status) => {
        expect(shouldRetry(status)).toBe(false);
      }),
      { numRuns: 100 }
    );
  });

  it('2xx status codes are never conflict', () => {
    fc.assert(
      fc.property(arb2xx, (status) => {
        expect(isConflict(status)).toBe(false);
      }),
      { numRuns: 100 }
    );
  });

  it('3xx status codes are never retryable', () => {
    fc.assert(
      fc.property(arb3xx, (status) => {
        expect(shouldRetry(status)).toBe(false);
      }),
      { numRuns: 100 }
    );
  });

  it('5xx status codes are never conflict', () => {
    fc.assert(
      fc.property(arb5xx, (status) => {
        expect(isConflict(status)).toBe(false);
      }),
      { numRuns: 100 }
    );
  });

  it('only 409 is classified as conflict among all HTTP status codes', () => {
    fc.assert(
      fc.property(fc.integer({ min: 100, max: 599 }), (status) => {
        if (status === 409) {
          expect(isConflict(status)).toBe(true);
        } else {
          expect(isConflict(status)).toBe(false);
        }
      }),
      { numRuns: 200 }
    );
  });

  it('only 500-599 range is classified as retryable', () => {
    fc.assert(
      fc.property(fc.integer({ min: 100, max: 599 }), (status) => {
        if (status >= 500 && status <= 599) {
          expect(shouldRetry(status)).toBe(true);
        } else {
          expect(shouldRetry(status)).toBe(false);
        }
      }),
      { numRuns: 200 }
    );
  });
});
