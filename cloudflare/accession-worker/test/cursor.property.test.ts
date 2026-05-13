import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { encodeCursor, decodeCursor } from '../src/utils/cursor';

describe('Property 27: Cursor round-trip stability', () => {
  it('encode then decode returns original values', () => {
    fc.assert(fc.property(
      fc.date({ min: new Date('2020-01-01'), max: new Date('2030-12-31'), noInvalidDate: true }),
      fc.uuid(),
      (date, id) => {
        const cursor = { createdAt: date.toISOString(), id };
        const encoded = encodeCursor(cursor);
        const decoded = decodeCursor(encoded);
        return decoded !== null && decoded.createdAt === cursor.createdAt && decoded.id === cursor.id;
      }
    ), { numRuns: 200 });
  });

  it('encoded cursor contains no +, /, or = characters', () => {
    fc.assert(fc.property(fc.date({ min: new Date('2020-01-01'), max: new Date('2030-12-31'), noInvalidDate: true }), fc.uuid(), (date, id) => {
      const encoded = encodeCursor({ createdAt: date.toISOString(), id });
      return !encoded.includes('+') && !encoded.includes('/') && !encoded.includes('=');
    }), { numRuns: 200 });
  });
});
