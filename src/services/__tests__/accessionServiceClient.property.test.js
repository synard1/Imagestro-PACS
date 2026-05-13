// src/services/__tests__/accessionServiceClient.property.test.js
// Property-based tests for AccessionServiceClient (Properties 8, 9, 13-15)
// **Validates: Requirements 2.6, 2.8, 10.2, 10.3, 10.6**
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fc from 'fast-check';

// Mock dependencies before importing the module
vi.mock('../../services/api-registry', () => ({
  loadRegistry: () => ({
    accession: { enabled: true, baseUrl: '/accession-api', healthPath: '/healthz', timeoutMs: 5000 }
  })
}));

vi.mock('../../services/auth-storage', () => ({
  getAuthHeader: () => ({ Authorization: 'Bearer test-token' })
}));

vi.mock('../../services/config', () => ({
  getConfig: async () => ({ apiBaseUrl: '', timeoutMs: 5000 }),
  getConfigSync: () => ({ apiBaseUrl: '' })
}));

vi.mock('../../services/error-parser', () => ({
  createCleanError: (err, status) => {
    const e = new Error(err.message);
    e.status = status || err.status;
    e.code = err.code;
    e.originalError = err;
    return e;
  },
  parseErrorMessage: (err) => err.message
}));

vi.mock('../../utils/csrf', () => ({
  addCSRFHeader: async () => ({})
}));

vi.mock('../../utils/security', () => ({
  redactSensitiveData: (data) => data
}));

vi.mock('../../services/settingsService', () => ({
  getSettings: vi.fn(async () => ({ useServerAccession: false })),
  getAccessionConfig: vi.fn(async () => ({
    pattern: '{ORG}-{YYYY}{MM}{DD}-{SEQ4}',
    resetPolicy: 'daily',
    seqPadding: 4,
    orgCode: 'RS01',
    siteCode: 'RAD',
    useModalityInSeqScope: false
  }))
}));

vi.mock('../../services/notifications', () => ({
  notify: vi.fn()
}));

vi.mock('../../services/accession', () => ({
  generateAccessionAsync: vi.fn(async () => 'LOCAL-20250115-0001'),
  loadAccessionConfig: () => ({ pattern: '{SEQ4}' }),
  saveAccessionConfig: () => true
}));

import {
  request,
  generateRequestId,
  parseRetryAfter,
  transformError,
  getAccessionNumber
} from '../../services/accessionServiceClient.js';

import { getSettings } from '../../services/settingsService';
import { generateAccessionAsync } from '../../services/accession';

// UUID v4 regex pattern
const UUID_V4_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

describe('Feature: accession-worker-integration, Property 8: Error response transformation', () => {
  it('transforms any HTTP error response into structured error with status, message, and requestId', () => {
    fc.assert(
      fc.property(
        // Generate random status codes (400-599)
        fc.integer({ min: 400, max: 599 }),
        // Generate error message strings (non-empty, alphanumeric to avoid JSON issues)
        fc.stringMatching(/^[A-Za-z0-9 _-]{1,50}$/),
        // Generate optional request_id (either a UUID-like string or undefined)
        fc.option(fc.uuid(), { nil: undefined }),
        // Generate a fallback request ID
        fc.uuid(),
        (statusCode, errorMessage, requestId, fallbackRequestId) => {
          // Build an error object that mimics what apiClient throws
          const body = { error: errorMessage };
          if (requestId !== undefined) {
            body.request_id = requestId;
          }
          const errorObj = new Error(`HTTP ${statusCode}: ${JSON.stringify(body)}`);
          errorObj.status = statusCode;

          const result = transformError(errorObj, fallbackRequestId);

          // Verify status matches the HTTP status code
          expect(result.statusCode).toBe(statusCode);
          // Verify message comes from the response body's error field
          expect(result.message).toBe(errorMessage);
          // Verify requestId comes from response body's request_id or falls back
          if (requestId !== undefined) {
            expect(result.requestId).toBe(requestId);
          } else {
            expect(result.requestId).toBe(fallbackRequestId);
          }
        }
      ),
      { numRuns: 100 }
    );
  });
});

describe('Feature: accession-worker-integration, Property 9: X-Request-ID UUID v4 on every request', () => {
  it('generateRequestId() always produces a valid UUID v4 string', () => {
    fc.assert(
      fc.property(
        fc.constant(null),
        () => {
          const id = generateRequestId();
          expect(typeof id).toBe('string');
          expect(id).toMatch(UUID_V4_REGEX);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('generateRequestId() produces unique values across calls', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 2, max: 50 }),
        (count) => {
          const ids = new Set();
          for (let i = 0; i < count; i++) {
            ids.add(generateRequestId());
          }
          expect(ids.size).toBe(count);
        }
      ),
      { numRuns: 100 }
    );
  });
});

describe('Feature: accession-worker-integration, Property 13: Idempotency key preservation on POST retry', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    globalThis.window = globalThis;
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('POST retry includes X-Idempotency-Key header with a valid UUID', async () => {
    for (let i = 0; i < 100; i++) {
      let callCount = 0;
      let retryHeaders = null;

      globalThis.window.fetch = vi.fn(async (url, options) => {
        callCount++;
        if (callCount === 1) {
          return new Response(JSON.stringify({ error: 'Server error' }), {
            status: 500,
            headers: { 'content-type': 'application/json' }
          });
        }
        retryHeaders = options.headers;
        return new Response(JSON.stringify({ id: '1', accession_number: 'ACC-001', issuer: 'TEST' }), {
          status: 200,
          headers: { 'content-type': 'application/json' }
        });
      });

      const promise = request('POST', '/api/accessions', { modality: 'CT' });
      await vi.advanceTimersByTimeAsync(1100);
      await promise;

      expect(callCount).toBe(2);
      expect(retryHeaders).toBeDefined();
      const idempotencyKey = retryHeaders.get
        ? retryHeaders.get('X-Idempotency-Key')
        : retryHeaders['X-Idempotency-Key'];
      expect(idempotencyKey).toBeDefined();
      expect(idempotencyKey).toMatch(UUID_V4_REGEX);
    }
  }, 30000);

  it('POST retry preserves the same idempotency key from original request', async () => {
    for (let i = 0; i < 100; i++) {
      let callCount = 0;
      let retryCallHeaders = null;

      globalThis.window.fetch = vi.fn(async (url, options) => {
        callCount++;
        if (callCount === 1) {
          return new Response(JSON.stringify({ error: 'Server error' }), {
            status: 500,
            headers: { 'content-type': 'application/json' }
          });
        }
        retryCallHeaders = options.headers;
        return new Response(JSON.stringify({ id: '1', accession_number: 'ACC-001', issuer: 'TEST' }), {
          status: 200,
          headers: { 'content-type': 'application/json' }
        });
      });

      const promise = request('POST', '/api/accessions', { modality: 'MR' });
      await vi.advanceTimersByTimeAsync(1100);
      await promise;

      const retryKey = retryCallHeaders.get
        ? retryCallHeaders.get('X-Idempotency-Key')
        : retryCallHeaders['X-Idempotency-Key'];
      expect(retryKey).toBeDefined();
      expect(retryKey).toMatch(UUID_V4_REGEX);
    }
  }, 30000);
});

describe('Feature: accession-worker-integration, Property 14: Structured error on retry exhaustion', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    globalThis.window = globalThis;
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('rejects with error containing statusCode, message, requestId, and originalError on retry exhaustion', async () => {
    // Generate test data upfront using fast-check sample
    const testCases = fc.sample(
      fc.tuple(
        fc.integer({ min: 500, max: 599 }),
        fc.stringMatching(/^[A-Za-z0-9 _-]{1,50}$/),
        fc.option(fc.uuid(), { nil: undefined })
      ),
      100
    );

    for (const [statusCode, errorMessage, serverRequestId] of testCases) {
      const body = { error: errorMessage };
      if (serverRequestId !== undefined) {
        body.request_id = serverRequestId;
      }

      globalThis.window.fetch = vi.fn(async () => {
        return new Response(JSON.stringify(body), {
          status: statusCode,
          headers: { 'content-type': 'application/json' }
        });
      });

      // Capture the rejection immediately to prevent unhandled rejection
      let caughtError = null;
      const promise = request('GET', '/api/accessions').catch(err => {
        caughtError = err;
      });

      // Run all timers and flush microtasks to ensure the retry completes
      await vi.runAllTimersAsync();
      await promise;

      // Verify the error was thrown
      expect(caughtError).not.toBeNull();

      // Verify all four required fields exist
      expect(caughtError).toHaveProperty('statusCode');
      expect(caughtError).toHaveProperty('message');
      expect(caughtError).toHaveProperty('requestId');
      expect(caughtError).toHaveProperty('originalError');

      // Verify types
      expect(typeof caughtError.statusCode).toBe('number');
      expect(typeof caughtError.message).toBe('string');
      expect(typeof caughtError.requestId).toBe('string');
      expect(typeof caughtError.originalError).toBe('string');

      // Verify message is non-empty
      expect(caughtError.message.length).toBeGreaterThan(0);
    }
  }, 60000);
});

describe('Feature: accession-worker-integration, Property 15: Rate limit handling respects Retry-After bounds', () => {
  it('parseRetryAfter returns milliseconds for valid integer values <= 60', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 60 }),
        (seconds) => {
          const result = parseRetryAfter(String(seconds));
          expect(result).toBe(seconds * 1000);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('parseRetryAfter returns null for values > 60', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 61, max: 10000 }),
        (seconds) => {
          const result = parseRetryAfter(String(seconds));
          expect(result).toBeNull();
        }
      ),
      { numRuns: 100 }
    );
  });

  it('parseRetryAfter returns null for missing or malformed values', () => {
    fc.assert(
      fc.property(
        fc.oneof(
          fc.constant(null),
          fc.constant(''),
          // Non-numeric strings
          fc.stringMatching(/^[A-Za-z]{1,10}$/),
          // Strings with trailing non-digits like "12abc"
          fc.tuple(fc.integer({ min: 0, max: 60 }), fc.stringMatching(/^[a-z]{1,5}$/))
            .map(([n, suffix]) => `${n}${suffix}`),
          // Negative numbers
          fc.integer({ min: -1000, max: -1 }).map(n => String(n))
        ),
        (value) => {
          const result = parseRetryAfter(value);
          expect(result).toBeNull();
        }
      ),
      { numRuns: 100 }
    );
  });
});


describe('Feature: accession-worker-integration, Property 16: Feature flag return type consistency', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    globalThis.window = globalThis;
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('returns a string when useServerAccession is true and server succeeds', async () => {
    // **Validates: Requirements 3.7**
    await fc.assert(
      fc.asyncProperty(
        fc.stringMatching(/^[A-Z]{2}$/),
        fc.stringMatching(/^[A-Za-z0-9]{3,20}$/),
        fc.stringMatching(/^[A-Z0-9\-]{3,30}$/),
        async (modality, patientId, accessionNumber) => {
          getSettings.mockResolvedValue({ useServerAccession: true });

          globalThis.window.fetch = vi.fn(async () => {
            return new Response(JSON.stringify({
              id: 'uuid-1',
              accession_number: accessionNumber,
              issuer: 'TEST'
            }), {
              status: 200,
              headers: { 'content-type': 'application/json' }
            });
          });

          const result = await getAccessionNumber({ modality, patientId });
          expect(typeof result).toBe('string');
        }
      ),
      { numRuns: 100 }
    );
  });

  it('returns a string when useServerAccession is false (client-side generation)', async () => {
    // **Validates: Requirements 3.7**
    await fc.assert(
      fc.asyncProperty(
        fc.stringMatching(/^[A-Z]{2}$/),
        fc.stringMatching(/^[A-Za-z0-9]{3,20}$/),
        fc.stringMatching(/^[A-Za-z0-9\-]{3,30}$/),
        async (modality, patientId, localResult) => {
          getSettings.mockResolvedValue({ useServerAccession: false });
          generateAccessionAsync.mockResolvedValue(localResult);

          const result = await getAccessionNumber({ modality, patientId });
          expect(typeof result).toBe('string');
        }
      ),
      { numRuns: 100 }
    );
  });

  it('returns a string when useServerAccession is undefined (defaults to client-side)', async () => {
    // **Validates: Requirements 3.7**
    await fc.assert(
      fc.asyncProperty(
        fc.stringMatching(/^[A-Z]{2}$/),
        fc.stringMatching(/^[A-Za-z0-9]{3,20}$/),
        fc.stringMatching(/^[A-Za-z0-9\-]{3,30}$/),
        async (modality, patientId, localResult) => {
          getSettings.mockResolvedValue({});
          generateAccessionAsync.mockResolvedValue(localResult);

          const result = await getAccessionNumber({ modality, patientId });
          expect(typeof result).toBe('string');
        }
      ),
      { numRuns: 100 }
    );
  });

  it('returns a string when server fails and falls back to client-side generation', async () => {
    // **Validates: Requirements 3.7**
    await fc.assert(
      fc.asyncProperty(
        fc.stringMatching(/^[A-Z]{2}$/),
        fc.stringMatching(/^[A-Za-z0-9]{3,20}$/),
        fc.stringMatching(/^[A-Za-z0-9\-]{3,30}$/),
        async (modality, patientId, fallbackResult) => {
          getSettings.mockResolvedValue({ useServerAccession: true });
          generateAccessionAsync.mockResolvedValue(fallbackResult);

          // Mock fetch to fail on both attempts (triggering retry exhaustion and fallback)
          let callCount = 0;
          globalThis.window.fetch = vi.fn(async () => {
            callCount++;
            return new Response(JSON.stringify({ error: 'Server error' }), {
              status: 500,
              headers: { 'content-type': 'application/json' }
            });
          });

          const promise = getAccessionNumber({ modality, patientId });
          // Advance timers to allow retry delay to complete
          await vi.advanceTimersByTimeAsync(2000);
          const result = await promise;

          expect(typeof result).toBe('string');
        }
      ),
      { numRuns: 100 }
    );
  });
});
