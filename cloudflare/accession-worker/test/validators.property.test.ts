import { describe, it } from 'vitest';
import * as fc from 'fast-check';
import { parseNestedFormat, parseFlatFormat } from '../src/validators/accession-input';

const validNik = fc.array(fc.constantFrom('0','1','2','3','4','5','6','7','8','9'), { minLength: 16, maxLength: 16 }).map(a => a.join(''));
const invalidNik = fc.oneof(
  fc.string({ minLength: 0, maxLength: 15 }),
  fc.string({ minLength: 17, maxLength: 20 }),
  fc.array(fc.constantFrom('a','b','c','X','Y'), { minLength: 16, maxLength: 16 }).map(a => a.join(''))
);
const validModality = fc.constantFrom('CT','MR','CR','DX','US','XA','RF','MG','NM','PT');
const invalidModality = fc.string({ minLength: 1, maxLength: 5 }).filter(s => !['CT','MR','CR','DX','US','XA','RF','MG','NM','PT'].includes(s));

describe('Property 6: NIK validation', () => {
  it('valid 16-digit NIK passes', () => {
    fc.assert(fc.property(validNik, validModality, (nik, mod) => {
      const result = parseNestedFormat({ patient: { id: nik, name: 'Test' }, modality: mod });
      return result.success;
    }), { numRuns: 200 });
  });
  it('invalid NIK fails', () => {
    fc.assert(fc.property(invalidNik, (nik) => {
      const result = parseNestedFormat({ patient: { id: nik, name: 'Test' }, modality: 'CT' });
      return !result.success;
    }), { numRuns: 200 });
  });
});

describe('Property 7: Modality validation', () => {
  it('valid modality passes', () => {
    fc.assert(fc.property(validModality, (mod) => {
      const result = parseNestedFormat({ patient: { id: '1234567890123456', name: 'T' }, modality: mod });
      return result.success;
    }), { numRuns: 100 });
  });
  it('invalid modality fails', () => {
    fc.assert(fc.property(invalidModality, (mod) => {
      const result = parseNestedFormat({ patient: { id: '1234567890123456', name: 'T' }, modality: mod });
      return !result.success;
    }), { numRuns: 100 });
  });
});

describe('Property 8: Validation aggregates all errors', () => {
  it('multiple invalid fields produce multiple errors', () => {
    fc.assert(fc.property(invalidNik, invalidModality, (nik, mod) => {
      const result = parseNestedFormat({ patient: { id: nik, name: '' }, modality: mod });
      return !result.success && result.errors.length >= 2;
    }), { numRuns: 100 });
  });
});
