/**
 * Property test 2.8: Status determination from outcome counts.
 *
 * Property 6: For any seeding operation with users_created and users_failed counts:
 * - If users_failed == 0 then status SHALL be "completed"
 * - If users_created > 0 AND users_failed > 0 then status SHALL be "partial"
 * - If users_created == 0 then status SHALL be "failed"
 *
 * Validates: Requirements 5.3, 6.4, 6.5, 6.6
 */

import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { determineStatus } from '../../src/utils/status';

describe('Feature: tenant-user-seeding, Property 6: Status determination', () => {
  it('returns "completed" when users_failed is 0 (regardless of users_created)', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 100 }), // users_created (can be 0 or more)
        (usersCreated) => {
          const status = determineStatus(usersCreated, 0);
          expect(status).toBe('completed');
        }
      ),
      { numRuns: 100 }
    );
  });

  it('returns "partial" when both users_created > 0 and users_failed > 0', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 100 }), // users_created > 0
        fc.integer({ min: 1, max: 100 }), // users_failed > 0
        (usersCreated, usersFailed) => {
          const status = determineStatus(usersCreated, usersFailed);
          expect(status).toBe('partial');
        }
      ),
      { numRuns: 100 }
    );
  });

  it('returns "failed" when users_created is 0 and users_failed > 0', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 100 }), // users_failed > 0
        (usersFailed) => {
          const status = determineStatus(0, usersFailed);
          expect(status).toBe('failed');
        }
      ),
      { numRuns: 100 }
    );
  });

  it('status is always one of "completed", "partial", or "failed"', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 100 }),
        fc.integer({ min: 0, max: 100 }),
        (usersCreated, usersFailed) => {
          const status = determineStatus(usersCreated, usersFailed);
          expect(['completed', 'partial', 'failed']).toContain(status);
        }
      ),
      { numRuns: 200 }
    );
  });

  it('status determination is deterministic for same inputs', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 100 }),
        fc.integer({ min: 0, max: 100 }),
        (usersCreated, usersFailed) => {
          const status1 = determineStatus(usersCreated, usersFailed);
          const status2 = determineStatus(usersCreated, usersFailed);
          expect(status1).toBe(status2);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('for typical 6-user seeding: all succeed → completed', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 6 }), // total users attempted
        (total) => {
          const status = determineStatus(total, 0);
          expect(status).toBe('completed');
        }
      ),
      { numRuns: 50 }
    );
  });

  it('for typical 6-user seeding: mixed results → partial', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 5 }), // some created
        (created) => {
          const failed = 6 - created;
          const status = determineStatus(created, failed);
          expect(status).toBe('partial');
        }
      ),
      { numRuns: 50 }
    );
  });

  it('for typical 6-user seeding: none succeed → failed', () => {
    const status = determineStatus(0, 6);
    expect(status).toBe('failed');
  });
});
