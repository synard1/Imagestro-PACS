# Order Files Documentation

This document describes how "files" are modeled and accessed in the Order Management Service
after the introduction and enhancement of the `order_files` table and related APIs.

Goals:
- Provide a clear model for files/attachments linked to orders.
- Support both:
  - Full file upload to the server (multipart/form-data), and
  - Metadata-only entries (backward compatible).
- Ensure files can be listed and retrieved (download/preview) by users.
- Enforce security via the API Gateway (JWT + RBAC).
- Keep compatibility with SATUSEHAT/DICOM monitoring use cases.
- Ensure DICOM uploads have correct `.dcm` extensions and consistent categorization.

## 1. Architecture Overview

Components:

- Order Management Service (DB: `worklist_db`)
  - Source of truth for clinical imaging orders.
  - Owns:
    - `orders` table (rich schema for orders)
    - `order_files` table (files/attachments linked to orders)
  - Provides internal endpoints:
    - `GET /orders/{identifier}/files`
    - `POST /orders/{identifier}/files`
    - `DELETE /orders/{identifier}/files/{file_id}`
    - `GET /orders/{identifier}/files/{file_id}/content` (download file)

- API Gateway
  - Single public entrypoint (`:8888`).
  - Enforces:
    - JWT validation.
    - RBAC (permissions per HTTP method).
  - Proxies `/orders/...` requests to the Order Management Service.
  - For multipart/form-data on `/orders/...`:
    - Forwards raw body and headers (supports file uploads end-to-end).
    - Does NOT modify filenames or extensions; all normalization is done in Order Management.

- apply_satusehat_schema.py (separate optional schema)
  - Targets a different database (default: `orthanc`), not `worklist_db`.
  - Defines an extensive SATUSEHAT/DICOM monitoring schema:
    - `files`, `dicom_metadata`, `studies/series/instances`, etc.
  - MUST NOT be run against `worklist_db`.
  - Optional for advanced pipelines/monitoring.

Important:
- For application-level "order files" (UI, reports, attachments), use `order_files` in `worklist_db` via this API.
- The `files` table from `apply_satusehat_schema.py` is for a separate monitoring/pipeline context.

## 2. Database Model: order_files

Schema (Order Management Service / `worklist_db`):

Table: `order_files`

Columns:

- `id` (uuid, PK)
- `order_id` (uuid, NOT NULL)
  - References `orders.id` ON DELETE CASCADE.
- `accession_number` (varchar(50), nullable)
  - Optional copy of `orders.accession_number` (for faster lookup/reporting).
- `filename` (text, NOT NULL)
  - Logical/original file name presented to clients.
  - For DICOM uploads via multipart, this is normalized to ensure a `.dcm` suffix (see section 3).
- `file_type` (text, NOT NULL)
  - MIME type / type string, e.g. `application/pdf`, `image/jpeg`, `application/dicom`.
- `category` (text, NOT NULL, default `'other'`)
  - Recommended values:
    - `report`      - radiology/clinical report
    - `key_image`   - selected / reference images
    - `dicom`       - DICOM objects/exports (see normalization rules)
    - `log`         - technical or process logs
    - `other`       - everything else
- `size_bytes` (bigint, nullable)
  - File size (in bytes), if known.
- `storage_path` (text, nullable)
  - Where the file is stored on server:
    - e.g. `/var/lib/orders/files/{order_id}/{file_id}`
    - For metadata-only records: may point to external storage or be null.
- `checksum_sha256` (text, nullable)
  - Integrity checksum for uploaded file (if computed).
- `metadata` (jsonb NOT NULL, default `{}`)
  - Arbitrary metadata. Examples:
    - `{ "report_status": "final", "author": "dr.radiologist@hospital.local" }`
    - `{ "study_instance_uid": "...", "sop_instance_uids": [ "...", "..." ] }`
- `created_at` (timestamptz NOT NULL, default `now()`)
- `created_by` (text, nullable)
  - Filled from JWT claims / `X-User-ID` / username if available.
- `source` (text, nullable)
  - e.g. `simrs`, `pacs`, `router`, `api`, `manual`.

Indexes:

- `idx_order_files_order_id` on (`order_id`)
- `idx_order_files_accession` on (`accession_number`)
- `idx_order_files_category` on (`category`)

Notes:

- Created non-destructively in `init_database()`.
- Independent from `apply_satusehat_schema.py`.

## 3. Storage Behavior

Physical storage for uploaded files:

- Controlled by env var in order-management:
  - `ORDER_FILES_STORAGE_ROOT` (default: `/var/lib/orders/files`)
- When uploading via multipart/form-data:
  - Files are stored as:
    - `{ORDER_FILES_STORAGE_ROOT}/{order_id}/{file_id}`
  - `file_id` is the UUID primary key of `order_files`.
  - `storage_path` in DB stores this full path.
- For metadata-only entries (JSON mode):
  - `storage_path` can reference external locations (e.g., URL, S3 key).
  - No physical file is written by this service.

Deletion behavior:

- `DELETE /orders/{identifier}/files/{file_id}`:
  - Currently deletes the metadata row from `order_files`.
  - Does NOT automatically delete the physical file from disk (to avoid unintended data loss).
  - Physical cleanup can be implemented as a separate maintenance task if desired.

### 3.1 DICOM-specific Normalization

For multipart/form-data uploads, Order Management applies additional rules to keep DICOM files consistent:

- DICOM detection heuristics:
  - `file_type` (MIME) contains `dicom`, OR
  - `filename` ends with `.dcm` or `.dicom`, OR
  - `category` explicitly indicates DICOM/image context (`dicom`, `imaging`, `image`).

If any of the above indicate a DICOM file:

1) Filename normalization:
   - If the effective `filename` does NOT end with `.dcm`:
     - The service automatically appends `.dcm`.
   - This affects:
     - The `filename` stored in `order_files`.
     - The `download_name` returned by the content endpoint.
   - The physical storage file is still `{order_id}/{file_id}` (UUID), so this change is safe and only user-facing.

2) Category normalization:
   - If the MIME type indicates DICOM (e.g. `application/dicom`)
   - AND the provided `category` is generic (`other`, empty, `file`, `image`),
   - THEN `category` is automatically set to `dicom`.
   - This ensures:
     - Easier filtering/reporting for DICOM-related files.
     - Consistent semantics for UIs and analytics.

Notes:

- JSON mode (metadata-only) does NOT auto-rewrite filename or category:
  - This mode is for advanced/external storage scenarios where the client controls naming.

## 4. API Endpoints (via API Gateway)

All external access should go through the API Gateway.

Base URL:
- `http(s)://<gateway-host>:8888`

Authentication:
- JWT required.

Authorization (Gateway generic rules for `/orders/<path>`):

- `GET`    → requires `order:read` or `*`
- `POST`   → requires `order:create` or `*`
- `PUT`    → requires `order:update` or `*`
- `DELETE` → requires `order:delete` or `*`

Specific to file operations:

- `GET /orders/{id}/files`                      → `order:read` or `*`
- `POST /orders/{id}/files`                     → `order:create` or `*`
- `DELETE /orders/{id}/files/{file_id}`         → `order:delete` or `*`
- `GET /orders/{id}/files/{file_id}/content`    → `order:read` or `*`

Order Management file endpoints trust the gateway and do not re-verify JWT.

`{identifier}` can be:
- `id` (UUID), or
- `accession_number`, or
- `order_number`.

### 4.1 GET /orders/{identifier}/files

Retrieve order summary and all files associated with the order.

Behavior unchanged (see previous version), using `order_files` metadata.

### 4.2 POST /orders/{identifier}/files

Attach a file to an order.

Mode A: multipart/form-data (recommended, with file upload)

- Request:
  - `POST /orders/{identifier}/files`
  - `Content-Type: multipart/form-data`
  - Fields:
    - `file` (required) — binary file.
    - `category` (optional)
    - `metadata` (optional, JSON string)
    - `file_type` (optional, overrides MIME)

Key behaviors:

- Gateway:
  - Forwards multipart body as-is (no filename/extension changes).
- Order Management:
  - Resolves order; generates `file_id`.
  - Saves to `{ORDER_FILES_STORAGE_ROOT}/{order_id}/{file_id}`.
  - Computes `size_bytes` and `checksum_sha256`.
  - Normalizes:
    - DICOM filename:
      - If detected as DICOM and filename lacks `.dcm` → append `.dcm`.
    - DICOM category:
      - If MIME indicates DICOM and category generic → set `category = "dicom"`.

Example (DICOM upload without `.dcm`):

- Client uploads `file` with name `CT_HEAD_001` and `file_type=application/dicom`.
- Stored metadata:
  - `filename`: `CT_HEAD_001.dcm`
  - `category`: `dicom`
  - `file_type`: `application/dicom`

Mode B: application/json (metadata-only)

- Request:
  - `POST /orders/{identifier}/files`
  - `Content-Type: application/json`
- Behavior:
  - Inserts metadata only.
  - No automatic `.dcm` suffix or category rewrite; caller is responsible.

### 4.3 DELETE /orders/{identifier}/files/{file_id}

Deletes `order_files` row for that order+file. Physical file cleanup is out-of-scope.

### 4.4 GET /orders/{identifier}/files/{file_id}/content

Download/stream the physical file content.

Behavior:

- Uses `storage_path` from `order_files`.
- Returns:
  - `Content-Type` from `file_type`.
  - `Content-Disposition` with `filename` from `order_files`.
- For normalized DICOM uploads:
  - Client receives filename with `.dcm`.

Errors:
- 400/404/401/403 sesuai kondisi yang telah dijelaskan sebelumnya.

## 5. Relationship to apply_satusehat_schema.py

- Separate monitoring schema; do not run on `worklist_db`.
- `order_files.metadata` can store references to that schema if integrated.

## 6. Summary

- `order_files` is the canonical model for files/attachments linked to orders.
- Supports:
  - Multipart upload with safe on-disk naming and rich metadata.
  - Metadata-only records for external storage.
- All access via API Gateway with JWT + RBAC.
- New guarantees for DICOM uploads (multipart):
  - DICOM files are categorized as `dicom` (when MIME is DICOM and category generic).
  - Presented filenames are normalized to include `.dcm`, improving interoperability with DICOM tools and UIs.
