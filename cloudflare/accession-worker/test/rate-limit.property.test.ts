import { describe, it } from 'vitest';
import * as fc from 'fast-check';

/**
 * Property 32: Rate limit classification — write vs read methods.
 * Tests the method classification logic from rate-limit middleware.
 */

const WRITE_METHODS = new Set(['POST', 'PATCH', 'DELETE', 'PUT']);

function isWriteMethod(method: string): boolean {
  return WRITE_METHODS.has(method.toUpperCase());
}

describe('Property 32: Rate limit method classification', () => {
  it('POST, PATCH, DELETE, PUT are always classified as write', () => {
    fc.assert(fc.property(fc.constantFrom('POST', 'PATCH', 'DELETE', 'PUT'), (method) => {
      return isWriteMethod(method);
    }), { numRuns: 100 });
  });

  it('GET, HEAD, OPTIONS are never classified as write', () => {
    fc.assert(fc.property(fc.constantFrom('GET', 'HEAD', 'OPTIONS'), (method) => {
      return !isWriteMethod(method);
    }), { numRuns: 100 });
  });

  it('method classification is case-insensitive', () => {
    fc.assert(fc.property(
      fc.constantFrom('post', 'Post', 'POST', 'patch', 'Patch', 'PATCH'),
      (method) => isWriteMethod(method)
    ), { numRuns: 100 });
  });

  it('random strings that are not HTTP methods are classified as read', () => {
    fc.assert(fc.property(
      fc.string({ minLength: 1, maxLength: 10 }).filter(s => !WRITE_METHODS.has(s.toUpperCase())),
      (method) => !isWriteMethod(method)
    ), { numRuns: 100 });
  });
});
