// src/services/accessionServiceClient.js
import { apiClient } from './http';
import { loadRegistry } from './api-registry';
import { getSettings } from './settingsService';
import { generateAccessionAsync, loadAccessionConfig, saveAccessionConfig } from './accession';
import { notify } from './notifications';

/**
 * Accession Service Client
 * Communicates with the accession-worker through the gateway.
 * Uses the apiClient('accession') pattern for consistency with other service modules.
 */

// Default config fallback when accession module is missing from registry
const DEFAULT_CONFIG = { baseUrl: '', timeoutMs: 5000 };

/**
 * Get the accession module config from the API registry.
 * Falls back to default config if the module entry is missing.
 * @returns {{ enabled?: boolean, baseUrl: string, timeoutMs: number }}
 */
export function getModuleConfig() {
  const registry = loadRegistry();
  return registry.accession || DEFAULT_CONFIG;
}

/**
 * Check if the accession module is enabled.
 * Throws immediately if the module is explicitly disabled.
 * @throws {Error} If accession module is disabled
 */
export function checkModuleEnabled() {
  const config = getModuleConfig();
  if (config.enabled === false) {
    throw new Error('Accession module is disabled');
  }
}

/**
 * Generate a UUID v4 for X-Request-ID header.
 * Uses crypto.randomUUID() when available.
 * @returns {string} UUID v4 string
 */
export function generateRequestId() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  // Fallback UUID v4 generator
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

/**
 * Delay execution for a specified number of milliseconds.
 * @param {number} ms - Milliseconds to wait
 * @returns {Promise<void>}
 */
function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Determine if an HTTP status code is a 5xx server error.
 * @param {number} status
 * @returns {boolean}
 */
function is5xx(status) {
  return status >= 500 && status < 600;
}

/**
 * Determine if an error represents a network timeout.
 * @param {Error} error
 * @returns {boolean}
 */
function isTimeoutOrNetworkError(error) {
  return (
    error.code === 'ETIMEOUT' ||
    error.name === 'AbortError' ||
    error.code === 'ENETWORK' ||
    (error.message && (
      error.message.includes('timeout') ||
      error.message.includes('Network error') ||
      error.message.includes('Failed to fetch')
    ))
  );
}

/**
 * Parse the Retry-After header value.
 * Returns the number of milliseconds to wait, or null if invalid/too large.
 * Only accepts integer seconds ≤ 60.
 * @param {string|null} retryAfterValue
 * @returns {number|null} Milliseconds to wait, or null if invalid
 */
export function parseRetryAfter(retryAfterValue) {
  if (retryAfterValue == null || retryAfterValue === '') return null;
  const seconds = parseInt(retryAfterValue, 10);
  if (isNaN(seconds) || seconds < 0 || seconds > 60) return null;
  // Ensure the string was actually a valid integer (not "12abc")
  if (String(seconds) !== retryAfterValue.trim()) return null;
  return seconds * 1000;
}

/**
 * Extract error information from an HTTP error response or error object.
 * The accession-worker returns: { request_id, error, code }
 * We transform to: { statusCode, message, requestId, originalError }
 *
 * @param {Error} error - The caught error
 * @param {string} fallbackRequestId - The locally generated request ID
 * @returns {{ statusCode: number, message: string, requestId: string, originalError: string }}
 */
export function transformError(error, fallbackRequestId) {
  let statusCode = error.status || 0;
  let message = 'An unexpected error occurred';
  let requestId = fallbackRequestId;
  let originalError = error.message || 'Unknown error';

  // Try to extract structured data from the error message
  // The apiClient throws errors with message like "HTTP 500: {json body}"
  if (error.message) {
    // Extract status code from "HTTP NNN:" prefix
    const statusMatch = error.message.match(/HTTP (\d{3})/);
    if (statusMatch && !statusCode) {
      statusCode = parseInt(statusMatch[1], 10);
    }

    // Try to parse JSON body from the error message
    const jsonStart = error.message.indexOf('{');
    if (jsonStart !== -1) {
      try {
        const jsonPart = error.message.substring(jsonStart);
        const body = JSON.parse(jsonPart);
        // Accession-worker format: { request_id, error, code }
        if (body.request_id) requestId = body.request_id;
        if (body.error) message = body.error;
        if (body.message) message = body.message;
      } catch (_) {
        // JSON parse failed, use defaults
      }
    }
  }

  // If error was already transformed (from originalError chain)
  if (error.originalError && error.originalError.message) {
    originalError = error.originalError.message;
  }

  // Fallback message based on status code
  if (message === 'An unexpected error occurred' && statusCode) {
    if (statusCode === 429) message = 'Rate limited. Please try again later.';
    else if (is5xx(statusCode)) message = 'Server error. Please try again later.';
    else if (statusCode === 401) message = 'Authentication required.';
    else if (statusCode === 403) message = 'Access denied.';
    else if (statusCode === 404) message = 'Resource not found.';
  }

  // For network/timeout errors without a status code
  if (!statusCode && isTimeoutOrNetworkError(error)) {
    statusCode = 0;
    message = 'Network error or timeout. Please check your connection.';
  }

  return { statusCode, message, requestId, originalError };
}

/**
 * Create a structured error object for retry exhaustion.
 * @param {{ statusCode: number, message: string, requestId: string, originalError: string }} details
 * @returns {Error}
 */
function createStructuredError({ statusCode, message, requestId, originalError }) {
  const err = new Error(message);
  err.statusCode = statusCode;
  err.message = message;
  err.requestId = requestId;
  err.originalError = originalError;
  return err;
}

/**
 * Make a request to the accession-worker API with retry logic and error handling.
 * - Checks module enabled status before every request
 * - Adds X-Request-ID header (UUID v4) to every request
 * - Uses apiClient('accession') for base HTTP handling (auth, timeout, baseUrl)
 * - Retries once on 5xx or network timeout (after 1000ms delay)
 * - Retries once on 429 with valid Retry-After ≤ 60s
 * - Throws immediately on 4xx (except 429)
 * - Includes X-Idempotency-Key on POST retries
 * - Throws structured error on retry exhaustion
 *
 * @param {string} method - HTTP method (GET, POST, PUT, DELETE, PATCH)
 * @param {string} path - API path (e.g., '/api/accessions')
 * @param {object|null} [data] - Request body for POST/PUT/PATCH
 * @param {object} [extraHeaders] - Additional headers to include (e.g., X-Idempotency-Key)
 * @returns {Promise<any>} Response data
 */
export async function request(method, path, data = null, extraHeaders = {}) {
  // Check module is enabled before making any HTTP request
  checkModuleEnabled();

  const requestId = generateRequestId();
  // For POST requests, prepare an idempotency key (reuse from extraHeaders or generate new)
  const idempotencyKey = extraHeaders['X-Idempotency-Key'] || (method.toUpperCase() === 'POST' ? generateRequestId() : null);

  // Store the requestId so callers can access it for error reporting
  request._lastRequestId = requestId;

  /**
   * Execute a single HTTP request attempt.
   * Intercepts fetch to inject headers and capture Retry-After from 429 responses.
   * @param {object} headersOverride - Additional headers for this attempt
   * @returns {Promise<any>} Response data
   */
  async function executeRequest(headersOverride = {}) {
    const mergedHeaders = { ...extraHeaders, ...headersOverride };
    const originalFetch = window.fetch;
    const patchedFetch = async (url, options = {}) => {
      const headers = new Headers(options.headers || {});
      headers.set('X-Request-ID', requestId);
      Object.entries(mergedHeaders).forEach(([key, value]) => {
        if (value != null) headers.set(key, value);
      });
      const response = await originalFetch.call(window, url, { ...options, headers });
      // Capture Retry-After header for 429 responses so we can use it in retry logic
      if (response.status === 429) {
        const retryAfterValue = response.headers.get('Retry-After');
        // Store on a module-level variable so parseRetryAfterFromError can access it
        request._lastRetryAfter = retryAfterValue;
      } else {
        request._lastRetryAfter = undefined;
      }
      return response;
    };

    try {
      window.fetch = patchedFetch;
      const client = apiClient('accession');
      const result = await client[method.toLowerCase()](path, data);
      return result;
    } finally {
      window.fetch = originalFetch;
    }
  }

  // --- First attempt ---
  try {
    return await executeRequest();
  } catch (firstError) {
    const status = firstError.status || 0;

    // 4xx (except 429): throw immediately without retry
    if (status >= 400 && status < 500 && status !== 429) {
      const transformed = transformError(firstError, requestId);
      throw createStructuredError(transformed);
    }

    // 429: check Retry-After header
    if (status === 429) {
      // Try to extract Retry-After from the error
      // The apiClient doesn't expose response headers directly,
      // so we look for Retry-After info in the error or use a fetch-level approach
      const retryAfterMs = parseRetryAfterFromError(firstError);
      if (retryAfterMs === null) {
        // No valid Retry-After or > 60s: reject immediately
        const transformed = transformError(firstError, requestId);
        throw createStructuredError(transformed);
      }
      // Valid Retry-After ≤ 60s: wait and retry once
      await delay(retryAfterMs);
    } else if (is5xx(status) || isTimeoutOrNetworkError(firstError)) {
      // 5xx or network timeout: wait 1000ms before retry
      await delay(1000);
    } else {
      // Unknown error category: throw immediately
      const transformed = transformError(firstError, requestId);
      throw createStructuredError(transformed);
    }

    // --- Retry attempt ---
    const retryHeaders = {};
    // For POST retries, include X-Idempotency-Key
    if (method.toUpperCase() === 'POST' && idempotencyKey) {
      retryHeaders['X-Idempotency-Key'] = idempotencyKey;
    }

    try {
      return await executeRequest(retryHeaders);
    } catch (retryError) {
      // Retry exhausted: throw structured error
      const transformed = transformError(retryError, requestId);
      throw createStructuredError(transformed);
    }
  }
}

/**
 * Creates multiple accession numbers in a single batch request.
 * @param {{ procedures: Array<{ modality: string, procedure_code: string, procedure_name: string }>, patient_national_id: string, patient_name: string }} params
 * @returns {Promise<{ accessions: Array<{ id: string, accession_number: string, issuer: string, modality: string, procedure_code: string }> }>}
 */
export async function createAccessionBatch({ procedures, patient_national_id, patient_name }) {
  return request('POST', '/api/accessions/batch', { procedures, patient_national_id, patient_name });
}

/**
 * Extract Retry-After value from an error thrown by apiClient.
 * Since apiClient doesn't expose response headers directly, we capture
 * the Retry-After header during fetch interception and store it on request._lastRetryAfter.
 *
 * @param {Error} error - The error from the first request attempt
 * @returns {number|null} Milliseconds to wait, or null if invalid/missing
 */
function parseRetryAfterFromError(error) {
  // Check if Retry-After was captured during the fetch interception
  if (request._lastRetryAfter !== undefined) {
    return parseRetryAfter(request._lastRetryAfter);
  }
  // Check if Retry-After was attached to the error
  if (error._retryAfter !== undefined) {
    return parseRetryAfter(error._retryAfter);
  }
  // If we can't determine Retry-After, return null (reject immediately)
  return null;
}

/**
 * Convert worker format {NNNN} to UI format {SEQ4}.
 * The accession-worker uses {N+} tokens for sequence placeholders,
 * while the frontend UI uses {SEQn} where n is the digit count.
 * @param {string} pattern - Pattern string with {N+} tokens
 * @returns {string} Pattern string with {SEQn} tokens
 */
export function workerPatternToUI(pattern) {
  return pattern.replace(/\{(N+)\}/g, (_, ns) => `{SEQ${ns.length}}`);
}

/**
 * Convert UI format {SEQ4} to worker format {NNNN}.
 * The frontend UI uses {SEQn} tokens, while the accession-worker
 * expects {N+} format where N is repeated n times.
 * @param {string} pattern - Pattern string with {SEQn} tokens
 * @returns {string} Pattern string with {N+} tokens
 */
export function uiPatternToWorker(pattern) {
  return pattern.replace(/\{SEQ(\d+)\}/gi, (_, n) => '{' + 'N'.repeat(parseInt(n, 10)) + '}');
}

/**
 * Lists accession records with cursor-based pagination.
 * @param {{ limit?: number, cursor?: string, source?: string, modality?: string, patient_national_id?: string, from_date?: string, to_date?: string }} filters
 * @returns {Promise<{ items: Array, next_cursor: string|null, has_more: boolean }>}
 */
export async function getAccessions(filters = {}) {
  const params = new URLSearchParams();
  Object.entries(filters).forEach(([key, value]) => {
    if (value != null && value !== '') params.set(key, String(value));
  });
  const queryString = params.toString();
  const path = queryString ? `/api/accessions?${queryString}` : '/api/accessions';
  return request('GET', path);
}

/**
 * Retrieves a single accession by its accession number.
 * @param {string} accessionNumber
 * @returns {Promise<Object>}
 */
export async function getAccessionByNumber(accessionNumber) {
  return request('GET', `/api/accessions/${encodeURIComponent(accessionNumber)}`);
}

/**
 * Creates a single accession number via the accession-worker.
 * @param {{ modality: string, patientId: string, orderId?: string }} params
 * @returns {Promise<{ id: string, accession_number: string, issuer: string }>}
 */
export async function createAccession({ modality, patientId, orderId }) {
  const body = { modality, patient: { id: patientId } };
  if (orderId) body.orderId = orderId;
  return request('POST', '/api/accessions', body);
}

/**
 * Load accession settings based on the feature flag.
 * - When `useServerAccession=true`: reads from the accession-worker via
 *   `GET /settings/accession_config` and converts worker pattern tokens to UI format.
 * - When `useServerAccession=false`: uses the existing local config from accession.js.
 * - On failure when flag=true: falls back to cached local config and shows a persistent warning.
 *
 * @returns {Promise<Object>} The accession configuration object (UI format)
 */
export async function loadAccessionSettings() {
  const settings = await getSettings();
  if (settings.useServerAccession) {
    try {
      const config = await request('GET', '/settings/accession_config');
      if (config.pattern) config.pattern = workerPatternToUI(config.pattern);
      return config;
    } catch (err) {
      console.warn('[accession] Failed to load settings from worker:', err.message);
      notify({ type: 'warning', message: 'Using cached accession settings due to server error', persistent: true });
      // Fall back to local cached config
      return loadAccessionConfig();
    }
  }
  return loadAccessionConfig();
}

/**
 * Save accession settings based on the feature flag.
 * - When `useServerAccession=true`: converts UI pattern tokens to worker format and
 *   writes to the accession-worker via `PUT /settings/accession_config`.
 * - When `useServerAccession=false`: uses the existing local save from accession.js.
 * - On failure when flag=true: shows error notification, does not overwrite local cache,
 *   and re-throws so the caller can retain unsaved form changes.
 *
 * @param {Object} config - The accession configuration object (UI format)
 * @returns {Promise<boolean|undefined>} true on success (when flag=true), or undefined (when flag=false)
 */
export async function saveAccessionSettings(config) {
  const settings = await getSettings();
  if (settings.useServerAccession) {
    const workerConfig = { ...config };
    if (workerConfig.pattern) workerConfig.pattern = uiPatternToWorker(workerConfig.pattern);
    try {
      await request('PUT', '/settings/accession_config', workerConfig);
      notify({ type: 'success', message: 'Accession settings saved' });
      return true;
    } catch (err) {
      notify({ type: 'error', message: 'Failed to save accession settings to server' });
      throw err; // Let caller retain unsaved changes
    }
  }
  return saveAccessionConfig(config);
}

/**
 * Prepare accession numbers for an order before submission.
 * Returns null if server-side generation is disabled (caller uses client-side flow).
 * Returns array of { procedure_code, modality, accession_number } on success.
 * Throws on failure (caller should prevent order submission and preserve form data).
 *
 * @param {{ procedures: Array<{ modality: string, procedure_code: string, procedure_name?: string }>, patientId: string, patientName: string, patientNationalId: string }} params
 * @returns {Promise<Array<{ procedure_code: string, modality: string, accession_number: string|null }>|null>}
 */
export async function prepareOrderAccessions({ procedures, patientId, patientName, patientNationalId }) {
  const settings = await getSettings();
  if (!settings.useServerAccession) return null;

  try {
    if (procedures.length === 1) {
      const proc = procedures[0];
      const result = await createAccession({ modality: proc.modality, patientId });
      return [{ procedure_code: proc.procedure_code, modality: proc.modality, accession_number: result.accession_number }];
    }

    // Multi-procedure: batch request
    const batchResult = await createAccessionBatch({
      procedures: procedures.map(p => ({ modality: p.modality, procedure_code: p.procedure_code, procedure_name: p.procedure_name })),
      patient_national_id: patientNationalId,
      patient_name: patientName
    });

    // Match response accessions to procedures by procedure_code + modality
    return procedures.map(proc => {
      const match = batchResult.accessions.find(a => a.procedure_code === proc.procedure_code && a.modality === proc.modality);
      return { procedure_code: proc.procedure_code, modality: proc.modality, accession_number: match?.accession_number || null };
    });
  } catch (err) {
    notify({ type: 'error', message: `Failed to generate accession number: ${err.message}` });
    throw err;
  }
}

/**
 * Get an accession number using the feature flag to determine generation mode.
 * 
 * - Reads `useServerAccession` from settings before each call (no page reload needed)
 * - When `true`: calls server-side `createAccession()`, returns `accession_number` string
 * - When `false` or absent: calls existing client-side `generateAccessionAsync()`
 * - On server failure when flag is `true`: falls back to `generateAccessionAsync()`,
 *   shows a non-blocking warning notification
 * - Always returns a string regardless of generation mode
 *
 * @param {{ modality: string, patientId: string }} params
 * @returns {Promise<string>} The generated accession number string
 */
export async function getAccessionNumber({ modality, patientId }) {
  const settings = await getSettings();

  if (settings.useServerAccession) {
    try {
      const result = await createAccession({ modality, patientId });
      return String(result.accession_number);
    } catch (err) {
      console.warn('[accession] Server generation failed, falling back to client-side:', err.message);
      notify({
        type: 'warning',
        message: 'Accession generated locally due to server unavailability'
      });
      const fallback = await generateAccessionAsync({ modality });
      return String(fallback);
    }
  }

  const result = await generateAccessionAsync({ modality });
  return String(result);
}
