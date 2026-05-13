// tests/accessionServiceClient.request.test.js
// Tests for the request() function retry logic and error handling
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock dependencies before importing the module
vi.mock('../src/services/api-registry', () => ({
  loadRegistry: () => ({
    accession: { enabled: true, baseUrl: '/accession-api', healthPath: '/healthz', timeoutMs: 5000 }
  })
}));

vi.mock('../src/services/auth-storage', () => ({
  getAuthHeader: () => ({ Authorization: 'Bearer test-token' })
}));

vi.mock('../src/services/config', () => ({
  getConfig: async () => ({ apiBaseUrl: '', timeoutMs: 5000 }),
  getConfigSync: () => ({ apiBaseUrl: '' })
}));

vi.mock('../src/services/error-parser', () => ({
  createCleanError: (err, status) => {
    const e = new Error(err.message);
    e.status = status || err.status;
    e.code = err.code;
    e.originalError = err;
    return e;
  },
  parseErrorMessage: (err) => err.message
}));

vi.mock('../src/utils/csrf', () => ({
  addCSRFHeader: async () => ({})
}));

vi.mock('../src/utils/security', () => ({
  redactSensitiveData: (data) => data
}));

import { request, generateRequestId } from '../src/services/accessionServiceClient.js';

describe('accessionServiceClient - request() retry logic', () => {
  let fetchMock;
  let fetchCallCount;
  let fetchCalls;

  beforeEach(() => {
    fetchCallCount = 0;
    fetchCalls = [];
    // Default mock that succeeds
    fetchMock = vi.fn(async (url, options) => {
      fetchCallCount++;
      fetchCalls.push({ url, options });
      return new Response(JSON.stringify({ id: '1', accession_number: 'ACC-001', issuer: 'TEST' }), {
        status: 200,
        headers: { 'content-type': 'application/json' }
      });
    });
    globalThis.window = globalThis;
    globalThis.window.fetch = fetchMock;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns result on successful first attempt', async () => {
    const result = await request('GET', '/api/accessions');
    expect(result).toEqual({ id: '1', accession_number: 'ACC-001', issuer: 'TEST' });
    expect(fetchCallCount).toBe(1);
  });

  it('retries once on 5xx and succeeds on retry', async () => {
    let callCount = 0;
    globalThis.window.fetch = vi.fn(async (url, options) => {
      callCount++;
      if (callCount === 1) {
        return new Response(JSON.stringify({ error: 'Internal error' }), {
          status: 500,
          headers: { 'content-type': 'application/json' }
        });
      }
      return new Response(JSON.stringify({ id: '1', accession_number: 'ACC-001', issuer: 'TEST' }), {
        status: 200,
        headers: { 'content-type': 'application/json' }
      });
    });

    const result = await request('GET', '/api/accessions');
    expect(result).toEqual({ id: '1', accession_number: 'ACC-001', issuer: 'TEST' });
    expect(callCount).toBe(2);
  });

  it('throws structured error on 5xx after retry exhaustion', async () => {
    globalThis.window.fetch = vi.fn(async () => {
      return new Response(JSON.stringify({ request_id: 'srv-req-1', error: 'Database unavailable', code: 'DB_ERROR' }), {
        status: 503,
        headers: { 'content-type': 'application/json' }
      });
    });

    try {
      await request('GET', '/api/accessions');
      expect.fail('Should have thrown');
    } catch (err) {
      expect(err.statusCode).toBe(503);
      expect(err.message).toBe('Database unavailable');
      expect(err.requestId).toBe('srv-req-1');
      expect(err.originalError).toBeDefined();
    }
  });

  it('throws immediately on 4xx (not 429) without retry', async () => {
    let callCount = 0;
    globalThis.window.fetch = vi.fn(async () => {
      callCount++;
      return new Response(JSON.stringify({ request_id: 'req-bad', error: 'Invalid modality', code: 'VALIDATION' }), {
        status: 400,
        headers: { 'content-type': 'application/json' }
      });
    });

    try {
      await request('POST', '/api/accessions', { modality: 'XX' });
      expect.fail('Should have thrown');
    } catch (err) {
      expect(err.statusCode).toBe(400);
      expect(err.message).toBe('Invalid modality');
      expect(callCount).toBe(1); // No retry
    }
  });

  it('throws immediately on 401 without retry', async () => {
    let callCount = 0;
    globalThis.window.fetch = vi.fn(async () => {
      callCount++;
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { 'content-type': 'application/json' }
      });
    });

    try {
      await request('GET', '/api/accessions');
      expect.fail('Should have thrown');
    } catch (err) {
      expect(err.statusCode).toBe(401);
      expect(callCount).toBe(1); // No retry
    }
  });

  it('throws immediately on 403 without retry', async () => {
    let callCount = 0;
    globalThis.window.fetch = vi.fn(async () => {
      callCount++;
      return new Response(JSON.stringify({ error: 'Forbidden' }), {
        status: 403,
        headers: { 'content-type': 'application/json' }
      });
    });

    try {
      await request('GET', '/api/accessions');
      expect.fail('Should have thrown');
    } catch (err) {
      expect(err.statusCode).toBe(403);
      expect(callCount).toBe(1); // No retry
    }
  });

  it('retries on 429 with valid Retry-After ≤ 60s', async () => {
    let callCount = 0;
    globalThis.window.fetch = vi.fn(async () => {
      callCount++;
      if (callCount === 1) {
        return new Response(JSON.stringify({ error: 'Rate limited' }), {
          status: 429,
          headers: { 'content-type': 'application/json', 'Retry-After': '2' }
        });
      }
      return new Response(JSON.stringify({ id: '1', accession_number: 'ACC-001', issuer: 'TEST' }), {
        status: 200,
        headers: { 'content-type': 'application/json' }
      });
    });

    const result = await request('GET', '/api/accessions');
    expect(result).toEqual({ id: '1', accession_number: 'ACC-001', issuer: 'TEST' });
    expect(callCount).toBe(2);
  });

  it('throws immediately on 429 without Retry-After header', async () => {
    let callCount = 0;
    globalThis.window.fetch = vi.fn(async () => {
      callCount++;
      return new Response(JSON.stringify({ error: 'Rate limited' }), {
        status: 429,
        headers: { 'content-type': 'application/json' }
      });
    });

    try {
      await request('GET', '/api/accessions');
      expect.fail('Should have thrown');
    } catch (err) {
      expect(err.statusCode).toBe(429);
      expect(callCount).toBe(1); // No retry
    }
  });

  it('throws immediately on 429 with Retry-After > 60s', async () => {
    let callCount = 0;
    globalThis.window.fetch = vi.fn(async () => {
      callCount++;
      return new Response(JSON.stringify({ error: 'Rate limited' }), {
        status: 429,
        headers: { 'content-type': 'application/json', 'Retry-After': '120' }
      });
    });

    try {
      await request('GET', '/api/accessions');
      expect.fail('Should have thrown');
    } catch (err) {
      expect(err.statusCode).toBe(429);
      expect(callCount).toBe(1); // No retry
    }
  });

  it('includes X-Idempotency-Key on POST retry', async () => {
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
      // Capture headers from retry attempt
      retryHeaders = options.headers;
      return new Response(JSON.stringify({ id: '1', accession_number: 'ACC-001', issuer: 'TEST' }), {
        status: 200,
        headers: { 'content-type': 'application/json' }
      });
    });

    await request('POST', '/api/accessions', { modality: 'CT' });
    expect(callCount).toBe(2);
    // The retry should have X-Idempotency-Key header
    expect(retryHeaders).toBeDefined();
    const idempotencyKey = retryHeaders.get ? retryHeaders.get('X-Idempotency-Key') : retryHeaders['X-Idempotency-Key'];
    expect(idempotencyKey).toBeDefined();
    expect(idempotencyKey).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
  });

  it('does NOT include X-Idempotency-Key on GET retry', async () => {
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
      return new Response(JSON.stringify({ items: [], next_cursor: null, has_more: false }), {
        status: 200,
        headers: { 'content-type': 'application/json' }
      });
    });

    await request('GET', '/api/accessions');
    expect(callCount).toBe(2);
    const idempotencyKey = retryHeaders.get ? retryHeaders.get('X-Idempotency-Key') : null;
    expect(idempotencyKey).toBeNull();
  });

  it('includes X-Request-ID header on every request', async () => {
    let capturedHeaders = null;
    globalThis.window.fetch = vi.fn(async (url, options) => {
      capturedHeaders = options.headers;
      return new Response(JSON.stringify({ id: '1' }), {
        status: 200,
        headers: { 'content-type': 'application/json' }
      });
    });

    await request('GET', '/api/accessions');
    const requestIdHeader = capturedHeaders.get ? capturedHeaders.get('X-Request-ID') : capturedHeaders['X-Request-ID'];
    expect(requestIdHeader).toBeDefined();
    expect(requestIdHeader).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
  });

  it('retries on network timeout error', async () => {
    let callCount = 0;
    globalThis.window.fetch = vi.fn(async () => {
      callCount++;
      if (callCount === 1) {
        const err = new Error('Request timeout for accession module');
        err.name = 'AbortError';
        throw err;
      }
      return new Response(JSON.stringify({ id: '1', accession_number: 'ACC-001', issuer: 'TEST' }), {
        status: 200,
        headers: { 'content-type': 'application/json' }
      });
    });

    const result = await request('GET', '/api/accessions');
    expect(result).toEqual({ id: '1', accession_number: 'ACC-001', issuer: 'TEST' });
    expect(callCount).toBe(2);
  });

  it('structured error has all required fields on retry exhaustion', async () => {
    globalThis.window.fetch = vi.fn(async () => {
      return new Response(JSON.stringify({ request_id: 'worker-req-id', error: 'Service overloaded', code: 'OVERLOAD' }), {
        status: 503,
        headers: { 'content-type': 'application/json' }
      });
    });

    try {
      await request('POST', '/api/accessions', { modality: 'CT' });
      expect.fail('Should have thrown');
    } catch (err) {
      // Verify all four required fields
      expect(err).toHaveProperty('statusCode');
      expect(err).toHaveProperty('message');
      expect(err).toHaveProperty('requestId');
      expect(err).toHaveProperty('originalError');
      expect(typeof err.statusCode).toBe('number');
      expect(typeof err.message).toBe('string');
      expect(typeof err.requestId).toBe('string');
      expect(typeof err.originalError).toBe('string');
      expect(err.message.length).toBeGreaterThan(0);
    }
  });
});

describe('accessionServiceClient - generateRequestId', () => {
  it('generates valid UUID v4 format', () => {
    const id = generateRequestId();
    expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
  });

  it('generates unique IDs', () => {
    const ids = new Set();
    for (let i = 0; i < 100; i++) {
      ids.add(generateRequestId());
    }
    expect(ids.size).toBe(100);
  });
});
