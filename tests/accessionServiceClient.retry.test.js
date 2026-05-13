// tests/accessionServiceClient.retry.test.js
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { parseRetryAfter, transformError } from '../src/services/accessionServiceClient.js';

describe('accessionServiceClient - parseRetryAfter', () => {
  it('returns milliseconds for valid integer ≤ 60', () => {
    expect(parseRetryAfter('5')).toBe(5000);
    expect(parseRetryAfter('30')).toBe(30000);
    expect(parseRetryAfter('60')).toBe(60000);
    expect(parseRetryAfter('0')).toBe(0);
    expect(parseRetryAfter('1')).toBe(1000);
  });

  it('returns null for values > 60', () => {
    expect(parseRetryAfter('61')).toBeNull();
    expect(parseRetryAfter('120')).toBeNull();
    expect(parseRetryAfter('3600')).toBeNull();
  });

  it('returns null for invalid values', () => {
    expect(parseRetryAfter(null)).toBeNull();
    expect(parseRetryAfter(undefined)).toBeNull();
    expect(parseRetryAfter('')).toBeNull();
    expect(parseRetryAfter('abc')).toBeNull();
    expect(parseRetryAfter('12abc')).toBeNull();
    expect(parseRetryAfter('-1')).toBeNull();
    expect(parseRetryAfter('3.5')).toBeNull();
  });
});

describe('accessionServiceClient - transformError', () => {
  it('extracts status, message, requestId from accession-worker error format', () => {
    const error = new Error('HTTP 400: {"request_id":"req-123","error":"Invalid modality","code":"VALIDATION_ERROR"}');
    error.status = 400;

    const result = transformError(error, 'fallback-id');

    expect(result.statusCode).toBe(400);
    expect(result.message).toBe('Invalid modality');
    expect(result.requestId).toBe('req-123');
    expect(result.originalError).toBe(error.message);
  });

  it('uses fallback requestId when response body has no request_id', () => {
    const error = new Error('HTTP 500: {"error":"Internal server error"}');
    error.status = 500;

    const result = transformError(error, 'my-fallback-id');

    expect(result.statusCode).toBe(500);
    expect(result.message).toBe('Internal server error');
    expect(result.requestId).toBe('my-fallback-id');
  });

  it('handles network/timeout errors without status code', () => {
    const error = new Error('Network error: backend unreachable');
    error.code = 'ENETWORK';

    const result = transformError(error, 'req-456');

    expect(result.statusCode).toBe(0);
    expect(result.message).toBe('Network error or timeout. Please check your connection.');
    expect(result.requestId).toBe('req-456');
  });

  it('handles timeout errors', () => {
    const error = new Error('Request timeout');
    error.code = 'ETIMEOUT';

    const result = transformError(error, 'req-789');

    expect(result.statusCode).toBe(0);
    expect(result.message).toBe('Network error or timeout. Please check your connection.');
    expect(result.requestId).toBe('req-789');
  });

  it('provides fallback message for 429 without body', () => {
    const error = new Error('HTTP 429: Too Many Requests');
    error.status = 429;

    const result = transformError(error, 'req-abc');

    expect(result.statusCode).toBe(429);
    expect(result.message).toBe('Rate limited. Please try again later.');
  });

  it('provides fallback message for 5xx without body', () => {
    const error = new Error('HTTP 502: Bad Gateway');
    error.status = 502;

    const result = transformError(error, 'req-def');

    expect(result.statusCode).toBe(502);
    expect(result.message).toBe('Server error. Please try again later.');
  });

  it('extracts originalError from error chain', () => {
    const innerError = new Error('Connection refused');
    const outerError = new Error('Request failed');
    outerError.originalError = innerError;
    outerError.status = 502;

    const result = transformError(outerError, 'req-ghi');

    expect(result.originalError).toBe('Connection refused');
  });

  it('prefers message field over error field in response body', () => {
    const error = new Error('HTTP 400: {"request_id":"req-x","error":"short","message":"Detailed validation message"}');
    error.status = 400;

    const result = transformError(error, 'fallback');

    // message field takes precedence (it's checked after error, so it overwrites)
    expect(result.message).toBe('Detailed validation message');
  });
});
