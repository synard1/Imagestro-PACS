import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { encodeCursor, decodeCursor } from '../src/utils/cursor';

describe('Property 28: Keyset pagination cursor properties', () => {
  it('cursor encoding is deterministic for same input', () => {
    fc.assert(fc.property(
      fc.date({ min: new Date('2020-01-01'), max: new Date('2030-12-31'), noInvalidDate: true }),
      fc.uuid(),
      (date, id) => {
        const cursor = { createdAt: date.toISOString(), id };
        const encoded1 = encodeCursor(cursor);
        const encoded2 = encodeCursor(cursor);
        return encoded1 === encoded2;
      }
    ), { numRuns: 200 });
  });

  it('different cursors produce different encoded strings', () => {
    fc.assert(fc.property(
      fc.date({ min: new Date('2020-01-01'), max: new Date('2030-12-31'), noInvalidDate: true }),
      fc.uuid(),
      fc.date({ min: new Date('2020-01-01'), max: new Date('2030-12-31'), noInvalidDate: true }),
      fc.uuid(),
      (date1, id1, date2, id2) => {
        if (date1.toISOString() === date2.toISOString() && id1 === id2) return true;
        const encoded1 = encodeCursor({ createdAt: date1.toISOString(), id: id1 });
        const encoded2 = encodeCursor({ createdAt: date2.toISOString(), id: id2 });
        return encoded1 !== encoded2;
      }
    ), { numRuns: 200 });
  });

  it('invalid base64 strings decode to null', () => {
    fc.assert(fc.property(
      fc.array(fc.constantFrom('!','@','#','$','%','^','&','('), { minLength: 1, maxLength: 20 }).map(a => a.join('')),
      (garbage) => decodeCursor(garbage) === null
    ), { numRuns: 100 });
  });
});
