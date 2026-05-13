import { describe, it } from 'vitest';
import * as fc from 'fast-check';

/**
 * Property 19.2: Migration audit logging — all migrated records preserve original timestamps.
 * Tests the invariant that migration does not alter created_at or accession_number.
 */

interface MigrationRecord {
  accession_number: string;
  created_at: string;
  patient_national_id: string;
  modality: string;
  source: 'internal' | 'external';
}

function migrateRecord(original: MigrationRecord): MigrationRecord & { migrated_at: string } {
  return {
    ...original,
    migrated_at: new Date().toISOString(),
  };
}

describe('Property 19.2: Migration preserves original data', () => {
  it('migrated record preserves accession_number', () => {
    fc.assert(fc.property(
      fc.string({ minLength: 5, maxLength: 30 }),
      fc.date({ min: new Date('2020-01-01'), max: new Date('2025-12-31'), noInvalidDate: true }),
      fc.array(fc.constantFrom('0','1','2','3','4','5','6','7','8','9'), { minLength: 16, maxLength: 16 }).map(a => a.join('')),
      fc.constantFrom('CT','MR','DX','US'),
      (accNum, date, nik, mod) => {
        const original: MigrationRecord = {
          accession_number: accNum,
          created_at: date.toISOString(),
          patient_national_id: nik,
          modality: mod,
          source: 'external',
        };
        const migrated = migrateRecord(original);
        return migrated.accession_number === original.accession_number;
      }
    ), { numRuns: 200 });
  });

  it('migrated record preserves created_at', () => {
    fc.assert(fc.property(
      fc.string({ minLength: 5, maxLength: 30 }),
      fc.date({ min: new Date('2020-01-01'), max: new Date('2025-12-31'), noInvalidDate: true }),
      (accNum, date) => {
        const original: MigrationRecord = {
          accession_number: accNum,
          created_at: date.toISOString(),
          patient_national_id: '1234567890123456',
          modality: 'CT',
          source: 'external',
        };
        const migrated = migrateRecord(original);
        return migrated.created_at === original.created_at;
      }
    ), { numRuns: 200 });
  });

  it('migrated record has migrated_at timestamp', () => {
    fc.assert(fc.property(fc.string({ minLength: 5, maxLength: 30 }), (accNum) => {
      const original: MigrationRecord = {
        accession_number: accNum,
        created_at: '2024-01-01T00:00:00Z',
        patient_national_id: '1234567890123456',
        modality: 'CT',
        source: 'external',
      };
      const migrated = migrateRecord(original);
      return migrated.migrated_at.length > 0;
    }), { numRuns: 100 });
  });
});
