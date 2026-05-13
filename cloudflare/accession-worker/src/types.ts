/**
 * Shared type definitions and environment bindings for the Accession Worker.
 *
 * Requirements: 11.3, 11.4, 12.6
 */

// ─── Environment Bindings ────────────────────────────────────────────────────

export interface Env {
  // D1 Database bindings
  DB: D1Database; // Primary (writes + strong reads)
  DB_READ?: D1Database; // Read replica (GET endpoints, best-effort)

  // Durable Object bindings
  COUNTER_DO?: DurableObjectNamespace; // Hot counter fallback
  CIRCUIT_BREAKER_DO: DurableObjectNamespace; // MWL circuit breaker

  // Service Bindings
  MWL_WRITER?: Fetcher;

  // Analytics Engine
  METRICS: AnalyticsEngineDataset; // dataset: accession_metrics
  RATE_LIMIT_EVENTS: AnalyticsEngineDataset;
  CIRCUIT_EVENTS: AnalyticsEngineDataset;
  JOB_RUNS: AnalyticsEngineDataset;

  // Rate Limiting (Cloudflare Rate Limiting bindings)
  RATE_LIMITER_WRITE: RateLimit; // 100/10s per tenant
  RATE_LIMITER_READ: RateLimit; // 500/10s per tenant

  // Secrets (wrangler secret put)
  JWT_SECRET: string; // Required, HS256
  GATEWAY_SHARED_SECRET?: string; // For X-Gateway-Signature HMAC

  // Environment variables (wrangler.jsonc vars)
  ENABLE_MWL: string; // "true" | "false"
  MWL_WRITER_URL?: string;
  FACILITY_CODE: string;
  SHADOW_MODE?: string; // "true" | "false"
  CANARY_TENANT_IDS?: string; // comma-separated
  MIGRATION_AUDIT_LOG?: string; // "true" | "false"
  ALLOWED_ORIGINS?: string; // comma-separated origins
  LOG_SAMPLE_RATE?: string; // "0.0" to "1.0"
  BUILD_VERSION?: string; // Git SHA injected at deploy
}

// ─── Tenant Context ──────────────────────────────────────────────────────────

export interface TenantContext {
  tenantId: string;
  facilityCode: string;
  timezone: string; // IANA, default "Asia/Jakarta"
  source: 'jwt' | 'gateway'; // How tenant was authenticated
  jwtClaims?: JWTClaims;
  roles: string[]; // e.g., ["admin", "data_steward"]
}

// ─── JWT Claims ──────────────────────────────────────────────────────────────

export interface JWTClaims {
  tenant_id: string;
  jti: string;
  sub: string;
  exp: number;
  nbf?: number;
  roles?: string[];
}

// ─── Modality ────────────────────────────────────────────────────────────────

export type Modality =
  | 'CT'
  | 'MR'
  | 'CR'
  | 'DX'
  | 'US'
  | 'XA'
  | 'RF'
  | 'MG'
  | 'NM'
  | 'PT';

export const MODALITIES: readonly Modality[] = [
  'CT',
  'MR',
  'CR',
  'DX',
  'US',
  'XA',
  'RF',
  'MG',
  'NM',
  'PT',
] as const;

// ─── Shared Result Types ─────────────────────────────────────────────────────

export interface AccessionResult {
  id: string;
  accession_number: string;
  issuer: string;
  facility_code?: string;
}

export interface BatchAccessionResult {
  accessions: AccessionResult[];
}

export interface PaginatedResult<T> {
  items: T[];
  next_cursor: string | null;
  has_more: boolean;
}

export interface ErrorDetail {
  field?: string;
  message: string;
  code?: string;
}

export interface ErrorResponse {
  request_id?: string;
  error: string;
  errors?: ErrorDetail[];
}

export interface HealthCheckResult {
  status: 'ok' | 'degraded';
  service: string;
  version: string;
  timestamp: string;
  uptime_ms: number;
  checks: {
    db: {
      status: 'ok' | 'error';
      latency_ms: number;
      error?: string;
    };
  };
}
