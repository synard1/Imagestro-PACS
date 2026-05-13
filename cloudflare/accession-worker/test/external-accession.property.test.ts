import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { validateExternalAccessionNumber } from '../src/validators/external-accession';

describe('Property 17: External accession number validation', () => {
  const printableAscii = fc.array(fc.integer({ min: 0x21, max: 0x7e }).map(c => String.fromCharCode(c)), { minLength: 1, maxLength: 64 }).map(a => a.join(''));

  it('valid printable ASCII strings (1-64 chars) pass', () => {
    fc.assert(fc.property(printableAscii, (s) => validateExternalAccessionNumber(s).valid), { numRuns: 200 });
  });

  it('empty string always fails', () => {
    expect(validateExternalAccessionNumber('').valid).toBe(false);
  });

  it('strings > 64 chars always fail', () => {
    fc.assert(fc.property(fc.array(fc.integer({ min: 0x21, max: 0x7e }).map(c => String.fromCharCode(c)), { minLength: 65, maxLength: 200 }).map(a => a.join('')), (s) => !validateExternalAccessionNumber(s).valid), { numRuns: 100 });
  });

  it('strings with control chars fail', () => {
    fc.assert(fc.property(fc.integer({ min: 0, max: 0x1f }), (code) => {
      const s = 'ABC' + String.fromCharCode(code) + 'DEF';
      return !validateExternalAccessionNumber(s).valid;
    }), { numRuns: 50 });
  });
});
