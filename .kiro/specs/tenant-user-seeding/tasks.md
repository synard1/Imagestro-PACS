# Implementation Plan: Tenant User Seeding

## Overview

Implement an event-driven tenant user seeding system using a Cloudflare Worker (Hono/TypeScript) that receives webhook events from the pacs-service and creates default users via the auth-service API. The implementation follows the existing accession-worker pattern.

## Tasks

- [x] 1. Set up project structure and core types
  - [x] 1.1 Initialize the tenant-seeding-worker project
    - Create `cloudflare/tenant-seeding-worker/` directory structure with `src/`, `tests/`, `src/routes/`, `src/services/`, `src/middleware/`, `src/utils/`
    - Create `package.json` with dependencies: hono, wrangler, vitest, fast-check, @cloudflare/workers-types
    - Create `tsconfig.json` with strict mode and Cloudflare Worker types
    - Create `vitest.config.ts` configured for the worker environment
    - Create `wrangler.jsonc` with KV binding (API_CACHE), VPC network (BACKBONE), vars (AUTH_SERVICE_URL), and observability settings (head_sampling_rate: 1, persistent logs, invocation_logs)
    - _Requirements: 9.3_

  - [x] 1.2 Define TypeScript interfaces and constants
    - Create `src/types.ts` with `Env`, `TenantCreatedEvent`, `SeedingStatus`, `ErrorEntry`, `DefaultUserDefinition`, `RetryConfig` interfaces
    - Define `DEFAULT_USERS` constant array with all 6 role definitions (TENANT_ADMIN, DOCTOR, RADIOLOGIST, TECHNICIAN, CLERK, NURSE)
    - Define retry configuration constants (`USER_CREATION_RETRY`, `AUTH_LOGIN_RETRY`)
    - _Requirements: 3.1, 5.1, 5.4_

- [x] 2. Implement utility modules
  - [x] 2.1 Implement validation utility
    - Create `src/utils/validation.ts` with `validateTenantCreatedEvent()` function
    - Validate: tenant_id (non-empty string), tenant_code (non-empty string), tenant_name (non-empty string, max 255 chars), tenant_email (non-empty string, valid email format)
    - Return structured validation errors for each failing field
    - _Requirements: 2.1, 2.2_

  - [ ]* 2.2 Write property test for event validation
    - **Property 2: Event validation accepts valid and rejects invalid payloads**
    - **Validates: Requirements 2.1, 2.2**

  - [x] 2.3 Implement password generator
    - Create `src/services/password-generator.ts` with `generatePassword()` function
    - Generate 16-character passwords using `crypto.getRandomValues()`
    - Ensure at least one uppercase, one lowercase, one digit, one special character
    - Shuffle characters to avoid predictable patterns
    - _Requirements: 3.2_

  - [ ]* 2.4 Write property test for password complexity
    - **Property 5: Password complexity**
    - **Validates: Requirements 3.2**

  - [x] 2.5 Implement retry utility
    - Create `src/utils/retry.ts` with `withRetry()` function
    - Support exponential backoff with configurable base delay and max retries
    - Classify HTTP responses: 5xx/timeout → retry, 409 → success, other 4xx → no retry
    - _Requirements: 5.1, 5.5, 5.6_

  - [ ]* 2.6 Write property test for retry classification
    - **Property 7: Retry classification by HTTP status code**
    - **Validates: Requirements 5.1, 5.5, 5.6**

  - [x] 2.7 Implement status utility
    - Create `src/utils/status.ts` with `determineStatus()` function
    - Logic: users_failed == 0 → "completed"; users_created > 0 && users_failed > 0 → "partial"; users_created == 0 → "failed"
    - Implement `truncateErrorDetails()` to cap at 50 entries, each max 500 chars
    - _Requirements: 5.3, 6.4, 6.5, 6.6, 6.2_

  - [ ]* 2.8 Write property test for status determination
    - **Property 6: Status determination from outcome counts**
    - **Validates: Requirements 5.3, 6.4, 6.5, 6.6**

- [x] 3. Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 4. Implement middleware
  - [x] 4.1 Implement gateway auth middleware
    - Create `src/middleware/gateway-auth.ts` with constant-time comparison of `X-Gateway-Secret` header against `GATEWAY_SHARED_SECRET`
    - Return 401 Unauthorized if header is missing or does not match
    - Use timing-safe comparison (byte-by-byte XOR or `crypto.subtle.timingSafeEqual`)
    - _Requirements: 7.4, 7.5_

  - [ ]* 4.2 Write property test for gateway secret validation
    - **Property 8: Gateway secret validation**
    - **Validates: Requirements 7.4, 7.5**

  - [x] 4.3 Implement JWT auth middleware
    - Create `src/middleware/jwt-auth.ts` for the manual trigger endpoint
    - Verify JWT signature against `JWT_SECRET`, check expiration, validate SUPERADMIN role claim
    - Return 403 Forbidden if token is invalid, expired, or lacks SUPERADMIN role
    - _Requirements: 8.2_

  - [x] 4.4 Implement request-id middleware
    - Create `src/middleware/request-id.ts` to generate/propagate request IDs
    - Generate UUID v4 if no `X-Request-ID` header present
    - Attach to response headers for traceability
    - _Requirements: 9.1_

- [x] 5. Implement auth-service client
  - [x] 5.1 Implement auth client service
    - Create `src/services/auth-client.ts` with `AuthClient` class
    - Implement `login()` method: POST to `/auth/login` via BACKBONE binding with service credentials
    - Implement `createUser()` method: POST to `/auth/users` via BACKBONE with JWT Bearer token
    - Implement token caching and automatic re-authentication on 401 responses (up to 3 re-auth attempts)
    - Set 10-second timeout on user creation calls
    - _Requirements: 4.1, 4.2, 4.3, 4.4_

  - [ ]* 5.2 Write unit tests for auth client
    - Test login success, login failure after 3 attempts, token refresh on 401
    - Test createUser with 201, 409, 5xx, and timeout responses
    - _Requirements: 4.1, 4.2, 4.3, 4.4_

- [x] 6. Implement user seeder service
  - [x] 6.1 Implement user seeder service
    - Create `src/services/user-seeder.ts` with `UserSeeder` class
    - Generate user definitions from tenant data: username `{prefix}.{lowercase(tenant_code)}`, email `{prefix}@{lowercase(tenant_code)}.local`, full_name `{Prefix} {tenant_name}`
    - Iterate through 6 default users sequentially, calling auth-client for each
    - Handle 409 as success, apply retry logic for 5xx/timeout, skip retry for other 4xx
    - Track users_created and users_failed counts
    - Log structured JSON for each user creation attempt (tenant_id, username, role, status, response_time_ms, error_detail)
    - _Requirements: 3.1, 3.3, 3.4, 3.6, 5.1, 5.2, 5.5, 5.6, 9.1_

  - [ ]* 6.2 Write property test for user definition generation
    - **Property 4: User definition generation from tenant data**
    - **Validates: Requirements 3.1, 3.3, 3.4, 3.6**

  - [ ]* 6.3 Write unit tests for user seeder
    - Test all-succeed, some-fail, all-fail, 409-handling scenarios
    - Test structured logging output
    - _Requirements: 3.1, 5.1, 5.2, 9.1_

- [x] 7. Implement route handlers
  - [x] 7.1 Implement POST /seed route
    - Create `src/routes/seed.ts`
    - Apply gateway-auth middleware
    - Validate event payload, return 400 on invalid
    - Check KV for existing `seed:{tenant_id}` entry (idempotency), return 202 if already processed
    - Return 500 if KV is unavailable during idempotency check
    - Return 202 Accepted immediately
    - Use `ctx.executionCtx.waitUntil()` to run seeding asynchronously
    - In async processing: set KV status "in_progress", authenticate, create users, set final status
    - Apply VPC tunnel retry logic (3 retries with 5s, 10s, 20s backoff) if auth-service unreachable
    - Log structured JSON summary on completion
    - Set KV TTL of 30 days (2,592,000 seconds)
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 5.3, 5.4, 6.1, 6.2, 6.3, 6.4, 6.5, 6.6, 6.7, 7.3, 7.6, 9.2_

  - [ ]* 7.2 Write property test for idempotent event processing
    - **Property 3: Idempotent event processing**
    - **Validates: Requirements 2.4**

  - [x] 7.3 Implement POST /seed/manual route
    - Create `src/routes/manual.ts`
    - Apply JWT auth middleware (require SUPERADMIN role)
    - Accept JSON body with required `tenant_id` and optional `email_domain`, `roles` fields
    - Query existing users for the tenant via auth-service
    - Create default users only for roles not already present
    - Return JSON response with users_created count and roles_skipped count within 30 seconds
    - Return 404 if tenant_id doesn't correspond to an existing tenant
    - _Requirements: 8.1, 8.2, 8.3, 8.4_

  - [ ]* 7.4 Write property test for manual trigger skipping existing roles
    - **Property 9: Manual trigger skips existing roles**
    - **Validates: Requirements 8.4**

  - [x] 7.5 Implement GET /seed/status/:tenant_id route
    - Create `src/routes/status.ts`
    - Read `seed:{tenant_id}` from KV
    - Return JSON SeedingStatus if found, 404 if not found
    - _Requirements: 6.8_

  - [x] 7.6 Implement GET /health route
    - Create `src/routes/health.ts`
    - Return 200 with `{ "status": "ok", "service": "tenant-seeding-worker" }`

- [x] 8. Wire up the Hono application
  - [x] 8.1 Create main application entry point
    - Create `src/index.ts` with Hono app
    - Register request-id middleware globally
    - Mount route handlers: `/seed`, `/seed/manual`, `/seed/status/:tenant_id`, `/health`
    - Export default app
    - _Requirements: 7.3, 8.1, 6.8_

  - [ ]* 8.2 Write unit tests for route integration
    - Test 401 on missing/invalid gateway secret for /seed
    - Test 403 on missing/invalid JWT for /seed/manual
    - Test 400 on invalid payload for /seed
    - Test 202 on valid event for /seed
    - Test 404 on missing status for /seed/status/:tenant_id
    - _Requirements: 7.4, 7.5, 7.8, 8.2_

- [x] 9. Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 10. Implement pacs-service webhook emission
  - [x] 10.1 Add webhook emission to pacs-service tenant creation
    - Modify `fullstack-orthanc-dicom/pacs-service/app/api/tenants.py`
    - Add `emit_tenant_created_event()` async function after `db.commit()` in `create_tenant()`
    - Use httpx AsyncClient with 3-second timeout
    - Include `X-Gateway-Secret` header from `GATEWAY_SHARED_SECRET` env var
    - Build event payload with event_id (UUID v4), tenant_id, tenant_code, tenant_name, tenant_email, created_at (ISO 8601 UTC)
    - Fire-and-forget: log WARNING on failure, never block tenant creation response
    - Add `TENANT_SEED_WEBHOOK_URL` and `GATEWAY_SHARED_SECRET` to environment configuration
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 7.1, 7.2, 7.7_

  - [ ]* 10.2 Write property test for event payload correctness
    - **Property 1: Event payload correctness**
    - **Validates: Requirements 1.1, 1.4, 7.2**

  - [ ]* 10.3 Write unit tests for webhook emission
    - Test timeout handling (>3s), connection error, non-2xx response
    - Test that tenant creation response is never blocked
    - Test event payload structure
    - _Requirements: 1.2, 1.3, 7.7_

- [ ] 11. Implement status record property test
  - [ ]* 11.1 Write property test for status record structure and limits
    - **Property 10: Status record structure and limits**
    - **Validates: Requirements 6.2**

- [x] 12. Final checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation
- Property tests validate universal correctness properties from the design document
- Unit tests validate specific examples and edge cases
- The worker follows the existing accession-worker pattern (Hono, typed Env, wrangler.jsonc, observability)
- Sequential user creation is intentional (simpler error handling, avoids overwhelming auth-service)
- The pacs-service changes (task 10) are in Python/FastAPI; all other tasks are TypeScript

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1", "1.2"] },
    { "id": 1, "tasks": ["2.1", "2.3", "2.5", "2.7"] },
    { "id": 2, "tasks": ["2.2", "2.4", "2.6", "2.8", "4.1", "4.3", "4.4"] },
    { "id": 3, "tasks": ["4.2", "5.1"] },
    { "id": 4, "tasks": ["5.2", "6.1"] },
    { "id": 5, "tasks": ["6.2", "6.3", "7.5", "7.6"] },
    { "id": 6, "tasks": ["7.1", "7.3"] },
    { "id": 7, "tasks": ["7.2", "7.4", "8.1"] },
    { "id": 8, "tasks": ["8.2", "10.1"] },
    { "id": 9, "tasks": ["10.2", "10.3", "11.1"] }
  ]
}
```
