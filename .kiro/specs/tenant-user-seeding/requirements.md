# Requirements Document

## Introduction

Event-driven tenant user seeding system for the Imagestro multi-tenant PACS platform. When a new tenant (hospital) is provisioned via the pacs-service, a Cloudflare Worker asynchronously creates a set of default users for that tenant by calling the auth-service API. This decouples user seeding from the tenant creation flow, ensuring tenant provisioning remains fast and non-blocking.

## Glossary

- **Tenant_Seeding_Worker**: A Cloudflare Worker responsible for receiving tenant creation events and orchestrating default user creation via the auth-service API
- **Auth_Service**: The Flask-based authentication service that manages user CRUD operations, accessible at `http://auth-service:5000` via VPC tunnel
- **Pacs_Service**: The FastAPI-based service that handles tenant CRUD operations
- **API_Gateway**: The Cloudflare Worker (Hono/TypeScript) that routes requests to backend services via VPC tunnel
- **Tenant_Created_Event**: A structured message containing tenant metadata, emitted after successful tenant creation
- **Default_User_Set**: The predefined collection of users to be created for each new tenant, consisting of roles: TENANT_ADMIN, DOCTOR, RADIOLOGIST, TECHNICIAN, CLERK, NURSE
- **Seeding_Status**: The tracking state of a user seeding operation (pending, in_progress, completed, failed, partial)
- **VPC_Tunnel**: The Cloudflare network tunnel (BACKBONE binding, tunnel_id: 5c496701-6046-410a-a870-f20f096c65e4) connecting Workers to backend services

## Requirements

### Requirement 1: Event Emission on Tenant Creation

**User Story:** As a platform operator, I want the system to emit an event when a new tenant is created, so that downstream processes can react asynchronously without blocking tenant provisioning.

#### Acceptance Criteria

1. WHEN a tenant is successfully created via `POST /api/tenants` (after database commit), THE Pacs_Service SHALL send an HTTP POST request containing a JSON Tenant_Created_Event to the configured webhook URL with the following fields: tenant ID, tenant code, tenant name, and tenant email
2. THE Pacs_Service SHALL send the webhook request with a timeout of 5 seconds and SHALL NOT block the tenant creation API response while awaiting the webhook outcome
3. IF the Tenant_Created_Event emission fails due to a connection error, non-2xx response, or timeout, THEN THE Pacs_Service SHALL log the failure at WARNING level including the tenant ID and error reason, and continue returning the successful tenant creation response to the caller
4. THE Tenant_Created_Event SHALL include a timestamp in ISO 8601 format (UTC) indicating when the event was produced, and a unique event ID in UUID v4 format for traceability

### Requirement 2: Event Consumption and Processing

**User Story:** As a platform operator, I want a dedicated worker to consume tenant creation events, so that default users are created without manual intervention.

#### Acceptance Criteria

1. WHEN the Tenant_Seeding_Worker receives a Tenant_Created_Event via HTTP POST, THE Tenant_Seeding_Worker SHALL validate the event payload contains tenant_id (non-empty string), tenant_code (non-empty string), tenant_name (non-empty string, maximum 255 characters), and tenant_email (non-empty string in valid email format)
2. IF the event payload is invalid or missing required fields, THEN THE Tenant_Seeding_Worker SHALL log the validation error, discard the event without retrying, and return an HTTP 400 response indicating the validation failure reason
3. WHEN a valid Tenant_Created_Event is received, THE Tenant_Seeding_Worker SHALL initiate the default user creation process within 5 seconds of event receipt and return an HTTP 202 response to acknowledge receipt
4. THE Tenant_Seeding_Worker SHALL process events idempotently using tenant_id as the deduplication key, ensuring that receiving the same event multiple times does not create duplicate users
5. IF the KV store is unavailable during idempotency check or status update, THEN THE Tenant_Seeding_Worker SHALL return an HTTP 500 response, allowing the event sender to retry delivery

### Requirement 3: Default User Creation

**User Story:** As a hospital administrator, I want default users pre-created when my hospital is onboarded, so that staff can start using the system immediately.

#### Acceptance Criteria

1. WHEN processing a Tenant_Created_Event, THE Tenant_Seeding_Worker SHALL create the following default users by calling the Auth_Service `POST /auth/users` endpoint:
   - username `admin.{tenant_code}`, email `admin@{tenant_code}.local` with role TENANT_ADMIN and full_name "Admin {tenant_name}"
   - username `dokter.{tenant_code}`, email `dokter@{tenant_code}.local` with role DOCTOR and full_name "Dokter {tenant_name}"
   - username `radiolog.{tenant_code}`, email `radiolog@{tenant_code}.local` with role RADIOLOGIST and full_name "Radiolog {tenant_name}"
   - username `teknisi.{tenant_code}`, email `teknisi@{tenant_code}.local` with role TECHNICIAN and full_name "Teknisi {tenant_name}"
   - username `clerk.{tenant_code}`, email `clerk@{tenant_code}.local` with role CLERK and full_name "Clerk {tenant_name}"
   - username `perawat.{tenant_code}`, email `perawat@{tenant_code}.local` with role NURSE and full_name "Perawat {tenant_name}"
2. THE Tenant_Seeding_Worker SHALL assign each default user a generated password of at least 12 characters containing at least one uppercase letter, one lowercase letter, one digit, and one special character
3. THE Tenant_Seeding_Worker SHALL set the `tenant_id` field for each created user to the tenant ID from the event
4. THE Tenant_Seeding_Worker SHALL set `is_active` to true for all default users
5. WHEN a user creation call returns a 409 conflict (username or email already exists), THE Tenant_Seeding_Worker SHALL treat the user as successfully handled and continue creating the remaining users
6. THE Tenant_Seeding_Worker SHALL lowercase the tenant_code before using it in email and username generation

### Requirement 4: Authentication for Service-to-Service Calls

**User Story:** As a platform architect, I want the seeding worker to authenticate securely with the auth-service, so that only authorized systems can create users.

#### Acceptance Criteria

1. WHEN calling the Auth_Service API, THE Tenant_Seeding_Worker SHALL include a valid JWT token with SUPERADMIN-level permissions in the Authorization header using the Bearer scheme
2. THE Tenant_Seeding_Worker SHALL obtain the JWT token by calling the Auth_Service login endpoint (`POST /auth/login`) with dedicated service credentials stored as Worker secrets (SEED_SERVICE_USERNAME, SEED_SERVICE_PASSWORD)
3. IF the JWT token is expired or rejected by the Auth_Service with an authentication error, THEN THE Tenant_Seeding_Worker SHALL re-authenticate by calling the login endpoint and retry the user creation request, up to a maximum of 3 re-authentication attempts per seeding operation
4. IF the Auth_Service login endpoint rejects the service credentials or is unreachable after 3 attempts, THEN THE Tenant_Seeding_Worker SHALL abort the seeding operation and report an authentication failure error indicating the cause

### Requirement 5: Error Handling and Retry Logic

**User Story:** As a platform operator, I want the seeding process to handle failures gracefully, so that transient errors do not prevent user creation.

#### Acceptance Criteria

1. IF a user creation API call fails with a 5xx status code or a network timeout (no response received within 10 seconds), THEN THE Tenant_Seeding_Worker SHALL retry the call up to 3 times with exponential backoff (1s, 2s, 4s delays)
2. IF all retry attempts for a single user fail, THEN THE Tenant_Seeding_Worker SHALL log the failure with tenant_id, username, and error details, and continue creating the remaining users
3. WHEN all user creation attempts for a tenant are completed, THE Tenant_Seeding_Worker SHALL record the final Seeding_Status as completed (all succeeded), partial (some failed), or failed (all failed)
4. IF the Auth_Service is unreachable via VPC tunnel, THEN THE Tenant_Seeding_Worker SHALL retry the entire seeding operation up to 3 times with exponential backoff (5s, 10s, 20s delays), skipping users that were already successfully created in prior attempts, before marking the status as failed
5. IF a user creation API call fails with a 4xx status code other than 409, THEN THE Tenant_Seeding_Worker SHALL NOT retry the call and SHALL treat the user as permanently failed and log the failure with tenant_id, username, and error details
6. IF a user creation API call returns a 409 Conflict status code, THEN THE Tenant_Seeding_Worker SHALL treat the user as successfully created and continue processing the remaining users

### Requirement 6: Seeding Status Tracking

**User Story:** As a platform operator, I want to track the status of user seeding operations, so that I can identify and resolve failures.

#### Acceptance Criteria

1. THE Tenant_Seeding_Worker SHALL store the Seeding_Status for each tenant in Cloudflare KV (API_CACHE namespace) with key format `seed:{tenant_id}`
2. THE Seeding_Status record SHALL include: tenant_id, event_id, status, users_created count, users_failed count, error_details array (maximum 50 entries, each entry maximum 500 characters), started_at timestamp, and completed_at timestamp
3. WHEN a seeding operation begins, THE Tenant_Seeding_Worker SHALL set the status to "in_progress" and record the started_at timestamp
4. WHEN a seeding operation completes with all users created successfully (users_failed equals 0), THE Tenant_Seeding_Worker SHALL update the status to "completed" and record the completed_at timestamp
5. WHEN a seeding operation completes with at least one user created and at least one user failed, THE Tenant_Seeding_Worker SHALL update the status to "partial" and record the completed_at timestamp
6. WHEN a seeding operation completes with zero users created successfully (users_created equals 0), THE Tenant_Seeding_Worker SHALL update the status to "failed" and record the completed_at timestamp
7. THE Tenant_Seeding_Worker SHALL set a TTL of 30 days (2,592,000 seconds) on Seeding_Status KV entries
8. THE Tenant_Seeding_Worker SHALL expose a `GET /seed/status/{tenant_id}` endpoint that returns the Seeding_Status record from KV as a JSON response

### Requirement 7: Event Delivery Mechanism

**User Story:** As a platform architect, I want a reliable event delivery mechanism between the pacs-service and the seeding worker, so that no tenant creation events are lost.

#### Acceptance Criteria

1. WHEN a new tenant is created, THE Pacs_Service SHALL deliver the Tenant_Created_Event to the Tenant_Seeding_Worker by making an asynchronous HTTP POST request (using httpx) to the worker's `POST /seed` endpoint with a timeout of 3 seconds
2. THE Pacs_Service SHALL include in the Tenant_Created_Event payload at minimum the `tenant_id`, `tenant_code`, `tenant_name`, `tenant_email`, `event_id`, and `created_at` fields as a JSON request body
3. THE Tenant_Seeding_Worker SHALL expose a `POST /seed` endpoint that accepts Tenant_Created_Event JSON payloads with Content-Type `application/json`
4. THE Tenant_Seeding_Worker SHALL validate incoming requests by comparing the value of the `X-Gateway-Secret` header against the configured GATEWAY_SHARED_SECRET using a constant-time comparison
5. IF the `X-Gateway-Secret` header is missing or does not match the configured GATEWAY_SHARED_SECRET, THEN THE Tenant_Seeding_Worker SHALL return a 401 Unauthorized response with no event processing initiated
6. WHEN the Tenant_Seeding_Worker receives a valid and authenticated event request, THE Tenant_Seeding_Worker SHALL return a 202 Accepted response before initiating the seeding process
7. IF the Pacs_Service webhook call to the Tenant_Seeding_Worker fails (connection error, timeout exceeding 3 seconds, or non-2xx response), THEN THE Pacs_Service SHALL log the failure with the tenant_id and error reason, and SHALL NOT retry the request (fire-and-forget semantics)
8. IF the Tenant_Seeding_Worker receives a request with a missing or malformed JSON body (missing required `tenant_id` field), THEN THE Tenant_Seeding_Worker SHALL return a 400 Bad Request response

### Requirement 8: Manual Trigger Support

**User Story:** As a platform operator, I want to manually trigger user seeding for an existing tenant, so that I can recover from failures or seed users for tenants created before this system was deployed.

#### Acceptance Criteria

1. THE Tenant_Seeding_Worker SHALL expose a `POST /seed/manual` endpoint that accepts a JSON request body containing a required tenant_id field and optional parameters for email_domain (string) and roles (array of role names to seed), and SHALL respond within 30 seconds with a JSON response indicating the number of users created and the number of roles skipped
2. IF a request to `POST /seed/manual` does not include a valid JWT token with SUPERADMIN role in the Authorization header (where valid means the token signature is verified against JWT_SECRET, the token is not expired, and the token contains the SUPERADMIN role claim), THEN THE Tenant_Seeding_Worker SHALL reject the request with a 403 Forbidden response
3. IF the provided tenant_id does not correspond to an existing tenant in the system, THEN THE Tenant_Seeding_Worker SHALL reject the request with a 404 Not Found response
4. WHEN manually triggered with a valid request, THE Tenant_Seeding_Worker SHALL query existing users for the specified tenant via the Auth_Service and create default users only for roles that do not already have a user assigned, skipping roles where a user already exists

### Requirement 9: Observability and Logging

**User Story:** As a platform operator, I want comprehensive logging of the seeding process, so that I can monitor operations and debug issues.

#### Acceptance Criteria

1. WHEN a user creation attempt completes (success or failure), THE Tenant_Seeding_Worker SHALL log a structured JSON message containing: tenant_id, username, role, status ("success" or "failure"), response_time_ms, and error_detail (for failures only)
2. WHEN all user creation attempts for a tenant are completed, THE Tenant_Seeding_Worker SHALL log a structured JSON summary containing: tenant_id, total_users_attempted, total_users_created, total_users_failed, and total_duration_ms
3. THE Tenant_Seeding_Worker wrangler.toml SHALL configure observability with head_sampling_rate of 1, persistent logs enabled, and invocation_logs enabled
4. WHEN a user creation attempt fails, THE Tenant_Seeding_Worker SHALL use console.error for the log entry; WHEN a user creation attempt succeeds, THE Tenant_Seeding_Worker SHALL use console.log
