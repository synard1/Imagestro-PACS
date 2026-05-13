/**
 * Retry utility with exponential backoff for HTTP requests.
 *
 * Classifies responses by status code:
 * - 5xx / timeout (no response) → retry with exponential backoff
 * - 409 Conflict → treat as success (return response)
 * - Other 4xx → do NOT retry (return response immediately)
 * - 2xx → success (return response)
 */

import type { RetryConfig } from '../types';

/**
 * Determines whether an HTTP status code should trigger a retry.
 * Only 5xx (server error) status codes are retryable.
 */
export function shouldRetry(status: number): boolean {
  return status >= 500 && status <= 599;
}

/**
 * Determines whether an HTTP status code indicates a conflict (409).
 * Conflicts are treated as successful operations (resource already exists).
 */
export function isConflict(status: number): boolean {
  return status === 409;
}

/**
 * Delays execution for the specified number of milliseconds.
 */
function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Executes an async function that returns a Response, retrying on 5xx or
 * timeout errors with exponential backoff.
 *
 * Behavior:
 * - 2xx responses: returned immediately as success
 * - 409 responses: returned immediately (treated as success by caller)
 * - Other 4xx responses: returned immediately without retry
 * - 5xx responses: retried up to config.maxRetries times
 * - Thrown errors (timeout/network): retried up to config.maxRetries times
 * - After all retries exhausted: throws the last error or returns the last 5xx response
 *
 * Delay between retries: baseDelayMs * 2^attempt (0-indexed)
 * Example with baseDelayMs=1000, maxRetries=3: 1s, 2s, 4s
 */
export async function withRetry(
  fn: () => Promise<Response>,
  config: RetryConfig
): Promise<Response> {
  let lastError: unknown = null;
  let lastResponse: Response | null = null;

  for (let attempt = 0; attempt <= config.maxRetries; attempt++) {
    // Wait before retry (skip delay on first attempt)
    if (attempt > 0) {
      const backoffMs = config.baseDelayMs * Math.pow(2, attempt - 1);
      await delay(backoffMs);
    }

    try {
      const response = await fn();

      // 2xx or 409: return immediately (success cases)
      if (response.status >= 200 && response.status < 300) {
        return response;
      }

      if (isConflict(response.status)) {
        return response;
      }

      // 5xx: retry if attempts remain
      if (shouldRetry(response.status)) {
        lastResponse = response;
        lastError = null;
        continue;
      }

      // Other 4xx: do not retry, return immediately
      return response;
    } catch (error) {
      // Network error / timeout: retry if attempts remain
      lastError = error;
      lastResponse = null;
    }
  }

  // All retries exhausted
  if (lastError) {
    throw lastError;
  }

  // Return the last 5xx response if no thrown error
  return lastResponse!;
}
