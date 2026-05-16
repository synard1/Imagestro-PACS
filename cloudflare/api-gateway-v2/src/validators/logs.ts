/**
 * Zod validation schemas for the Log Viewer API query parameters.
 *
 * Endpoints: GET /api/v2/logs/app, /errors, /audit, /metrics
 * Requirements: 12.3, 12.4, 12.6
 */
import { z } from 'zod';

// ---------------------------------------------------------------------------
// Shared primitives
// ---------------------------------------------------------------------------

/** UUIDv7 regex: version nibble = 7, variant bits = 8/9/a/b */
const UUIDV7_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const uuidv7 = z.string().regex(UUIDV7_REGEX, 'Must be a valid UUIDv7');

/** ISO-8601 datetime string coerced to a Date for range arithmetic */
const isoDatetime = z
  .string()
  .datetime({ message: 'Must be a valid ISO-8601 datetime string' });

// ---------------------------------------------------------------------------
// Base query schema — shared across all log endpoints
// ---------------------------------------------------------------------------

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

const baseLogQuerySchema = z
  .object({
    /** Start of time range (ISO-8601). Defaults to `to - 1h` when omitted. */
    from: isoDatetime.optional(),
    /** End of time range (ISO-8601). Defaults to `now` when omitted. */
    to: isoDatetime.optional(),
    /** Filter by originating worker name */
    worker: z.string().min(1).optional(),
    /** Correlation request ID (UUIDv7) */
    request_id: uuidv7.optional(),
    /** Maximum number of results (1–500, default 100) */
    limit: z.coerce.number().int().min(1).max(500).default(100),
    /** Cursor for pagination (UUIDv7) */
    cursor: uuidv7.optional(),
  })
  .superRefine((data, ctx) => {
    if (data.from && data.to) {
      const fromMs = new Date(data.from).getTime();
      const toMs = new Date(data.to).getTime();

      if (toMs - fromMs > SEVEN_DAYS_MS) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message:
            'Time range must not exceed 7 days. Narrow the from/to window.',
          path: ['from'],
          params: { errorCode: 'LOG_QUERY_RANGE_TOO_LARGE' },
        });
      }
    }
  });

// ---------------------------------------------------------------------------
// Endpoint-specific schemas
// ---------------------------------------------------------------------------

/**
 * GET /api/v2/logs/app
 * Accepts optional `level` filter.
 */
export const appLogsQuerySchema = baseLogQuerySchema.and(
  z.object({
    /** Filter by log level */
    level: z
      .enum(['debug', 'info', 'warn', 'error'])
      .optional(),
    /** Tenant ID override (UUIDv7) — only accepted for super_admin + LOGS_ADMIN */
    tenant_id: uuidv7.optional(),
  })
);

/**
 * GET /api/v2/logs/errors
 * Accepts optional `severity` filter.
 */
export const errorEventsQuerySchema = baseLogQuerySchema.and(
  z.object({
    /** Filter by error severity */
    severity: z
      .enum(['low', 'medium', 'high', 'critical'])
      .optional(),
    /** Tenant ID override (UUIDv7) — only accepted for super_admin + LOGS_ADMIN */
    tenant_id: uuidv7.optional(),
  })
);

/**
 * GET /api/v2/logs/audit
 * Accepts optional `action` and `resource_type` filters.
 */
export const auditLogsQuerySchema = baseLogQuerySchema.and(
  z.object({
    /** Filter by audit action (e.g. ORDER_CREATE, LOGS_QUERY) */
    action: z.string().min(1).optional(),
    /** Filter by resource type */
    resource_type: z.string().min(1).optional(),
    /** Tenant ID override (UUIDv7) — only accepted for super_admin + LOGS_ADMIN */
    tenant_id: uuidv7.optional(),
  })
);

/**
 * GET /api/v2/logs/metrics
 * Accepts optional `endpoint` filter.
 */
export const metricsQuerySchema = baseLogQuerySchema.and(
  z.object({
    /** Filter by endpoint path */
    endpoint: z.string().min(1).optional(),
    /** Tenant ID override (UUIDv7) — only accepted for super_admin + LOGS_ADMIN */
    tenant_id: uuidv7.optional(),
  })
);

// ---------------------------------------------------------------------------
// Exported error code constant
// ---------------------------------------------------------------------------

export const LOG_QUERY_RANGE_TOO_LARGE = 'LOG_QUERY_RANGE_TOO_LARGE' as const;
