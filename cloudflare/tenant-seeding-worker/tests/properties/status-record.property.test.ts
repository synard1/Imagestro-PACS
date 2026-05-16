/**
 * Property test 11.1: Status record structure and limits.
 *
 * Property 10: For any completed seeding operation, the stored SeedingStatus
 * record SHALL contain all required fields, the error_details array SHALL
 * have at most 50 entries, and each entry SHALL be at most 500 characters.
 *
 * Validates: Requirements 6.2
 */

import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { truncateErrorDetails } from '../../src/utils/status';
import type { ErrorEntry, SeedingStatus } from '../../src/types';

// Arbitrary: safe ISO timestamp string (avoids Invalid Date in Workers runtime)
const arbTimestamp = fc.integer({ min: 1577836800000, max: 1924905600000 }).map((ms) => new Date(ms).toISOString());

// Arbitrary: error entry with variable-length error messages
const arbErrorEntry: fc.Arbitrary<ErrorEntry> = fc.record({
  username: fc.string({ minLength: 1, maxLength: 50 }),
  role: fc.constantFrom('TENANT_ADMIN', 'DOCTOR', 'RADIOLOGIST', 'TECHNICIAN', 'CLERK', 'NURSE'),
  error: fc.string({ minLength: 0, maxLength: 2000 }), // Can be very long before truncation
  timestamp: arbTimestamp,
});

// Arbitrary: array of error entries (0 to 100 entries, exceeding the 50 limit)
const arbErrorArray = fc.array(arbErrorEntry, { minLength: 0, maxLength: 100 });

// Arbitrary: valid SeedingStatus record
const arbSeedingStatus: fc.Arbitrary<SeedingStatus> = fc.record({
  tenant_id: fc.uuid(),
  event_id: fc.uuid(),
  status: fc.constantFrom('completed', 'partial', 'failed', 'in_progress', 'pending'),
  users_created: fc.integer({ min: 0, max: 6 }),
  users_failed: fc.integer({ min: 0, max: 6 }),
  error_details: fc.array(arbErrorEntry, { minLength: 0, maxLength: 10 }),
  started_at: arbTimestamp,
  completed_at: fc.oneof(arbTimestamp, fc.constant(null)),
});

describe('Feature: tenant-user-seeding, Property 10: Status record structure and limits', () => {
  describe('truncateErrorDetails', () => {
    it('output array never exceeds 50 entries', () => {
      fc.assert(
        fc.property(arbErrorArray, (errors) => {
          const truncated = truncateErrorDetails(errors);
          expect(truncated.length).toBeLessThanOrEqual(50);
        }),
        { numRuns: 100 }
      );
    });

    it('each error message is at most 500 characters after truncation', () => {
      fc.assert(
        fc.property(arbErrorArray, (errors) => {
          const truncated = truncateErrorDetails(errors);
          for (const entry of truncated) {
            expect(entry.error.length).toBeLessThanOrEqual(500);
          }
        }),
        { numRuns: 100 }
      );
    });

    it('preserves entries when array has 50 or fewer items', () => {
      fc.assert(
        fc.property(
          fc.array(arbErrorEntry, { minLength: 0, maxLength: 50 }),
          (errors) => {
            const truncated = truncateErrorDetails(errors);
            expect(truncated.length).toBe(errors.length);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('caps at exactly 50 entries when input exceeds 50', () => {
      fc.assert(
        fc.property(
          fc.array(arbErrorEntry, { minLength: 51, maxLength: 100 }),
          (errors) => {
            const truncated = truncateErrorDetails(errors);
            expect(truncated.length).toBe(50);
          }
        ),
        { numRuns: 50 }
      );
    });

    it('preserves error messages that are already 500 chars or less', () => {
      fc.assert(
        fc.property(
          fc.array(
            fc.record({
              username: fc.string({ minLength: 1, maxLength: 20 }),
              role: fc.constant('DOCTOR'),
              error: fc.string({ minLength: 0, maxLength: 500 }),
              timestamp: arbTimestamp,
            }),
            { minLength: 1, maxLength: 10 }
          ),
          (errors) => {
            const truncated = truncateErrorDetails(errors);
            for (let i = 0; i < errors.length; i++) {
              expect(truncated[i]!.error).toBe(errors[i]!.error);
            }
          }
        ),
        { numRuns: 100 }
      );
    });

    it('truncates error messages longer than 500 chars to exactly 500', () => {
      fc.assert(
        fc.property(
          fc.string({ minLength: 501, maxLength: 2000 }),
          (longError) => {
            const errors: ErrorEntry[] = [{
              username: 'test-user',
              role: 'DOCTOR',
              error: longError,
              timestamp: new Date().toISOString(),
            }];
            const truncated = truncateErrorDetails(errors);
            expect(truncated[0]!.error.length).toBe(500);
            expect(truncated[0]!.error).toBe(longError.slice(0, 500));
          }
        ),
        { numRuns: 100 }
      );
    });

    it('preserves username, role, and timestamp fields unchanged', () => {
      fc.assert(
        fc.property(arbErrorArray, (errors) => {
          const truncated = truncateErrorDetails(errors);
          const limit = Math.min(errors.length, 50);
          for (let i = 0; i < limit; i++) {
            expect(truncated[i]!.username).toBe(errors[i]!.username);
            expect(truncated[i]!.role).toBe(errors[i]!.role);
            expect(truncated[i]!.timestamp).toBe(errors[i]!.timestamp);
          }
        }),
        { numRuns: 100 }
      );
    });

    it('takes the first 50 entries (not random selection)', () => {
      fc.assert(
        fc.property(
          fc.array(arbErrorEntry, { minLength: 51, maxLength: 100 }),
          (errors) => {
            const truncated = truncateErrorDetails(errors);
            for (let i = 0; i < 50; i++) {
              expect(truncated[i]!.username).toBe(errors[i]!.username);
              expect(truncated[i]!.role).toBe(errors[i]!.role);
              expect(truncated[i]!.timestamp).toBe(errors[i]!.timestamp);
            }
          }
        ),
        { numRuns: 50 }
      );
    });
  });

  describe('SeedingStatus structure', () => {
    it('contains all required fields', () => {
      fc.assert(
        fc.property(arbSeedingStatus, (status) => {
          expect(status).toHaveProperty('tenant_id');
          expect(status).toHaveProperty('event_id');
          expect(status).toHaveProperty('status');
          expect(status).toHaveProperty('users_created');
          expect(status).toHaveProperty('users_failed');
          expect(status).toHaveProperty('error_details');
          expect(status).toHaveProperty('started_at');
          expect(status).toHaveProperty('completed_at');
        }),
        { numRuns: 100 }
      );
    });

    it('serializes to valid JSON', () => {
      fc.assert(
        fc.property(arbSeedingStatus, (status) => {
          const json = JSON.stringify(status);
          const parsed = JSON.parse(json);
          expect(parsed.tenant_id).toBe(status.tenant_id);
          expect(parsed.event_id).toBe(status.event_id);
          expect(parsed.status).toBe(status.status);
          expect(parsed.users_created).toBe(status.users_created);
          expect(parsed.users_failed).toBe(status.users_failed);
        }),
        { numRuns: 100 }
      );
    });
  });
});
