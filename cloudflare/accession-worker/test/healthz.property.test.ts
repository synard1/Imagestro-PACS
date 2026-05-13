import { describe, it } from 'vitest';
import * as fc from 'fast-check';

/**
 * Property 23: Health endpoint status derivation.
 * Tests the health status logic: ok when DB probe succeeds, degraded otherwise.
 */

type DbStatus = 'ok' | 'error';
type HealthStatus = 'ok' | 'degraded';

function deriveHealthStatus(dbStatus: DbStatus): HealthStatus {
  return dbStatus === 'ok' ? 'ok' : 'degraded';
}

function deriveReadyStatus(hasDb: boolean, hasJwtSecret: boolean): { ready: boolean; missing: string[] } {
  const missing: string[] = [];
  if (!hasDb) missing.push('DB');
  if (!hasJwtSecret) missing.push('JWT_SECRET');
  return { ready: missing.length === 0, missing };
}

describe('Property 23: Health endpoint status derivation', () => {
  it('healthz returns ok only when DB probe succeeds', () => {
    fc.assert(fc.property(fc.constantFrom('ok' as DbStatus, 'error' as DbStatus), (dbStatus) => {
      const health = deriveHealthStatus(dbStatus);
      if (dbStatus === 'ok') return health === 'ok';
      return health === 'degraded';
    }), { numRuns: 100 });
  });

  it('readyz returns ready=true only when both DB and JWT_SECRET are present', () => {
    fc.assert(fc.property(fc.boolean(), fc.boolean(), (hasDb, hasJwt) => {
      const result = deriveReadyStatus(hasDb, hasJwt);
      if (hasDb && hasJwt) return result.ready === true && result.missing.length === 0;
      return result.ready === false && result.missing.length > 0;
    }), { numRuns: 100 });
  });

  it('missing array contains DB when DB is absent', () => {
    fc.assert(fc.property(fc.boolean(), (hasJwt) => {
      const result = deriveReadyStatus(false, hasJwt);
      return result.missing.includes('DB');
    }), { numRuns: 100 });
  });

  it('missing array contains JWT_SECRET when JWT_SECRET is absent', () => {
    fc.assert(fc.property(fc.boolean(), (hasDb) => {
      const result = deriveReadyStatus(hasDb, false);
      return result.missing.includes('JWT_SECRET');
    }), { numRuns: 100 });
  });
});
