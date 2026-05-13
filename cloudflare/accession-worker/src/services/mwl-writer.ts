/**
 * MWL Writer integration service.
 *
 * Sends accession data to the MWL Writer service for DICOM Modality Worklist
 * file generation. Uses a fire-and-forget pattern — errors are logged but
 * never thrown to the caller.
 *
 * Features:
 * - Prefers Service Binding (`env.MWL_WRITER`); falls back to URL fetch with 5s timeout
 * - Consults circuit breaker DO before calling; logs `circuit_open` when denied
 * - Retries 5xx/network failures up to 2 times (200ms, 800ms delays)
 * - Does not retry 4xx errors
 * - Propagates `X-Request-ID` header for end-to-end trace correlation
 *
 * Requirements: 9.1, 9.2, 9.3, 9.4, 9.5, 9.6, 9.7, 9.8, 9.9, 9.10
 */

import type { Env } from '../types';
import { sleep } from '../utils/backoff';
import { emitCircuitEvent } from './analytics';

// ─── Types ───────────────────────────────────────────────────────────────────

export interface MwlPayload {
  accession_number: string;
  patient_national_id: string;
  patient_name: string;
  patient_ihs_number?: string;
  patient_birth_date?: string;
  patient_sex?: string;
  modality: string;
  procedure_code?: string;
  procedure_name?: string;
  scheduled_at?: string;
}

// ─── Constants ───────────────────────────────────────────────────────────────

/** Retry delays in milliseconds for 5xx/network errors (up to 2 retries) */
const RETRY_DELAYS_MS: readonly number[] = [200, 800] as const;

/** Connection/fetch timeout in milliseconds */
const FETCH_TIMEOUT_MS = 5_000;

/** Circuit breaker DO instance name */
const CIRCUIT_BREAKER_ID = 'mwl-writer';

// ─── Main Export ─────────────────────────────────────────────────────────────

/**
 * Sends accession data to the MWL Writer service.
 *
 * This function is designed to be called within `ctx.waitUntil()` and will
 * never throw. All errors are logged and swallowed.
 *
 * @param env - Worker environment bindings
 * @param payload - MWL payload containing accession and patient data
 * @param requestId - X-Request-ID for trace correlation
 */
export async function sendToMwlWriter(
  env: Env,
  payload: MwlPayload,
  requestId: string
): Promise<void> {
  try {
    // Step 1: Check if MWL is enabled
    if (env.ENABLE_MWL !== 'true') {
      return;
    }

    // Step 2: Consult circuit breaker DO
    const circuitAllowed = await consultCircuitBreaker(env, requestId);
    if (!circuitAllowed) {
      return;
    }

    // Step 3: Attempt to send with retries
    const result = await sendWithRetry(env, payload, requestId);

    // Step 4/5/6: Handle result
    if (result.success) {
      await recordCircuitSuccess(env);
    } else {
      await recordCircuitFailure(env);
    }
  } catch (error) {
    // Step 7: Never throw — log and swallow
    console.error('[mwl-writer] Unexpected error in sendToMwlWriter', {
      requestId,
      accession_number: payload.accession_number,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

// ─── Circuit Breaker Helpers ─────────────────────────────────────────────────

/**
 * Consults the circuit breaker DO to determine if the call is allowed.
 * Returns true if allowed, false if circuit is open.
 * Logs `circuit_open` warning when denied (Req 9.7).
 */
async function consultCircuitBreaker(env: Env, requestId: string): Promise<boolean> {
  try {
    const id = env.CIRCUIT_BREAKER_DO.idFromName(CIRCUIT_BREAKER_ID);
    const stub = env.CIRCUIT_BREAKER_DO.get(id);

    const response = await stub.fetch(new Request('http://internal/try-acquire', {
      method: 'POST',
    }));

    if (!response.ok) {
      console.warn('[mwl-writer] Circuit breaker DO returned error', {
        requestId,
        status: response.status,
      });
      // On DO error, allow the call to proceed (fail-open)
      return true;
    }

    const result = await response.json<{ allowed: boolean; status: { state: string; openUntil?: number } }>();

    if (!result.allowed) {
      console.warn('[mwl-writer] circuit_open', {
        requestId,
        state: result.status.state,
        openUntil: result.status.openUntil
          ? new Date(result.status.openUntil).toISOString()
          : undefined,
      });

      emitCircuitEvent(env, {
        service: 'mwl-writer',
        state: result.status.state,
        action: 'denied',
      });

      return false;
    }

    return true;
  } catch (error) {
    // If circuit breaker DO is unreachable, fail-open (allow the call)
    console.warn('[mwl-writer] Circuit breaker DO unreachable, proceeding with call', {
      requestId,
      error: error instanceof Error ? error.message : String(error),
    });
    return true;
  }
}

/**
 * Records a successful call on the circuit breaker DO.
 */
async function recordCircuitSuccess(env: Env): Promise<void> {
  try {
    const id = env.CIRCUIT_BREAKER_DO.idFromName(CIRCUIT_BREAKER_ID);
    const stub = env.CIRCUIT_BREAKER_DO.get(id);
    await stub.fetch(new Request('http://internal/record-success', { method: 'POST' }));
  } catch {
    // Non-critical — don't let circuit breaker errors propagate
  }
}

/**
 * Records a failed call on the circuit breaker DO.
 */
async function recordCircuitFailure(env: Env): Promise<void> {
  try {
    const id = env.CIRCUIT_BREAKER_DO.idFromName(CIRCUIT_BREAKER_ID);
    const stub = env.CIRCUIT_BREAKER_DO.get(id);
    await stub.fetch(new Request('http://internal/record-failure', { method: 'POST' }));
  } catch {
    // Non-critical — don't let circuit breaker errors propagate
  }
}

// ─── Send with Retry ─────────────────────────────────────────────────────────

interface SendResult {
  success: boolean;
  statusCode?: number;
  error?: string;
}

/**
 * Attempts to send the MWL payload with retry logic.
 *
 * - On success (2xx): returns success
 * - On 4xx: does NOT retry, logs error, returns failure
 * - On 5xx/network error: retries up to 2 times (200ms, 800ms), then returns failure
 */
async function sendWithRetry(
  env: Env,
  payload: MwlPayload,
  requestId: string
): Promise<SendResult> {
  let lastError: string | undefined;
  let lastStatusCode: number | undefined;

  // Initial attempt + up to 2 retries = 3 total attempts
  for (let attempt = 0; attempt <= RETRY_DELAYS_MS.length; attempt++) {
    try {
      const response = await doFetch(env, payload, requestId);
      lastStatusCode = response.status;

      // Success (2xx)
      if (response.ok) {
        return { success: true, statusCode: response.status };
      }

      // 4xx — do not retry (Req 9.10)
      if (response.status >= 400 && response.status < 500) {
        const body = await safeReadBody(response);
        console.error('[mwl-writer] MWL Writer returned 4xx, not retrying', {
          requestId,
          accession_number: payload.accession_number,
          statusCode: response.status,
          body,
        });
        return { success: false, statusCode: response.status, error: `HTTP ${response.status}` };
      }

      // 5xx — retry if attempts remain
      lastError = `HTTP ${response.status}`;
      const retryDelay5xx = RETRY_DELAYS_MS[attempt];
      if (attempt < RETRY_DELAYS_MS.length && retryDelay5xx !== undefined) {
        console.warn('[mwl-writer] MWL Writer returned 5xx, retrying', {
          requestId,
          accession_number: payload.accession_number,
          statusCode: response.status,
          attempt: attempt + 1,
          nextDelayMs: retryDelay5xx,
        });
        await sleep(retryDelay5xx);
      }
    } catch (error) {
      // Network error — retry if attempts remain
      lastError = error instanceof Error ? error.message : String(error);
      lastStatusCode = undefined;

      const retryDelayNet = RETRY_DELAYS_MS[attempt];
      if (attempt < RETRY_DELAYS_MS.length && retryDelayNet !== undefined) {
        console.warn('[mwl-writer] MWL Writer network error, retrying', {
          requestId,
          accession_number: payload.accession_number,
          error: lastError,
          attempt: attempt + 1,
          nextDelayMs: retryDelayNet,
        });
        await sleep(retryDelayNet);
      }
    }
  }

  // All retries exhausted
  console.error('[mwl-writer] MWL Writer call failed after all retries', {
    requestId,
    accession_number: payload.accession_number,
    lastStatusCode,
    lastError,
  });

  return { success: false, statusCode: lastStatusCode, error: lastError };
}

// ─── Fetch Implementation ────────────────────────────────────────────────────

/**
 * Performs the actual fetch to the MWL Writer service.
 * Prefers Service Binding; falls back to URL fetch with 5s timeout (Req 9.4).
 * Includes X-Request-ID header (Req 9.9).
 */
async function doFetch(
  env: Env,
  payload: MwlPayload,
  requestId: string
): Promise<Response> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'X-Request-ID': requestId,
  };

  const body = JSON.stringify(payload);

  // Prefer Service Binding (Req 9.4)
  if (env.MWL_WRITER) {
    return env.MWL_WRITER.fetch(new Request('https://mwl-writer.internal/write', {
      method: 'POST',
      headers,
      body,
    }));
  }

  // Fall back to URL fetch with timeout (Req 9.4)
  if (env.MWL_WRITER_URL) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

    try {
      const response = await fetch(env.MWL_WRITER_URL, {
        method: 'POST',
        headers,
        body,
        signal: controller.signal,
      });
      return response;
    } finally {
      clearTimeout(timeoutId);
    }
  }

  // Neither binding nor URL configured
  throw new Error('No MWL_WRITER binding or MWL_WRITER_URL configured');
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Safely reads the response body as text, returning empty string on failure.
 */
async function safeReadBody(response: Response): Promise<string> {
  try {
    return await response.text();
  } catch {
    return '';
  }
}
