import { describe, it } from 'vitest';
import * as fc from 'fast-check';

/**
 * Property 6.5: Durable Object counter — sequence exhaustion detection.
 * Tests the counter DO logic: increment succeeds when current + count <= maxValue,
 * fails (409) when it would exceed maxValue.
 */

interface IncrementResult {
  success: boolean;
  startValue?: number;
  endValue?: number;
}

function simulateIncrement(current: number, count: number, maxValue: number): IncrementResult {
  if (current + count > maxValue) {
    return { success: false };
  }
  const startValue = current + 1;
  const endValue = current + count;
  return { success: true, startValue, endValue };
}

describe('Property 6.5: DO counter sequence exhaustion', () => {
  it('increment succeeds when current + count <= maxValue', () => {
    fc.assert(fc.property(
      fc.integer({ min: 0, max: 9990 }),
      fc.integer({ min: 1, max: 10 }),
      (current, count) => {
        const maxValue = 9999;
        if (current + count > maxValue) return true; // skip overflow case
        const result = simulateIncrement(current, count, maxValue);
        return result.success && result.startValue === current + 1 && result.endValue === current + count;
      }
    ), { numRuns: 200 });
  });

  it('increment fails when current + count > maxValue', () => {
    fc.assert(fc.property(
      fc.integer({ min: 9990, max: 9999 }),
      fc.integer({ min: 1, max: 20 }),
      (current, count) => {
        const maxValue = 9999;
        if (current + count <= maxValue) return true; // skip non-overflow case
        const result = simulateIncrement(current, count, maxValue);
        return !result.success;
      }
    ), { numRuns: 200 });
  });

  it('batch reservation range is exactly count numbers', () => {
    fc.assert(fc.property(
      fc.integer({ min: 0, max: 5000 }),
      fc.integer({ min: 1, max: 20 }),
      (current, count) => {
        const maxValue = 9999;
        const result = simulateIncrement(current, count, maxValue);
        if (!result.success) return true;
        return result.endValue! - result.startValue! + 1 === count;
      }
    ), { numRuns: 200 });
  });

  it('startValue is always current + 1', () => {
    fc.assert(fc.property(
      fc.integer({ min: 0, max: 9000 }),
      fc.integer({ min: 1, max: 10 }),
      (current, count) => {
        const result = simulateIncrement(current, count, 9999);
        if (!result.success) return true;
        return result.startValue === current + 1;
      }
    ), { numRuns: 100 });
  });
});
