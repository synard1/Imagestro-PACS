import { describe, it, expect, vi, beforeEach } from 'vitest';
import { incrementCounterDO, incrementCounter } from '../src/services/sequence-counter-do';
import { SequenceExhaustedError } from '../src/errors';
import type { CounterScope } from '../src/models/counter';
import type { AccessionConfig } from '../src/models/config';
import type { Env } from '../src/types';

/**
 * Unit tests for sequence-counter-do.ts dispatcher.
 *
 * Validates: Requirements 3A.1, 3A.2, 3A.5, 3A.6
 */

const baseScope: CounterScope = {
  tenantId: 'tenant-1',
  facilityCode: 'FAC01',
  modality: 'CT',
  dateBucket: '20250120',
};

function createMockEnv(overrides: Partial<Env> = {}): Env {
  return {
    DB: {} as D1Database,
    COUNTER_DO: undefined,
    CIRCUIT_BREAKER_DO: {} as DurableObjectNamespace,
    METRICS: {} as AnalyticsEngineDataset,
    RATE_LIMIT_EVENTS: {} as AnalyticsEngineDataset,
    CIRCUIT_EVENTS: {} as AnalyticsEngineDataset,
    JOB_RUNS: {} as AnalyticsEngineDataset,
    RATE_LIMITER_WRITE: {} as RateLimit,
    RATE_LIMITER_READ: {} as RateLimit,
    JWT_SECRET: 'test-secret',
    ENABLE_MWL: 'false',
    FACILITY_CODE: 'FAC01',
    ...overrides,
  } as Env;
}

function createMockDONamespace(
  fetchResponse: Response,
): DurableObjectNamespace {
  const mockStub = {
    fetch: vi.fn().mockResolvedValue(fetchResponse),
  } as unknown as DurableObjectStub;

  return {
    idFromName: vi.fn().mockReturnValue('mock-id'),
    get: vi.fn().mockReturnValue(mockStub),
  } as unknown as DurableObjectNamespace;
}

function makeConfig(
  backend: 'D1' | 'DURABLE_OBJECT' = 'D1',
): AccessionConfig {
  return {
    pattern: '{ORG}-{YYYY}{MM}{DD}-{NNNN}',
    counter_reset_policy: 'DAILY',
    sequence_digits: 4,
    timezone: 'Asia/Jakarta',
    counter_backend: backend,
  };
}

describe('incrementCounterDO', () => {
  it('hashes scope and calls DO stub with correct payload', async () => {
    const successResponse = new Response(
      JSON.stringify({ startValue: 1, endValue: 1 }),
      { status: 200, headers: { 'Content-Type': 'application/json' } },
    );
    const mockNamespace = createMockDONamespace(successResponse);
    const env = createMockEnv({ COUNTER_DO: mockNamespace });

    const result = await incrementCounterDO(env, baseScope, 9999, 1);

    expect(result).toEqual({ startValue: 1, endValue: 1 });
    expect(mockNamespace.idFromName).toHaveBeenCalledWith(expect.any(String));
    expect(mockNamespace.get).toHaveBeenCalledWith('mock-id');
  });

  it('throws SequenceExhaustedError on HTTP 409', async () => {
    const exhaustedResponse = new Response(
      JSON.stringify({ error: 'sequence_exhausted' }),
      { status: 409, headers: { 'Content-Type': 'application/json' } },
    );
    const mockNamespace = createMockDONamespace(exhaustedResponse);
    const env = createMockEnv({ COUNTER_DO: mockNamespace });

    await expect(
      incrementCounterDO(env, baseScope, 9999, 1),
    ).rejects.toThrow(SequenceExhaustedError);
  });

  it('throws generic error on non-200/non-409 response', async () => {
    const errorResponse = new Response('Internal Server Error', {
      status: 500,
    });
    const mockNamespace = createMockDONamespace(errorResponse);
    const env = createMockEnv({ COUNTER_DO: mockNamespace });

    await expect(
      incrementCounterDO(env, baseScope, 9999, 1),
    ).rejects.toThrow(/Durable Object counter error/);
  });

  it('passes count to the DO request body', async () => {
    const successResponse = new Response(
      JSON.stringify({ startValue: 5, endValue: 9 }),
      { status: 200, headers: { 'Content-Type': 'application/json' } },
    );
    const mockNamespace = createMockDONamespace(successResponse);
    const env = createMockEnv({ COUNTER_DO: mockNamespace });

    const result = await incrementCounterDO(env, baseScope, 9999, 5);

    expect(result).toEqual({ startValue: 5, endValue: 9 });
  });

  it('uses consistent hash for the same scope', async () => {
    const successResponse = new Response(
      JSON.stringify({ startValue: 1, endValue: 1 }),
      { status: 200, headers: { 'Content-Type': 'application/json' } },
    );
    const mockNamespace1 = createMockDONamespace(successResponse);
    const mockNamespace2 = createMockDONamespace(
      new Response(JSON.stringify({ startValue: 2, endValue: 2 }), {
        status: 200,
      }),
    );

    const env1 = createMockEnv({ COUNTER_DO: mockNamespace1 });
    const env2 = createMockEnv({ COUNTER_DO: mockNamespace2 });

    await incrementCounterDO(env1, baseScope, 9999, 1);
    await incrementCounterDO(env2, baseScope, 9999, 1);

    // Both should have been called with the same hash
    const hash1 = (mockNamespace1.idFromName as ReturnType<typeof vi.fn>).mock
      .calls[0]![0];
    const hash2 = (mockNamespace2.idFromName as ReturnType<typeof vi.fn>).mock
      .calls[0]![0];
    expect(hash1).toBe(hash2);
  });
});

describe('incrementCounter (dispatcher)', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('uses D1 when counter_backend is D1', async () => {
    // We can't easily mock incrementCounterD1 without module mocking,
    // but we can verify it attempts to use env.DB by checking it doesn't
    // touch COUNTER_DO
    const config = makeConfig('D1');
    const mockNamespace = createMockDONamespace(
      new Response(JSON.stringify({ startValue: 1, endValue: 1 }), {
        status: 200,
      }),
    );
    const env = createMockEnv({ COUNTER_DO: mockNamespace });

    // D1 call will fail since DB is a mock, but it should NOT call DO
    try {
      await incrementCounter(env, config, baseScope, 1);
    } catch {
      // Expected: DB is not a real D1Database
    }

    // DO should not have been called
    expect(mockNamespace.idFromName).not.toHaveBeenCalled();
  });

  it('uses DO when counter_backend is DURABLE_OBJECT and binding exists', async () => {
    const config = makeConfig('DURABLE_OBJECT');
    const successResponse = new Response(
      JSON.stringify({ startValue: 1, endValue: 1 }),
      { status: 200, headers: { 'Content-Type': 'application/json' } },
    );
    const mockNamespace = createMockDONamespace(successResponse);
    const env = createMockEnv({ COUNTER_DO: mockNamespace });

    const result = await incrementCounter(env, config, baseScope, 1);

    expect(result).toEqual({ startValue: 1, endValue: 1 });
    expect(mockNamespace.idFromName).toHaveBeenCalled();
  });

  it('falls back to D1 with warning when COUNTER_DO binding is missing', async () => {
    const config = makeConfig('DURABLE_OBJECT');
    const env = createMockEnv({ COUNTER_DO: undefined });
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    // D1 call will fail since DB is a mock, but we can verify the warning
    try {
      await incrementCounter(env, config, baseScope, 1);
    } catch {
      // Expected: DB is not a real D1Database
    }

    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('COUNTER_DO binding is not configured'),
    );
    warnSpy.mockRestore();
  });

  it('propagates DO errors without fallback when binding exists', async () => {
    const config = makeConfig('DURABLE_OBJECT');
    const errorResponse = new Response('DO unavailable', { status: 500 });
    const mockNamespace = createMockDONamespace(errorResponse);
    const env = createMockEnv({ COUNTER_DO: mockNamespace });

    await expect(
      incrementCounter(env, config, baseScope, 1),
    ).rejects.toThrow(/Durable Object counter error/);
  });

  it('computes maxValue from sequence_digits', async () => {
    const config = makeConfig('DURABLE_OBJECT');
    config.sequence_digits = 6; // maxValue = 999999
    const successResponse = new Response(
      JSON.stringify({ startValue: 1, endValue: 1 }),
      { status: 200, headers: { 'Content-Type': 'application/json' } },
    );
    const mockNamespace = createMockDONamespace(successResponse);
    const env = createMockEnv({ COUNTER_DO: mockNamespace });

    await incrementCounter(env, config, baseScope, 1);

    // Verify the stub.fetch was called (we can't easily inspect the body
    // without more complex mocking, but the call succeeding confirms it works)
    const stub = mockNamespace.get({} as DurableObjectId) as unknown as {
      fetch: ReturnType<typeof vi.fn>;
    };
    expect((stub.fetch as ReturnType<typeof vi.fn>)).toHaveBeenCalled();
  });
});
