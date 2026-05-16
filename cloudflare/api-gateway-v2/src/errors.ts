/**
 * Custom error classes for the API Gateway v2.
 *
 * Each error carries a `statusCode` and `code` property that the global
 * `onError` handler in index.ts uses to derive the HTTP response.
 *
 * Requirements: 8.5, 12.6, 13.6
 */

// ─── Base Error ──────────────────────────────────────────────────────────────

/**
 * Base application error with HTTP status code and machine-readable error code.
 * All domain errors extend this class so the Hono onError handler can
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

// ─── Log Viewer Errors ───────────────────────────────────────────────────────

/**
 * HTTP 400 — Log query parameters failed validation (invalid filters,
 * malformed cursor, bad ISO-8601 dates, etc.).
 */
export class LogQueryValidationError extends AppError {
  constructor(message = 'Invalid log query parameters', details?: unknown) {
    super(message, 400, 'LOG_QUERY_VALIDATION_ERROR', details);
  }
}

/**
 * HTTP 400 — The requested time range exceeds the maximum allowed window
 * of 7 days. Callers must narrow their `from`/`to` range.
 */
export class LogQueryRangeTooLargeError extends AppError {
  constructor(
    message = 'Query time range exceeds the maximum allowed window of 7 days',
  ) {
    super(message, 400, 'LOG_QUERY_RANGE_TOO_LARGE');
  }
}

/**
 * HTTP 403 — The requester lacks the required LOGS_VIEWER or LOGS_ADMIN
 * permission to access the log viewer API.
 */
export class LogQueryForbiddenError extends AppError {
  constructor(message = 'Insufficient permissions to access logs') {
    super(message, 403, 'LOG_QUERY_FORBIDDEN');
  }
}

/**
 * HTTP 403 — A non-super_admin user attempted a cross-tenant log query
 * by specifying a tenant_id that does not match their own.
 */
export class LogQueryCrossTenantForbiddenError extends AppError {
  constructor(
    message = 'Cross-tenant log queries require super_admin role and LOGS_ADMIN permission',
  ) {
    super(message, 403, 'LOG_QUERY_CROSS_TENANT_FORBIDDEN');
  }
}

/**
 * HTTP 404 — The requested log record (e.g., a specific error event by ID)
 * does not exist or is not visible to the requester's tenant.
 */
export class LogNotFoundError extends AppError {
  constructor(message = 'Log record not found') {
    super(message, 404, 'LOG_NOT_FOUND');
  }
}
