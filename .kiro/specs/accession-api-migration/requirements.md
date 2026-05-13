# Requirements Document

## Introduction

Migration of the Accession API service from an internal Docker container (Hono/TypeScript + PostgreSQL) to Cloudflare Workers + D1. The service generates unique accession numbers for radiology workflows, stores accession metadata, and optionally triggers MWL (Modality Worklist) creation. This migration must preserve API contract compatibility for existing consumers (order-management, pacs-service) while gaining edge deployment benefits, eliminating single-point-of-failure Docker dependency, and enabling multi-tenant isolation.

## Glossary

- **Accession_Service**: The Cloudflare Worker application that generates and manages accession numbers, replacing the current Docker-based accession-api container
- **D1_Database**: Cloudflare D1 SQLite-compatible database used as the persistence layer for accessions and counters
- **Accession_Number**: A unique identifier generated per radiology examination following a configurable pattern per tenant (default: `{ORG}-{YYYY}{MM}{DD}-{NNNN}`, e.g., `RS01-20250120-0001`)
- **Counter_Scope**: The combination of tenant_id, facility_code, modality (optional, based on `useModalityInSeqScope`), and date_bucket (based on `counter_reset_policy`) that defines the boundary for sequence number generation
- **Idempotency_Key**: A client-supplied unique token used to prevent duplicate accession generation from network retries
- **MWL_Writer**: An internal service that creates DICOM Modality Worklist files from accession data
- **Consumer_Service**: Any service that calls the Accession_Service API (currently order-management and pacs-service)
- **Tenant**: An organizational boundary representing a hospital or facility, identified by tenant_id extracted from JWT claims
- **API_Gateway_Worker**: The existing Cloudflare Worker that handles authentication, routing, and tenant extraction for the platform
- **Tenant_Timezone**: The IANA timezone identifier (e.g., `Asia/Jakarta`) used by a tenant to compute local date boundaries for counter reset; defaults to `Asia/Jakarta` (WIB/UTC+7) if not configured
- **Durable_Object**: A Cloudflare Workers primitive providing strongly-consistent, single-threaded state storage with transactional semantics, used for hot counter scopes that exceed D1's throughput limits
- **UUID_v7**: Time-ordered UUID format (RFC 9562) with a Unix timestamp prefix, providing globally unique identifiers that sort chronologically for improved database index locality

## Requirements

### Requirement 1: Accession Number Generation

**User Story:** As a Consumer_Service, I want to request a new accession number via the Accession_Service, so that each radiology examination receives a globally unique identifier compliant with SATUSEHAT standards.

#### Acceptance Criteria

1. WHEN a valid POST request is received at `/api/accessions`, THE Accession_Service SHALL generate a unique accession number by rendering the tenant's configured format pattern (or the default `{ORG}-{YYYY}{MM}{DD}-{NNNN}` if no custom format is set), and return it with HTTP 201
2. WHEN a valid POST request is received at `/accession/create`, THE Accession_Service SHALL generate a unique accession number by rendering the tenant's configured format pattern (or the default format if no custom format is set), and return it with HTTP 201
3. THE Accession_Service SHALL return the response as a JSON object containing fields `accession_number` (string), `issuer` (string), and `id` (string, UUID v7) for both endpoints
4. WHEN the `issuer` field is generated, THE Accession_Service SHALL format it as `http://sys-ids.kemkes.go.id/acsn/{patient_national_id}|{accession_number}`
5. THE Accession_Service SHALL increment the sequence counter atomically within the Counter_Scope to prevent duplicate accession numbers under concurrent requests
6. IF the sequence counter for a Counter_Scope has reached the maximum value allowed by the tenant's configured `sequence_digits` (10^sequence_digits - 1, default 9999), THEN THE Accession_Service SHALL reject the request with HTTP 409 Conflict and an error message indicating the sequence limit has been exhausted for that scope

### Requirement 2: Configurable Accession Number Format

**User Story:** As a tenant administrator, I want to define a custom accession number format for my organization, so that generated accession numbers comply with my facility's naming conventions and regulatory requirements.

#### Acceptance Criteria

1. THE Accession_Service SHALL read the tenant's accession format configuration from the backend settings store (key: `accession_config`) which contains: `pattern` (string with token placeholders), `counter_reset_policy` (string: "DAILY", "MONTHLY", or "NEVER"), `sequence_digits` (integer: padding length for sequence numbers), and optional `timezone` (IANA timezone identifier, default `Asia/Jakarta`)
2. THE format pattern SHALL support the following token placeholders: `{YYYY}` (4-digit year), `{YY}` (2-digit year), `{MM}` (2-digit month), `{DD}` (2-digit day), `{DOY}` (3-digit day of year), `{HOUR}` (2-digit hour), `{MIN}` (2-digit minute), `{SEC}` (2-digit second), `{MOD}` (modality code), `{ORG}` (tenant org code), `{SITE}` (site/facility code), `{NNN...}` (sequence number where the count of N characters determines padding length), `{SEQn}` (alias for `{N...}` with n digits, e.g., `{SEQ4}` equals `{NNNN}`), and `{RANDn}` (random n-digit number)
3. WHEN `counter_reset_policy` is set to `DAILY`, THE Accession_Service SHALL scope the sequence counter by tenant_id, facility_code, modality (if `useModalityInSeqScope` is true), and date (YYYYMMDD in the tenant's configured Tenant_Timezone), resetting to 1 at local midnight each new day
4. WHEN `counter_reset_policy` is set to `MONTHLY`, THE Accession_Service SHALL scope the sequence counter by tenant_id, facility_code, modality (if applicable), and month (YYYYMM in the tenant's configured Tenant_Timezone), resetting to 1 at local midnight on the first day of each new month
5. WHEN `counter_reset_policy` is set to `NEVER`, THE Accession_Service SHALL scope the sequence counter by tenant_id and facility_code (and modality if applicable) without any date-based reset, using the literal string `ALL` as the date_bucket value
6. WHEN a tenant does not have an `accession_config` setting stored, THE Accession_Service SHALL use the default pattern `{ORG}-{YYYY}{MM}{DD}-{NNNN}` with `counter_reset_policy` = `DAILY`, `sequence_digits` = `4`, and `timezone` = `Asia/Jakarta`
7. THE Accession_Service SHALL validate the format pattern on save to ensure it contains at least one sequence token (`{N+}` or `{SEQn}`) and that the resulting accession number does not exceed 64 characters for any valid input combination
8. IF a format pattern would produce accession numbers exceeding 64 characters, THEN THE Accession_Service SHALL reject the configuration update with HTTP 400 and an error message indicating the maximum length constraint
9. WHEN a tenant updates their format configuration via `PUT /settings/accession_config`, THE Accession_Service SHALL apply the new format only to newly generated accession numbers and SHALL NOT retroactively modify existing accession numbers
10. THE Accession_Service SHALL expose the accession format configuration through the existing settings API endpoints (`GET /settings/accession_config` and `PUT /settings/accession_config`) scoped by the authenticated tenant_id
11. IF the `sequence_digits` value is updated to a value that would cause the maximum sequence number (10^sequence_digits - 1) to be less than the current counter value for any active Counter_Scope, THEN THE Accession_Service SHALL reject the update with HTTP 409 and an error message indicating the padding is too small for existing counters
12. THE Accession_Service SHALL support an optional `useModalityInSeqScope` boolean field in the configuration that, when true, maintains separate sequence counters per modality within the same date scope
13. IF the `timezone` field is provided but is not a valid IANA timezone identifier recognized by the `Intl.DateTimeFormat` API, THEN THE Accession_Service SHALL reject the configuration update with HTTP 400 and an error message indicating the timezone is invalid
14. WHEN rendering date tokens (`{YYYY}`, `{MM}`, `{DD}`, `{DOY}`, `{HOUR}`, `{MIN}`, `{SEC}`), THE Accession_Service SHALL compute the date parts using the tenant's configured Tenant_Timezone, not UTC

### Requirement 3: Atomic Sequence Generation in D1

**User Story:** As a system operator, I want the sequence counter to be atomically incremented without duplicates, so that no two accession numbers collide even under high concurrency.

#### Acceptance Criteria

1. THE Accession_Service SHALL generate the next sequence number within a Counter_Scope using a single atomic D1 statement — either a conditional `UPDATE ... RETURNING` on an existing counter row, or an `INSERT ... ON CONFLICT DO UPDATE ... RETURNING` upsert that atomically creates a counter row with value 1 or increments the existing value
2. IF the atomic increment fails due to a write contention or transaction conflict (D1 error codes indicating busy/locked database), THEN THE Accession_Service SHALL retry the operation up to 3 times with exponential backoff (10ms, 40ms, 160ms) before returning HTTP 409 Conflict; the service SHALL NOT retry on other D1 errors such as network timeouts, schema errors, or generic unavailability
3. THE Accession_Service SHALL scope each counter by the combination of tenant_id, facility_code, modality (if `useModalityInSeqScope` is enabled), and date_bucket (determined by the tenant's `counter_reset_policy`: YYYYMMDD for DAILY, YYYYMM for MONTHLY, or `ALL` for NEVER, computed in the tenant's configured Tenant_Timezone)
4. WHEN a new date_bucket begins based on the tenant's `counter_reset_policy` and local date in Tenant_Timezone, THE Accession_Service SHALL start the sequence from 1 for that Counter_Scope
5. THE Accession_Service SHALL enforce a UNIQUE constraint on `(tenant_id, accession_number)` in the D1_Database to guarantee no duplicates persist
6. WHEN no counter row exists for a given Counter_Scope, THE Accession_Service SHALL atomically INSERT a new counter row with current_value set to 1 and return 1 as the sequence number — new counter scopes SHALL always return the value 1 for the first increment, with no exceptions
7. IF the sequence number exceeds the maximum value allowed by the tenant's configured `sequence_digits` (10^sequence_digits - 1) for a Counter_Scope, THEN THE Accession_Service SHALL reject the request with HTTP 409 Conflict and an error message indicating the sequence limit has been reached
8. THE Accession_Service SHALL persist the accession record and the counter update as a single atomic D1 operation (either via `db.batch([stmt1, stmt2])` or a single combined statement) so that a counter increment without a corresponding accession record cannot occur, and vice versa

### Requirement 3A: Durable Object Fallback for Hot Counter Scopes

**User Story:** As a platform engineer operating a high-throughput tenant, I want hot counter scopes to be handled by a Durable_Object instead of D1 when throughput exceeds D1's write limits, so that the system can scale beyond D1's ~1000 writes/second ceiling while maintaining strong consistency.

#### Acceptance Criteria

1. THE Accession_Service SHALL support an optional `counter_backend` configuration field per tenant with allowed values `D1` (default) or `DURABLE_OBJECT`
2. WHEN `counter_backend` is set to `DURABLE_OBJECT` for a tenant, THE Accession_Service SHALL route sequence generation to a Durable_Object instance keyed by the Counter_Scope hash (SHA-256 of `tenant_id|facility_code|modality|date_bucket`) instead of performing D1 counter operations
3. THE Durable_Object SHALL expose an RPC method `increment(maxValue: number): { value: number, isNew: boolean }` that atomically increments and returns the next sequence number, leveraging Durable Objects' single-threaded consistency guarantees
4. THE Durable_Object SHALL persist the current counter value to its transactional storage after each increment to survive restarts without data loss
5. IF the Durable_Object binding is not configured when `counter_backend` is `DURABLE_OBJECT`, THEN THE Accession_Service SHALL fall back to D1-based counter generation and log a warning; THE Accession_Service SHALL NOT fall back to D1 for other Durable_Object error conditions (unreachable, thrown exception) — such errors SHALL propagate as HTTP 500 to prevent silent inconsistency between hot and cold counter backends
6. THE Accession_Service SHALL still write the accession record to D1 regardless of whether the counter source is D1 or a Durable_Object, preserving the single source of truth for accession lookups

### Requirement 4: Idempotency for Retry Safety

**User Story:** As a Consumer_Service, I want to safely retry failed requests without generating duplicate accession numbers, so that network instability does not corrupt data.

#### Acceptance Criteria

1. WHEN a request includes an `X-Idempotency-Key` header with a value between 1 and 128 characters, THE Accession_Service SHALL look up the idempotency_keys table scoped by tenant_id and the provided key to determine if an accession was already generated
2. IF an accession already exists for the provided Idempotency_Key and tenant_id, THEN THE Accession_Service SHALL return the previously generated accession with HTTP 200 instead of creating a new one
3. IF a request provides an `X-Idempotency-Key` that matches an existing record but the request body differs from the original request's modality or patient_national_id, THEN THE Accession_Service SHALL return HTTP 422 with an error message indicating an idempotency key reuse conflict
4. THE Accession_Service SHALL store idempotency records with a TTL of 24 hours, after which the record is eligible for deletion and the key may be reused
5. WHEN a request does not include an `X-Idempotency-Key` header, THE Accession_Service SHALL proceed with normal generation without idempotency protection
6. IF two concurrent requests arrive with the same `X-Idempotency-Key` and tenant_id, THEN THE Accession_Service SHALL ensure only one accession is created by using a unique constraint on `(tenant_id, key)` in the idempotency_keys table, and the second request SHALL receive the result of the first
7. IF the `X-Idempotency-Key` header is present but empty or exceeds 128 characters, THEN THE Accession_Service SHALL return HTTP 400 with an error message indicating the key length constraint
8. THE Accession_Service SHALL register a Cloudflare Cron Trigger that invokes a scheduled handler at `0 3 * * *` (03:00 UTC daily) to execute `DELETE FROM idempotency_keys WHERE expires_at < CURRENT_TIMESTAMP` so that expired records are physically removed on a predictable schedule
9. THE scheduled cleanup handler SHALL process deletion in batches of no more than 1000 records per D1 statement to stay within D1 CPU time limits, iterating until no expired records remain or a maximum of 100 batches per invocation is reached
10. THE scheduled cleanup handler SHALL log the number of records deleted per invocation as a structured log entry with fields `job: "idempotency_cleanup"`, `deleted_count`, and `elapsed_ms`, and SHALL increment an Analytics Engine metric `idempotency_cleanup_deleted` per invocation

### Requirement 5: Multi-Tenant Isolation

**User Story:** As a platform operator, I want each tenant's accession data to be strictly isolated, so that one hospital cannot access or interfere with another hospital's accession numbers.

#### Acceptance Criteria

1. THE Accession_Service SHALL extract the tenant_id from the authenticated JWT claims on every request except `GET /healthz`
2. THE Accession_Service SHALL include the tenant_id as a mandatory filter in all database operations (INSERT, SELECT, UPDATE, DELETE) against the `accessions` and `accession_counters` tables
3. IF a request references an accession_number that exists in the D1_Database but belongs to a different tenant_id, THEN THE Accession_Service SHALL return HTTP 404 Not Found without revealing that the accession exists under another tenant, AND SHALL emit a structured security event log with fields `event_type: "cross_tenant_access_attempt"`, `requesting_tenant_id`, `accession_number`, `request_id`, and `timestamp` to enable detection of probing behavior
4. THE Accession_Service SHALL include tenant_id in the Counter_Scope so that sequence numbers are independent per tenant
5. THE Accession_Service SHALL create a composite index on `(tenant_id, accession_number)` in the D1_Database for efficient lookups

### Requirement 6: Input Validation

**User Story:** As a Consumer_Service, I want clear validation errors when submitting invalid data, so that integration issues are quickly identified and resolved.

#### Acceptance Criteria

1. WHEN `patient.id` (NIK) is missing or does not consist of exactly 16 numeric characters, THE Accession_Service SHALL return HTTP 400 with a JSON error response containing a `field` identifier and a `message` describing the validation failure
2. WHEN `modality` is missing or not one of the allowed values (CT, MR, CR, DX, US, XA, RF, MG, NM, PT), THE Accession_Service SHALL return HTTP 400 with a JSON error response containing the `field` identifier and a `message` specifying the allowed values
3. WHEN `patient.name` is missing, empty, or contains only whitespace, THE Accession_Service SHALL return HTTP 400 with a JSON error response containing the `field` identifier and a `message` specifying the missing field
4. WHEN `patient.ihs_number` is provided and does not match the pattern `P` followed by exactly 11 numeric characters, THE Accession_Service SHALL return HTTP 400 with a JSON error response containing the `field` identifier and a `message` specifying the format requirement
5. WHEN `birth_date` is provided and is not a valid ISO date (YYYY-MM-DD) or represents a date after the server's current date, THE Accession_Service SHALL return HTTP 400 with a JSON error response containing the `field` identifier and a `message` specifying the date constraint
6. WHEN a request contains multiple validation failures, THE Accession_Service SHALL return all detected validation errors in a single HTTP 400 response as an array of error objects, each containing `field` and `message`
7. WHEN `patient.name` exceeds 200 characters in length, THE Accession_Service SHALL return HTTP 400 with a JSON error response containing the `field` identifier and a `message` specifying the maximum length constraint
8. THE Accession_Service SHALL apply the same validation rules to both `/api/accessions` and `/accession/create` endpoint payloads after normalization to the unified internal representation

### Requirement 7: Accession Lookup and Listing

**User Story:** As a Consumer_Service, I want to retrieve accession details by accession number and list accessions with filtering, so that I can verify and display accession information in downstream workflows.

#### Acceptance Criteria

1. WHEN a GET request is received at `/api/accessions/:accession_number`, THE Accession_Service SHALL return the matching accession record for the authenticated tenant with HTTP 200
2. IF the accession number does not exist for the authenticated tenant, THEN THE Accession_Service SHALL return HTTP 404 Not Found
3. THE Accession_Service SHALL return the accession record including fields: id, accession_number, issuer, facility_code, modality, patient_national_id, patient_name, patient_ihs_number, patient_birth_date, patient_sex, medical_record_number, procedure_code, procedure_name, scheduled_at, note, source, and created_at
4. WHEN a GET request is received at `/api/accessions` (no path parameter), THE Accession_Service SHALL return a paginated list of accession records for the authenticated tenant with HTTP 200, supporting query parameters: `limit` (1-100, default 50), `cursor` (opaque pagination token), `source` (`internal` | `external`), `modality` (any allowed modality value), `patient_national_id` (exact match), `from_date` (ISO 8601 date, inclusive lower bound on `created_at`), and `to_date` (ISO 8601 date, exclusive upper bound on `created_at`)
5. THE list response SHALL be a JSON object containing `items` (array of accession records — an empty array when no records match the filters, never HTTP 404), `next_cursor` (opaque string or null if no more results), and `has_more` (boolean)
6. THE Accession_Service SHALL use keyset pagination based on `(created_at DESC, id DESC)` rather than offset pagination, so that performance remains stable regardless of result set size
7. IF `limit` exceeds 100 or is less than 1, THEN THE Accession_Service SHALL return HTTP 400 with an error message indicating the allowed range
8. IF `cursor` is provided but cannot be decoded as a valid pagination token, THEN THE Accession_Service SHALL return HTTP 400 with an error message indicating the cursor is invalid

### Requirement 7A: Accession Update and Deletion

**User Story:** As a data steward, I want to correct metadata on existing accessions and remove accessions for compliance purposes, so that patient data stays accurate and we can honor deletion requests without purging the entire database.

#### Acceptance Criteria

1. WHEN a PATCH request is received at `/api/accessions/:accession_number`, THE Accession_Service SHALL apply the partial update for the authenticated tenant's accession and return HTTP 200 with the updated record
2. THE PATCH endpoint SHALL accept updates only for the following fields: `patient_name`, `patient_birth_date`, `patient_sex`, `medical_record_number`, `procedure_code`, `procedure_name`, `scheduled_at`, and `note`
3. THE PATCH endpoint SHALL NOT allow updates to `id`, `tenant_id`, `accession_number`, `issuer`, `patient_national_id`, `facility_code`, `modality`, `source`, or `created_at`; IF the request body contains any of these immutable fields, THEN THE Accession_Service SHALL reject the request with HTTP 400 and an error message indicating which fields are immutable
4. THE Accession_Service SHALL record every PATCH operation in an `accession_audit` table with columns: id (TEXT PRIMARY KEY), accession_id (TEXT), tenant_id (TEXT), actor (TEXT - user_id or service), action (TEXT - `UPDATE` or `DELETE`), changes (TEXT - JSON diff), created_at (TEXT); IF audit logging fails (D1 error during the audit INSERT), THEN the entire PATCH operation SHALL fail with HTTP 500 and the primary record SHALL NOT be updated, ensuring every successful mutation has a corresponding audit entry
5. WHEN a DELETE request is received at `/api/accessions/:accession_number` with query parameter `?confirm=true`, THE Accession_Service SHALL perform a soft delete by setting a `deleted_at` timestamp on the accession record and return HTTP 204
6. IF a DELETE request is made without `?confirm=true`, THEN THE Accession_Service SHALL return HTTP 400 with an error message requiring the confirmation parameter
7. THE GET lookup endpoints (`/api/accessions/:accession_number` and `/api/accessions`) SHALL exclude soft-deleted records by default; a query parameter `?include_deleted=true` SHALL include them in the response
8. THE Accession_Service SHALL restrict DELETE operations to authenticated principals with a `role: admin` or `role: data_steward` claim in the JWT; IF the claim is absent, THEN THE Accession_Service SHALL return HTTP 403 Forbidden

### Requirement 8: D1 Schema and Data Model

**User Story:** As a developer, I want a well-defined D1 schema that supports the accession workflow, so that data integrity is maintained and queries are performant.

#### Acceptance Criteria

1. THE D1_Database SHALL contain an `accessions` table with columns: id (TEXT PRIMARY KEY storing a UUID v7), tenant_id (TEXT NOT NULL), accession_number (TEXT NOT NULL), issuer (TEXT), facility_code (TEXT), modality (TEXT NOT NULL), patient_national_id (TEXT NOT NULL), patient_name (TEXT NOT NULL), patient_ihs_number (TEXT), patient_birth_date (TEXT), patient_sex (TEXT), medical_record_number (TEXT), procedure_code (TEXT), procedure_name (TEXT), scheduled_at (TEXT), note (TEXT), source (TEXT NOT NULL DEFAULT 'internal'), created_at (TEXT NOT NULL), deleted_at (TEXT NULL to support soft delete per Requirement 7A.5)
2. THE D1_Database SHALL contain an `accession_counters` table with columns: tenant_id (TEXT NOT NULL), facility_code (TEXT NOT NULL), modality (TEXT NOT NULL DEFAULT ''), date_bucket (TEXT NOT NULL storing the scope period as YYYYMMDD for daily reset, YYYYMM for monthly reset, or 'ALL' for never-reset policy), current_value (INTEGER NOT NULL DEFAULT 0), updated_at (TEXT NOT NULL ISO 8601), PRIMARY KEY (tenant_id, facility_code, modality, date_bucket)
3. THE PRIMARY KEY of `accession_counters` SHALL be the composite `(tenant_id, facility_code, modality, date_bucket)` tuple, eliminating the need for a surrogate INTEGER id and reducing write overhead
4. THE D1_Database SHALL enforce a UNIQUE constraint on `accessions(tenant_id, accession_number)`
5. THE D1_Database SHALL contain an `idempotency_keys` table with columns: key (TEXT NOT NULL), tenant_id (TEXT NOT NULL), accession_id (TEXT NOT NULL), request_hash (TEXT NOT NULL SHA-256 of modality+patient_national_id), created_at (TEXT NOT NULL), expires_at (TEXT NOT NULL storing the expiration timestamp 24 hours after creation in ISO 8601 format), PRIMARY KEY (tenant_id, key)
6. THE D1_Database SHALL define the following indexes to support query patterns: `idx_accessions_tenant_created ON accessions(tenant_id, created_at DESC, id DESC)` for keyset pagination, `idx_accessions_tenant_patient ON accessions(tenant_id, patient_national_id)` for patient lookup, `idx_accessions_tenant_source ON accessions(tenant_id, source, created_at DESC)` for source filtering, and `idx_idempotency_expires ON idempotency_keys(expires_at)` for TTL cleanup
7. THE D1_Database SHALL store the `id` column of the `accessions` table as UUID v7 text format (36 characters including hyphens), which embeds a Unix timestamp prefix for natural chronological ordering and improved index locality in D1/SQLite
8. THE D1_Database SHALL contain a `tenant_settings` table with columns: tenant_id (TEXT NOT NULL), key (TEXT NOT NULL), value (TEXT NOT NULL storing a JSON-encoded string), updated_at (TEXT NOT NULL), PRIMARY KEY (tenant_id, key)
9. THE D1_Database SHALL contain an `accession_audit` table with columns: id (TEXT PRIMARY KEY UUID v7), accession_id (TEXT NOT NULL), tenant_id (TEXT NOT NULL), actor (TEXT NOT NULL), action (TEXT NOT NULL CHECK IN ('UPDATE', 'DELETE')), changes (TEXT NOT NULL JSON diff), created_at (TEXT NOT NULL), and an index `idx_audit_accession ON accession_audit(accession_id, created_at DESC)`
10. ALL D1 migrations SHALL be authored as idempotent SQL files in the `migrations/` directory and applied via `wrangler d1 migrations apply`; the initial migration SHALL be numbered `0001_initial_schema.sql`

### Requirement 9: MWL Writer Integration

**User Story:** As a radiology technologist, I want accession creation to optionally trigger MWL file generation, so that the modality worklist is automatically updated when new examinations are scheduled.

#### Acceptance Criteria

1. WHEN the environment variable `ENABLE_MWL` is set to `true` and an accession is successfully created, THE Accession_Service SHALL send the accession data to the MWL_Writer service as a non-blocking call (using `ctx.waitUntil()`) with a connection timeout of 5 seconds, so that the accession response is not delayed by MWL processing
2. IF the environment variable `ENABLE_MWL` is not set or is set to any value other than `true`, THEN THE Accession_Service SHALL skip the MWL_Writer call entirely and return the accession response without attempting MWL communication
3. IF the MWL_Writer service is unreachable (connection timeout exceeds 5 seconds) or returns a non-2xx HTTP response, THEN THE Accession_Service SHALL log the failure including the accession_number, the error reason, and the MWL_Writer URL attempted, and still return the successful accession response to the caller
4. WHERE a Cloudflare Service Binding named `MWL_WRITER` is configured, THE Accession_Service SHALL use the Service Binding to reach the MWL_Writer; IF no Service Binding is configured, THEN THE Accession_Service SHALL use the URL from the `MWL_WRITER_URL` environment variable
5. THE Accession_Service SHALL include the following fields in the MWL_Writer payload: accession_number, patient_national_id, patient_name, patient_ihs_number, patient_birth_date, patient_sex, modality, procedure_code, procedure_name, and scheduled_at
6. THE Accession_Service SHALL implement a circuit breaker for the MWL_Writer integration that tracks consecutive failures in a Durable_Object keyed by MWL endpoint identifier; WHEN the failure count reaches 5 within a 60-second window, THE circuit SHALL open and subsequent MWL calls SHALL be skipped for 30 seconds without attempting network communication
7. WHEN the circuit is open and a new MWL call is requested, THE Accession_Service SHALL log a `circuit_open` warning with the current open-until timestamp and SHALL NOT count the skipped call as a new failure
8. WHEN the 30-second open period elapses, THE circuit SHALL enter a half-open state in which the next MWL call is attempted; IF that call succeeds, THEN THE circuit SHALL close and reset the failure counter; IF that call fails, THEN THE circuit SHALL reopen for another 30 seconds
9. THE Accession_Service SHALL include a `X-Request-ID` header in MWL_Writer calls, propagated from the originating accession request, to enable end-to-end trace correlation
10. THE Accession_Service SHALL implement retry with exponential backoff (up to 2 retries with 200ms and 800ms delays) for MWL calls that fail with 5xx responses or network errors, but SHALL NOT retry on 4xx client errors

### Requirement 10: API Contract Compatibility

**User Story:** As a platform engineer, I want both legacy endpoint formats to remain functional during migration, so that existing Consumer_Services continue working without code changes.

#### Acceptance Criteria

1. THE Accession_Service SHALL accept POST requests at `/api/accessions` with the nested patient object format containing `patient.id`, `patient.name`, `patient.ihs_number`, along with top-level fields `modality`, `procedure_code`, `procedure_name`, `facility_code`, `scheduled_at`, and `note`
2. THE Accession_Service SHALL accept POST requests at `/accession/create` with the flat field format containing `patient_national_id`, `patient_name`, `gender`, `birth_date`, along with `modality`, `procedure_code`, `procedure_name`, `facility_code`, `scheduled_at`, `medical_record_number`, and `note`
3. WHEN a POST request is received at either endpoint, THE Accession_Service SHALL map both payload formats to produce an equivalent accession record in the D1_Database regardless of which endpoint was used
4. WHEN a successful accession is created via `/accession/create`, THE Accession_Service SHALL return HTTP 201 with a response body containing the fields `id`, `accession_number`, and `issuer`
5. WHEN a successful accession is created via `/api/accessions`, THE Accession_Service SHALL return HTTP 201 with a response body containing the fields `id`, `accession_number`, `issuer`, and `facility`
6. IF a POST request body does not match the expected format for the target endpoint, THEN THE Accession_Service SHALL return HTTP 400 with an error message indicating which required fields are missing or malformed
7. THE Accession_Service SHALL map `patient.id` from the nested format to `patient_national_id` in the flat format, `patient.name` to `patient_name`, `patient.ihs_number` to `patient_ihs_number`, and `patient.sex` to `gender` when normalizing between formats

### Requirement 11: Worker Runtime and Configuration

**User Story:** As a DevOps engineer, I want the Worker to be properly configured with D1 bindings and environment variables, so that deployment is reproducible and environment-specific settings are managed correctly.

#### Acceptance Criteria

1. THE Accession_Service SHALL be deployed as a Cloudflare Worker using the Hono framework for routing with `nodejs_compat` compatibility flag enabled and a `compatibility_date` no older than `2025-01-01`
2. THE Accession_Service SHALL declare its configuration in `wrangler.jsonc` (JSON with comments format, Cloudflare's current recommended format as of 2025) with D1 database bindings for both production and preview environments, each referencing a separate D1 database instance
3. THE Accession_Service SHALL read non-sensitive configuration from `[vars]` in `wrangler.jsonc`: `ENABLE_MWL` (boolean string, default `"false"`), `MWL_WRITER_URL` (string, optional), `FACILITY_CODE` (string), `ALLOWED_ORIGINS` (comma-separated string, optional)
4. THE Accession_Service SHALL read sensitive configuration from Cloudflare secrets (set via `wrangler secret put`) rather than `[vars]`: `JWT_SECRET` (required), `GATEWAY_SHARED_SECRET` (optional), and `POSTGRES_MIGRATION_URL` (optional, used only by migration scripts)
5. IF the required secret `JWT_SECRET` is not set when the Worker starts processing a non-healthz request, THEN THE Accession_Service SHALL return HTTP 500 with an error indicating missing configuration and log the missing secret name
6. WHEN a GET request is received at `/healthz`, THE Accession_Service SHALL return HTTP 200 with a JSON body containing: `status` (string: "ok" | "degraded"), `service` (string: "accession-worker"), `version` (string: build commit SHA or semver), `timestamp` (ISO 8601), `checks` (object with at minimum `db` field), and `uptime_ms` (number since cold start)
7. THE `/healthz` endpoint SHALL perform a lightweight D1 probe (e.g., `SELECT 1`) with a 1-second timeout and populate `checks.db` with `{ status: "ok" | "error", latency_ms: number, error?: string }`
8. IF the D1 probe fails (timeout, error, or binding missing), THEN THE Accession_Service SHALL return HTTP 200 with top-level `status` set to `degraded`, ensuring healthcheck endpoints remain reachable for monitoring even when D1 is unavailable
9. THE Accession_Service SHALL expose `/readyz` in addition to `/healthz`, where `/readyz` returns HTTP 200 only when all critical dependencies (D1, JWT_SECRET presence) are fully operational, and HTTP 503 otherwise — suitable for Kubernetes/load-balancer readiness probes
10. THE Accession_Service SHALL be published via `wrangler deploy` with `[observability]` enabled so that logs, traces, and invocation metrics are captured in the Cloudflare dashboard
11. THE Accession_Service SHALL use JWT HS256 (HMAC-SHA256) as the JWT algorithm for compatibility with the existing API_Gateway_Worker; WHEN the JWT header specifies any other algorithm, THE Accession_Service SHALL reject the token with HTTP 401
12. THE Accession_Service SHALL declare all dependencies (including the chosen UUID v7 library and input validation library) in `package.json` with pinned versions to ensure reproducible builds

### Requirement 12: Security and Access Control

**User Story:** As a security engineer, I want the Accession_Service to validate authentication and enforce tenant boundaries, so that unauthorized access is prevented.

#### Acceptance Criteria

1. WHEN a request is received at any endpoint except `GET /healthz` and `GET /readyz`, THE Accession_Service SHALL require a JWT token to be present in the `Authorization: Bearer <token>` header; IF no token is provided, THEN the request SHALL be rejected with HTTP 401 before any other processing
2. WHEN a JWT token is present, THE Accession_Service SHALL validate it by verifying the HS256 signature against the configured `JWT_SECRET`, confirming the token is not expired (`exp` claim), confirming the token is not used before its `nbf` (not-before) claim if present, and confirming the token is well-formed
3. IF the JWT token is missing, malformed, has an invalid signature, is expired, is before `nbf`, or uses any algorithm other than HS256, THEN THE Accession_Service SHALL return HTTP 401 Unauthorized with an error message indicating the authentication failure reason
4. IF the JWT token does not contain a `tenant_id` claim or the claim is an empty string, THEN THE Accession_Service SHALL return HTTP 403 Forbidden with an error message indicating the missing tenant context
5. THE Accession_Service SHALL include CORS response headers that restrict access to origins defined in the `ALLOWED_ORIGINS` environment variable (comma-separated list) and SHALL omit the `Access-Control-Allow-Origin` header for requests from non-configured origins; IF `ALLOWED_ORIGINS` is unset, THEN CORS SHALL be disabled (no origin allowed)
6. WHERE the Accession_Service is accessed via the API_Gateway_Worker through a Service Binding, THE Accession_Service SHALL trust the binding identity by default and extract the tenant_id from the `X-Tenant-ID` header without performing JWT validation; WHERE the service is accessed directly via public HTTP (no Service Binding), THE Accession_Service SHALL perform full JWT validation
7. WHERE the Accession_Service is accessed via public HTTP, IF a request contains an `X-Tenant-ID` header AND a valid `X-Gateway-Signature` header (HMAC-SHA256 of `X-Tenant-ID + X-Request-ID` using `GATEWAY_SHARED_SECRET`), THEN THE Accession_Service SHALL trust the header and skip JWT validation; OTHERWISE THE Accession_Service SHALL ignore `X-Tenant-ID` and fall back to JWT-based tenant extraction
8. THE Accession_Service SHALL apply Cloudflare Rate Limiting Rules (configured per zone in `wrangler.jsonc` or via dashboard) with the following limits per tenant_id: 100 requests per 10 seconds for accession-creating endpoints (`POST /api/accessions*`, `POST /accession/*`), and 500 requests per 10 seconds for read endpoints (`GET /api/accessions*`)
9. WHEN a tenant exceeds the rate limit, THE Accession_Service SHALL return HTTP 429 Too Many Requests with a `Retry-After` response header indicating the number of seconds until the window resets
10. THE Accession_Service SHALL enforce the following security response headers on every response: `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Strict-Transport-Security: max-age=63072000; includeSubDomains`, and `Referrer-Policy: no-referrer`
11. THE Accession_Service SHALL reject any request body exceeding 1 MB with HTTP 413 Payload Too Large to prevent resource-exhaustion attacks via large payloads
12. THE Accession_Service SHALL enforce that each JWT contains a `jti` (JWT ID) claim and SHALL maintain an in-memory revocation cache (per isolate) keyed by `jti`; IF a `jti` has been revoked via the admin `/admin/revoke-jti` endpoint, THEN THE Accession_Service SHALL treat authentication as invalid and reject the token with HTTP 401, regardless of signature validity or other authentication state

### Requirement 13: Gradual Migration Strategy

**User Story:** As a platform engineer, I want to migrate consumers gradually from the old Docker service to the new Worker, so that risk is minimized and rollback is possible at each stage.

#### Acceptance Criteria

1. THE Accession_Service SHALL be deployable alongside the existing Docker-based accession-api on separate URL endpoints such that both services can receive requests independently without shared mutable state or port conflicts
2. WHEN the environment variable `SHADOW_MODE` is set to `true`, THE Accession_Service SHALL process a copy of each incoming write request for validation purposes, log the response it would produce, and discard the result without persisting any data to the D1_Database or triggering MWL_Writer side effects
3. WHILE `SHADOW_MODE` is set to `true`, THE Accession_Service SHALL respond to the client with HTTP 202 Accepted and a response body `{ status: "shadow", would_respond: { ...original response shape } }` so that consumers can distinguish shadow responses from real responses while still receiving the expected payload shape for testing
4. WHEN a Consumer_Service switches its `ACCESSION_API_URL` to the Worker endpoint, THE Accession_Service SHALL handle the traffic without requiring changes to the consumer's request format as long as the request conforms to one of the documented formats (nested `/api/accessions` or flat `/accession/create`); IF the request body does not match either documented format, THEN the service SHALL return HTTP 400 with a clear error message identifying the expected format — the service SHALL NOT attempt graceful handling or format inference for unknown structures
5. WHILE the environment variable `MIGRATION_AUDIT_LOG` is set to `true`, THE Accession_Service SHALL log each request and response including: timestamp, endpoint path, tenant_id, request body (with sensitive fields redacted per Requirement 15.7), response body, and response status for audit comparison with the old service
6. WHILE `SHADOW_MODE` is set to `true`, THE Accession_Service SHALL NOT increment accession counters, SHALL NOT write records to the `accessions` table, and SHALL NOT write records to the `idempotency_keys` table, ensuring shadow processing does not affect production data integrity
7. IF a Consumer_Service reverts its `ACCESSION_API_URL` to the Docker-based endpoint after switching to the Worker, THEN THE Accession_Service SHALL continue operating without requiring cleanup or state reconciliation for the rollback to succeed
8. THE Accession_Service SHALL support partial rollout via a `CANARY_TENANT_IDS` environment variable (comma-separated tenant_id list); WHEN set, only the listed tenant_ids SHALL receive real processing, and all other tenant_ids SHALL be automatically routed through shadow mode regardless of the global `SHADOW_MODE` setting
9. WHEN `SHADOW_MODE` applies to a GET request OR when both `SHADOW_MODE=true` and `CANARY_TENANT_IDS` are simultaneously configured, THE Accession_Service SHALL guarantee that GET requests are NEVER routed through shadow mode under any combination of migration settings — read requests are always processed normally so consumers can verify data during shadow-mode write testing

### Requirement 14: Data Migration from PostgreSQL

**User Story:** As a database administrator, I want to migrate existing accession data from PostgreSQL to D1, so that historical records are preserved and counter continuity is maintained.

#### Acceptance Criteria

1. THE migration tooling SHALL export all existing accession records from PostgreSQL and import them into the D1_Database `accessions` table using a fixed batch size of exactly 500 records per D1 transaction (the final batch may be smaller if the total count is not divisible by 500)
2. THE migration tooling SHALL export current counter values from PostgreSQL `accession_counters` and set the corresponding D1_Database counter rows to values equal to or greater than the maximum sequence number found in the migrated accession records for each Counter_Scope
3. THE migration tooling SHALL validate that the count of migrated records matches the source count and output a summary report listing total source records, successfully migrated records, and failed records
4. IF a record fails to import while the migration is still active and the cumulative failure count is below the abort threshold (100), THEN THE migration tooling SHALL log the failure with the record identifier and error reason, and continue processing remaining records; once the abort threshold has been reached, the tool SHALL stop logging new failures and halt processing per item 5
5. IF the cumulative number of failed records exceeds 100, THEN THE migration tooling SHALL abort the migration and report the total failures and last error encountered
6. THE migration tooling SHALL be idempotent by using INSERT OR IGNORE (or equivalent conflict resolution on the UNIQUE constraint `tenant_id, accession_number`) so that re-running the migration does not create duplicate records
7. WHEN the migration completes successfully, THE migration tooling SHALL verify counter continuity by confirming that each D1_Database counter value is greater than or equal to the highest sequence number present in the migrated accession records for that Counter_Scope

### Requirement 15: Observability and Error Handling

**User Story:** As an operations engineer, I want comprehensive logging, metrics, and error handling, so that issues in production can be quickly diagnosed and resolved without exposing sensitive data.

#### Acceptance Criteria

1. THE Accession_Service SHALL log each request (excluding `GET /healthz` and `GET /readyz`) as a structured JSON object via `console.log` containing: timestamp (ISO 8601), endpoint, HTTP method, tenant_id, modality (if applicable), response status code, response time in milliseconds, log level (info, warn, error), the `X-Request-ID` correlation value, and a `service` field set to `"accession-worker"`
2. IF an unexpected error occurs during processing, THEN THE Accession_Service SHALL return HTTP 500 with a JSON response body containing only a `request_id` field and an `error` field with a generic error message, without exposing stack traces, internal paths, or variable values, AND SHALL log the full error details internally including error name, message, stack trace, and the originating request context
3. THE Accession_Service SHALL emit all log entries as structured JSON objects via `console.log` compatible with Cloudflare Workers Logs (accessible via `wrangler tail` and the Logs dashboard)
4. WHEN an incoming request includes an `X-Request-ID` header with a value matching the UUID format (v4 or v7), THE Accession_Service SHALL propagate that value as the correlation ID in all log entries and in the `X-Request-ID` response header
5. WHEN an incoming request does not include an `X-Request-ID` header (or the header is malformed), THE Accession_Service SHALL generate a new UUID v7 value and use it as the correlation ID in all log entries and in the `X-Request-ID` response header
6. THE Accession_Service SHALL include a `level` field in each log entry with value `info` for successful requests (2xx/3xx), `warn` for client errors (4xx except 429 which is `info`), and `error` for server errors (5xx)
7. THE Accession_Service SHALL redact the following fields from any logged request/response body: `patient_national_id` (show only last 4 digits as `****1234`), `patient_ihs_number` (show only first 2 chars as `P***********`), and any field named `password`, `token`, or `secret`; applied recursively through nested objects
8. THE Accession_Service SHALL emit business metrics to Cloudflare Analytics Engine (dataset name: `accession_metrics`) for each accession creation event with blobs `[tenant_id, facility_code, modality, source]`, doubles `[response_time_ms]`, and indexes `[status_code_group]` where status_code_group is `2xx`, `4xx`, or `5xx`
9. THE Accession_Service SHALL emit business metrics to Analytics Engine for rate-limit events (dataset: `rate_limit_events`), circuit breaker state changes (dataset: `circuit_events`), and scheduled job executions (dataset: `job_runs`)
10. THE Accession_Service SHALL support log sampling via the `LOG_SAMPLE_RATE` environment variable (float 0.0–1.0, default 1.0); WHEN the value is less than 1.0, successful `info`-level logs SHALL be sampled at that rate while `warn` and `error` logs SHALL always be emitted in full
11. THE Accession_Service SHALL emit a `slow_request` warning log when any request exceeds a 2-second wall-clock duration, including the endpoint, tenant_id, elapsed_ms, and a breakdown of major phases (validation_ms, db_ms, external_ms) to enable performance regression detection

### Requirement 16: Batch Accession Generation for Multi-Procedure Orders

**User Story:** As a Consumer_Service handling multi-procedure radiology orders, I want to generate multiple accession numbers in a single API call, so that network round-trips are minimized and all procedures in an order receive their accession numbers atomically.

#### Acceptance Criteria

1. THE Accession_Service SHALL expose a POST endpoint at `/api/accessions/batch` that accepts a JSON body containing a `procedures` array (1 to 20 items) and shared patient data fields (`patient_national_id`, `patient_name`, `gender`, `birth_date`, `medical_record_number`, `ihs_number`)
2. EACH item in the `procedures` array SHALL contain at minimum: `modality` (required), `procedure_code` (required), `procedure_name` (required), and optionally `scheduled_at`, `facility_code`, and `note`
3. WHEN a valid batch request is received, THE Accession_Service SHALL generate one unique accession number per procedure item, each following the tenant's configured format pattern, and return HTTP 201 with a JSON response containing an `accessions` array of objects each with `id`, `accession_number`, `issuer`, `modality`, and `procedure_code`
4. THE Accession_Service SHALL generate all accession numbers within a single D1 `batch()` execution (`db.batch([...statements])`) to ensure atomicity — the batch is executed as one unit so that either all statements commit together or none do, preventing partial writes
5. IF any individual procedure in the batch fails validation OR if the batch contains duplicate `procedure_code` values within the same request (business-level constraint), THEN THE Accession_Service SHALL return HTTP 400 with an `errors` array indicating which procedure index failed and why, without generating any accession numbers for the batch
6. IF the `procedures` array is empty or contains more than 20 items, THEN THE Accession_Service SHALL return HTTP 400 with an error message indicating the batch size constraint (minimum 1, maximum 20)
7. WHEN the batch request includes an `X-Idempotency-Key` header, THE Accession_Service SHALL apply idempotency to the entire batch as a unit — returning all previously generated accessions if the key matches a prior successful batch
8. THE Accession_Service SHALL increment the sequence counter atomically for each procedure in the batch, ensuring consecutive sequence numbers within the same Counter_Scope when multiple procedures share the same modality; when multiple procedures map to the same Counter_Scope, the counter SHALL be pre-allocated by a single `UPDATE ... SET current_value = current_value + N RETURNING current_value` so that the batch reserves all N sequence numbers atomically rather than performing N separate increments
9. WHEN `ENABLE_MWL` is `true`, THE Accession_Service SHALL trigger MWL_Writer for each generated accession in the batch as non-blocking calls after the batch response is committed, using `ctx.waitUntil()` to continue MWL delivery beyond the response lifecycle
10. THE Accession_Service SHALL also accept the batch endpoint at `/accession/batch` with the flat field format for backward compatibility with order-management consumers
11. IF the `db.batch()` execution fails after the first statement commits (e.g., D1 error mid-batch), THEN THE Accession_Service SHALL return HTTP 500 with a compensating-action log entry describing the partial state, since D1 batch guarantees atomicity at the API level but the implementation must handle the rare case of underlying storage errors

### Requirement 17: External Accession Number Registration (SIMRS-Supplied)

**User Story:** As a Consumer_Service integrating with an external SIMRS, I want to register an accession number that was already generated by the SIMRS, so that the system maintains a single source of truth for all accession numbers regardless of origin.

#### Acceptance Criteria

1. THE Accession_Service SHALL accept a POST request at `/api/accessions` and `/accession/create` with an explicit `accession_number` field in the request body, indicating the number was pre-generated externally (e.g., by SIMRS)
2. WHEN the request body contains a non-empty `accession_number` field, THE Accession_Service SHALL store that value directly without generating a new one, and SHALL set the `source` column to `external`
3. WHEN the request body does NOT contain an `accession_number` field (or it is null/empty), THE Accession_Service SHALL auto-generate a new accession number using the tenant's configured format pattern, and SHALL set the `source` column to `internal`
4. THE Accession_Service SHALL still generate the `issuer` field in SATUSEHAT format (`http://sys-ids.kemkes.go.id/acsn/{patient_national_id}|{accession_number}`) regardless of whether the accession number was externally supplied or internally generated
5. THE Accession_Service SHALL enforce the UNIQUE constraint on `(tenant_id, accession_number)` for both external and internal accession numbers — IF a duplicate is detected, THEN THE Accession_Service SHALL return HTTP 409 Conflict with an error message indicating the accession number already exists
6. THE Accession_Service SHALL NOT increment the sequence counter when registering an externally-supplied accession number, since the number was not generated by the internal sequence
7. THE Accession_Service SHALL validate externally-supplied accession numbers to ensure they are non-empty, do not exceed 64 characters, and contain only printable ASCII characters (no control characters or whitespace-only values)
8. THE Accession_Service SHALL include the `source` field (`internal` or `external`) in the response body when returning accession details via GET endpoints, so consumers can distinguish the origin
9. WHEN a batch request (`/api/accessions/batch`) contains procedures where some have pre-supplied `accession_number` values and others do not, THE Accession_Service SHALL handle each procedure independently — registering external numbers as-is and generating internal numbers for the rest, all within the same transaction
10. THE Accession_Service SHALL support filtering accessions by `source` in future list/search endpoints via query parameter `?source=internal` or `?source=external`

### Requirement 18: D1 Read Replica Usage for Lookup Endpoints

**User Story:** As a platform engineer, I want read-only lookup endpoints to serve traffic from D1 read replicas, so that global read latency is minimized and primary-region write capacity is preserved for critical accession generation.

#### Acceptance Criteria

1. THE Accession_Service SHALL declare a D1 binding with `experimental_remote = true` (or the currently recommended read-replica flag per Cloudflare D1 documentation) such that GET endpoints can opt into serving reads from the nearest available replica
2. WHEN a GET request is received at `/api/accessions/:accession_number` or `/api/accessions` (list), THE Accession_Service SHALL execute the query using the `DB_READ` binding that routes to read replicas when available, regardless of whether the same request context previously performed a write operation — write-then-read consistency within a single request SHALL use the `X-Consistency: strong` header rather than implicit primary routing
3. WHEN a POST/PATCH/DELETE request is received OR a GET request contains the header `X-Consistency: strong`, THE Accession_Service SHALL execute the query using the `DB` primary binding to avoid replica lag
4. THE Accession_Service SHALL include a response header `X-D1-Replica: true|false` indicating whether the query was served from a replica, enabling client-side observability of replica usage
5. IF the `DB_READ` binding is unavailable (not configured), THEN THE Accession_Service SHALL transparently fall back to the `DB` primary binding for read queries without emitting an error to the client
6. THE Accession_Service SHALL document the expected replica lag tolerance in operational runbooks — typically under 1 second — and shall configure clients that require read-after-write consistency to use the `X-Consistency: strong` header

### Requirement 19: Cron-Triggered Scheduled Jobs

**User Story:** As an operations engineer, I want scheduled maintenance jobs (idempotency cleanup, soft-delete purge) to run automatically without operator intervention, so that data hygiene is maintained consistently.

#### Acceptance Criteria

1. THE Accession_Service SHALL declare Cron Triggers in `wrangler.jsonc` under the `triggers.crons` array with at least two schedules: `0 3 * * *` (daily 03:00 UTC) for idempotency cleanup, and `0 4 * * 0` (weekly Sunday 04:00 UTC) for soft-delete purge
2. THE Accession_Service SHALL implement a `scheduled(event, env, ctx)` handler that routes to the correct job based on `event.cron`, invoking `idempotencyCleanupJob(env)` for `0 3 * * *` and `softDeletePurgeJob(env)` for `0 4 * * 0`
3. THE `softDeletePurgeJob` SHALL execute `DELETE FROM accessions WHERE deleted_at IS NOT NULL AND deleted_at < datetime('now', '-30 days')` to physically purge accessions that have been soft-deleted for more than 30 days
4. EACH scheduled job SHALL emit a log entry at the start (`job_started`) and end (`job_completed`) with fields `job_name`, `cron_expression`, `started_at`, `completed_at`, `duration_ms`, and `records_affected`
5. IF a scheduled job fails with an exception, THEN THE Accession_Service SHALL log the failure with full error context and emit an Analytics Engine event to `job_runs` with `status: "error"`, so that operators can set up alerting on failed jobs
6. THE Accession_Service SHALL provide a manually-invokable endpoint `POST /admin/run-job/:job_name` (admin-authenticated) that triggers the same scheduled job on demand, enabling operators to run cleanup outside the normal schedule
