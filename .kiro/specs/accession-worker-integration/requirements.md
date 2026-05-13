# Requirements Document

## Introduction

This specification defines the integration of the standalone accession-worker (Cloudflare Worker + D1) into the Imagestro PACS platform. The integration replaces unreliable client-side accession number generation (localStorage counters) with server-side generation via the accession-worker, routes requests through the API gateway, synchronizes settings, and supports gradual rollout via feature flags.

## Glossary

- **Frontend**: The React/Vite SPA deployed on Cloudflare Pages (imagestro-pacs.pages.dev)
- **Gateway_Worker**: The Cloudflare Worker (`cloudflare/worker.js`) that acts as a reverse proxy between the Frontend and backend services
- **Accession_Worker**: The standalone Cloudflare Worker (`cloudflare/accession-worker/`) that generates and manages accession numbers using D1 and Durable Objects
- **Order_Service**: The backend Hono/TypeScript service (`order-management`) running on Docker that manages radiology orders
- **API_Registry**: The frontend module (`src/services/api-registry.js`) that defines enabled API modules with baseUrl, healthPath, and timeoutMs
- **Accession_Service_Client**: The new frontend service module that communicates with the Accession_Worker through the Gateway_Worker
- **Feature_Flag**: A configuration toggle (`useServerAccession`) that controls whether accession numbers are generated server-side or client-side
- **Service_Binding**: A Cloudflare Workers mechanism that allows one Worker to invoke another Worker directly without HTTP overhead
- **Health_Dashboard**: The frontend UI component that displays connectivity status of all registered backend services

## Requirements

### Requirement 1: Gateway Routing to Accession Worker

**User Story:** As a frontend developer, I want accession-related API requests to be routed through the gateway to the accession-worker, so that the frontend can communicate with the accession-worker without CORS issues.

#### Acceptance Criteria

1. WHEN the Gateway_Worker receives a request with path prefix `/accession-api/`, THE Gateway_Worker SHALL forward the request to the Accession_Worker with the `/accession-api/` prefix stripped, preserving the remaining path, query string, and HTTP method
2. WHEN the Gateway_Worker forwards a request to the Accession_Worker, THE Gateway_Worker SHALL include the original Authorization header, Content-Type header, and X-Request-ID header if present in the incoming request, and SHALL forward the request body unchanged for POST, PUT, PATCH, and DELETE methods
3. WHEN the Accession_Worker returns a response, THE Gateway_Worker SHALL forward the response status code, body, and Content-Type header back to the client with CORS headers appended (Access-Control-Allow-Origin set to the request origin, Access-Control-Allow-Credentials set to true)
4. IF the Gateway_Worker cannot establish a connection to the Accession_Worker (network error, DNS resolution failure, or no response received within 30 seconds), THEN THE Gateway_Worker SHALL return HTTP 502 with a JSON body containing fields `error`, `path` (the original request path), and `message` (a description of the failure reason)
5. WHEN the Gateway_Worker receives an OPTIONS request for a path matching `/accession-api/*`, THE Gateway_Worker SHALL return a 204 response with headers Access-Control-Allow-Origin (request origin), Access-Control-Allow-Methods (GET, POST, PUT, DELETE, PATCH, OPTIONS), Access-Control-Allow-Headers (Authorization, Content-Type, X-Request-ID), Access-Control-Allow-Credentials (true), and Access-Control-Max-Age (86400)

### Requirement 2: Frontend Accession Service Client

**User Story:** As a frontend developer, I want a service module that calls the accession-worker API, so that accession numbers are generated server-side with proper sequence guarantees.

#### Acceptance Criteria

1. THE Accession_Service_Client SHALL expose a `createAccession({ modality, patientId, orderId })` function that calls `POST /accession-api/api/accessions` with a JSON body mapping `patientId` to the `patient.id` field and `modality` to the top-level `modality` field per the nested patient object format, and returns a JSON object containing `id`, `accession_number`, and `issuer`
2. THE Accession_Service_Client SHALL expose a `createAccessionBatch(items[])` function that calls `POST /accession-api/api/accessions/batch` with a JSON body containing a `procedures` array (each item providing at minimum `modality`, `procedure_code`, and `procedure_name`) and shared patient data fields (`patient_national_id`, `patient_name`), and returns a JSON object containing an `accessions` array of objects each with `id`, `accession_number`, `issuer`, `modality`, and `procedure_code`
3. THE Accession_Service_Client SHALL expose a `getAccessions(filters)` function that calls `GET /accession-api/api/accessions` with query parameters mapped from the `filters` object (supporting keys: `limit`, `cursor`, `source`, `modality`, `patient_national_id`, `from_date`, `to_date`) and returns a JSON object containing `items` (array of accession records), `next_cursor` (string or null), and `has_more` (boolean)
4. THE Accession_Service_Client SHALL expose a `getAccessionByNumber(accessionNumber)` function that calls `GET /accession-api/api/accessions/:accession_number` and returns the accession JSON object
5. THE Accession_Service_Client SHALL use the `apiClient('accession')` pattern from `src/services/http.js` for all HTTP calls, inheriting the module's configured `baseUrl`, `timeoutMs`, and authentication header injection
6. IF the Accession_Service_Client receives an HTTP error response, THEN THE Accession_Service_Client SHALL throw an error object containing properties `status` (HTTP status code as integer), `message` (error description string from the response body), and `requestId` (the `request_id` value from the response body, or null if absent)
7. IF the Accession_Service_Client receives a network timeout or HTTP 5xx error, THEN THE Accession_Service_Client SHALL retry the request once after a 1000-millisecond delay before throwing the error
8. THE Accession_Service_Client SHALL include an `X-Request-ID` header with a generated UUID v4 value on every outgoing request to enable end-to-end request tracing

### Requirement 3: Feature Flag for Gradual Rollout

**User Story:** As a system administrator, I want to toggle between client-side and server-side accession generation, so that the migration can be rolled out gradually without disrupting existing workflows.

#### Acceptance Criteria

1. THE Frontend SHALL read a `useServerAccession` boolean from the application settings (via `settingsService.getSettings()`)
2. WHILE `useServerAccession` is `true`, THE Frontend SHALL generate accession numbers by sending a POST request to the Accession_Service endpoint (`/api/accessions`) with the required patient and modality data, and SHALL use the returned `accession_number` field from the response
3. WHILE `useServerAccession` is `false`, THE Frontend SHALL generate accession numbers using the existing client-side `generateAccessionAsync()` function
4. WHEN `useServerAccession` is not present in settings, THE Frontend SHALL default to `false` (client-side generation)
5. WHEN the `useServerAccession` value changes in the backend settings, THE Frontend SHALL apply the new behavior on the next accession generation request without requiring a page reload, by re-reading the setting from `settingsService.getSettings()` before each generation call
6. IF `useServerAccession` is `true` and the POST request to the Accession_Service fails (network error, timeout exceeding 10 seconds, or non-2xx HTTP response), THEN THE Frontend SHALL fall back to client-side generation using `generateAccessionAsync()` and SHALL display a non-blocking warning notification indicating that the accession was generated locally
7. WHILE `useServerAccession` is `true`, THE Frontend SHALL return the accession number as a string to the calling code, matching the same return type as `generateAccessionAsync()`, so that consuming components do not need to distinguish between generation modes

### Requirement 4: Order Creation Integration

**User Story:** As a radiologist, I want accession numbers to be generated server-side when creating orders, so that numbers are unique across all devices and sessions.

#### Acceptance Criteria

1. WHILE `useServerAccession` is `true`, WHEN a new single-procedure order is created, THE Frontend SHALL call `Accession_Service_Client.createAccession()` with the `modality` and `patientId` (patient_national_id) from the order form to obtain the accession number before submitting the order to the Order_Service
2. WHILE `useServerAccession` is `true`, WHEN a multi-procedure order is created (2 or more procedures), THE Frontend SHALL call `Accession_Service_Client.createAccessionBatch()` with all procedure items to obtain all accession numbers in a single request
3. IF the Accession_Service_Client fails to generate an accession number after all retries defined in Requirement 10 are exhausted, THEN THE Frontend SHALL display an error notification indicating the failure reason, prevent the order from being submitted, and preserve the user's entered form data so the user can retry without re-entering information
4. WHEN the Accession_Service_Client returns an accession number, THE Frontend SHALL include the `accession_number` field in the order payload sent to the Order_Service
5. THE Frontend SHALL pass the `modality` and `patientId` (patient_national_id) from the order form to the Accession_Service_Client when requesting an accession number
6. WHEN the Accession_Service_Client returns a batch of accession numbers, THE Frontend SHALL match each returned accession to its corresponding procedure by the `procedure_code` and `modality` fields present in both the request items and the response objects

### Requirement 5: Settings Synchronization

**User Story:** As a system administrator, I want accession configuration (pattern, reset policy, org code) to be managed through the accession-worker's settings endpoint, so that configuration is centralized and consistent.

#### Acceptance Criteria

1. WHILE `useServerAccession` is `true`, WHEN the accession settings page loads, THE Frontend SHALL fetch configuration from `GET /accession-api/settings/accession_config` with a request timeout of 5 seconds
2. WHILE `useServerAccession` is `true`, WHEN the administrator saves accession configuration, THE Frontend SHALL send the updated configuration to `PUT /accession-api/settings/accession_config` and display a success notification upon receiving an HTTP 2xx response
3. WHILE `useServerAccession` is `false`, THE Frontend SHALL continue reading and writing accession configuration via the existing backend `/settings/accession_config` endpoint
4. WHEN reading settings from the Accession_Worker, THE Frontend SHALL convert `{NNN...}` sequence tokens in the pattern to the equivalent `{SEQn}` UI format (e.g., `{NNNN}` becomes `{SEQ4}`, where n equals the count of N characters)
5. WHEN writing settings to the Accession_Worker, THE Frontend SHALL convert `{SEQn}` tokens in the pattern to the equivalent `{NNN...}` format (e.g., `{SEQ4}` becomes `{NNNN}`) before sending the PUT request
6. IF the settings fetch from the Accession_Worker fails (network error, non-2xx response, or timeout), THEN THE Frontend SHALL fall back to the cached local configuration and display a warning notification that remains visible until the user dismisses it
7. IF the PUT request to save configuration to the Accession_Worker fails (network error, non-2xx response, or timeout), THEN THE Frontend SHALL retain the user's unsaved changes in the form, display an error notification indicating the save failed, and not overwrite the local cached configuration

### Requirement 6: API Registry Registration

**User Story:** As a frontend developer, I want the accession-worker registered in the API registry, so that it follows the same module pattern as other backend services.

#### Acceptance Criteria

1. THE API_Registry SHALL include an `accession` module entry with `enabled: true`, `baseUrl: "/accession-api"`, `healthPath: "/healthz"`, and `timeoutMs: 5000`
2. WHEN the `accession` module is disabled in the API_Registry, THE Accession_Service_Client SHALL reject all calls by throwing an error with a message indicating the accession module is disabled, without making any HTTP request to the Accession_Worker
3. THE Accession_Service_Client SHALL use the `timeoutMs` value from the API_Registry `accession` entry as the HTTP request timeout for all requests to the Accession_Worker, aborting any request that exceeds the configured duration
4. IF the `accession` module entry is missing from the API_Registry, THEN THE Accession_Service_Client SHALL fall back to a default configuration with `baseUrl: ""` and `timeoutMs: 5000`

### Requirement 7: Health Monitoring

**User Story:** As a system administrator, I want to see the accession-worker health status in the frontend health dashboard, so that I can monitor service availability.

#### Acceptance Criteria

1. THE Health_Dashboard SHALL include the Accession_Worker in the API_Registry with the entry `accession_worker: { enabled: true, baseUrl: "", healthPath: "/accession-api/healthz", timeoutMs: 5000 }`
2. WHEN the Accession_Worker health endpoint returns HTTP 200, THE Health_Dashboard SHALL display the Accession_Worker status as "healthy"
3. WHEN the Accession_Worker health endpoint returns a non-200 HTTP status code, or the request fails to receive a response within 8 seconds, THE Health_Dashboard SHALL display the Accession_Worker status as "unhealthy"
4. THE Health_Dashboard SHALL poll the Accession_Worker health endpoint at the same interval as other registered services (default 30 seconds)

### Requirement 8: Authentication Propagation

**User Story:** As a security engineer, I want the gateway to propagate authentication credentials to the accession-worker, so that multi-tenant isolation is enforced.

#### Acceptance Criteria

1. WHEN the Gateway_Worker forwards a request to the Accession_Worker, THE Gateway_Worker SHALL include an `X-Gateway-Signature` header containing an HMAC-SHA256 computed over the concatenation of the `X-Tenant-ID` header value and the `X-Request-ID` header value, using the `GATEWAY_SHARED_SECRET` as the signing key
2. WHEN the Frontend sends a request through the Gateway_Worker, THE Gateway_Worker SHALL propagate the user's JWT Bearer token in the `Authorization` header to the Accession_Worker alongside the `X-Tenant-ID` and `X-Gateway-Signature` headers
3. THE Accession_Worker SHALL extract the `tenant_id` from the JWT claims and include it as a mandatory filter in every database query (INSERT, SELECT, UPDATE, DELETE) against the `accessions` and `accession_counters` tables, ensuring no request can read or modify another tenant's data
4. IF the Accession_Worker receives a request via public HTTP with an `X-Gateway-Signature` header that does not match the expected HMAC-SHA256 of `X-Tenant-ID + X-Request-ID` using `GATEWAY_SHARED_SECRET`, THEN THE Accession_Worker SHALL ignore the `X-Tenant-ID` header and fall back to JWT-based tenant extraction
5. IF the Accession_Worker rejects a request with HTTP 401 or 403, THEN THE Gateway_Worker SHALL propagate the same HTTP status code and error response body to the calling client without retrying the request
6. WHERE the Accession_Worker is accessed via a Cloudflare Service Binding from the Gateway_Worker, THE Accession_Worker SHALL trust the `X-Tenant-ID` header without performing JWT validation or HMAC signature verification

### Requirement 9: Backward Compatibility

**User Story:** As a product owner, I want the existing order creation flow to continue working during migration, so that no data is lost and users experience no disruption.

#### Acceptance Criteria

1. THE Frontend SHALL retain the existing `src/services/accession.js` module as an importable ES module with all current named exports (`generateAccession`, `generateAccessionAsync`, `previewAccession`, `previewAccessionFromConfig`, `loadAccessionConfig`, `saveAccessionConfig`, `resetAllCounters`, `generateDeterministicAccession`) callable without runtime errors
2. WHILE `useServerAccession` is `false`, THE Frontend SHALL produce accession numbers by executing the existing client-side `generateAccessionAsync()` logic using the tenant's locally stored configuration and localStorage-based sequence counters, producing output that matches the same format pattern rendering and counter scoping as the current implementation
3. WHEN migrating from client-side to server-side generation, THE Accession_Worker SHALL accept a `starting_sequence` integer parameter (minimum 1, maximum 10^sequence_digits - 1) in the `PUT /settings/accession_config` payload; THE Accession_Worker SHALL set the counter for the specified Counter_Scope to at least this value so that subsequent server-generated sequence numbers start above previously generated client-side numbers
4. IF the `starting_sequence` value is less than 1 or exceeds the maximum allowed by the tenant's configured `sequence_digits`, THEN THE Accession_Worker SHALL reject the configuration update with HTTP 400 and an error message indicating the allowed range
5. WHILE `useServerAccession` is `true`, WHEN a new order is created, THE Frontend SHALL call the Accession_Service_Client to obtain the accession number before submitting the order to the Order_Service via the existing `orderService.js` `createOrder()` function; THE Frontend SHALL NOT modify the existing `createOrder()` function signature or behavior
6. WHILE `useServerAccession` is `true`, IF the Accession_Service_Client fails to return an accession number (network error, timeout, or non-2xx response), THEN THE Frontend SHALL display an error notification to the user and SHALL NOT submit the order to the Order_Service, preventing orders with missing accession numbers

### Requirement 10: Error Handling and Resilience

**User Story:** As a radiologist, I want the system to handle accession-worker failures gracefully, so that my workflow is not blocked by transient service issues.

#### Acceptance Criteria

1. IF the Accession_Service_Client receives a network timeout or HTTP 5xx error on a GET request, THEN THE Accession_Service_Client SHALL retry the request once after a 1-second delay
2. IF the Accession_Service_Client receives a network timeout or HTTP 5xx error on a POST request, THEN THE Accession_Service_Client SHALL include an `X-Idempotency-Key` header on the retry attempt (reusing the key from the original request, or generating one if not already present) and retry once after a 1-second delay to prevent duplicate accession creation
3. IF the retry also fails, THEN THE Accession_Service_Client SHALL reject with a structured error object containing `statusCode` (number), `message` (string suitable for display to the user describing the failure), `requestId` (string from the `X-Request-ID` response header, or the locally generated value if no response was received), and `originalError` (string with the underlying error reason)
4. WHILE `useServerAccession` is `true`, IF the Accession_Worker is unreachable for more than 3 consecutive health checks, THEN THE Health_Dashboard SHALL display a degraded-service warning
5. THE Accession_Service_Client SHALL include an `X-Request-ID` header containing a UUID v4 value on every request to enable end-to-end request tracing
6. IF the Accession_Service_Client receives HTTP 429 (rate limited) and the response contains a valid `Retry-After` header with a value of 60 seconds or less, THEN THE Accession_Service_Client SHALL wait for the specified duration before retrying the request once; IF the `Retry-After` header is missing, malformed, or specifies a duration greater than 60 seconds, THEN THE Accession_Service_Client SHALL reject immediately with a structured error indicating rate limiting without waiting
