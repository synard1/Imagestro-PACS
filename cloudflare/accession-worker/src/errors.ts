/**
 * Custom error classes for the Accession Worker.
 *
 * Requirements: 1.6, 3.2, 3.7, 4.3, 7A.3, 7A.8, 12.11, 15.2
 */

import type { CounterScope } from './models/counter';

// ─── Base Error ──────────────────────────────────────────────────────────────

/**
 * Base application error with HTTP status code and machine-readable error code.
 * All domain errors extend this class so the error handler middleware can
 * produce consistent JSON responses.
 */
export class AppError extends Error {
  /** HTTP status code to return */
  readonly statusCode: number;
  /** Machine-readable error code (e.g., "VALIDATION_ERROR") */
  readonly code: string;
  /** Optional structured details for the response body */
  readonly details?: unknown;

  constructor(
    message: string,
    statusCode: number,
    code: string,
    details?: unknown,
  ) {
    super(message);
    this.name = this.constructor.name;
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
    // Maintain proper prototype chain for instanceof checks
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

// ─── Validation ──────────────────────────────────────────────────────────────

export interface ValidationErrorDetail {
  field?: string;
  message: string;
}

/**
 * HTTP 400 — Request body or query parameters failed validation.
 * Carries an array of per-field error details so consumers can display
 * all issues at once.
 */
export class ValidationError extends AppError {
  readonly errors: ValidationErrorDetail[];

  constructor(errors: ValidationErrorDetail[]) {
    const message =
      errors.length === 1
        ? errors[0]!.message
        : `Validation failed with ${errors.length} errors`;
    super(message, 400, 'VALIDATION_ERROR', { errors });
    this.errors = errors;
  }
}

// ─── Sequence Exhausted ──────────────────────────────────────────────────────

/**
 * HTTP 409 — The sequence counter for a given scope has reached its maximum
 * value (10^sequence_digits - 1). No more accession numbers can be generated
 * until the counter resets (next date bucket) or sequence_digits is increased.
 */
export class SequenceExhaustedError extends AppError {
  readonly scope: CounterScope;
  readonly maxValue: number;

  constructor(scope: CounterScope, maxValue: number) {
    const message = `Sequence limit reached (max ${maxValue}) for scope ${scope.tenantId}/${scope.facilityCode}/${scope.modality || '*'}/${scope.dateBucket}`;
    super(message, 409, 'SEQUENCE_EXHAUSTED', {
      scope,
      maxValue,
    });
    this.scope = scope;
    this.maxValue = maxValue;
  }
}

// ─── Write Contention ────────────────────────────────────────────────────────

/**
 * HTTP 409 — The atomic counter increment failed after exhausting all retry
 * attempts due to D1 write contention (busy/locked database).
 */
export class WriteContentionError extends AppError {
  readonly scope: CounterScope;
  readonly attempts: number;

  constructor(scope: CounterScope, attempts: number) {
    const message = `Write contention after ${attempts} attempts for scope ${scope.tenantId}/${scope.facilityCode}/${scope.modality || '*'}/${scope.dateBucket}`;
    super(message, 409, 'WRITE_CONTENTION', {
      scope,
      attempts,
    });
    this.scope = scope;
    this.attempts = attempts;
  }
}

// ─── Idempotency Conflict ────────────────────────────────────────────────────

/**
 * HTTP 422 — An idempotency key was reused with a different request payload
 * (modality or patient_national_id differs from the original request).
 */
export class IdempotencyConflictError extends AppError {
  constructor(key: string) {
    super(
      `Idempotency key "${key}" was already used with a different request payload`,
      422,
      'IDEMPOTENCY_CONFLICT',
      { key },
    );
  }
}

// ─── Duplicate Accession ─────────────────────────────────────────────────────

/**
 * HTTP 409 — An accession number already exists for this tenant.
 * Typically raised when an externally-supplied accession number collides
 * with an existing record.
 */
export class DuplicateAccessionError extends AppError {
  constructor(accessionNumber: string) {
    super(
      `Accession number "${accessionNumber}" already exists`,
      409,
      'DUPLICATE_ACCESSION',
      { accessionNumber },
    );
  }
}

// ─── Immutable Field ─────────────────────────────────────────────────────────

/**
 * HTTP 400 — A PATCH request attempted to modify one or more immutable fields.
 */
export class ImmutableFieldError extends AppError {
  readonly fields: string[];

  constructor(fields: string[]) {
    const message = `The following fields are immutable and cannot be modified: ${fields.join(', ')}`;
    super(message, 400, 'IMMUTABLE_FIELD', { fields });
    this.fields = fields;
  }
}

// ─── Forbidden ───────────────────────────────────────────────────────────────

/**
 * HTTP 403 — The authenticated principal lacks the required role or permission.
 */
export class ForbiddenError extends AppError {
  constructor(message = 'Insufficient permissions') {
    super(message, 403, 'FORBIDDEN');
  }
}

// ─── Payload Too Large ───────────────────────────────────────────────────────

/**
 * HTTP 413 — The request body exceeds the 1 MB size limit.
 */
export class PayloadTooLargeError extends AppError {
  constructor(message = 'Request body exceeds the maximum allowed size of 1 MB') {
    super(message, 413, 'PAYLOAD_TOO_LARGE');
  }
}

// ─── Rate Limited ────────────────────────────────────────────────────────────

/**
 * HTTP 429 — The tenant has exceeded their rate limit.
 * Includes a `retryAfter` value (in seconds) for the Retry-After header.
 */
export class RateLimitedError extends AppError {
  readonly retryAfter: number;

  constructor(retryAfter: number) {
    super(
      `Rate limit exceeded. Retry after ${retryAfter} seconds`,
      429,
      'RATE_LIMITED',
      { retryAfter },
    );
    this.retryAfter = retryAfter;
  }
}

// ─── Circuit Open ────────────────────────────────────────────────────────────

/**
 * HTTP 503 — The circuit breaker is open, indicating the downstream service
 * (e.g., MWL Writer) is currently unavailable.
 */
export class CircuitOpenError extends AppError {
  constructor(service = 'MWL Writer') {
    super(
      `Circuit breaker is open for ${service}. Service temporarily unavailable`,
      503,
      'CIRCUIT_OPEN',
      { service },
    );
  }
}
