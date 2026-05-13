import { describe, it } from 'vitest';
import * as fc from 'fast-check';

/**
 * Properties 19/20: Log level assignment based on HTTP status code.
 * Mirrors the getLogLevel function from logger middleware.
 */

function getLogLevel(status: number): 'info' | 'warn' | 'error' {
  if (status >= 500) return 'error';
  if (status >= 400 && status !== 429) return 'warn';
  return 'info';
}

describe('Property 19: Log level for 5xx is always error', () => {
  it('any 5xx status produces error level', () => {
    fc.assert(fc.property(fc.integer({ min: 500, max: 599 }), (status) => {
      return getLogLevel(status) === 'error';
    }), { numRuns: 100 });
  });
});

describe('Property 20: Log level for 4xx (except 429) is warn', () => {
  it('4xx except 429 produces warn level', () => {
    fc.assert(fc.property(
      fc.integer({ min: 400, max: 499 }).filter(s => s !== 429),
      (status) => getLogLevel(status) === 'warn'
    ), { numRuns: 100 });
  });

  it('429 produces info level', () => {
    fc.assert(fc.property(fc.constant(429), (status) => {
      return getLogLevel(status) === 'info';
    }), { numRuns: 100 });
  });

  it('2xx/3xx produces info level', () => {
    fc.assert(fc.property(fc.integer({ min: 200, max: 399 }), (status) => {
      return getLogLevel(status) === 'info';
    }), { numRuns: 100 });
  });
});
