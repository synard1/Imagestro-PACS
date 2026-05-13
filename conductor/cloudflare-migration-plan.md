# Cloudflare Ecosystem Migration Plan (Imagestro-PACS)

## Background & Motivation
Imagestro-PACS is currently using a traditional server-based architecture (Postgres, local/S3 storage, FastAPI/Hono gateways). To optimize server costs, reduce bandwidth usage, and improve global response times, we are migrating several key components to Cloudflare's Free Tier ecosystem (Workers, R2, D1, KV, Turnstile, AI).

## Scope & Impact
This plan covers the migration of 6 core features to Cloudflare. The strategy chosen is **Infrastructure First**, which prioritizes network routing, security, and heavy storage before moving operational databases. This minimizes risk to core application logic during the initial phases.

## Phased Implementation Plan

### Phase 1: Edge Routing & Security (Workers & Turnstile)
**Goal:** Shift API routing to the Edge and secure the authentication endpoints.

*   **Task 1.1: Deploy Hono.js API Gateway to Workers**
    *   **Description:** Migrate `fullstack-orthanc-dicom/api-gateway-v2` to run entirely on Cloudflare Workers.
    *   **Implementation:**
        1.  Update `wrangler.toml` in `api-gateway-v2` with correct compatibility dates and routes.
        2.  Adjust `src/index.ts` to ensure full compatibility with Cloudflare's standard Fetch API (remove Node-specific dependencies if any).
        3.  Deploy using `wrangler deploy`.
*   **Task 1.2: Implement Turnstile Security**
    *   **Description:** Protect the login endpoints from brute-force and bot attacks.
    *   **Implementation:**
        1.  Integrate the Cloudflare Turnstile React widget into the frontend login page (`src/pages/Login.jsx`).
        2.  Update the Auth Service (FastAPI) or API Gateway to validate the Turnstile token using Cloudflare's verification endpoint.

### Phase 2: Heavy Storage Migration (Cloudflare R2)
**Goal:** Offload DICOM images and report files from local storage/AWS to Cloudflare R2 to save bandwidth and storage costs.

*   **Task 2.1: Configure R2 Bucket & Credentials**
    *   **Description:** Provision the R2 bucket and set up local development environments.
    *   **Implementation:**
        1.  Create an R2 bucket via `wrangler r2 bucket create imagestro-dicom-storage`.
        2.  Generate R2 API tokens (Access Key & Secret).
*   **Task 2.2: Update PACS Storage Backend**
    *   **Description:** Switch the `S3StorageAdapter` in the PACS service to point to R2.
    *   **Implementation:**
        1.  Update `fullstack-orthanc-dicom/pacs-service/.env` and `docker-compose.yml` to use R2 endpoints (`https://<account_id>.r2.cloudflarestorage.com`).
        2.  Ensure `storage_backends.py` and `adapter_factory.py` correctly handle R2's auto-region and addressing styles (already partially supported in codebase).
        3.  Run the connection test endpoint to verify R2 access.

### Phase 3: Data & Caching (D1 & KV)
**Goal:** Offload read-heavy master data and caching logic to the Edge.

*   **Task 3.1: Implement KV Caching**
    *   **Description:** Cache frequent, non-sensitive API responses and Feature Flags.
    *   **Implementation:**
        1.  Bind a KV namespace to the `api-gateway-v2` Worker.
        2.  Implement caching middleware in Hono for endpoints like `/api/master-data/hospitals` or `/api/system/features`.
*   **Task 3.2: Migrate Master Data to D1**
    *   **Description:** Move static reference tables (Doctors, Procedures) to SQLite at the Edge.
    *   **Implementation:**
        1.  Create a D1 Database: `wrangler d1 create imagestro-master-data`.
        2.  Extract schema for read-only tables from Postgres and convert to SQLite syntax.
        3.  Update the Master Data Service (or API Gateway directly) to query D1 using the Cloudflare API/bindings instead of Postgres.

### Phase 4: Edge Intelligence (Workers AI)
**Goal:** Add AI capabilities without requiring expensive GPU servers.

*   **Task 4.1: Medical Report OCR & Summarization**
    *   **Description:** Utilize free LLM/Vision models for document processing.
    *   **Implementation:**
        1.  Bind Workers AI to a new or existing Worker.
        2.  Create an endpoint `/api/ai/summarize` that takes raw diagnostic text and uses a model like `@cf/meta/llama-3-8b-instruct` to generate a structured summary.

### Phase 5: Advanced Edge Integration & Operations
**Goal:** Further reduce server footprint by moving auxiliary services and event-driven logic to the Edge.

*   **Task 5.1: Deploy Frontend SPAs to Cloudflare Pages**
    *   **Description:** Migrate `mwl-pacs-ui` and other SPAs (MWL-UI, SIMRS-Order-UI) to Cloudflare Pages for global edge delivery.
    *   **Implementation:**
        1. Connect the repository to Cloudflare Pages.
        2. Configure build commands (`npm run build`) and output directory (`dist`).
        3. Set up environment variables for the API gateway endpoint.
*   **Task 5.2: Migrate Accession Number Management to D1**
    *   **Description:** Move the `accession-api` logic to a Worker using D1 for sequence persistence and templates.
    *   **Implementation:**
        1. Create D1 tables for accession counters per hospital/tenant.
        2. Implement a Worker that generates unique accession numbers based on configurable templates stored in KV/D1.
*   **Task 5.3: Event-Driven DICOM Processing**
    *   **Description:** Automatically process new DICOM uploads using R2 Event Notifications.
    *   **Implementation:**
        1. Configure an R2 Event Notification to trigger a Worker on `PutObject`.
        2. The Worker extracts metadata tags and updates the central database (or D1 cache).
*   **Task 5.4: Edge-Based Health Monitoring**
    *   **Description:** Replace local Python monitoring scripts with Worker Cron Triggers.
    *   **Implementation:**
        1. Set up a Worker with a Cron Trigger (e.g., every 5 minutes).
        2. The Worker probes backend services and logs status/latency to D1/KV, triggering alerts if services are down.
*   **Task 5.5: SATUSEHAT Token Lifecycle at Edge**
    *   **Description:** Manage Indonesian Ministry of Health (SATUSEHAT) OAuth2 tokens at the Edge.
    *   **Implementation:**
        1. Use KV to store the active SATUSEHAT token shared across all edge instances.
        2. Implement automatic token refresh in a Worker, ensuring backend services always have a valid token available via KV.

## Verification & Testing
*   **Phase 1:** Verify login works seamlessly and Turnstile widget blocks automated requests. Ensure API gateway routes requests correctly to the backend services.
*   **Phase 2:** Upload a test DICOM file. Verify it appears in the R2 bucket dashboard and can be successfully streamed to the Cornerstone.js viewer in the frontend.
*   **Phase 3:** Verify KV cache hits using Cloudflare dashboard metrics. Verify Master Data dropdowns in the frontend populate correctly from D1.
*   **Phase 4:** Submit a dummy radiology text and verify the generated summary format.
*   **Phase 5:** Verify frontend loads from `.pages.dev` domain. Confirm accession numbers are generated correctly from D1 without the `accession-api` Docker service. Check R2 logs for successful Worker triggers on upload.

## Migration & Rollback
*   Each phase is isolated. If Phase 1 (Workers Gateway) fails, DNS can be immediately switched back to the legacy server IP.
*   For R2, keep the legacy storage active as a read-fallback. Only write new studies to R2 until fully confident.
*   D1 migrations should initially be read-only mirrors of Postgres. Keep Postgres as the source of truth until synchronization scripts are proven stable.