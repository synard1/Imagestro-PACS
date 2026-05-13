import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { newUuidV7 } from '../src/utils/uuid';

describe('Property 21: UUID v7 chronological ordering', () => {
  it('UUIDs generated sequentially sort in generation order', () => {
    fc.assert(fc.property(fc.integer({ min: 2, max: 20 }), (count) => {
      const uuids: string[] = [];
      for (let i = 0; i < count; i++) { uuids.push(newUuidV7()); }
      const sorted = [...uuids].sort();
      return JSON.stringify(uuids) === JSON.stringify(sorted);
    }), { numRuns: 100 });
  });
});
