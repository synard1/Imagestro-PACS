/**
 * TypeScript interfaces and constants for the Tenant Seeding Worker.
 *
 * Defines the environment bindings, event payloads, status tracking,
 * default user definitions, and retry configuration.
 */

/** Cloudflare Worker environment bindings */
export interface Env {
  /** VPC Tunnel to reach auth-service */
  BACKBONE: Fetcher;

  /** KV for idempotency and status tracking */
  API_CACHE: KVNamespace;

  /** Shared secret for gateway authentication */
  GATEWAY_SHARED_SECRET: string;

  /** Service account username for auth-service login */
  SEED_SERVICE_USERNAME: string;

  /** Service account password for auth-service login */
  SEED_SERVICE_PASSWORD: string;

  /** Secret used to verify JWT tokens */
  JWT_SECRET: string;

  /** Base URL for the auth-service (e.g. "http://auth-service:5000") */
  AUTH_SERVICE_URL: string;

  // --- Centralized D1 Logging bindings ---
  /** D1 database for centralized logging (null when binding is absent) */
  LOG_DB: D1Database | null;
  /** Minimum log level: 'debug' | 'info' | 'warn' | 'error' */
  LOG_LEVEL: string;
  /** Sampling rate for debug/info logs [0.0, 1.0] */
  LOG_SAMPLE_RATE: string;
  /** Number of records to buffer before flushing */
  LOG_BATCH_SIZE: string;
  /** Max time (ms) between flushes */
  LOG_FLUSH_INTERVAL_MS: string;
  /** Whether to also emit logs to console/Analytics Engine */
  LOG_DUAL_WRITE: string;
}

/** Event payload emitted by pacs-service after tenant creation */
export interface TenantCreatedEvent {
  /** Unique event identifier (UUID v4) */
  event_id: string;

  /** Tenant identifier (UUID) */
  tenant_id: string;

  /** Tenant code used for username/email generation */
  tenant_code: string;

  /** Tenant display name (max 255 chars) */
  tenant_name: string;

  /** Tenant contact email */
  tenant_email: string;

  /** ISO 8601 UTC timestamp of event creation */
  created_at: string;
}

/** Status of a seeding operation, stored in KV as JSON */
export interface SeedingStatus {
  tenant_id: string;
  event_id: string;
  status: 'pending' | 'in_progress' | 'completed' | 'partial' | 'failed';
  users_created: number;
  users_failed: number;
  error_details: ErrorEntry[];
  started_at: string;
  completed_at: string | null;
}

/** Individual error entry within a seeding status record */
export interface ErrorEntry {
  username: string;
  role: string;
  error: string;
  timestamp: string;
}

/** Definition for a default user to be created per tenant */
export interface DefaultUserDefinition {
  usernamePrefix: string;
  emailPrefix: string;
  role: string;
  fullNamePrefix: string;
}

/** Configuration for retry behavior with exponential backoff */
export interface RetryConfig {
  maxRetries: number;
  baseDelayMs: number;
}

/**
 * Default users created for every new tenant.
 * Each entry defines the prefix patterns and role for one user.
 */
export const DEFAULT_USERS: DefaultUserDefinition[] = [
  { usernamePrefix: 'admin', emailPrefix: 'admin', role: 'TENANT_ADMIN', fullNamePrefix: 'Admin' },
  { usernamePrefix: 'dokter', emailPrefix: 'dokter', role: 'DOCTOR', fullNamePrefix: 'Dokter' },
  { usernamePrefix: 'radiolog', emailPrefix: 'radiolog', role: 'RADIOLOGIST', fullNamePrefix: 'Radiolog' },
  { usernamePrefix: 'teknisi', emailPrefix: 'teknisi', role: 'TECHNICIAN', fullNamePrefix: 'Teknisi' },
  { usernamePrefix: 'clerk', emailPrefix: 'clerk', role: 'CLERK', fullNamePrefix: 'Clerk' },
  { usernamePrefix: 'perawat', emailPrefix: 'perawat', role: 'NURSE', fullNamePrefix: 'Perawat' },
];

/** Retry config for individual user creation calls (1s, 2s, 4s backoff) */
export const USER_CREATION_RETRY: RetryConfig = { maxRetries: 3, baseDelayMs: 1000 };

/** Retry config for auth-service login attempts (5s, 10s, 20s backoff) */
export const AUTH_LOGIN_RETRY: RetryConfig = { maxRetries: 3, baseDelayMs: 5000 };
