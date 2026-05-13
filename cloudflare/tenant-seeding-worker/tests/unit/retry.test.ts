import { describe, it, expect, vi } from 'vitest';
import { withRetry, shouldRetry, isConflict } from '../../src/utils/retry';
import type { RetryConfig } from '../../src/types';

describe('shouldRetry', () => {
  it('returns true for 5xx status codes', () => {
    expect(shouldRetry(500)).toBe(true);
    expect(shouldRetry(502)).toBe(true);
    expect(shouldRetry(503)).toBe(true);
    expect(shouldRetry(599)).toBe(true);
  });

  it('returns false for 2xx status codes', () => {
    expect(shouldRetry(200)).toBe(false);
    expect(shouldRetry(201)).toBe(false);
    expect(shouldRetry(204)).toBe(false);
  });

  it('returns false for 4xx status codes', () => {
    expect(shouldRetry(400)).toBe(false);
    expect(shouldRetry(401)).toBe(false);
    expect(shouldRetry(404)).toBe(false);
    expect(shouldRetry(409)).toBe(false);
    expect(shouldRetry(422)).toBe(false);
  });
});

describe('isConflict', () => {
  it('returns true for 409', () => {
    expect(isConflict(409)).toBe(true);
  });

  it('returns false for other status codes', () => {
    expect(isConflict(200)).toBe(false);
    expect(isConflict(400)).toBe(false);
    expect(isConflict(500)).toBe(false);
  });
});

describe('withRetry', () => {
  const config: RetryConfig = { maxRetries: 3, baseDelayMs: 10 }; // Short delays for tests

  function mockResponse(status: number): Response {
    return new Response(null, { status });
  }

  it('returns immediately on 2xx response', async () => {
    const fn = vi.fn().mockResolvedValue(mockResponse(201));

    const result = await withRetry(fn, config);

    expect(result.status).toBe(201);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('returns immediately on 409 response (conflict treated as success)', async () => {
    const fn = vi.fn().mockResolvedValue(mockResponse(409));

    const result = await withRetry(fn, config);

    expect(result.status).toBe(409);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('returns immediately on 4xx (non-409) without retrying', async () => {
    const fn = vi.fn().mockResolvedValue(mockResponse(400));

    const result = await withRetry(fn, config);

    expect(result.status).toBe(400);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('retries on 5xx and returns last response when all retries exhausted', async () => {
    const fn = vi.fn().mockResolvedValue(mockResponse(503));

    const result = await withRetry(fn, config);

    expect(result.status).toBe(503);
    // 1 initial + 3 retries = 4 total calls
    expect(fn).toHaveBeenCalledTimes(4);
  });

  it('retries on thrown error (timeout/network) and throws last error when exhausted', async () => {
    const fn = vi.fn().mockRejectedValue(new Error('timeout'));

    await expect(withRetry(fn, config)).rejects.toThrow('timeout');
    expect(fn).toHaveBeenCalledTimes(4);
  });

  it('succeeds after transient 5xx followed by 2xx', async () => {
    const fn = vi
      .fn()
      .mockResolvedValueOnce(mockResponse(500))
      .mockResolvedValueOnce(mockResponse(200));

    const result = await withRetry(fn, config);

    expect(result.status).toBe(200);
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('succeeds after thrown error followed by 2xx', async () => {
    const fn = vi
      .fn()
      .mockRejectedValueOnce(new Error('network error'))
      .mockResolvedValueOnce(mockResponse(201));

    const result = await withRetry(fn, config);

    expect(result.status).toBe(201);
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('does not retry when maxRetries is 0', async () => {
    const fn = vi.fn().mockResolvedValue(mockResponse(500));
    const noRetryConfig: RetryConfig = { maxRetries: 0, baseDelayMs: 10 };

    const result = await withRetry(fn, noRetryConfig);

    expect(result.status).toBe(500);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('returns 409 without retry even after prior 5xx', async () => {
    const fn = vi
      .fn()
      .mockResolvedValueOnce(mockResponse(502))
      .mockResolvedValueOnce(mockResponse(409));

    const result = await withRetry(fn, config);

    expect(result.status).toBe(409);
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('stops retrying on 4xx after prior 5xx', async () => {
    const fn = vi
      .fn()
      .mockResolvedValueOnce(mockResponse(500))
      .mockResolvedValueOnce(mockResponse(422));

    const result = await withRetry(fn, config);

    expect(result.status).toBe(422);
    expect(fn).toHaveBeenCalledTimes(2);
  });
});
