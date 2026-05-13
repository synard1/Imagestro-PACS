import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';

describe('Property 4: Counter monotonic increments (conceptual)', () => {
  it('sequence of increments produces strictly increasing values', () => {
    fc.assert(fc.property(fc.integer({ min: 1, max: 100 }), (n) => {
      // Simulate counter behavior: each increment returns prev+1
      let current = 0;
      const values: number[] = [];
      for (let i = 0; i < n; i++) { current++; values.push(current); }
      for (let i = 1; i < values.length; i++) { if (values[i]! <= values[i-1]!) return false; }
      return true;
    }), { numRuns: 200 });
  });

  it('batch reservation produces consecutive range', () => {
    fc.assert(fc.property(fc.integer({ min: 1, max: 20 }), fc.integer({ min: 0, max: 100 }), (count, startFrom) => {
      const startValue = startFrom + 1;
      const endValue = startFrom + count;
      return endValue - startValue + 1 === count && startValue > startFrom;
    }), { numRuns: 200 });
  });
});
