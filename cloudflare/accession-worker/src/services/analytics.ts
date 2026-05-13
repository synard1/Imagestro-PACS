/**
 * Analytics Engine event emission for the Accession Worker.
 *
 * Emits structured data points to Cloudflare Analytics Engine datasets
 * for observability and alerting. Each function guards against missing
 * bindings so the worker doesn't crash in environments where Analytics
 * Engine is not configured.
 *
 * Requirements: 4.10, 15.8, 15.9, 19.5
 */

import type { Env } from '../types';

// ─── Accession Metrics (dataset: accession_metrics) ──────────────────────────

export interface AccessionMetricData {
  tenantId: string;
  modality: string;
  endpoint: string;
  statusCode: number;
  durationMs: number;
}

/**
 * Emits a metric for each accession-related request.
 *
 * Blobs: [tenantId, modality, endpoint]
 * Doubles: [durationMs, statusCode]
 * Indexes: [statusCodeGroup] — "2xx", "4xx", or "5xx"
 *
 * Validates: Requirement 15.8
 */
export function emitAccessionMetric(env: Env, data: AccessionMetricData): void {
  if (!env.METRICS) return;

  const statusCodeGroup = getStatusCodeGroup(data.statusCode);

  env.METRICS.writeDataPoint({
    blobs: [data.tenantId, data.modality, data.endpoint],
    doubles: [data.durationMs, data.statusCode],
    indexes: [statusCodeGroup],
  });
}

// ─── Rate Limit Events (dataset: rate_limit_events) ──────────────────────────

export interface RateLimitEventData {
  tenantId: string;
  endpoint: string;
  statusCode: number;
}

/**
 * Emits an event when a rate limit is triggered.
 *
 * Blobs: [tenantId, endpoint]
 * Doubles: [statusCode]
 * Indexes: [tenantId]
 *
 * Validates: Requirement 15.9
 */
export function emitRateLimitEvent(env: Env, data: RateLimitEventData): void {
  if (!env.RATE_LIMIT_EVENTS) return;

  env.RATE_LIMIT_EVENTS.writeDataPoint({
    blobs: [data.tenantId, data.endpoint],
    doubles: [data.statusCode],
    indexes: [data.tenantId],
  });
}

// ─── Circuit Breaker Events (dataset: circuit_events) ────────────────────────

export interface CircuitEventData {
  service: string;
  state: string;
  action: string;
}

/**
 * Emits an event when the circuit breaker changes state or takes action.
 *
 * Blobs: [service, state, action]
 * Doubles: []
 * Indexes: [service]
 *
 * Validates: Requirement 15.9
 */
export function emitCircuitEvent(env: Env, data: CircuitEventData): void {
  if (!env.CIRCUIT_EVENTS) return;

  env.CIRCUIT_EVENTS.writeDataPoint({
    blobs: [data.service, data.state, data.action],
    doubles: [],
    indexes: [data.service],
  });
}

// ─── Job Run Events (dataset: job_runs) ──────────────────────────────────────

export interface JobRunData {
  jobName: string;
  deletedCount: number;
  elapsedMs: number;
  success: boolean;
}

/**
 * Emits an event after a scheduled job completes (or fails).
 *
 * Blobs: [jobName, status]
 * Doubles: [deletedCount, elapsedMs]
 * Indexes: [jobName]
 *
 * Validates: Requirements 4.10, 19.5
 */
export function emitJobRun(env: Env, data: JobRunData): void {
  if (!env.JOB_RUNS) return;

  const status = data.success ? 'success' : 'error';

  env.JOB_RUNS.writeDataPoint({
    blobs: [data.jobName, status],
    doubles: [data.deletedCount, data.elapsedMs],
    indexes: [data.jobName],
  });
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function getStatusCodeGroup(statusCode: number): string {
  if (statusCode >= 200 && statusCode < 300) return '2xx';
  if (statusCode >= 400 && statusCode < 500) return '4xx';
  if (statusCode >= 500) return '5xx';
  return 'other';
}
