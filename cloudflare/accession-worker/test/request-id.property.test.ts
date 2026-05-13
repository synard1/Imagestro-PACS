import { describe, it } from 'vitest';
import * as fc from 'fast-check';
import { newUuidV7, isUuid } from '../src/utils/uuid';

/**
 * Property 25: Request ID propagation — valid UUIDs pass through, invalid ones generate new.
 */

describe('Property 25: Request ID middleware logic', () => {
  it('valid UUID v4/v7 strings are accepted as-is', () => {
    fc.assert(fc.property(fc.uuid(), (uuid) => {
      // Simulate middleware logic: if incoming is valid UUID, use it
      const requestId = isUuid(uuid) ? uuid : newUuidV7();
      return requestId === uuid;
    }), { numRuns: 200 });
  });

  it('invalid strings cause generation of new UUID v7', () => {
    const invalidUuid = fc.oneof(
      fc.string({ minLength: 0, maxLength: 5 }),
      fc.string({ minLength: 37, maxLength: 50 }),
      fc.constant('not-a-uuid'),
      fc.constant('12345678-1234-1234-1234-12345678901g')
    );
    fc.assert(fc.property(invalidUuid, (incoming) => {
      const requestId = isUuid(incoming) ? incoming : newUuidV7();
      return isUuid(requestId) && requestId !== incoming;
    }), { numRuns: 100 });
  });

  it('generated UUIDs are always valid format', () => {
    fc.assert(fc.property(fc.integer({ min: 1, max: 50 }), (_) => {
      const id = newUuidV7();
      return isUuid(id);
    }), { numRuns: 200 });
  });
});
