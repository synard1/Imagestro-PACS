// src/services/logsService.js
// Service for querying the centralized D1 Log Viewer API (/api/v2/logs/*)
import { apiClient } from './http'

const client = apiClient('logs')

/**
 * Build query string from a filter params object.
 * Omits null/undefined values. Handles arrays (e.g. level[]).
 */
function buildQuery(params = {}) {
  const qs = new URLSearchParams()
  for (const [key, value] of Object.entries(params)) {
    if (value == null || value === '') continue
    if (Array.isArray(value)) {
      value.forEach(v => qs.append(key, v))
    } else {
      qs.append(key, String(value))
    }
  }
  const str = qs.toString()
  return str ? `?${str}` : ''
}

/**
 * Query application logs.
 * @param {Object} params - Filter parameters
 * @param {string} [params.from] - ISO-8601 start time
 * @param {string} [params.to] - ISO-8601 end time
 * @param {string|string[]} [params.level] - Log level(s): debug|info|warn|error
 * @param {string|string[]} [params.worker] - Worker name(s)
 * @param {string} [params.request_id] - Request ID (UUIDv7)
 * @param {number} [params.limit] - Results per page (1-500, default 100)
 * @param {string} [params.cursor] - Pagination cursor (UUIDv7)
 * @returns {Promise<{items: Array, next_cursor: string|null, query_id: string}>}
 */
export async function getAppLogs(params = {}) {
  const query = buildQuery(params)
  return client.get(`/api/v2/logs/app${query}`)
}

/**
 * Query error events.
 * @param {Object} params - Filter parameters
 * @param {string} [params.from] - ISO-8601 start time
 * @param {string} [params.to] - ISO-8601 end time
 * @param {string|string[]} [params.severity] - Severity: low|medium|high|critical
 * @param {string|string[]} [params.worker] - Worker name(s)
 * @param {string} [params.request_id] - Request ID (UUIDv7)
 * @param {number} [params.limit] - Results per page (1-500, default 100)
 * @param {string} [params.cursor] - Pagination cursor (UUIDv7)
 * @returns {Promise<{items: Array, next_cursor: string|null, query_id: string}>}
 */
export async function getErrorEvents(params = {}) {
  const query = buildQuery(params)
  return client.get(`/api/v2/logs/errors${query}`)
}

/**
 * Get a single error event by ID.
 * @param {string} id - Error event ID (UUIDv7)
 * @returns {Promise<Object>}
 */
export async function getErrorEventById(id) {
  return client.get(`/api/v2/logs/errors/${id}`)
}

/**
 * Mark an error event as resolved.
 * Requires LOGS_ADMIN permission.
 * @param {string} id - Error event ID (UUIDv7)
 * @returns {Promise<Object>}
 */
export async function resolveErrorEvent(id) {
  return client.patch(`/api/v2/logs/errors/${id}/resolve`)
}

/**
 * Query worker audit logs.
 * Requires LOGS_ADMIN permission.
 * @param {Object} params - Filter parameters
 * @param {string} [params.from] - ISO-8601 start time
 * @param {string} [params.to] - ISO-8601 end time
 * @param {string|string[]} [params.worker] - Worker name(s)
 * @param {string} [params.request_id] - Request ID (UUIDv7)
 * @param {number} [params.limit] - Results per page (1-500, default 100)
 * @param {string} [params.cursor] - Pagination cursor (UUIDv7)
 * @returns {Promise<{items: Array, next_cursor: string|null, query_id: string}>}
 */
export async function getAuditLogs(params = {}) {
  const query = buildQuery(params)
  return client.get(`/api/v2/logs/audit${query}`)
}

/**
 * Query performance metrics.
 * @param {Object} params - Filter parameters
 * @param {string} [params.from] - ISO-8601 start time
 * @param {string} [params.to] - ISO-8601 end time
 * @param {string|string[]} [params.worker] - Worker name(s)
 * @param {string} [params.endpoint] - Endpoint path
 * @param {number} [params.limit] - Results per page (1-500, default 100)
 * @param {string} [params.cursor] - Pagination cursor (UUIDv7)
 * @returns {Promise<{items: Array, next_cursor: string|null, query_id: string}>}
 */
export async function getMetrics(params = {}) {
  const query = buildQuery(params)
  return client.get(`/api/v2/logs/metrics${query}`)
}
