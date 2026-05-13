# Implementation Plan: Accession Worker Integration

## Overview

This plan integrates the standalone accession-worker (Cloudflare Worker + D1) into the Imagestro PACS frontend by adding gateway routing, a new service client module, feature flag support, settings synchronization, and health monitoring. Each task builds incrementally, starting with infrastructure (gateway + registry), then the service client, then integration into existing flows.

## Tasks

- [x] 1. Gateway Worker routing for accession-worker
  - [x] 1.1 Add `/accession-api/*` route handling to the gateway worker
    - Modify `cloudflare/worker.js` to detect `/accession-api/` prefix in incoming requests
    - Implement `proxyToAccessionWorker()` function that strips the `/accession-api` prefix, preserves remaining path + query string + HTTP method
    - Forward request body for POST, PUT, PATCH, DELETE methods
    - Use Service Binding (`env.ACCESSION_WORKER`) when available, fall back to HTTP URL constant
    - Return HTTP 502 JSON error (`{ error, path, message }`) on connection failure or 30-second timeout
    - _Requirements: 1.1, 1.4_

  - [x] 1.2 Implement selective header forwarding and HMAC signature
    - Forward only Authorization, Content-Type, and X-Request-ID headers from the incoming request
    - Propagate X-Tenant-ID header (from incoming request or empty string)
    - Compute HMAC-SHA256 over `X-Tenant-ID + X-Request-ID` using `env.GATEWAY_SHARED_SECRET`
    - Set `X-Gateway-Signature` header on the forwarded request
    - _Requirements: 1.2, 8.1, 8.2_

  - [x] 1.3 Implement CORS handling for accession-api responses
    - Append `Access-Control-Allow-Origin` (set to request origin) and `Access-Control-Allow-Credentials: true` on all forwarded responses
    - Forward response status code, body, and Content-Type unchanged
    - Handle OPTIONS preflight: return 204 with Allow-Methods (GET, POST, PUT, DELETE, PATCH, OPTIONS), Allow-Headers (Authorization, Content-Type, X-Request-ID), Allow-Credentials (true), Max-Age (86400)
    - _Requirements: 1.3, 1.5_

  - [x]* 1.4 Write property tests for gateway routing (Properties 1-3, 12)
    - **Property 1: Gateway path prefix stripping preserves remainder**
    - **Property 2: Gateway header forwarding is selective and complete**
    - **Property 3: Gateway response forwarding appends CORS**
    - **Property 12: Gateway HMAC signature computation**
    - Create `src/services/__tests__/gatewayRouting.property.test.js` using `fast-check`
    - **Validates: Requirements 1.1, 1.2, 1.3, 8.1**

- [x] 2. API Registry and service client foundation
  - [x] 2.1 Register accession module in the API registry
    - Add `accession: { enabled: true, baseUrl: "/accession-api", healthPath: "/healthz", timeoutMs: 5000 }` to `DEFAULT_REGISTRY` in `src/services/api-registry.js`
    - _Requirements: 6.1_

  - [x] 2.2 Create `src/services/accessionServiceClient.js` with core HTTP setup
    - Use `apiClient('accession')` pattern from `src/services/http.js`
    - Implement UUID v4 generation for `X-Request-ID` header on every request
    - Implement module-disabled check: throw error immediately if accession module is disabled in registry
    - Implement fallback to default config (`baseUrl: ""`, `timeoutMs: 5000`) if module entry is missing
    - _Requirements: 2.5, 2.8, 6.2, 6.3, 6.4_

  - [x] 2.3 Implement retry logic and error handling in the service client
    - On 5xx or network timeout: wait 1000ms, retry once
    - On POST retry: include `X-Idempotency-Key` header (reuse from original or generate new UUID)
    - On 429 with valid Retry-After ≤ 60s: wait specified duration, retry once
    - On 429 without valid Retry-After or > 60s: reject immediately
    - On 4xx (except 429): throw immediately without retry
    - On retry exhaustion: throw structured error `{ statusCode, message, requestId, originalError }`
    - Transform error responses: extract `status`, `message`, `requestId` from response body
    - _Requirements: 2.6, 2.7, 10.1, 10.2, 10.3, 10.5, 10.6_

  - [x]* 2.4 Write property tests for service client (Properties 8, 9, 13-15)
    - **Property 8: Error response transformation**
    - **Property 9: X-Request-ID UUID v4 on every request**
    - **Property 13: Idempotency key preservation on POST retry**
    - **Property 14: Structured error on retry exhaustion**
    - **Property 15: Rate limit handling respects Retry-After bounds**
    - Create `src/services/__tests__/accessionServiceClient.property.test.js` using `fast-check`
    - **Validates: Requirements 2.6, 2.8, 10.2, 10.3, 10.6**

- [x] 3. Checkpoint - Ensure gateway and service client foundation pass tests
  - Ensure all tests pass, ask the user if questions arise.

- [x] 4. Service client API methods
  - [x] 4.1 Implement `createAccession({ modality, patientId, orderId })`
    - POST to `/api/accessions` with body `{ modality, patient: { id: patientId } }`
    - Include orderId in body if provided
    - Return `{ id, accession_number, issuer }` from response
    - _Requirements: 2.1, 4.1_

  - [x] 4.2 Implement `createAccessionBatch(params)`
    - POST to `/api/accessions/batch` with body `{ procedures: [...], patient_national_id, patient_name }`
    - Return `{ accessions: [{ id, accession_number, issuer, modality, procedure_code }] }`
    - _Requirements: 2.2, 4.2_

  - [x] 4.3 Implement `getAccessions(filters)` and `getAccessionByNumber(accessionNumber)`
    - GET `/api/accessions` with query params mapped from filters object (limit, cursor, source, modality, patient_national_id, from_date, to_date)
    - GET `/api/accessions/:accessionNumber` with URL-encoded accession number
    - Return paginated response `{ items, next_cursor, has_more }` for list
    - _Requirements: 2.3, 2.4_

  - [x]* 4.4 Write property tests for API methods (Properties 4-7, 11)
    - **Property 4: CreateAccession request body mapping**
    - **Property 5: CreateAccessionBatch request body structure**
    - **Property 6: GetAccessions filter-to-query-parameter mapping**
    - **Property 7: GetAccessionByNumber URL construction**
    - **Property 11: Batch response matching by procedure_code and modality**
    - Add to `src/services/__tests__/accessionServiceClient.property.test.js`
    - **Validates: Requirements 2.1, 2.2, 2.3, 2.4, 4.6**

- [x] 5. Feature flag and order creation integration
  - [x] 5.1 Implement feature flag logic for accession generation
    - Read `useServerAccession` from `settingsService.getSettings()` before each generation call
    - When `true`: call `createAccession()`, return `accession_number` string
    - When `false` or absent: call existing `generateAccessionAsync()`
    - On server failure when flag is `true`: fall back to `generateAccessionAsync()`, show warning notification
    - Ensure return type is always a string regardless of generation mode
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7_

  - [x] 5.2 Integrate server-side accession into order creation flow
    - For single-procedure orders: call `createAccession({ modality, patientId })` before order submission
    - For multi-procedure orders (≥2 procedures): call `createAccessionBatch()` with all procedures
    - Match batch response accessions to procedures by `procedure_code` and `modality`
    - Include `accession_number` in order payload sent to Order_Service
    - On failure after retries: show error notification, prevent order submission, preserve form data
    - Do NOT modify existing `createOrder()` function signature
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5, 4.6, 9.5, 9.6_

  - [x]* 5.3 Write property test for feature flag return type (Property 16)
    - **Property 16: Feature flag return type consistency**
    - Verify return value is always a string regardless of generation mode or fallback
    - Add to `src/services/__tests__/accessionServiceClient.property.test.js`
    - **Validates: Requirements 3.7**

  - [x]* 5.4 Write unit tests for feature flag branching and order integration
    - Test `useServerAccession=true` path calls server
    - Test `useServerAccession=false` path calls client-side
    - Test `useServerAccession` absent defaults to client-side
    - Test fallback on server failure with warning notification
    - Test order creation blocks on accession failure
    - Test form data preservation on failure
    - Create `src/services/__tests__/accessionIntegration.test.js`
    - _Requirements: 3.1-3.7, 4.1-4.6_

- [x] 6. Checkpoint - Ensure feature flag and order integration pass tests
  - Ensure all tests pass, ask the user if questions arise.

- [x] 7. Settings synchronization
  - [x] 7.1 Implement settings routing based on feature flag
    - When `useServerAccession=true`: read from `GET /accession-api/settings/accession_config` (5s timeout)
    - When `useServerAccession=true`: write to `PUT /accession-api/settings/accession_config`
    - When `useServerAccession=false`: use existing backend `/settings/accession_config` endpoint
    - On read failure: fall back to cached local config, show persistent warning
    - On write failure: retain unsaved form changes, show error notification, don't overwrite cache
    - _Requirements: 5.1, 5.2, 5.3, 5.6, 5.7_

  - [x] 7.2 Implement pattern token conversion functions
    - `workerPatternToUI(pattern)`: convert `{NNN...}` → `{SEQn}` (n = count of N characters)
    - `uiPatternToWorker(pattern)`: convert `{SEQn}` → `{NNN...}` (repeat N, n times)
    - Apply `workerPatternToUI` when reading settings from accession-worker
    - Apply `uiPatternToWorker` when writing settings to accession-worker
    - _Requirements: 5.4, 5.5_

  - [x]* 7.3 Write property test for pattern token round-trip (Property 10)
    - **Property 10: Settings pattern token round-trip**
    - Verify `workerPatternToUI(uiPatternToWorker(pattern)) === pattern` for all valid patterns with `{SEQn}` tokens (n=1-8)
    - Add to `src/services/__tests__/accessionServiceClient.property.test.js`
    - **Validates: Requirements 5.4, 5.5**

- [x] 8. Health monitoring integration
  - [x] 8.1 Add accession-worker to health dashboard
    - Ensure the `accession` module's `healthPath: "/healthz"` is polled by the health dashboard at the standard 30-second interval
    - Map HTTP 200 → "healthy" status display
    - Map non-200 or timeout (8 seconds) → "unhealthy" status display
    - After 3 consecutive failures: display degraded-service warning
    - _Requirements: 7.1, 7.2, 7.3, 7.4, 10.4_

- [x] 9. Backward compatibility verification
  - [x] 9.1 Verify existing accession.js module remains intact
    - Confirm `src/services/accession.js` is unchanged and all named exports are callable: `generateAccession`, `generateAccessionAsync`, `previewAccession`, `previewAccessionFromConfig`, `loadAccessionConfig`, `saveAccessionConfig`, `resetAllCounters`, `generateDeterministicAccession`
    - Confirm client-side generation still uses localStorage counters and tenant config when `useServerAccession=false`
    - _Requirements: 9.1, 9.2_

  - [x]* 9.2 Write unit tests for backward compatibility
    - Test all existing `accession.js` exports are callable without errors
    - Test client-side generation produces expected format when flag is false
    - Test `createOrder()` function signature is unchanged
    - Add to `src/services/__tests__/accessionIntegration.test.js`
    - _Requirements: 9.1, 9.2, 9.5_

- [x] 10. Final checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation
- Property tests validate universal correctness properties from the design document
- Unit tests validate specific examples and edge cases
- The existing `accession.js` module is NOT modified — it remains as the client-side fallback
- The gateway worker (`cloudflare/worker.js`) is the only infrastructure file modified
- All frontend service code uses the existing `apiClient` pattern for consistency

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1", "2.1"] },
    { "id": 1, "tasks": ["1.2", "1.3", "2.2"] },
    { "id": 2, "tasks": ["1.4", "2.3"] },
    { "id": 3, "tasks": ["2.4", "4.1", "4.2", "4.3"] },
    { "id": 4, "tasks": ["4.4", "5.1", "7.2"] },
    { "id": 5, "tasks": ["5.2", "5.3", "7.1", "7.3"] },
    { "id": 6, "tasks": ["5.4", "8.1"] },
    { "id": 7, "tasks": ["9.1", "9.2"] }
  ]
}
```
