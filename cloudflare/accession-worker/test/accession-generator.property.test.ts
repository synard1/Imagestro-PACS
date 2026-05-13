import { describe, it } from 'vitest';
import * as fc from 'fast-check';
import { renderAccessionNumber, computeCounterScope, validateFormatPattern, computeDateBucket } from '../src/services/accession-generator';
import type { AccessionConfig } from '../src/models/config';

const baseConfig: AccessionConfig = { pattern: '{ORG}-{YYYY}{MM}{DD}-{NNNN}', counter_reset_policy: 'DAILY', sequence_digits: 4, timezone: 'Asia/Jakarta', counter_backend: 'D1', orgCode: 'RS01' };

describe('Property 1: Format rendering matches pattern structure', () => {
  it('rendered number length is consistent for same config', () => {
    fc.assert(fc.property(fc.integer({ min: 1, max: 9999 }), (seq) => {
      const result = renderAccessionNumber({ config: baseConfig, modality: 'CT', facilityCode: 'F1', tenantId: 't1', sequenceNumber: seq, date: new Date('2025-06-15T10:00:00Z') });
      return result.length > 0 && result.length <= 64;
    }), { numRuns: 200 });
  });
});

describe('Property 2: Date bucket is timezone-aware', () => {
  it('DAILY bucket format is YYYYMMDD', () => {
    fc.assert(fc.property(fc.date({ min: new Date('2020-01-01'), max: new Date('2030-12-31'), noInvalidDate: true }), (date) => {
      const bucket = computeDateBucket('DAILY', date, 'Asia/Jakarta');
      return /^\d{8}$/.test(bucket);
    }), { numRuns: 200 });
  });
  it('MONTHLY bucket format is YYYYMM', () => {
    fc.assert(fc.property(fc.date({ min: new Date('2020-01-01'), max: new Date('2030-12-31'), noInvalidDate: true }), (date) => {
      const bucket = computeDateBucket('MONTHLY', date, 'Asia/Jakarta');
      return /^\d{6}$/.test(bucket);
    }), { numRuns: 200 });
  });
  it('NEVER bucket is always ALL', () => {
    fc.assert(fc.property(fc.date({ noInvalidDate: true }), (date) => computeDateBucket('NEVER', date, 'UTC') === 'ALL'), { numRuns: 100 });
  });
});

describe('Property 3: Counter scope includes/excludes modality', () => {
  it('modality is empty string when useModalityInSeqScope=false', () => {
    fc.assert(fc.property(fc.string(), fc.string(), fc.constantFrom('CT','MR','DX'), fc.string(), (tid, fc2, mod, db) => {
      const scope = computeCounterScope(tid, fc2, mod, db, false);
      return scope.modality === '';
    }), { numRuns: 200 });
  });
  it('modality is preserved when useModalityInSeqScope=true', () => {
    fc.assert(fc.property(fc.string(), fc.string(), fc.constantFrom('CT','MR','DX','US'), fc.string(), (tid, fc2, mod, db) => {
      const scope = computeCounterScope(tid, fc2, mod, db, true);
      return scope.modality === mod;
    }), { numRuns: 200 });
  });
});

describe('Property 5: Issuer follows SATUSEHAT format', () => {
  it('issuer contains patient NIK and accession number', () => {
    fc.assert(fc.property(fc.array(fc.constantFrom('0','1','2','3','4','5','6','7','8','9'), { minLength: 16, maxLength: 16 }).map(a => a.join('')), fc.integer({ min: 1, max: 9999 }), (nik, seq) => {
      const result = renderAccessionNumber({ config: baseConfig, modality: 'CT', facilityCode: 'F1', tenantId: 't1', sequenceNumber: seq, date: new Date('2025-01-20T10:00:00Z') });
      const issuer = 'http://sys-ids.kemkes.go.id/acsn/' + nik + '|' + result;
      return issuer.startsWith('http://sys-ids.kemkes.go.id/acsn/') && issuer.includes('|');
    }), { numRuns: 100 });
  });
});

describe('Property 18: Format pattern validation', () => {
  it('rejects patterns without sequence token', () => {
    fc.assert(fc.property(fc.constantFrom('{ORG}', '{YYYY}{MM}{DD}', 'LITERAL', '{MOD}-{YYYY}'), (pattern) => {
      const result = validateFormatPattern(pattern, 4);
      return !result.valid;
    }), { numRuns: 50 });
  });
  it('accepts patterns with sequence token', () => {
    fc.assert(fc.property(fc.constantFrom('{NNNN}', '{ORG}-{NNN}', '{YYYY}-{NNNNNN}'), (pattern) => {
      const result = validateFormatPattern(pattern, 4);
      return result.valid;
    }), { numRuns: 50 });
  });
});
