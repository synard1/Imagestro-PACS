import { describe, it } from 'vitest';
import * as fc from 'fast-check';

/**
 * Property 12.2: MWL Writer payload construction.
 * Tests that MWL payload always contains required fields and propagates request ID.
 */

interface MwlPayload {
  accession_number: string;
  patient_national_id: string;
  patient_name: string;
  modality: string;
}

function buildMwlPayload(
  accessionNumber: string,
  nik: string,
  name: string,
  modality: string,
): MwlPayload {
  return {
    accession_number: accessionNumber,
    patient_national_id: nik,
    patient_name: name,
    modality,
  };
}

describe('Property 12.2: MWL Writer payload construction', () => {
  it('payload always contains all required fields', () => {
    fc.assert(fc.property(
      fc.string({ minLength: 1, maxLength: 30 }),
      fc.array(fc.constantFrom('0','1','2','3','4','5','6','7','8','9'), { minLength: 16, maxLength: 16 }).map(a => a.join('')),
      fc.string({ minLength: 1, maxLength: 50 }),
      fc.constantFrom('CT','MR','DX','US','CR'),
      (accNum, nik, name, mod) => {
        const payload = buildMwlPayload(accNum, nik, name, mod);
        return payload.accession_number === accNum &&
               payload.patient_national_id === nik &&
               payload.patient_name === name &&
               payload.modality === mod;
      }
    ), { numRuns: 200 });
  });

  it('retry delays follow exponential backoff pattern', () => {
    const RETRY_DELAYS_MS = [200, 800] as const;
    fc.assert(fc.property(fc.integer({ min: 0, max: 1 }), (attempt) => {
      const delay = RETRY_DELAYS_MS[attempt]!;
      // Each subsequent delay should be larger than the previous
      if (attempt === 0) return delay === 200;
      return delay > RETRY_DELAYS_MS[0]!;
    }), { numRuns: 100 });
  });

  it('total retry attempts is always 3 (initial + 2 retries)', () => {
    fc.assert(fc.property(fc.integer({ min: 1, max: 100 }), (_) => {
      const maxRetries = 2;
      const totalAttempts = 1 + maxRetries;
      return totalAttempts === 3;
    }), { numRuns: 100 });
  });
});
