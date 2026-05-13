import { describe, it } from 'vitest';
import * as fc from 'fast-check';
import { computeCounterScope } from '../src/services/accession-generator';

describe('Property 12: Tenant isolation in counter scope', () => {
  it('different tenants always produce different scope keys', () => {
    fc.assert(fc.property(
      fc.string({ minLength: 1, maxLength: 20 }),
      fc.string({ minLength: 1, maxLength: 20 }),
      fc.string({ minLength: 1, maxLength: 5 }),
      fc.string({ minLength: 1, maxLength: 10 }),
      (tenant1, tenant2, mod, dateBucket) => {
        if (tenant1 === tenant2) return true;
        const scope1 = computeCounterScope(tenant1, 'F1', mod, dateBucket, true);
        const scope2 = computeCounterScope(tenant2, 'F1', mod, dateBucket, true);
        const key1 = `${scope1.tenantId}:${scope1.facilityCode}:${scope1.modality}:${scope1.dateBucket}`;
        const key2 = `${scope2.tenantId}:${scope2.facilityCode}:${scope2.modality}:${scope2.dateBucket}`;
        return key1 !== key2;
      }
    ), { numRuns: 200 });
  });

  it('same tenant same params produce identical scope', () => {
    fc.assert(fc.property(
      fc.string({ minLength: 1, maxLength: 20 }),
      fc.string({ minLength: 1, maxLength: 10 }),
      fc.constantFrom('CT','MR','DX'),
      fc.string({ minLength: 1, maxLength: 10 }),
      (tenant, facility, mod, dateBucket) => {
        const scope1 = computeCounterScope(tenant, facility, mod, dateBucket, true);
        const scope2 = computeCounterScope(tenant, facility, mod, dateBucket, true);
        return scope1.tenantId === scope2.tenantId &&
               scope1.facilityCode === scope2.facilityCode &&
               scope1.modality === scope2.modality &&
               scope1.dateBucket === scope2.dateBucket;
      }
    ), { numRuns: 200 });
  });
});
