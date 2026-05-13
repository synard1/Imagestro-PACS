import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import {
  validateIdempotencyKey,
  computeRequestHash,
  checkIdempotency,
  storeIdempotency,
  type IdempotencyRecord,
} from '../src/services/idempotency';

// ─── Existing: Key validation ────────────────────────────────────────────────

describe('Idempotency key validation (property)', () => {
  it('keys 1-128 chars are valid', () => {
    fc.assert(fc.property(fc.string({ minLength: 1, maxLength: 128 }), (key) => validateIdempotencyKey(key).valid), { numRuns: 200 });
  });
  it('empty key is invalid', () => {
    expect(validateIdempotencyKey('').valid).toBe(false);
  });
  it('keys > 128 chars are invalid', () => {
    fc.assert(fc.property(fc.string({ minLength: 129, maxLength: 300 }), (key) => !validateIdempotencyKey(key).valid), { numRuns: 100 });
  });
});

// ─── Existing: Request hash determinism ──────────────────────────────────────

describe('Request hash determinism (property)', () => {
  it('same inputs produce same hash', async () => {
    await fc.assert(fc.asyncProperty(fc.string({ minLength: 1 }), fc.string({ minLength: 1 }), async (mod, nik) => {
      const h1 = await computeRequestHash(mod, nik);
      const h2 = await computeRequestHash(mod, nik);
      return h1 === h2;
    }), { numRuns: 100 });
  });
  it('different inputs produce different hashes', async () => {
    await fc.assert(fc.asyncProperty(fc.string({ minLength: 1, maxLength: 10 }), fc.string({ minLength: 1, maxLength: 10 }), async (a, b) => {
      if (a === b) return true;
      const h1 = await computeRequestHash('CT', a);
      const h2 = await computeRequestHash('CT', b);
      return h1 !== h2;
    }), { numRuns: 100 });
  });
});

// ─── Helper: Mock D1 database for idempotency property tests ─────────────────

/**
 * Creates a mock D1Database that simulates the idempotency_keys table in-memory.
 * This allows property tests to exercise checkIdempotency and storeIdempotency
 * without a real D1 connection.
 */
function createMockD1(
  storedRecord: {
    key: string;
    tenant_id: string;
    accession_id: string;
    request_hash: string;
    payload_type: string;
    payload: string;
    created_at: string;
    expires_at: string;
  } | null,
) {
  return {
    prepare: (_sql: string) => ({
      bind: (..._args: any[]) => ({
        first: async () => storedRecord,
        run: async () => ({ success: true }),
      }),
    }),
  } as unknown as D1Database;
}

// ─── Property 10: Idempotency key lookup returns cached result or detects conflict ─

// Helper: generate a 64-char hex string (simulating SHA-256 output)
const hexHashArb = fc
  .array(fc.integer({ min: 0, max: 15 }), { minLength: 64, maxLength: 64 })
  .map((arr) => arr.map((n) => n.toString(16)).join(''));

/**
 * **Validates: Requirements 4.1, 4.2, 4.3**
 *
 * Property 10: When an idempotency key is looked up:
 * - If no record exists → status is 'miss'
 * - If record exists with matching request hash → status is 'hit' (cached result returned)
 * - If record exists with different request hash → status is 'conflict'
 */
describe('Property 10: Idempotency key lookup returns cached result or detects conflict', () => {
  // Arbitrary generators for idempotency test data
  const tenantIdArb = fc.string({ minLength: 1, maxLength: 36 });
  const keyArb = fc.string({ minLength: 1, maxLength: 128 });
  const hashArb = hexHashArb;
  const accessionIdArb = fc.uuid();
  const payloadArb = fc.constant('{"accession_number":"TEST-001"}');

  it('returns miss when no record exists for the key', async () => {
    await fc.assert(
      fc.asyncProperty(tenantIdArb, keyArb, hashArb, async (tenantId, key, requestHash) => {
        const db = createMockD1(null);
        const result = await checkIdempotency(db, tenantId, key, requestHash);
        return result.status === 'miss' && result.record === undefined;
      }),
      { numRuns: 100 },
    );
  });

  it('returns hit when record exists with matching hash', async () => {
    await fc.assert(
      fc.asyncProperty(
        tenantIdArb,
        keyArb,
        hashArb,
        accessionIdArb,
        payloadArb,
        async (tenantId, key, requestHash, accessionId, payload) => {
          const now = new Date();
          const expiresAt = new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString();

          const db = createMockD1({
            key,
            tenant_id: tenantId,
            accession_id: accessionId,
            request_hash: requestHash, // same hash as the request
            payload_type: 'single',
            payload,
            created_at: now.toISOString(),
            expires_at: expiresAt,
          });

          const result = await checkIdempotency(db, tenantId, key, requestHash);
          return (
            result.status === 'hit' &&
            result.record !== undefined &&
            result.record.accessionId === accessionId &&
            result.record.requestHash === requestHash
          );
        },
      ),
      { numRuns: 100 },
    );
  });

  it('returns conflict when record exists with different hash', async () => {
    await fc.assert(
      fc.asyncProperty(
        tenantIdArb,
        keyArb,
        hashArb,
        hashArb,
        accessionIdArb,
        payloadArb,
        async (tenantId, key, storedHash, requestHash, accessionId, payload) => {
          // Ensure the hashes are actually different
          if (storedHash === requestHash) return true; // skip trivial case

          const now = new Date();
          const expiresAt = new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString();

          const db = createMockD1({
            key,
            tenant_id: tenantId,
            accession_id: accessionId,
            request_hash: storedHash, // different from requestHash
            payload_type: 'single',
            payload,
            created_at: now.toISOString(),
            expires_at: expiresAt,
          });

          const result = await checkIdempotency(db, tenantId, key, requestHash);
          return result.status === 'conflict' && result.record !== undefined;
        },
      ),
      { numRuns: 100 },
    );
  });

  it('hit result preserves the full cached record payload', async () => {
    await fc.assert(
      fc.asyncProperty(
        tenantIdArb,
        keyArb,
        hashArb,
        accessionIdArb,
        fc.constantFrom('single', 'batch') as fc.Arbitrary<'single' | 'batch'>,
        async (tenantId, key, requestHash, accessionId, payloadType) => {
          const now = new Date();
          const createdAt = now.toISOString();
          const expiresAt = new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString();
          const payload = JSON.stringify({ accession_number: `ACC-${accessionId}` });

          const db = createMockD1({
            key,
            tenant_id: tenantId,
            accession_id: accessionId,
            request_hash: requestHash,
            payload_type: payloadType,
            payload,
            created_at: createdAt,
            expires_at: expiresAt,
          });

          const result = await checkIdempotency(db, tenantId, key, requestHash);
          return (
            result.status === 'hit' &&
            result.record!.key === key &&
            result.record!.tenantId === tenantId &&
            result.record!.accessionId === accessionId &&
            result.record!.payloadType === payloadType &&
            result.record!.payload === payload &&
            result.record!.createdAt === createdAt &&
            result.record!.expiresAt === expiresAt
          );
        },
      ),
      { numRuns: 100 },
    );
  });
});

// ─── Property 11: Idempotency key TTL is exactly 24 hours after creation ─────

/**
 * **Validates: Requirements 4.4**
 *
 * Property 11: When an idempotency record is stored:
 * - The expires_at field is exactly 24 hours (86,400,000 ms) after createdAt
 * - This holds for any valid creation timestamp
 */
describe('Property 11: Idempotency key TTL is exactly 24 hours after creation', () => {
  const TWENTY_FOUR_HOURS_MS = 24 * 60 * 60 * 1000;

  // Generate arbitrary valid dates via integer timestamps (avoids NaN dates)
  const MIN_TS = new Date('2020-01-01T00:00:00Z').getTime();
  const MAX_TS = new Date('2030-12-31T23:59:59Z').getTime();
  const dateArb = fc.integer({ min: MIN_TS, max: MAX_TS }).map((ts) => new Date(ts));

  it('storeIdempotency computes expires_at as exactly createdAt + 24h when expiresAt is empty', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.string({ minLength: 1, maxLength: 128 }),
        fc.string({ minLength: 1, maxLength: 36 }),
        fc.uuid(),
        hexHashArb,
        dateArb,
        async (key, tenantId, accessionId, requestHash, createdDate) => {
          const createdAt = createdDate.toISOString();
          let capturedExpiresAt: string | null = null;

          // Create a mock D1 that captures the bind arguments
          const mockDb = {
            prepare: (_sql: string) => ({
              bind: (...args: any[]) => {
                // The last argument to bind is expires_at
                capturedExpiresAt = args[args.length - 1] as string;
                return {
                  run: async () => ({ success: true }),
                };
              },
            }),
          } as unknown as D1Database;

          const record: IdempotencyRecord = {
            key,
            tenantId,
            accessionId,
            requestHash,
            payloadType: 'single',
            payload: '{}',
            createdAt,
            expiresAt: '', // empty → should be computed as createdAt + 24h
          };

          await storeIdempotency(mockDb, record);

          // Verify the computed expires_at is exactly 24h after createdAt
          const expectedExpiresAt = new Date(
            createdDate.getTime() + TWENTY_FOUR_HOURS_MS,
          ).toISOString();

          return capturedExpiresAt === expectedExpiresAt;
        },
      ),
      { numRuns: 200 },
    );
  });

  it('storeIdempotency uses provided expiresAt when non-empty', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.string({ minLength: 1, maxLength: 128 }),
        fc.string({ minLength: 1, maxLength: 36 }),
        fc.uuid(),
        hexHashArb,
        dateArb,
        async (key, tenantId, accessionId, requestHash, createdDate) => {
          const createdAt = createdDate.toISOString();
          const explicitExpiresAt = new Date(
            createdDate.getTime() + TWENTY_FOUR_HOURS_MS,
          ).toISOString();
          let capturedExpiresAt: string | null = null;

          const mockDb = {
            prepare: (_sql: string) => ({
              bind: (...args: any[]) => {
                capturedExpiresAt = args[args.length - 1] as string;
                return {
                  run: async () => ({ success: true }),
                };
              },
            }),
          } as unknown as D1Database;

          const record: IdempotencyRecord = {
            key,
            tenantId,
            accessionId,
            requestHash,
            payloadType: 'single',
            payload: '{}',
            createdAt,
            expiresAt: explicitExpiresAt, // explicitly provided
          };

          await storeIdempotency(mockDb, record);

          return capturedExpiresAt === explicitExpiresAt;
        },
      ),
      { numRuns: 100 },
    );
  });

  it('TTL difference between expires_at and created_at is always exactly 86400000ms', async () => {
    await fc.assert(
      fc.asyncProperty(dateArb, async (createdDate) => {
        const createdAt = createdDate.toISOString();
        let capturedExpiresAt: string | null = null;

        const mockDb = {
          prepare: (_sql: string) => ({
            bind: (...args: any[]) => {
              capturedExpiresAt = args[args.length - 1] as string;
              return {
                run: async () => ({ success: true }),
              };
            },
          }),
        } as unknown as D1Database;

        const record: IdempotencyRecord = {
          key: 'test-key',
          tenantId: 'test-tenant',
          accessionId: 'test-acc',
          requestHash: 'a'.repeat(64),
          payloadType: 'single',
          payload: '{}',
          createdAt,
          expiresAt: '', // compute automatically
        };

        await storeIdempotency(mockDb, record);

        const createdMs = new Date(createdAt).getTime();
        const expiresMs = new Date(capturedExpiresAt!).getTime();
        const diff = expiresMs - createdMs;

        return diff === TWENTY_FOUR_HOURS_MS;
      }),
      { numRuns: 200 },
    );
  });
});
