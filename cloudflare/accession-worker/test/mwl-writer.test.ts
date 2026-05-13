/**
 * Unit tests for MWL Writer service paths.
 *
 * Covers:
 * - Service Binding vs HTTP fallback (Req 9.4)
 * - ENABLE_MWL toggle (Req 9.1, 9.2)
 * - 5xx retry with exponential backoff (Req 9.10)
 * - 4xx no-retry (Req 9.10)
 * - Circuit-open skip (Req 9.6, 9.7)
 * - X-Request-ID propagation (Req 9.9)
 *
 * Requirements: 9.1, 9.2, 9.3, 9.4, 9.10
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { sendToMwlWriter, type MwlPayload } from '../src/services/mwl-writer';
import type { Env } from '../src/types';

// ─── Test Fixtures ───────────────────────────────────────────────────────────

const TEST_REQUEST_ID = '01912345-6789-7abc-8def-0123456789ab';

const TEST_PAYLOAD: MwlPayload = {
  accession_number: 'RS01-20250120-0001',
  patient_national_id: '3201234567890001',
  patient_name: 'John Doe',
  modality: 'CT',
  procedure_code: 'CT-HEAD',
  procedure_name: 'CT Head Without Contrast',
  scheduled_at: '2025-01-20T10:00:00Z',
};

// ─── Mock Helpers ────────────────────────────────────────────────────────────

function createMockCircuitBreakerDO(options: {
  allowed?: boolean;
  state?: string;
  openUntil?: number;
} = {}): DurableObjectNamespace {
  const { allowed = true, state = 'closed', openUntil } = options;

  const stub = {
    fetch: vi.fn().mockResolvedValue(
      new Response(JSON.stringify({
        allowed,
        status: { state, openUntil },
      }), { status: 200 })
    ),
  };

  return {
    idFromName: vi.fn().mockReturnValue({ toString: () => 'mock-id' }),
    get: vi.fn().mockReturnValue(stub),
  } as unknown as DurableObjectNamespace;
}

function createMockServiceBinding(responses: Response[]): Fetcher {
  let callIndex = 0;
  return {
    fetch: vi.fn().mockImplementation(() => {
      const response = responses[callIndex] ?? responses[responses.length - 1];
      callIndex++;
      return Promise.resolve(response!);
    }),
  } as unknown as Fetcher;
}

function createBaseEnv(overrides: Partial<Env> = {}): Env {
  return {
    ENABLE_MWL: 'true',
    MWL_WRITER_URL: 'https://mwl-writer.example.com/write',
    FACILITY_CODE: 'RS01',
    CIRCUIT_BREAKER_DO: createMockCircuitBreakerDO(),
    DB: {} as D1Database,
    METRICS: { writeDataPoint: vi.fn() } as unknown as AnalyticsEngineDataset,
    RATE_LIMIT_EVENTS: { writeDataPoint: vi.fn() } as unknown as AnalyticsEngineDataset,
    CIRCUIT_EVENTS: { writeDataPoint: vi.fn() } as unknown as AnalyticsEngineDataset,
    JOB_RUNS: { writeDataPoint: vi.fn() } as unknown as AnalyticsEngineDataset,
    RATE_LIMITER_WRITE: {} as RateLimit,
    RATE_LIMITER_READ: {} as RateLimit,
    JWT_SECRET: 'test-secret',
    ...overrides,
  } as Env;
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('MWL Writer - sendToMwlWriter', () => {
  let fetchSpy: any;

  beforeEach(() => {
    vi.useFakeTimers();
    fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response('OK', { status: 200 })
    );
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  // ─── ENABLE_MWL Toggle (Req 9.1, 9.2) ───────────────────────────────────

  describe('ENABLE_MWL toggle', () => {
    it('skips MWL call entirely when ENABLE_MWL is not "true"', async () => {
      const env = createBaseEnv({ ENABLE_MWL: 'false' });

      await sendToMwlWriter(env, TEST_PAYLOAD, TEST_REQUEST_ID);

      // Should not call circuit breaker or fetch
      const cbDO = env.CIRCUIT_BREAKER_DO as unknown as { idFromName: ReturnType<typeof vi.fn> };
      expect(cbDO.idFromName).not.toHaveBeenCalled();
      expect(fetchSpy).not.toHaveBeenCalled();
    });

    it('skips MWL call when ENABLE_MWL is undefined', async () => {
      const env = createBaseEnv({ ENABLE_MWL: undefined as unknown as string });

      await sendToMwlWriter(env, TEST_PAYLOAD, TEST_REQUEST_ID);

      const cbDO = env.CIRCUIT_BREAKER_DO as unknown as { idFromName: ReturnType<typeof vi.fn> };
      expect(cbDO.idFromName).not.toHaveBeenCalled();
      expect(fetchSpy).not.toHaveBeenCalled();
    });

    it('proceeds with MWL call when ENABLE_MWL is "true"', async () => {
      const mwlBinding = createMockServiceBinding([new Response('OK', { status: 200 })]);
      const env = createBaseEnv({ MWL_WRITER: mwlBinding });

      await sendToMwlWriter(env, TEST_PAYLOAD, TEST_REQUEST_ID);

      expect((mwlBinding.fetch as ReturnType<typeof vi.fn>)).toHaveBeenCalled();
    });
  });

  // ─── Service Binding vs HTTP Fallback (Req 9.4) ──────────────────────────

  describe('Service Binding vs HTTP fallback', () => {
    it('uses Service Binding when env.MWL_WRITER is available', async () => {
      const mwlBinding = createMockServiceBinding([new Response('OK', { status: 200 })]);
      const env = createBaseEnv({ MWL_WRITER: mwlBinding });

      await sendToMwlWriter(env, TEST_PAYLOAD, TEST_REQUEST_ID);

      expect((mwlBinding.fetch as ReturnType<typeof vi.fn>)).toHaveBeenCalledTimes(1);
      // Should NOT use global fetch
      expect(fetchSpy).not.toHaveBeenCalled();
    });

    it('falls back to HTTP fetch when no Service Binding is configured', async () => {
      const env = createBaseEnv({ MWL_WRITER: undefined });

      await sendToMwlWriter(env, TEST_PAYLOAD, TEST_REQUEST_ID);

      expect(fetchSpy).toHaveBeenCalledTimes(1);
      const [url] = fetchSpy.mock.calls[0]!;
      expect(url).toBe('https://mwl-writer.example.com/write');
    });

    it('Service Binding request targets the correct internal URL', async () => {
      const mwlBinding = createMockServiceBinding([new Response('OK', { status: 200 })]);
      const env = createBaseEnv({ MWL_WRITER: mwlBinding });

      await sendToMwlWriter(env, TEST_PAYLOAD, TEST_REQUEST_ID);

      const fetchCall = (mwlBinding.fetch as ReturnType<typeof vi.fn>).mock.calls[0]!;
      const request = fetchCall[0] as Request;
      expect(request.url).toBe('https://mwl-writer.internal/write');
      expect(request.method).toBe('POST');
    });
  });

  // ─── 5xx Retry (Req 9.10) ────────────────────────────────────────────────

  describe('5xx retry with exponential backoff', () => {
    it('retries up to 2 times on 5xx responses (200ms, 800ms delays)', async () => {
      const mwlBinding = createMockServiceBinding([
        new Response('Internal Server Error', { status: 500 }),
        new Response('Bad Gateway', { status: 502 }),
        new Response('OK', { status: 200 }),
      ]);
      const env = createBaseEnv({ MWL_WRITER: mwlBinding });

      const promise = sendToMwlWriter(env, TEST_PAYLOAD, TEST_REQUEST_ID);

      // Advance through retry delays
      await vi.advanceTimersByTimeAsync(200); // first retry delay
      await vi.advanceTimersByTimeAsync(800); // second retry delay

      await promise;

      // 3 total attempts: initial + 2 retries
      expect((mwlBinding.fetch as ReturnType<typeof vi.fn>)).toHaveBeenCalledTimes(3);
    });

    it('succeeds on second attempt after initial 5xx', async () => {
      const mwlBinding = createMockServiceBinding([
        new Response('Internal Server Error', { status: 500 }),
        new Response('OK', { status: 200 }),
      ]);
      const env = createBaseEnv({ MWL_WRITER: mwlBinding });

      const promise = sendToMwlWriter(env, TEST_PAYLOAD, TEST_REQUEST_ID);
      await vi.advanceTimersByTimeAsync(200); // first retry delay
      await promise;

      expect((mwlBinding.fetch as ReturnType<typeof vi.fn>)).toHaveBeenCalledTimes(2);
    });

    it('records circuit failure after all retries exhausted on 5xx', async () => {
      const mwlBinding = createMockServiceBinding([
        new Response('Error', { status: 500 }),
        new Response('Error', { status: 503 }),
        new Response('Error', { status: 502 }),
      ]);
      const cbDO = createMockCircuitBreakerDO();
      const env = createBaseEnv({ MWL_WRITER: mwlBinding, CIRCUIT_BREAKER_DO: cbDO });

      const promise = sendToMwlWriter(env, TEST_PAYLOAD, TEST_REQUEST_ID);
      await vi.advanceTimersByTimeAsync(200);
      await vi.advanceTimersByTimeAsync(800);
      await promise;

      // Circuit breaker should have recorded a failure
      const stub = (cbDO as unknown as { get: ReturnType<typeof vi.fn> }).get.mock.results;
      // The DO stub's fetch should have been called for try-acquire + record-failure
      const doStub = (cbDO as unknown as { get: ReturnType<typeof vi.fn> }).get();
      const fetchCalls = (doStub.fetch as ReturnType<typeof vi.fn>).mock.calls;
      // At least one call should be to record-failure
      const hasRecordFailure = fetchCalls.some((call: unknown[]) => {
        const req = call[0] as Request;
        return req.url.includes('record-failure');
      });
      expect(hasRecordFailure).toBe(true);
    });
  });

  // ─── 4xx No-Retry (Req 9.10) ─────────────────────────────────────────────

  describe('4xx no-retry', () => {
    it('does NOT retry on 4xx responses', async () => {
      const mwlBinding = createMockServiceBinding([
        new Response('Bad Request', { status: 400 }),
      ]);
      const env = createBaseEnv({ MWL_WRITER: mwlBinding });

      await sendToMwlWriter(env, TEST_PAYLOAD, TEST_REQUEST_ID);

      // Only 1 attempt — no retries for 4xx
      expect((mwlBinding.fetch as ReturnType<typeof vi.fn>)).toHaveBeenCalledTimes(1);
    });

    it('does NOT retry on 404 responses', async () => {
      const mwlBinding = createMockServiceBinding([
        new Response('Not Found', { status: 404 }),
      ]);
      const env = createBaseEnv({ MWL_WRITER: mwlBinding });

      await sendToMwlWriter(env, TEST_PAYLOAD, TEST_REQUEST_ID);

      expect((mwlBinding.fetch as ReturnType<typeof vi.fn>)).toHaveBeenCalledTimes(1);
    });

    it('does NOT retry on 422 responses', async () => {
      const mwlBinding = createMockServiceBinding([
        new Response('Unprocessable Entity', { status: 422 }),
      ]);
      const env = createBaseEnv({ MWL_WRITER: mwlBinding });

      await sendToMwlWriter(env, TEST_PAYLOAD, TEST_REQUEST_ID);

      expect((mwlBinding.fetch as ReturnType<typeof vi.fn>)).toHaveBeenCalledTimes(1);
    });
  });

  // ─── Circuit-Open Skip (Req 9.6, 9.7) ────────────────────────────────────

  describe('circuit-open skip', () => {
    it('skips MWL call when circuit breaker is open', async () => {
      const mwlBinding = createMockServiceBinding([new Response('OK', { status: 200 })]);
      const cbDO = createMockCircuitBreakerDO({ allowed: false, state: 'open', openUntil: Date.now() + 30_000 });
      const env = createBaseEnv({ MWL_WRITER: mwlBinding, CIRCUIT_BREAKER_DO: cbDO });

      await sendToMwlWriter(env, TEST_PAYLOAD, TEST_REQUEST_ID);

      // MWL fetch should NOT be called
      expect((mwlBinding.fetch as ReturnType<typeof vi.fn>)).not.toHaveBeenCalled();
      expect(fetchSpy).not.toHaveBeenCalled();
    });

    it('logs circuit_open warning when circuit is open', async () => {
      const consoleSpy = vi.spyOn(console, 'warn');
      const cbDO = createMockCircuitBreakerDO({ allowed: false, state: 'open', openUntil: Date.now() + 30_000 });
      const env = createBaseEnv({ CIRCUIT_BREAKER_DO: cbDO });

      await sendToMwlWriter(env, TEST_PAYLOAD, TEST_REQUEST_ID);

      expect(consoleSpy).toHaveBeenCalledWith(
        '[mwl-writer] circuit_open',
        expect.objectContaining({
          requestId: TEST_REQUEST_ID,
          state: 'open',
        })
      );
    });

    it('emits circuit event when circuit is open', async () => {
      const cbDO = createMockCircuitBreakerDO({ allowed: false, state: 'open', openUntil: Date.now() + 30_000 });
      const circuitEvents = { writeDataPoint: vi.fn() } as unknown as AnalyticsEngineDataset;
      const env = createBaseEnv({ CIRCUIT_BREAKER_DO: cbDO, CIRCUIT_EVENTS: circuitEvents });

      await sendToMwlWriter(env, TEST_PAYLOAD, TEST_REQUEST_ID);

      expect(circuitEvents.writeDataPoint).toHaveBeenCalledWith(
        expect.objectContaining({
          blobs: ['mwl-writer', 'open', 'denied'],
        })
      );
    });
  });

  // ─── X-Request-ID Propagation (Req 9.9) ──────────────────────────────────

  describe('X-Request-ID propagation', () => {
    it('includes X-Request-ID header in Service Binding calls', async () => {
      const mwlBinding = createMockServiceBinding([new Response('OK', { status: 200 })]);
      const env = createBaseEnv({ MWL_WRITER: mwlBinding });

      await sendToMwlWriter(env, TEST_PAYLOAD, TEST_REQUEST_ID);

      const fetchCall = (mwlBinding.fetch as ReturnType<typeof vi.fn>).mock.calls[0]!;
      const request = fetchCall[0] as Request;
      expect(request.headers.get('X-Request-ID')).toBe(TEST_REQUEST_ID);
    });

    it('includes X-Request-ID header in HTTP fallback calls', async () => {
      const env = createBaseEnv({ MWL_WRITER: undefined });

      await sendToMwlWriter(env, TEST_PAYLOAD, TEST_REQUEST_ID);

      const [, options] = fetchSpy.mock.calls[0]!;
      const headers = (options as RequestInit).headers as Record<string, string>;
      expect(headers['X-Request-ID']).toBe(TEST_REQUEST_ID);
    });

    it('propagates different request IDs correctly', async () => {
      const customRequestId = 'custom-req-id-12345';
      const mwlBinding = createMockServiceBinding([new Response('OK', { status: 200 })]);
      const env = createBaseEnv({ MWL_WRITER: mwlBinding });

      await sendToMwlWriter(env, TEST_PAYLOAD, customRequestId);

      const fetchCall = (mwlBinding.fetch as ReturnType<typeof vi.fn>).mock.calls[0]!;
      const request = fetchCall[0] as Request;
      expect(request.headers.get('X-Request-ID')).toBe(customRequestId);
    });
  });

  // ─── Fire-and-Forget Error Handling (Req 9.3) ────────────────────────────

  describe('fire-and-forget error handling', () => {
    it('never throws to caller even on unexpected errors', async () => {
      const cbDO = {
        idFromName: vi.fn().mockImplementation(() => { throw new Error('DO unavailable'); }),
        get: vi.fn(),
      } as unknown as DurableObjectNamespace;
      const env = createBaseEnv({ CIRCUIT_BREAKER_DO: cbDO });

      // Should not throw
      await expect(sendToMwlWriter(env, TEST_PAYLOAD, TEST_REQUEST_ID)).resolves.toBeUndefined();
    });

    it('never throws when fetch throws a network error', async () => {
      fetchSpy.mockRejectedValue(new Error('Network unreachable'));
      const env = createBaseEnv({ MWL_WRITER: undefined });

      const promise = sendToMwlWriter(env, TEST_PAYLOAD, TEST_REQUEST_ID);
      await vi.advanceTimersByTimeAsync(200);
      await vi.advanceTimersByTimeAsync(800);

      await expect(promise).resolves.toBeUndefined();
    });
  });
});
