import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { redact } from '../src/utils/redaction';

describe('Property 22: PII redaction preserves structure', () => {
  it('redacted object has same keys as original', () => {
    const objArb = fc.dictionary(fc.string({ minLength: 1, maxLength: 20 }), fc.oneof(fc.string(), fc.integer(), fc.boolean(), fc.constant(null)));
    fc.assert(fc.property(objArb, (obj) => {
      const redacted = redact(obj) as Record<string, unknown>;
      return Object.keys(obj).every(k => k in redacted);
    }), { numRuns: 200 });
  });

  it('patient_national_id is always masked in output', () => {
    fc.assert(fc.property(fc.array(fc.constantFrom('0','1','2','3','4','5','6','7','8','9'), { minLength: 16, maxLength: 16 }).map(a => a.join('')), (nik) => {
      const result = redact({ patient_national_id: nik }) as any;
      return result.patient_national_id.startsWith('****') && result.patient_national_id !== nik;
    }), { numRuns: 200 });
  });

  it('password/token/secret fields are always [REDACTED]', () => {
    fc.assert(fc.property(fc.string({ minLength: 1 }), (value) => {
      const r1 = redact({ password: value }) as any;
      const r2 = redact({ token: value }) as any;
      const r3 = redact({ secret: value }) as any;
      return r1.password === '[REDACTED]' && r2.token === '[REDACTED]' && r3.secret === '[REDACTED]';
    }), { numRuns: 100 });
  });
});
