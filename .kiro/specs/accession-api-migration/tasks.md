# Implementation Plan: Accession API Migration

## Overview

This plan breaks the migration from Docker/Postgres to Cloudflare Workers + D1 into incremental, integrable steps. We build the foundation (scaffold, schema, utilities) first, layer in core services (generator, counter, idempotency, repository), wire up HTTP routes and middleware, then add observability, MWL integration, scheduled jobs, and migration tooling. Each implementation task is paired with its property or unit test sub-task so correctness guarantees from the design are validated close to the code they cover.

All tasks target TypeScript on Cloudflare Workers using the Hono framework, Zod for validation, `fast-check` for property tests, and Vitest with `@cloudflare/vitest-pool-workers` for the test runtime.

## Tasks

- [x] 1. Scaffold `cloudflare/accession-worker` project and toolchain
  - [x] 1.1 Initialize project structure, package.json, tsconfig, and Vitest/Wrangler config
    - Create `cloudflare/accession-worker/` with `src/`, `test/`, `migrations/`, `scripts/` subdirectories per design
    - Add pinned dependencies: `hono`, `zod`, `uuidv7`, `fast-check` (dev), `vitest`, `@cloudflare/vitest-pool-workers`, `wrangler`, `typescript`
    - Create `tsconfig.json` with strict mode and Workers types
    - Create `vitest.config.ts` wired to `@cloudflare/vitest-pool-workers`
    - _Requirements: 11.12_

  - [x] 1.2 Author `wrangler.jsonc` with bindings, vars, migrations, cron triggers, and observability
    - Declare `DB` (primary) and `DB_READ` (replica) D1 bindings for prod and preview envs
    - Declare `COUNTER_DO` and `CIRCUIT_BREAKER_DO` Durable Object bindings and the `v1` migration
    - Declare Analytics Engine datasets (`METRICS`, `RATE_LIMIT_EVENTS`, `CIRCUIT_EVENTS`, `JOB_RUNS`)
    - Declare rate-limit bindings (`RATE_LIMITER_WRITE`, `RATE_LIMITER_READ`)
    - Declare cron triggers `0 3 * * *` and `0 4 * * 0` (note: only `0 3 * * *` currently declared in `wrangler.jsonc`; the `0 4 * * 0` weekly soft-delete cron is handled in `scheduled()` but missing from the trigger list)
    - Set non-sensitive `[vars]` (`ENABLE_MWL`, `FACILITY_CODE`, `SHADOW_MODE`, `MIGRATION_AUDIT_LOG`, `LOG_SAMPLE_RATE`)
    - Enable `[observability]` block
    - _Requirements: 11.1, 11.2, 11.3, 11.10, 12.8, 18.1, 19.1_

  - [x] 1.3 Create `src/types.ts` with `Env`, `TenantContext`, and `JWTClaims` interfaces
    - Include all D1, DO, Analytics Engine, rate-limit, secret, and var bindings listed in the design
    - Export union type `Modality` and shared result types
    - _Requirements: 11.3, 11.4, 12.6_

- [x] 2. D1 schema and migrations
  - [x] 2.1 Write `migrations/0001_initial_schema.sql` for accessions, counters, idempotency, tenant_settings
    - Create `accessions` table with all columns from Requirement 8.1 including `deleted_at TEXT NULL`
    - Create `accession_counters` with composite primary key `(tenant_id, facility_code, modality, date_bucket)`
    - Create `idempotency_keys` with composite primary key `(tenant_id, key)` plus `request_hash`, `payload_type`, `payload`, `expires_at`
    - Create `tenant_settings` table with composite primary key `(tenant_id, key)`
    - Add unique index on `accessions(tenant_id, accession_number)`
    - Add supporting indexes: `idx_accessions_tenant_created`, `idx_accessions_tenant_patient`, `idx_accessions_tenant_source`, `idx_accessions_tenant_active` (partial on `deleted_at IS NULL`), `idx_idempotency_expires`
    - _Requirements: 8.1, 8.2, 8.3, 8.4, 8.5, 8.6, 8.8, 8.10_

  - [x] 2.2 Write `migrations/0002_audit_table.sql` for `accession_audit`
    - Create `accession_audit` table and indexes per Requirement 8.9 and 7A.4
    - _Requirements: 7A.4, 8.9_

  - [x] 2.3 Write `migrations/0003_soft_delete.sql` to confirm `deleted_at` column and indexes
    - Ensure `accessions.deleted_at` and partial active index are migration-safe if 0001 runs on an existing DB
    - _Requirements: 7A.5, 8.1_

- [x] 3. Shared utilities
  - [x] 3.1 Implement `src/utils/uuid.ts` wrapping `uuidv7` package
    - Export `newUuidV7()` and `isUuid(s)` (accepts v4 and v7 forms)
    - _Requirements: 1.3, 8.7, 15.4, 15.5_

  - [x] 3.2 Property test UUID v7 chronological ordering
    - **Property 21: UUID v7 values sort in chronological generation order**
    - **Validates: Requirements 1.3, 8.7, 15.5**

  - [x] 3.3 Implement `src/utils/date-utils.ts` with timezone-aware date parts and `computeDateBucket`
    - `computeDatePartsInTimezone(date, timezone)` using `Intl.DateTimeFormat`
    - `computeDateBucket(policy, date, timezone)` returning `YYYYMMDD`, `YYYYMM`, or `ALL`
    - Reject invalid IANA timezones (throw typed error caller can translate to HTTP 400)
    - _Requirements: 2.3, 2.4, 2.5, 2.13, 2.14, 3.3_

  - [x] 3.4 Implement `src/utils/cursor.ts` opaque keyset cursor encode/decode
    - `encodeCursor({createdAt, id})` → base64url JSON
    - `decodeCursor(encoded)` → `DecodedCursor | null` (never throws)
    - _Requirements: 7.6, 7.8_

  - [x] 3.5 Property test cursor encode/decode round-trip stability
    - **Property 27: Keyset pagination cursor round-trip is stable**
    - **Validates: Requirements 7.6, 7.8**

  - [x] 3.6 Implement `src/utils/redaction.ts` for PII-safe logging
    - Recursively walk objects; mask `patient_national_id` → `****XXXX`, `patient_ihs_number` → `P***********`, replace `password`/`token`/`secret` with `[REDACTED]`
    - _Requirements: 15.7_

  - [x] 3.7 Property test PII redaction preserves structure
    - **Property 22: PII redaction preserves structure but removes sensitive values**
    - **Validates: Requirements 15.7**

  - [x] 3.8 Implement `src/utils/backoff.ts` exponential backoff helper and contention-error predicate
    - `sleep(ms)`, `backoffSchedule = [10, 40, 160]`, `isContentionError(err)` matching `busy`/`locked`/`contention`
    - _Requirements: 3.2_

  - [x] 3.9 Implement `src/utils/format-tokens.ts` — token parser and token types
    - `tokenize(pattern)` returning `Token[]` with `isToken`, `isSequence`, `isRandom`, `digits`, `normalized`, `text`
    - Support `{YYYY}`, `{YY}`, `{MM}`, `{DD}`, `{DOY}`, `{HOUR}`, `{MIN}`, `{SEC}`, `{MOD}`, `{ORG}`, `{SITE}`, `{NNN...}`, `{SEQn}`, `{RANDn}`
    - _Requirements: 2.2_

- [x] 4. Models and error classes
  - [x] 4.1 Create `src/models/` type definitions
    - `accession.ts`, `counter.ts` (`CounterScope`), `config.ts` (`AccessionConfig` incl. `timezone`, `counter_backend`), `audit.ts`
    - _Requirements: 2.1, 2.12, 3A.1, 7A.4, 8.1, 8.2_

  - [x] 4.2 Implement custom error classes in `src/errors.ts`
    - `AppError`, `ValidationError`, `SequenceExhaustedError`, `WriteContentionError`, `IdempotencyConflictError`, `DuplicateAccessionError`, `ImmutableFieldError`, `ForbiddenError`, `PayloadTooLargeError`, `RateLimitedError`, `CircuitOpenError`
    - _Requirements: 1.6, 3.2, 3.7, 4.3, 7A.3, 7A.8, 12.11, 15.2_

- [x] 5. Accession generator service
  - [x] 5.1 Implement `src/services/accession-generator.ts`
    - `renderAccessionNumber(input)` — render tokens using tenant timezone date parts
    - `computeCounterScope(tenantId, facilityCode, modality, dateBucket, useModalityInSeqScope)`
    - `validateFormatPattern(pattern, sequenceDigits)` — require ≥ 1 sequence token and bound max length ≤ 64
    - Re-export `computeDateBucket` / `computeDatePartsInTimezone`
    - _Requirements: 1.1, 1.2, 1.4, 2.1, 2.2, 2.6, 2.7, 2.8, 2.14, 5.4_

  - [x] 5.2 Property test format rendering matches pattern structure
    - **Property 1: Accession number format rendering matches pattern structure**
    - **Validates: Requirements 1.1, 2.2**

  - [x] 5.3 Property test timezone-aware date bucket computation
    - **Property 2: Date bucket computation is timezone-aware and correct for all reset policies**
    - **Validates: Requirements 2.3, 2.4, 2.5, 2.14**

  - [x] 5.4 Property test counter scope includes/excludes modality
    - **Property 3: Counter scope correctly includes or excludes modality**
    - **Validates: Requirements 2.12, 3.3, 5.4**

  - [x] 5.5 Property test issuer formatting
    - **Property 5: Issuer field follows SATUSEHAT format**
    - **Validates: Requirements 1.4, 17.4**

  - [x] 5.6 Property test format pattern validation rejects invalid patterns
    - **Property 18: Format pattern validation rejects patterns without sequence token or exceeding max length**
    - **Validates: Requirements 2.7, 2.8**

- [x] 6. Sequence counter implementations
  - [x] 6.1 Implement `src/services/sequence-counter-d1.ts` with single-statement UPSERT and backoff
    - `incrementCounterD1(db, scope, maxValue, count=1)` returning `{ startValue, endValue }`
    - Retry schedule [10, 40, 160] ms on contention; throw `SequenceExhaustedError` when UPDATE guard fails
    - Do not retry on non-contention errors (network/schema) — propagate immediately
    - _Requirements: 1.5, 1.6, 3.1, 3.2, 3.4, 3.6, 3.7, 16.8_

  - [x] 6.2 Property test D1 counter monotonic increments and batch reservation
    - **Property 4: Sequential counter increments produce monotonically increasing values without gaps**
    - **Property 4A: Batch counter reservation produces consecutive value ranges**
    - **Validates: Requirements 1.5, 3.1, 3.4, 3.6, 3A.3, 16.4, 16.8**

  - [x] 6.3 Implement `src/durable-objects/counter-do.ts` CounterDurableObject
    - Lazy-load `current_value` from `state.storage`
    - `fetch('/increment')` handles `{ maxValue, count }`, returns `{ startValue, endValue }` or HTTP 409 on exhaustion
    - _Requirements: 3A.3, 3A.4_

  - [x] 6.4 Implement `src/services/sequence-counter-do.ts` dispatcher
    - `incrementCounterDO(env, scope, maxValue, count)` hashes scope and calls DO
    - `incrementCounter(env, config, scope, count)` dispatcher selecting `D1` or `DURABLE_OBJECT` based on `config.counter_backend`
    - Fallback to D1 and log warning ONLY when DO binding is missing; propagate other DO errors as HTTP 500
    - _Requirements: 3A.1, 3A.2, 3A.5, 3A.6_

  - [x] 6.5 Property test DO counter monotonic increments
    - **Property 4 (DO backend): Sequential counter increments produce monotonically increasing values without gaps**
    - **Validates: Requirements 3A.3, 3A.4**

- [x] 7. Input validation and normalization
  - [x] 7.1 Implement `src/validators/accession-input.ts` Zod schemas and normalizers
    - `nestedFormatSchema` (patient nested) and `flatFormatSchema` (flat) per Requirement 10
    - NIK `^\d{16}$`, IHS `^P\d{11}$`, modality in 10-value enum, `patient_name` 1–200 chars, `birth_date` ISO and not future
    - `normalizeNestedFormat` / `normalizeFlatFormat` → `NormalizedAccessionInput`
    - Aggregate errors using Zod's `safeParse` error map (return all failures)
    - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.5, 6.6, 6.7, 6.8, 10.1, 10.2, 10.3, 10.6, 10.7_

  - [x] 7.2 Property test NIK, modality, and error-aggregation validators
    - **Property 6: Input validation correctly classifies valid and invalid NIK values**
    - **Property 7: Input validation correctly classifies modality values**
    - **Property 8: Validation aggregates all errors in a single response**
    - **Validates: Requirements 6.1, 6.2, 6.6**

  - [x] 7.3 Property test nested ↔ flat normalization equivalence
    - **Property 9: Format normalization equivalence between nested and flat formats**
    - **Validates: Requirements 10.3, 10.7**

  - [x] 7.4 Implement `src/validators/batch-input.ts`
    - `batchSchema` — `procedures` 1–20, reject duplicate `procedure_code` within a batch
    - Support each procedure optionally carrying an external `accession_number`
    - Return per-index error objects
    - _Requirements: 16.1, 16.2, 16.5, 16.6_

  - [x] 7.5 Implement `src/validators/format-pattern.ts`
    - Wrap `validateFormatPattern` from generator; validate IANA timezone via `Intl.DateTimeFormat`
    - _Requirements: 2.7, 2.8, 2.11, 2.13_

  - [x] 7.6 Implement `src/validators/list-query.ts`
    - Parse `limit`, `cursor`, `source`, `modality`, `patient_national_id`, `from_date`, `to_date`, `include_deleted`
    - Enforce `limit` 1–100, decode cursor via `decodeCursor`, reject malformed
    - _Requirements: 7.4, 7.7, 7.8, 7A.7_

  - [x] 7.7 Implement `src/validators/external-accession.ts`
    - Validate externally-supplied accession numbers: non-empty, ≤ 64 chars, printable ASCII only (no control chars, no whitespace-only)
    - _Requirements: 17.7_

  - [x] 7.8 Property test external accession number validator
    - **Property 17: External accession number validation**
    - **Validates: Requirements 17.7**

- [x] 8. Idempotency service
  - [x] 8.1 Implement `src/services/idempotency.ts`
    - `checkIdempotency(db, tenantId, key, requestHash)` returning cached record, conflict, or miss
    - `storeIdempotency(db, record)` with 24h `expires_at`
    - Request hash = SHA-256 of modality + patient_national_id (and batch signature for batch payloads)
    - Validate key length 1–128 chars
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5, 4.6, 4.7, 16.7_

  - [x] 8.2 Property test idempotency lookup/conflict detection and TTL
    - **Property 10: Idempotency key lookup returns cached result or detects conflict**
    - **Property 11: Idempotency key TTL is exactly 24 hours after creation**
    - **Validates: Requirements 4.1, 4.2, 4.3, 4.4**
    - (note: `idempotency.property.test.ts` covers key-length validation and request-hash determinism, not the exact 24h TTL property; `idempotency.test.ts` asserts 24h `expires_at` as a unit test)

- [x] 9. Accession repository (D1 CRUD, pagination, audit, soft delete)
  - [x] 9.1 Implement `src/services/accession-repository.ts`
    - `createAccession(db, record)` via `db.batch([INSERT accession, INSERT idempotency_key])`
    - `createBatchAccessions(db, records, idempotencyRecord?)` via single `db.batch([...INSERTs, idempotency])`
    - `getAccession(db, tenantId, accessionNumber, includeDeleted)` returning 404-safe result
    - `listAccessions(db, tenantId, filters, cursor, limit)` using keyset `(created_at DESC, id DESC)` with partial-index path when `include_deleted=false`
    - `patchAccession(db, tenantId, accessionNumber, changes, actor)` — enforce allowed field list, write `accession_audit` row in same `db.batch`
    - `softDeleteAccession(db, tenantId, accessionNumber, actor)` → set `deleted_at`, write audit row
    - Mandatory `tenant_id` filter on every statement
    - Select `DB` vs `DB_READ` based on caller context (strong vs replica read)
    - _Requirements: 3.5, 3.8, 5.2, 5.3, 5.5, 7.1, 7.2, 7.3, 7.4, 7.5, 7.6, 7A.1, 7A.2, 7A.3, 7A.4, 7A.5, 7A.7, 17.5, 17.8, 18.2, 18.3, 18.5_

  - [x] 9.2 Property test tenant isolation (cross-tenant 404)
    - **Property 12: Tenant isolation prevents cross-tenant access**
    - **Validates: Requirements 5.3**

  - [x] 9.3 Property test keyset pagination produces non-overlapping pages in correct order
    - **Property 28: List endpoint pagination produces non-overlapping pages in correct order**
    - **Validates: Requirements 7.4, 7.5, 7.6**

  - [x] 9.4 Property test PATCH rejects immutable fields
    - **Property 29: Immutable fields cannot be modified via PATCH**
    - **Validates: Requirements 7A.3**

  - [x] 9.5 Property test soft-deleted records excluded from default results
    - **Property 30: Soft-deleted records are excluded from default list/get results**
    - **Validates: Requirements 7A.5, 7A.7**

- [x] 10. Checkpoint
  - Ensure all tests pass, ask the user if questions arise.
  - (note: tests not executed during audit; upstream task 1.2 is partial due to missing weekly cron declaration)

- [x] 11. Circuit breaker Durable Object
  - [x] 11.1 Implement `src/durable-objects/circuit-breaker-do.ts`
    - RPC methods `getStatus`, `recordSuccess`, `recordFailure`, `tryAcquire`
    - Transition closed → open after 5 consecutive failures in 60s window
    - Open → half-open after 30s; success closes, failure reopens for another 30s
    - Persist state via `state.storage`
    - _Requirements: 9.6, 9.7, 9.8_

  - [x] 11.2 Property test circuit breaker state transitions
    - **Property 31: Circuit breaker transitions follow closed → open → half-open → closed pattern**
    - **Validates: Requirements 9.6, 9.7, 9.8**

- [x] 12. MWL writer integration
  - [x] 12.1 Implement `src/services/mwl-writer.ts`
    - Prefer `env.MWL_WRITER` Service Binding; fall back to URL fetch with 5s timeout
    - Consult circuit breaker DO before calling; log `circuit_open` when denied and do not count as new failure
    - Retry 5xx/network failures up to 2 times (200ms, 800ms); do not retry 4xx
    - Propagate `X-Request-ID`
    - Return fire-and-forget errors via logs; never throw to caller
    - _Requirements: 9.1, 9.2, 9.3, 9.4, 9.5, 9.6, 9.7, 9.8, 9.9, 9.10_

  - [x] 12.2 Unit tests for MWL writer paths
    - Service Binding vs HTTP fallback, ENABLE_MWL toggle, 5xx retry, 4xx no-retry, circuit-open skip, X-Request-ID propagation
    - _Requirements: 9.1, 9.2, 9.3, 9.4, 9.10_
    - (note: `mwl-writer.property.test.ts` covers payload construction and retry-delay math only; the specific path scenarios above are not asserted)

- [x] 13. Analytics Engine emitter
  - [x] 13.1 Implement `src/services/analytics.ts`
    - `emitAccessionMetric`, `emitRateLimitEvent`, `emitCircuitEvent`, `emitJobRun` with blobs/doubles/indexes shape per design
    - _Requirements: 4.10, 15.8, 15.9, 19.5_

- [x] 14. Middleware stack
  - [x] 14.1 Implement `src/middleware/request-id.ts`
    - Accept valid UUID v4/v7 `X-Request-ID`, otherwise generate UUID v7
    - Set response header to the resolved value
    - _Requirements: 15.4, 15.5_

  - [x] 14.2 Property test request ID propagation and generation
    - **Property 25: Request ID is propagated when valid, generated when absent or malformed**
    - **Validates: Requirements 15.4, 15.5**

  - [x] 14.3 Implement `src/middleware/logger.ts` structured JSON logger
    - Emit per-request JSON with timestamp, endpoint, method, tenant, modality, status, duration, level, request_id, service=`accession-worker`
    - Apply `redact` on any logged body
    - Apply `LOG_SAMPLE_RATE` to `info` logs only (warn/error always emit)
    - Emit `slow_request` warn when elapsed > 2000 ms with phase breakdown
    - Log level: info for 2xx/3xx/429, warn for 4xx (except 429), error for 5xx
    - Skip `/healthz` and `/readyz`
    - _Requirements: 15.1, 15.3, 15.6, 15.7, 15.10, 15.11_

  - [x] 14.4 Property test log level classification and no-leak
    - **Property 19: Log level classification matches HTTP status code ranges**
    - **Property 20: Error responses do not leak internal details**
    - **Validates: Requirements 15.2, 15.6**

  - [x] 14.5 Implement `src/middleware/security-headers.ts`
    - Set `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Strict-Transport-Security: max-age=63072000; includeSubDomains`, `Referrer-Policy: no-referrer`
    - _Requirements: 12.10_

  - [x] 14.6 Implement `src/middleware/body-size-limit.ts`
    - Reject > 1 MB with HTTP 413 via `PayloadTooLargeError`
    - _Requirements: 12.11_

  - [x] 14.7 Implement `src/middleware/cors.ts`
    - Parse `ALLOWED_ORIGINS` comma list; set `Access-Control-Allow-Origin` only for allowed origins; omit header otherwise
    - Handle preflight `OPTIONS`
    - _Requirements: 12.5_

  - [x] 14.8 Property test CORS allow-origin policy
    - **Property 24: CORS Allow-Origin header is set only for allowed origins**
    - **Validates: Requirements 12.4, 12.5**

  - [x] 14.9 Implement `src/middleware/auth.ts` and `src/middleware/tenant.ts`
    - Skip auth on `/healthz` and `/readyz`
    - Service-Binding trust → use `X-Tenant-ID`
    - Public HTTP: trust `X-Tenant-ID` when `X-Gateway-Signature` verifies HMAC over `tenant_id + request_id` using `GATEWAY_SHARED_SECRET`
    - Otherwise validate JWT HS256 via `hono/jwt`: verify signature, `exp`, `nbf`, presence of `tenant_id` and `jti`
    - Maintain per-isolate revoked-jti cache; reject revoked jtis
    - Build `TenantContext` with timezone (tenant default `Asia/Jakarta`) and roles
    - Reject missing/invalid JWT with 401; missing `tenant_id` with 403
    - _Requirements: 5.1, 11.5, 11.11, 12.1, 12.2, 12.3, 12.4, 12.6, 12.7, 12.12_

  - [x] 14.10 Implement `src/middleware/rate-limit.ts`
    - Use `RATE_LIMITER_WRITE` for write endpoints, `RATE_LIMITER_READ` for GET endpoints, keyed by tenant_id
    - On 429, set `Retry-After`, emit `RATE_LIMIT_EVENTS`
    - _Requirements: 12.8, 12.9_

  - [x] 14.11 Property test rate limit returns 429 with Retry-After
    - **Property 32: Rate limit enforcement returns 429 with Retry-After**
    - **Validates: Requirements 12.7, 12.8, 12.9**

  - [x] 14.12 Implement `src/middleware/shadow-mode.ts`
    - Activate shadow for writes when `SHADOW_MODE=true` OR tenant_id not in `CANARY_TENANT_IDS`
    - GET requests always pass through (never shadowed)
    - For shadowed writes: run validation and response shaping but suppress D1 writes and MWL side effects; respond `202` with `{ status: "shadow", would_respond: {...} }`
    - _Requirements: 13.2, 13.3, 13.6, 13.8, 13.9_

  - [x] 14.13 Property test shadow mode does not mutate state
    - **Property 26: Shadow mode does not mutate state**
    - **Validates: Requirements 13.2, 13.3, 13.6**

  - [x] 14.14 Implement `src/middleware/error-handler.ts`
    - Catch `AppError` subclasses → respond with declared status/code/shape
    - Catch unknown errors → 500 `{ request_id, error: "Internal server error" }`; log full internal stack
    - Ensure `500` body never includes stack traces, paths, or variable state
    - _Requirements: 15.2_

- [x] 15. Route handlers
  - [x] 15.1 Implement `src/routes/health.ts` — `/healthz` and `/readyz`
    - `/healthz` runs `SELECT 1` with 1s timeout; populate `checks.db` and `status` (`ok`/`degraded`); always 200
    - `/readyz` returns 200 only when D1 + JWT_SECRET available; else 503
    - Include service, version (BUILD_VERSION), timestamp, uptime_ms
    - _Requirements: 11.6, 11.7, 11.8, 11.9_

  - [x] 15.2 Property test /healthz degraded state reporting
    - **Property 23: Healthz reports degraded state when D1 is unavailable**
    - **Validates: Requirements 11.7, 11.8**

  - [x] 15.3 Implement `src/routes/accessions.ts` — POST / GET / PATCH / DELETE
    - `POST /api/accessions`: idempotency → tenant config load → counter scope → increment (D1 or DO) → render number OR register external number (no counter increment) → persist via repository → enqueue MWL via `ctx.waitUntil` → respond 201 with `{ id, accession_number, issuer, facility }`
    - `GET /api/accessions/:accession_number`: tenant-scoped, soft-delete aware, uses `DB_READ` unless `X-Consistency: strong`; set `X-D1-Replica` header
    - `GET /api/accessions` list with keyset pagination, filters, and `include_deleted`
    - `PATCH /api/accessions/:accession_number`: allowed fields only; reject immutable fields with 400; write audit in same batch
    - `DELETE /api/accessions/:accession_number?confirm=true`: require admin/data_steward role; soft delete + audit; 204
    - Cross-tenant lookups return 404 and emit `cross_tenant_access_attempt` security event
    - _Requirements: 1.1, 1.3, 1.4, 1.5, 1.6, 5.3, 7.1, 7.2, 7.3, 7.4, 7.5, 7A.1, 7A.2, 7A.3, 7A.4, 7A.5, 7A.6, 7A.7, 7A.8, 9.1, 9.2, 17.1, 17.2, 17.3, 17.4, 17.5, 17.6, 17.8, 17.10, 18.2, 18.3, 18.4, 18.5_

  - [x] 15.4 Property test external accession number is preserved and counter untouched
    - **Property 15: External accession registration preserves the supplied number and does not increment counter**
    - **Property 16: Source field is correctly assigned based on accession origin**
    - **Validates: Requirements 17.2, 17.3, 17.6**

  - [x] 15.5 Implement `src/routes/accessions-legacy.ts` — POST `/accession/create` and `/accession/batch`
    - Share normalization layer with nested-format routes
    - `/accession/create` response shape: `{ id, accession_number, issuer }`
    - _Requirements: 1.2, 10.2, 10.4, 10.6, 10.7, 16.10_

  - [x] 15.6 Implement `src/routes/batch.ts` — POST `/api/accessions/batch`
    - Validate array 1–20, reject duplicate `procedure_code`
    - Group procedures by counter scope, reserve N consecutive sequence numbers per scope in one UPSERT/UPDATE
    - Mix internal-generated and external-supplied numbers per procedure
    - Persist via single `db.batch([...INSERT accessions, INSERT idempotency])`
    - Enqueue one MWL call per accession via `ctx.waitUntil`
    - _Requirements: 16.1, 16.2, 16.3, 16.4, 16.5, 16.6, 16.7, 16.8, 16.9, 16.11, 17.9_

  - [x] 15.7 Property test batch N→N and all-or-nothing
    - **Property 13: Batch generation produces exactly N accessions for N valid procedures**
    - **Property 14: Batch validation is all-or-nothing**
    - **Validates: Requirements 16.3, 16.4, 16.5, 16.8**

  - [x] 15.8 Implement `src/routes/settings.ts` — GET/PUT `/settings/accession_config`
    - Validate pattern, `sequence_digits`, `timezone`, `counter_reset_policy`, `counter_backend`, `useModalityInSeqScope`
    - Reject `sequence_digits` too small for any existing scope counter (409)
    - Reject invalid IANA timezone (400)
    - Do not retroactively update existing accessions
    - _Requirements: 2.1, 2.7, 2.8, 2.9, 2.10, 2.11, 2.12, 2.13, 3A.1_

  - [x] 15.9 Implement `src/routes/admin.ts` — admin-only maintenance endpoints
    - `POST /admin/run-job/:name` to invoke `idempotency_cleanup` or `soft_delete_purge` on demand
    - `POST /admin/revoke-jti` to push a jti into the in-memory revocation cache
    - Require admin role; forbid otherwise
    - _Requirements: 12.12, 19.6_

- [x] 16. Checkpoint
  - Ensure all tests pass, ask the user if questions arise.

- [x] 17. Scheduled jobs
  - [x] 17.1 Implement `src/jobs/idempotency-cleanup.ts`
    - Batch deletes of up to 1000 rows per statement, max 100 batches per run
    - Log start/end with counts and elapsed time; emit Analytics Engine metric `idempotency_cleanup_deleted`
    - _Requirements: 4.8, 4.9, 4.10, 19.4, 19.5_

  - [x] 17.2 Property test scheduled cleanup deletes only expired records
    - **Property 11A: Scheduled idempotency cleanup removes only expired records**
    - **Validates: Requirements 4.8, 4.9**

  - [x] 17.3 Implement `src/jobs/soft-delete-purge.ts`
    - `DELETE FROM accessions WHERE deleted_at IS NOT NULL AND deleted_at < datetime('now', '-30 days')`
    - Same structured job logging + Analytics Engine event
    - _Requirements: 19.3, 19.4, 19.5_

- [x] 18. App wiring and entry point
  - [x] 18.1 Create `src/index.ts` Hono app and Workers entry
    - Apply middleware chain in order: request-id → logger → security-headers → body-size-limit → CORS → auth/tenant → rate-limit → shadow-mode → route → error-handler
    - Mount route modules under their prefixes
    - Export `default { fetch, scheduled }` with `scheduled(event, env, ctx)` dispatching to `idempotency-cleanup` for `0 3 * * *` and `soft-delete-purge` for `0 4 * * 0`
    - Export Durable Object classes `CounterDurableObject`, `CircuitBreakerDurableObject`
    - _Requirements: 11.1, 11.2, 12.1, 13.8, 13.9, 15.1, 19.1, 19.2_

- [x] 19. Data migration tooling
  - [x] 19.1 Implement `scripts/migrate-from-pg.ts`
    - Export accessions from Postgres; import into D1 in fixed batches of 500 using `INSERT OR IGNORE`
    - Export counters; set each D1 counter ≥ max sequence found for its scope
    - Track cumulative failures; log per-failure until threshold 100; abort beyond threshold
    - Output summary report (source total, migrated, failed); verify counter continuity
    - _Requirements: 14.1, 14.2, 14.3, 14.4, 14.5, 14.6, 14.7_

  - [x] 19.2 Unit tests for migration tooling
    - Idempotent re-run, 500-batch sizing, counter max-seed logic, abort threshold
    - _Requirements: 14.1, 14.5, 14.6, 14.7_
    - (note: `migration.property.test.ts` asserts record-preservation properties only; idempotent re-run, batch sizing, counter seeding, and abort threshold are not exercised)

- [x] 20. Integration tests
  - [x] 20.1 `test/integration/api.test.ts` — full request lifecycle
    - Auth happy path, JWT failures, tenant isolation, single-create both endpoints, GET, PATCH, DELETE flow with audit rows
    - _Requirements: 1.1, 1.2, 5.3, 7.1, 7A.4, 10.1, 10.2, 12.1, 12.2_
    - (note: current file is a smoke test — covers `/healthz`, `/readyz`, unauthenticated 401, and Service Binding trust; PATCH/DELETE/audit/tenant-isolation scenarios are not yet asserted)

  - [x] 20.2 `test/integration/batch.test.ts` — batch atomicity
    - Validate all-or-nothing with mid-batch D1 error; consecutive sequences within scope; mixed internal/external
    - _Requirements: 16.3, 16.4, 16.8, 16.11, 17.9_
    - (note: current file covers empty/oversize/duplicate rejection only; all-or-nothing-on-D1-error, consecutive sequence verification, and mixed internal/external flows are not yet asserted)

  - [x] 20.3 `test/integration/shadow-mode.test.ts`
    - SHADOW_MODE global, CANARY_TENANT_IDS cohort routing, GETs never shadowed, no D1 mutation
    - _Requirements: 13.2, 13.3, 13.6, 13.8, 13.9_
    - (note: current file asserts GETs and `/healthz` only; SHADOW_MODE write interception, canary cohort routing, and D1-mutation guards are not yet asserted)

  - [x] 20.4 `test/integration/scheduled-jobs.test.ts`
    - Cron `scheduled()` invocation triggers cleanup and purge; job logs and Analytics events emitted
    - _Requirements: 4.8, 19.1, 19.2, 19.4, 19.5_
    - (note: current file only asserts that job functions exist and are callable; the `scheduled()` dispatch path, job logs, and Analytics Engine emissions are not yet asserted)

- [x] 21. Final checkpoint
  - Ensure all tests pass, ask the user if questions arise.
  - (note: integration test coverage is partial — see task 20.x notes; deeper integration assertions and a full test run are still required)

## Notes

- Tasks marked with `*` are optional and can be skipped for a faster MVP, but they validate the correctness properties defined in the design. Skipping them reduces regression safety.
- Each property sub-task explicitly cites the property number and validated requirement clauses so traceability from acceptance criteria → property → test is preserved.
- Property tests run ≥ 100 iterations using `fast-check` generators defined in the design's Testing Strategy section.
- Checkpoints (tasks 10, 16, 21) are natural boundaries to verify the growing system. The final checkpoint precedes data migration and deployment activities (out of scope for this plan).
- Tasks strictly avoid deployment, UAT, or runbook activities — only code, migrations, and automated tests are listed.

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1", "1.2", "1.3"] },
    { "id": 1, "tasks": ["2.1", "2.2", "2.3", "3.1", "3.3", "3.4", "3.6", "3.8", "3.9", "4.1", "4.2"] },
    { "id": 2, "tasks": ["3.2", "3.5", "3.7", "5.1", "6.1", "6.3", "7.1", "7.4", "7.5", "7.6", "7.7", "8.1", "11.1", "13.1", "14.1", "14.3", "14.5", "14.6", "14.7", "14.14"] },
    { "id": 3, "tasks": ["5.2", "5.3", "5.4", "5.5", "5.6", "6.2", "6.4", "7.2", "7.3", "7.8", "8.2", "9.1", "11.2", "12.1", "14.2", "14.4", "14.8", "14.9", "14.10", "14.12"] },
    { "id": 4, "tasks": ["6.5", "9.2", "9.3", "9.4", "9.5", "12.2", "14.11", "14.13", "15.1", "15.5", "15.6", "15.8", "15.9", "17.1", "17.3", "19.1"] },
    { "id": 5, "tasks": ["15.2", "15.3", "15.7", "17.2", "19.2"] },
    { "id": 6, "tasks": ["15.4", "18.1"] },
    { "id": 7, "tasks": ["20.1", "20.2", "20.3", "20.4"] }
  ]
}
```

## Workflow Completion

This workflow is complete once you review `tasks.md`. To begin implementing the feature, open `.kiro/specs/accession-api-migration/tasks.md` and click "Start task" next to the task you want to execute.
