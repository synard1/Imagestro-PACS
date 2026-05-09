# PACS Service API Documentation: Studies & WADO-RS

> **Version**: 1.0.0
> **Base URL**: `http://localhost:8003` (adjust for production)
> **API Prefix**:
> - Studies: `/api/studies`
> - WADO-RS: `/wado-rs`
> **Auth**: Currently disabled (RBAC commented out). Production requires `SUPERADMIN` or `DEVELOPER` roles.
> **CORS**: Enabled for `localhost:5173`, `localhost:3000`, `localhost:8080`.
> **Docs**: `/api/docs` (Swagger), `/api/redoc`
> **Health**: `/api/health`, `/wado-rs/health`

This documentation covers the **Studies** and **WADO-RS** APIs for frontend/UI integration. All UIDs follow DICOM standards (e.g., `1.2.840.113619.2.5.1762583154.215214.12321789.23491234.567890`).

---

## Table of Contents
- [Studies API](#studies-api)
  - [List Studies](#get-apistudies)
  - [Get Study Details](#get-apistudiesStudy_uid)
  - [Get Study Series](#get-apistudiesstudY_uidseries)
  - [Get Study Files](#get-apistudiesstudY_uidfiles)
  - [Delete Study](#delete-apistudiesstudY_uid)
- [WADO-RS API](#wado-rs-api)
  - [Get Study Instances](#get-wado-rsstudiesstudY_id)
  - [Get Series Instances](#get-wado-rsstudiesstudY_idseriesseries_id)
  - [Download DICOM Instance](#get-wado-rsstudiesstudY_idseriesseries_idinstancesinstance_id)
  - [Get Instance Metadata](#get-wado-rsstudiesstudY_idseriesseries_idinstancesinstance_idmetadata)
  - [Get Thumbnail](#get-wado-rsstudiesstudY_idseriesseries_idinstancesinstance_idthumbnail)
  - [Get Rendered Image](#get-wado-rsstudiesstudY_idseriesseries_idinstancesinstance_idrendered)
  - [Get Frame](#get-wado-rsstudiesstudY_idseriesseries_idinstancesinstance_idframesframe_number)
  - [Health Check](#get-wado-rshealth)
- [Data Models](#data-models)
- [Error Handling](#error-handling)
- [Frontend Integration Examples](#frontend-integration-examples)
- [DICOM UIDs](#dicom-uids)

---

## Studies API

Manage DICOM studies with listing, retrieval, series access, file information, and soft-delete operations.

**Base Path**: `/api/studies`

### `GET /api/studies`

**List studies** with pagination and filters. Only returns non-deleted studies (where `deleted_at IS NULL`).

**Query Parameters**:

| Parameter | Type | Required | Default | Validation | Description | Example |
|-----------|------|----------|---------|------------|-------------|---------|
| `page` | `integer` | No | `1` | ≥1 | Page number | `1` |
| `page_size` | `integer` | No | `25` | 1-100 | Items per page | `25` |
| `patient_name` | `string` | No | - | - | Partial match (case-insensitive) | `John Doe` |
| `accession_number` | `string` | No | - | - | Exact match | `ACC123` |
| `modality` | `string` | No | - | - | Exact match (e.g., CT, MR, XA) | `CT` |
| `study_date_from` | `string` | No | - | YYYY-MM-DD | From date (inclusive) | `2025-01-01` |
| `study_date_to` | `string` | No | - | YYYY-MM-DD | To date (inclusive) | `2025-11-21` |

**Filtering Logic**:
- `patient_name`: Uses SQL `ILIKE` with wildcards (`%{value}%`)
- Other filters: Exact match
- Multiple filters: Combined with AND logic
- Soft-deleted studies are excluded automatically

**Response**: `200 OK`

**Content-Type**: `application/json`

**Response Schema**: `PaginatedResponse[StudyList]`

```json
{
  "data": [
    {
      "study_instance_uid": "1.2.840.113619.2.5.1762583154.215214.12321789.23",
      "study_date": "2025-11-19",
      "study_description": "Chest CT with Contrast",
      "accession_number": "ACC123456",
      "patient_name": "Doe^John",
      "modality": "CT",
      "number_of_series": 5,
      "number_of_instances": 150,
      "created_at": "2025-11-19T10:30:00.123456Z"
    },
    {
      "study_instance_uid": "1.2.840.113619.2.5.1762583154.215214.98765432.11",
      "study_date": "2025-11-18",
      "study_description": "Brain MRI",
      "accession_number": "ACC789012",
      "patient_name": "Smith^Jane",
      "modality": "MR",
      "number_of_series": 8,
      "number_of_instances": 320,
      "created_at": "2025-11-18T14:22:00.654321Z"
    }
  ],
  "count": 2,
  "page": 1,
  "page_size": 25,
  "total": 47,
  "total_pages": 2
}
```

**Response Fields**:
- `data`: Array of `StudyList` objects (see [StudyList Schema](#studylist))
- `count`: Number of items in current page
- `page`: Current page number
- `page_size`: Items per page
- `total`: Total number of studies matching filters
- `total_pages`: Total pages available

**Example Requests**:

```bash
# Get first page
GET /api/studies?page=1&page_size=25

# Filter by patient name
GET /api/studies?patient_name=Doe

# Filter by date range and modality
GET /api/studies?study_date_from=2025-01-01&study_date_to=2025-11-21&modality=CT

# Combined filters
GET /api/studies?patient_name=John&modality=MR&page=1&page_size=10
```

---

### `GET /api/studies/{study_uid}`

**Get detailed study information** by Study Instance UID.

**Path Parameters**:

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `study_uid` | `string` | Yes | Study Instance UID (DICOM UID) |

**Response**: `200 OK`

**Content-Type**: `application/json`

**Response Schema**: `StudyResponse`

```json
{
  "study_instance_uid": "1.2.840.113619.2.5.1762583154.215214.12321789.23",
  "study_id": "STUDY20251119001",
  "study_date": "2025-11-19",
  "study_time": "10:30:00",
  "study_description": "Chest CT with Contrast",
  "accession_number": "ACC123456",
  "patient_name": "Doe^John",
  "patient_id": "550e8400-e29b-41d4-a716-446655440000",
  "patient_birth_date": "1980-01-15",
  "patient_sex": "M",
  "referring_physician": "Dr. Smith",
  "modality": "CT",
  "order_id": "660e8400-e29b-41d4-a716-446655440001",
  "number_of_series": 5,
  "number_of_instances": 150,
  "storage_size": 125000000,
  "orthanc_id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "created_at": "2025-11-19T10:30:00.123456Z",
  "updated_at": "2025-11-19T10:30:00.123456Z",
  "deleted_at": null
}
```

**Response Fields**: See [StudyResponse Schema](#studyresponse)

**Error Responses**:

```json
// 404 Not Found
{
  "status": "error",
  "error_code": "STUDY_NOT_FOUND",
  "message": "Study with UID 1.2.840.113619... not found"
}
```

**Example Request**:

```bash
GET /api/studies/1.2.840.113619.2.5.1762583154.215214.12321789.23
```

---

### `GET /api/studies/{study_uid}/series`

**Get all series** belonging to a specific study. Returns detailed series information ordered by series number.

**Path Parameters**:

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `study_uid` | `string` | Yes | Study Instance UID |

**Response**: `200 OK`

**Content-Type**: `application/json`

**Response Schema**: `List[SeriesResponse]`

```json
[
  {
    "series_instance_uid": "1.2.840.113619.2.5.1762583154.215214.55555555.01",
    "study_instance_uid": "1.2.840.113619.2.5.1762583154.215214.12321789.23",
    "series_number": 1,
    "series_description": "Axial CT",
    "modality": "CT",
    "body_part_examined": "CHEST",
    "number_of_instances": 50,
    "storage_size": 25000000,
    "orthanc_id": "series-orthanc-id-001",
    "created_at": "2025-11-19T10:30:00.123456Z",
    "updated_at": "2025-11-19T10:30:00.123456Z"
  },
  {
    "series_instance_uid": "1.2.840.113619.2.5.1762583154.215214.55555555.02",
    "study_instance_uid": "1.2.840.113619.2.5.1762583154.215214.12321789.23",
    "series_number": 2,
    "series_description": "Coronal CT",
    "modality": "CT",
    "body_part_examined": "CHEST",
    "number_of_instances": 40,
    "storage_size": 20000000,
    "orthanc_id": "series-orthanc-id-002",
    "created_at": "2025-11-19T10:31:00.123456Z",
    "updated_at": "2025-11-19T10:31:00.123456Z"
  }
]
```

**Response Fields**: See [SeriesResponse Schema](#seriesresponse)

**Ordering**: Results are ordered by `series_number` (ascending)

**Error Responses**:

```json
// 404 Not Found - Study doesn't exist
{
  "status": "error",
  "error_code": "STUDY_NOT_FOUND",
  "message": "Study with UID 1.2.840.113619... not found"
}
```

**Example Request**:

```bash
GET /api/studies/1.2.840.113619.2.5.1762583154.215214.12321789.23/series
```

**Use Cases**:
- Display series list in study viewer
- Build series thumbnails grid
- Series navigation in DICOM viewer
- Calculate total study storage

---

### `GET /api/studies/{study_uid}/files`

**Get physical DICOM files** associated with a study. Returns file metadata including filesystem paths and existence status.

**Path Parameters**:

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `study_uid` | `string` | Yes | Study Instance UID |

**Response**: `200 OK`

**Content-Type**: `application/json`

**Response Schema**: `List[FileInfo]`

```json
[
  {
    "id": "7c9e6679-7425-40de-944b-e07fc1f90ae7",
    "file_path": "/storage/studies/1.2.840.113619.2.5.1762583154/IMG0001.dcm",
    "filename": "IMG0001.dcm",
    "file_size": 5242880,
    "sop_instance_uid": "1.2.840.113619.2.5.1762583154.215214.99999999.01",
    "created_at": "2025-11-19T10:30:00.123456Z",
    "exists": true
  },
  {
    "id": "8d0f7680-8536-51ef-a55c-f18gd2ga1bf8",
    "file_path": "/storage/studies/1.2.840.113619.2.5.1762583154/IMG0002.dcm",
    "filename": "IMG0002.dcm",
    "file_size": 5242880,
    "sop_instance_uid": "1.2.840.113619.2.5.1762583154.215214.99999999.02",
    "created_at": "2025-11-19T10:30:01.234567Z",
    "exists": true
  }
]
```

**Response Fields**:

| Field | Type | Description |
|-------|------|-------------|
| `id` | `string` (UUID) | Database ID of file record |
| `file_path` | `string` | Absolute filesystem path |
| `filename` | `string` or `null` | Original filename from metadata |
| `file_size` | `integer` | File size in bytes |
| `sop_instance_uid` | `string` | DICOM SOP Instance UID |
| `created_at` | `string` (ISO 8601) | File creation timestamp |
| `exists` | `boolean` | Whether file exists on filesystem |

**Ordering**: Results ordered by `created_at` (descending - newest first)

**Notes**:
- `exists` field performs real-time filesystem check with `os.path.exists()`
- `filename` extracted from `dicom_metadata` JSON field if available
- Returns empty array `[]` if no files found for study
- File paths are internal - use WADO-RS endpoints for actual file access

**Example Request**:

```bash
GET /api/studies/1.2.840.113619.2.5.1762583154.215214.12321789.23/files
```

**Use Cases**:
- Verify file integrity
- Debug storage issues
- Audit file locations
- Check missing files (`exists: false`)

---

### `DELETE /api/studies/{study_uid}`

**Soft-delete a study** by setting `deleted_at` timestamp. Study data remains in database but is excluded from listing queries.

**Path Parameters**:

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `study_uid` | `string` | Yes | Study Instance UID |

**Response**: `200 OK`

**Content-Type**: `application/json`

```json
{
  "status": "success",
  "message": "Study deleted successfully",
  "study_uid": "1.2.840.113619.2.5.1762583154.215214.12321789.23"
}
```

**Implementation Details**:
- Uses raw SQL with parameterized query for safety
- Only deletes if `deleted_at IS NULL` (prevents double-deletion)
- Sets `deleted_at = NOW()` (database server timestamp)
- Transaction committed immediately

**Error Responses**:

```json
// 404 Not Found - Study doesn't exist or already deleted
{
  "detail": "Study not found"
}
```

**Example Request**:

```bash
DELETE /api/studies/1.2.840.113619.2.5.1762583154.215214.12321789.23
```

**Important Notes**:
- This is a **soft delete** - data is NOT physically removed
- Deleted studies won't appear in `GET /api/studies` listing
- Deleted studies CAN still be retrieved via `GET /api/studies/{study_uid}`
- WADO-RS endpoints may still serve deleted studies (check implementation)
- Physical files remain on disk - implement cleanup job if needed

---

## WADO-RS API

DICOMweb RESTful Services (WADO-RS) for medical image retrieval, compliant with DICOM PS3.18 standard.

**Base Path**: `/wado-rs`

**Standard Compliance**: Implements subset of DICOMweb WADO-RS specification

---

### `GET /wado-rs/studies/{study_id}`

**Get all instances** in a study with metadata.

**Path Parameters**:

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `study_id` | `string` | Yes | Study Instance UID |

**Response**: `200 OK`

**Content-Type**: `application/json`

```json
{
  "study_id": "1.2.840.113619.2.5.1762583154.215214.12321789.23",
  "instance_count": 150,
  "instances": [
    {
      "sop_instance_uid": "1.2.840.113619.2.5.1762583154.215214.99999999.01",
      "series_instance_uid": "1.2.840.113619.2.5.1762583154.215214.55555555.01",
      "instance_number": 1,
      "rows": 512,
      "columns": 512,
      "bits_allocated": 16
    }
  ]
}
```

**Response Fields**:
- `study_id`: Study Instance UID (echoed from request)
- `instance_count`: Total number of instances
- `instances`: Array of instance metadata objects

**Error Responses**:

```json
// 500 Internal Server Error
{
  "detail": "Error message"
}
```

---

### `GET /wado-rs/studies/{study_id}/series/{series_id}`

**Get all instances** in a specific series with metadata.

**Path Parameters**:

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `study_id` | `string` | Yes | Study Instance UID |
| `series_id` | `string` | Yes | Series Instance UID |

**Response**: `200 OK`

**Content-Type**: `application/json`

```json
{
  "study_id": "1.2.840.113619.2.5.1762583154.215214.12321789.23",
  "series_id": "1.2.840.113619.2.5.1762583154.215214.55555555.01",
  "instance_count": 50,
  "instances": [
    {
      "sop_instance_uid": "1.2.840.113619.2.5.1762583154.215214.99999999.01",
      "instance_number": 1,
      "rows": 512,
      "columns": 512
    }
  ]
}
```

**Response Fields**:
- `study_id`: Study Instance UID
- `series_id`: Series Instance UID
- `instance_count`: Total instances in series
- `instances`: Array of instance metadata

---

### `GET /wado-rs/studies/{study_id}/series/{series_id}/instances/{instance_id}`

**Download DICOM instance file** in native DICOM format.

**Path Parameters**:

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `study_id` | `string` | Yes | Study Instance UID |
| `series_id` | `string` | Yes | Series Instance UID |
| `instance_id` | `string` | Yes | SOP Instance UID |

**Response**: `200 OK`

**Content-Type**: `application/dicom`

**Headers**:
```
Content-Disposition: attachment; filename={instance_id}.dcm
```

**Response Body**: Binary DICOM file

**Error Responses**:

```json
// 404 Not Found
{
  "detail": "Instance not found"
}

// 500 Internal Server Error
{
  "detail": "Error message"
}
```

**Example Request**:

```bash
curl -O -J "http://localhost:8003/wado-rs/studies/1.2.840.../series/1.2.840.../instances/1.2.840..."
```

---

### `GET /wado-rs/studies/{study_id}/series/{series_id}/instances/{instance_id}/metadata`

**Get instance metadata** without pixel data. Returns DICOM tags in JSON format.

**Path Parameters**:

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `study_id` | `string` | Yes | Study Instance UID |
| `series_id` | `string` | Yes | Series Instance UID |
| `instance_id` | `string` | Yes | SOP Instance UID |

**Response**: `200 OK`

**Content-Type**: `application/json`

**Response Body**: JSON object with DICOM tags (pixel data excluded)

```json
{
  "00080018": {
    "vr": "UI",
    "Value": ["1.2.840.113619.2.5.1762583154.215214.99999999.01"]
  },
  "00200013": {
    "vr": "IS",
    "Value": [1]
  },
  "00280010": {
    "vr": "US",
    "Value": [512]
  }
}
```

**Format**: DICOMweb JSON (tag format: 8-character hex group+element)

**Error Responses**:

```json
// 404 Not Found
{
  "detail": "Instance not found"
}
```

---

### `GET /wado-rs/studies/{study_id}/series/{series_id}/instances/{instance_id}/thumbnail`

**Get thumbnail image** in JPEG format. Optimized for preview/list views.

**Path Parameters**:

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `study_id` | `string` | Yes | Study Instance UID |
| `series_id` | `string` | Yes | Series Instance UID |
| `instance_id` | `string` | Yes | SOP Instance UID |

**Query Parameters**:

| Parameter | Type | Required | Default | Validation | Description |
|-----------|------|----------|---------|------------|-------------|
| `size` | `integer` | No | `200` | 50-500 | Thumbnail size in pixels (max dimension) |

**Response**: `200 OK`

**Content-Type**: `image/jpeg`

**Headers**:
```
Cache-Control: public, max-age=3600
```

**Response Body**: JPEG image binary

**Implementation Notes**:
- Maintains aspect ratio (size is max dimension)
- Uses DICOM windowing for optimal contrast
- Cached for 1 hour (3600 seconds)
- Recommended sizes: 100 (grid), 200 (list), 300 (preview)

**Error Responses**:

```json
// 404 Not Found
{
  "detail": "Thumbnail not available"
}
```

**Example Requests**:

```bash
# Default 200px thumbnail
GET /wado-rs/studies/1.2.840.../series/1.2.840.../instances/1.2.840.../thumbnail

# 150px thumbnail for grid view
GET /wado-rs/studies/1.2.840.../series/1.2.840.../instances/1.2.840.../thumbnail?size=150
```

---

### `GET /wado-rs/studies/{study_id}/series/{series_id}/instances/{instance_id}/rendered`

**Get rendered image** with DICOM windowing applied. For viewport display with window/level controls.

**Path Parameters**:

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `study_id` | `string` | Yes | Study Instance UID |
| `series_id` | `string` | Yes | Series Instance UID |
| `instance_id` | `string` | Yes | SOP Instance UID |

**Query Parameters**:

| Parameter | Type | Required | Default | Validation | Description |
|-----------|------|----------|---------|------------|-------------|
| `window_center` | `integer` | No | Auto | - | Window center (brightness) |
| `window_width` | `integer` | No | Auto | - | Window width (contrast) |
| `quality` | `integer` | No | `90` | 1-100 | JPEG quality |

**Response**: `200 OK`

**Content-Type**: `image/jpeg`

**Headers**:
```
Cache-Control: public, max-age=300
```

**Response Body**: JPEG image binary

**Window/Level Behavior**:
- If `window_center` and `window_width` are **not** provided: Uses DICOM default window or auto-calculation
- If **both** provided: Applies custom windowing
- Values correspond to DICOM Window Center/Width tags

**Implementation Notes**:
- Full resolution rendering
- Cached for 5 minutes (300 seconds)
- Quality range: 1 (lowest) to 100 (highest)
- Recommended quality: 85-95 for diagnostic viewing

**Error Responses**:

```json
// 404 Not Found
{
  "detail": "Image not available"
}
```

**Example Requests**:

```bash
# Auto windowing
GET /wado-rs/studies/1.2.840.../series/1.2.840.../instances/1.2.840.../rendered

# Custom window (CT lung window: center=-600, width=1500)
GET /wado-rs/studies/1.2.840.../series/1.2.840.../instances/1.2.840.../rendered?window_center=-600&window_width=1500

# High quality with custom window
GET /wado-rs/studies/1.2.840.../series/1.2.840.../instances/1.2.840.../rendered?window_center=40&window_width=400&quality=95
```

**Common Window Presets**:

| Preset | Window Center | Window Width | Use Case |
|--------|---------------|--------------|----------|
| CT Lung | -600 | 1500 | Lung parenchyma |
| CT Mediastinum | 40 | 400 | Soft tissue |
| CT Bone | 400 | 1800 | Bone detail |
| CT Brain | 40 | 80 | Brain tissue |

---

### `GET /wado-rs/studies/{study_id}/series/{series_id}/instances/{instance_id}/frames/{frame_number}`

**Get specific frame** from multi-frame DICOM instance. For cine loops, ultrasound, and other multi-frame modalities.

**Path Parameters**:

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `study_id` | `string` | Yes | Study Instance UID |
| `series_id` | `string` | Yes | Series Instance UID |
| `instance_id` | `string` | Yes | SOP Instance UID |
| `frame_number` | `integer` | Yes | Frame number (1-based index) |

**Query Parameters**:

| Parameter | Type | Required | Default | Validation | Description |
|-----------|------|----------|---------|------------|-------------|
| `frame` | `integer` | No | - | - | Alternative frame number (OHIF compatibility) |
| `quality` | `integer` | No | `90` | 1-100 | JPEG quality |

**Response**: `200 OK`

**Content-Type**: `image/jpeg`

**Headers**:
```
Content-Type: image/jpeg
Cache-Control: public, max-age=300
```

**Response Body**: JPEG frame image binary

**Frame Number Logic**:
- Prioritizes `frame_number` from path
- Falls back to `frame` query parameter if path param is 0/null
- Defaults to frame 1 if neither provided
- Frame indexing is **1-based** (first frame = 1)

**Implementation Notes**:
- Cached for 5 minutes (300 seconds)
- Single-frame instances should use frame 1
- Multi-frame instances specify total frames in DICOM metadata

**Error Responses**:

```json
// 404 Not Found
{
  "detail": "Frame {frame_num} not available"
}
```

**Example Requests**:

```bash
# Get first frame (path parameter)
GET /wado-rs/studies/1.2.840.../series/1.2.840.../instances/1.2.840.../frames/1

# Get frame 15 (path parameter)
GET /wado-rs/studies/1.2.840.../series/1.2.840.../instances/1.2.840.../frames/15

# OHIF compatibility (query parameter)
GET /wado-rs/studies/1.2.840.../series/1.2.840.../instances/1.2.840.../frames/1?frame=5

# High quality frame
GET /wado-rs/studies/1.2.840.../series/1.2.840.../instances/1.2.840.../frames/1?quality=95
```

**Use Cases**:
- Cine loop playback (cardiac, ultrasound)
- Frame-by-frame navigation
- Multi-phase CT/MR series
- OHIF/Cornerstone viewer integration

**Known Issue**:
⚠️ Current implementation has alias typo: `alias="fram"` instead of `alias="frame"`. Query parameter should be `?frame=N` but code may expect `?fram=N`. Use path parameter for reliability.

---

### `GET /wado-rs/health`

**Health check endpoint** for WADO-RS service monitoring.

**Response**: `200 OK`

**Content-Type**: `application/json`

```json
{
  "status": "healthy",
  "service": "WADO-RS",
  "version": "1.0.0",
  "endpoints": [
    "/wado-rs/studies/{study_id}",
    "/wado-rs/studies/{study_id}/series/{series_id}",
    "/wado-rs/studies/{study_id}/series/{series_id}/instances/{instance_id}",
    "/wado-rs/studies/{study_id}/series/{series_id}/instances/{instance_id}/metadata",
    "/wado-rs/studies/{study_id}/series/{series_id}/instances/{instance_id}/thumbnail",
    "/wado-rs/studies/{study_id}/series/{series_id}/instances/{instance_id}/rendered"
  ]
}
```

**Error Response**: `503 Service Unavailable`

```json
{
  "detail": "WADO service unhealthy: {error_message}"
}
```

**Example Request**:

```bash
curl http://localhost:8003/wado-rs/health
```

---

## Data Models

### StudyList

Minimal study information for list views. Used in paginated study listings.

| Field | Type | Required | Description | Example |
|-------|------|----------|-------------|---------|
| `study_instance_uid` | `string` | Yes | Study Instance UID | `1.2.840.113619...` |
| `study_date` | `string` or `null` | No | Study date (YYYY-MM-DD) | `2025-11-19` |
| `study_description` | `string` or `null` | No | Study description | `Chest CT` |
| `accession_number` | `string` or `null` | No | Accession number | `ACC123456` |
| `patient_name` | `string` or `null` | No | Patient name (Last^First) | `Doe^John` |
| `modality` | `string` or `null` | No | Primary modality | `CT` |
| `number_of_series` | `integer` | Yes | Series count | `5` |
| `number_of_instances` | `integer` | Yes | Instance count | `150` |
| `created_at` | `string` | Yes | Creation timestamp (ISO 8601) | `2025-11-19T10:30:00.123456Z` |

**Source**: `app/schemas/study.py` - `StudyList` class

---

### StudyResponse

Complete study information with all metadata. Used for detailed study view.

| Field | Type | Required | Description | Example |
|-------|------|----------|-------------|---------|
| `study_instance_uid` | `string` | Yes | Study Instance UID | `1.2.840.113619...` |
| `study_id` | `string` or `null` | No | Study ID | `STUDY20251119001` |
| `study_date` | `string` or `null` | No | Study date (YYYY-MM-DD) | `2025-11-19` |
| `study_time` | `string` or `null` | No | Study time (HH:MM:SS) | `10:30:00` |
| `study_description` | `string` or `null` | No | Study description | `Chest CT with Contrast` |
| `accession_number` | `string` or `null` | No | Accession number | `ACC123456` |
| `patient_name` | `string` or `null` | No | Patient name (Last^First) | `Doe^John` |
| `patient_id` | `string` (UUID) or `null` | No | Internal patient ID | `550e8400-e29b-41d4-...` |
| `patient_birth_date` | `string` or `null` | No | Birth date (YYYY-MM-DD) | `1980-01-15` |
| `patient_sex` | `string` or `null` | No | Patient sex (M/F/O) | `M` |
| `referring_physician` | `string` or `null` | No | Referring physician name | `Dr. Smith` |
| `modality` | `string` or `null` | No | Primary modality | `CT` |
| `order_id` | `string` (UUID) or `null` | No | Internal order ID | `660e8400-e29b-41d4-...` |
| `number_of_series` | `integer` | Yes | Series count | `5` |
| `number_of_instances` | `integer` | Yes | Instance count | `150` |
| `storage_size` | `integer` | Yes | Total size in bytes | `125000000` |
| `orthanc_id` | `string` or `null` | No | Orthanc resource ID | `a1b2c3d4-e5f6-7890-...` |
| `created_at` | `string` | Yes | Creation timestamp | `2025-11-19T10:30:00.123456Z` |
| `updated_at` | `string` | Yes | Last update timestamp | `2025-11-19T10:30:00.123456Z` |
| `deleted_at` | `string` or `null` | No | Deletion timestamp | `null` or `2025-11-20T15:00:00Z` |

**Source**: `app/schemas/study.py` - `StudyResponse` class

---

### SeriesResponse

Complete series information. Used for series listings and detail views.

| Field | Type | Required | Description | Example |
|-------|------|----------|-------------|---------|
| `series_instance_uid` | `string` | Yes | Series Instance UID | `1.2.840.113619.2.5...` |
| `study_instance_uid` | `string` | Yes | Parent study UID | `1.2.840.113619.2.5...` |
| `series_number` | `integer` or `null` | No | Series number | `1` |
| `series_description` | `string` or `null` | No | Series description | `Axial CT` |
| `modality` | `string` or `null` | No | Modality | `CT` |
| `body_part_examined` | `string` or `null` | No | Body part | `CHEST` |
| `number_of_instances` | `integer` | Yes | Instance count in series | `50` |
| `storage_size` | `integer` | Yes | Total size in bytes | `25000000` |
| `orthanc_id` | `string` or `null` | No | Orthanc resource ID | `series-orthanc-id-001` |
| `created_at` | `string` | Yes | Creation timestamp | `2025-11-19T10:30:00Z` |
| `updated_at` | `string` | Yes | Last update timestamp | `2025-11-19T10:30:00Z` |

**Source**: `app/schemas/series.py` - `SeriesResponse` class

---

## Error Handling

All endpoints use consistent error response format with HTTP status codes.

### Error Response Format

```json
{
  "status": "error",
  "error_code": "ERROR_CODE_CONSTANT",
  "message": "Human-readable error description"
}
```

**Alternative Format** (some endpoints):

```json
{
  "detail": "Error message or object"
}
```

### HTTP Status Codes

| Code | Meaning | When Used |
|------|---------|-----------|
| `200` | OK | Successful request |
| `400` | Bad Request | Invalid parameters (validation errors) |
| `404` | Not Found | Resource doesn't exist (study/series/instance) |
| `500` | Internal Server Error | Server-side error |
| `503` | Service Unavailable | Service health check failure |

### Common Error Codes

| Error Code | HTTP Status | Description | Example |
|------------|-------------|-------------|---------|
| `STUDY_NOT_FOUND` | 404 | Study UID not in database | Invalid study UID |
| `VALIDATION_ERROR` | 400 | Query parameter validation failed | `page=-1` |
| `INSTANCE_NOT_FOUND` | 404 | DICOM instance not found | WADO instance retrieval |

### Error Examples

**Study Not Found**:
```json
{
  "status": "error",
  "error_code": "STUDY_NOT_FOUND",
  "message": "Study with UID 1.2.840.113619.2.5.1762583154.215214.12321789.23 not found"
}
```

**Validation Error**:
```json
{
  "detail": [
    {
      "loc": ["query", "page"],
      "msg": "ensure this value is greater than or equal to 1",
      "type": "value_error.number.not_ge"
    }
  ]
}
```

**Generic Error**:
```json
{
  "detail": "Thumbnail not available"
}
```

---

## Frontend Integration Examples

### JavaScript/TypeScript Examples

#### List Studies with Filtering

```javascript
// ES6 Fetch API
async function fetchStudies(filters = {}) {
  const params = new URLSearchParams({
    page: filters.page || 1,
    page_size: filters.pageSize || 25,
    ...(filters.patientName && { patient_name: filters.patientName }),
    ...(filters.modality && { modality: filters.modality }),
    ...(filters.dateFrom && { study_date_from: filters.dateFrom }),
    ...(filters.dateTo && { study_date_to: filters.dateTo })
  });

  const response = await fetch(`/api/studies?${params}`, {
    credentials: 'include' // Include cookies if auth enabled
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
  }

  const data = await response.json();

  return {
    studies: data.data,
    pagination: {
      page: data.page,
      pageSize: data.page_size,
      total: data.total,
      totalPages: data.total_pages
    }
  };
}

// Usage
const result = await fetchStudies({
  patientName: 'Doe',
  modality: 'CT',
  dateFrom: '2025-01-01',
  page: 1,
  pageSize: 10
});

console.log(`Found ${result.pagination.total} studies`);
result.studies.forEach(study => {
  console.log(`${study.patient_name} - ${study.study_description}`);
});
```

#### Get Study with Series

```javascript
async function fetchStudyWithSeries(studyUid) {
  // Fetch study details and series in parallel
  const [study, series] = await Promise.all([
    fetch(`/api/studies/${studyUid}`).then(r => r.json()),
    fetch(`/api/studies/${studyUid}/series`).then(r => r.json())
  ]);

  return {
    ...study,
    series: series
  };
}

// Usage
const studyData = await fetchStudyWithSeries('1.2.840.113619...');
console.log(`Study has ${studyData.series.length} series`);
```

#### Display Thumbnail Grid

```javascript
function renderSeriesThumbnails(studyUid, seriesList) {
  const container = document.getElementById('thumbnails');

  seriesList.forEach(series => {
    // Assuming first instance UID is available from WADO instances endpoint
    const thumbnailUrl = `/wado-rs/studies/${studyUid}/series/${series.series_instance_uid}/instances/${firstInstanceUid}/thumbnail?size=150`;

    const img = document.createElement('img');
    img.src = thumbnailUrl;
    img.alt = series.series_description || 'Series';
    img.classList.add('thumbnail');
    img.dataset.seriesUid = series.series_instance_uid;

    img.addEventListener('click', () => {
      openSeriesViewer(studyUid, series.series_instance_uid);
    });

    container.appendChild(img);
  });
}
```

#### DICOM Image Viewer with Windowing

```javascript
class DicomImageViewer {
  constructor(containerElement) {
    this.container = containerElement;
    this.img = document.createElement('img');
    this.container.appendChild(this.img);

    // Window presets for CT
    this.presets = {
      lung: { center: -600, width: 1500 },
      mediastinum: { center: 40, width: 400 },
      bone: { center: 400, width: 1800 }
    };
  }

  async loadInstance(studyUid, seriesUid, instanceUid, preset = 'mediastinum') {
    const { center, width } = this.presets[preset];

    const url = `/wado-rs/studies/${studyUid}/series/${seriesUid}/instances/${instanceUid}/rendered?window_center=${center}&window_width=${width}&quality=90`;

    this.img.src = url;
    this.img.alt = 'DICOM Image';
  }

  async loadWithCustomWindow(studyUid, seriesUid, instanceUid, center, width) {
    const url = `/wado-rs/studies/${studyUid}/series/${seriesUid}/instances/${instanceUid}/rendered?window_center=${center}&window_width=${width}&quality=90`;

    this.img.src = url;
  }
}

// Usage
const viewer = new DicomImageViewer(document.getElementById('viewer'));
await viewer.loadInstance(studyUid, seriesUid, instanceUid, 'lung');
```

#### Download DICOM File

```javascript
async function downloadDicomFile(studyUid, seriesUid, instanceUid) {
  const response = await fetch(
    `/wado-rs/studies/${studyUid}/series/${seriesUid}/instances/${instanceUid}`,
    { credentials: 'include' }
  );

  if (!response.ok) {
    throw new Error('Download failed');
  }

  const blob = await response.blob();
  const url = URL.createObjectURL(blob);

  const a = document.createElement('a');
  a.href = url;
  a.download = `${instanceUid}.dcm`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);

  URL.revokeObjectURL(url);
}
```

#### Multi-Frame Cine Loop Player

```javascript
class CinePlayer {
  constructor(containerElement, studyUid, seriesUid, instanceUid, totalFrames) {
    this.container = containerElement;
    this.studyUid = studyUid;
    this.seriesUid = seriesUid;
    this.instanceUid = instanceUid;
    this.totalFrames = totalFrames;
    this.currentFrame = 1;
    this.playing = false;
    this.fps = 15;

    this.img = document.createElement('img');
    this.container.appendChild(this.img);
  }

  async loadFrame(frameNumber) {
    const url = `/wado-rs/studies/${this.studyUid}/series/${this.seriesUid}/instances/${this.instanceUid}/frames/${frameNumber}?quality=85`;
    this.img.src = url;
    this.currentFrame = frameNumber;
  }

  async play() {
    this.playing = true;
    const intervalMs = 1000 / this.fps;

    const playLoop = async () => {
      if (!this.playing) return;

      await this.loadFrame(this.currentFrame);

      this.currentFrame++;
      if (this.currentFrame > this.totalFrames) {
        this.currentFrame = 1;
      }

      setTimeout(playLoop, intervalMs);
    };

    playLoop();
  }

  stop() {
    this.playing = false;
  }
}

// Usage
const player = new CinePlayer(document.getElementById('cine'), studyUid, seriesUid, instanceUid, 24);
player.play();
```

#### Soft Delete Study

```javascript
async function deleteStudy(studyUid) {
  const confirmed = confirm('Are you sure you want to delete this study?');

  if (!confirmed) return;

  const response = await fetch(`/api/studies/${studyUid}`, {
    method: 'DELETE',
    credentials: 'include'
  });

  if (!response.ok) {
    const error = await response.json();
    alert(`Delete failed: ${error.detail || error.message}`);
    return;
  }

  const result = await response.json();
  console.log(result.message);

  // Refresh study list
  await refreshStudyList();
}
```

### React/TypeScript Example

```typescript
import React, { useState, useEffect } from 'react';

interface Study {
  study_instance_uid: string;
  patient_name: string;
  study_date: string;
  study_description: string;
  modality: string;
  number_of_series: number;
  number_of_instances: number;
}

interface PaginatedResponse {
  data: Study[];
  page: number;
  page_size: number;
  total: number;
  total_pages: number;
}

const StudyList: React.FC = () => {
  const [studies, setStudies] = useState<Study[]>([]);
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);

  const [filters, setFilters] = useState({
    patientName: '',
    modality: '',
    dateFrom: '',
    dateTo: ''
  });

  const fetchStudies = async () => {
    setLoading(true);

    const params = new URLSearchParams({
      page: page.toString(),
      page_size: '25',
      ...(filters.patientName && { patient_name: filters.patientName }),
      ...(filters.modality && { modality: filters.modality }),
      ...(filters.dateFrom && { study_date_from: filters.dateFrom }),
      ...(filters.dateTo && { study_date_to: filters.dateTo })
    });

    try {
      const response = await fetch(`/api/studies?${params}`);
      const data: PaginatedResponse = await response.json();

      setStudies(data.data);
      setTotalPages(data.total_pages);
    } catch (error) {
      console.error('Failed to fetch studies:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStudies();
  }, [page, filters]);

  return (
    <div>
      <h1>Study List</h1>

      <div className="filters">
        <input
          type="text"
          placeholder="Patient Name"
          value={filters.patientName}
          onChange={e => setFilters({ ...filters, patientName: e.target.value })}
        />

        <select
          value={filters.modality}
          onChange={e => setFilters({ ...filters, modality: e.target.value })}
        >
          <option value="">All Modalities</option>
          <option value="CT">CT</option>
          <option value="MR">MR</option>
          <option value="XA">XA</option>
        </select>
      </div>

      {loading ? (
        <div>Loading...</div>
      ) : (
        <table>
          <thead>
            <tr>
              <th>Patient Name</th>
              <th>Study Date</th>
              <th>Description</th>
              <th>Modality</th>
              <th>Series</th>
              <th>Instances</th>
            </tr>
          </thead>
          <tbody>
            {studies.map(study => (
              <tr key={study.study_instance_uid}>
                <td>{study.patient_name}</td>
                <td>{study.study_date}</td>
                <td>{study.study_description}</td>
                <td>{study.modality}</td>
                <td>{study.number_of_series}</td>
                <td>{study.number_of_instances}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <div className="pagination">
        <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}>
          Previous
        </button>
        <span>Page {page} of {totalPages}</span>
        <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages}>
          Next
        </button>
      </div>
    </div>
  );
};

export default StudyList;
```

### cURL Examples

```bash
# List studies with filters
curl -X GET "http://localhost:8003/api/studies?patient_name=Doe&modality=CT&page=1&page_size=10"

# Get study details
curl -X GET "http://localhost:8003/api/studies/1.2.840.113619.2.5.1762583154.215214.12321789.23"

# Get study series
curl -X GET "http://localhost:8003/api/studies/1.2.840.113619.2.5.1762583154.215214.12321789.23/series"

# Get study files
curl -X GET "http://localhost:8003/api/studies/1.2.840.113619.2.5.1762583154.215214.12321789.23/files"

# Delete study
curl -X DELETE "http://localhost:8003/api/studies/1.2.840.113619.2.5.1762583154.215214.12321789.23"

# Get WADO study instances
curl -X GET "http://localhost:8003/wado-rs/studies/1.2.840.113619.2.5.1762583154.215214.12321789.23"

# Download DICOM file
curl -O -J "http://localhost:8003/wado-rs/studies/1.2.840.../series/1.2.840.../instances/1.2.840..."

# Get thumbnail (save to file)
curl -o thumbnail.jpg "http://localhost:8003/wado-rs/studies/1.2.840.../series/1.2.840.../instances/1.2.840.../thumbnail?size=200"

# Get rendered image with windowing
curl -o rendered.jpg "http://localhost:8003/wado-rs/studies/1.2.840.../series/1.2.840.../instances/1.2.840.../rendered?window_center=40&window_width=400&quality=90"

# Get specific frame
curl -o frame5.jpg "http://localhost:8003/wado-rs/studies/1.2.840.../series/1.2.840.../instances/1.2.840.../frames/5?quality=85"

# Health checks
curl http://localhost:8003/api/health
curl http://localhost:8003/wado-rs/health
```

---

## DICOM UIDs

DICOM UIDs (Unique Identifiers) follow hierarchical structure defined by DICOM standard.

### UID Structure

**Format**: `{root}.{organization}.{suffix}`

**Example**: `1.2.840.113619.2.5.1762583154.215214.12321789.23`

- `1.2.840`: ISO registered root
- `113619`: Organization ID
- `2.5.1762583154.215214.12321789.23`: Unique suffix

### UID Hierarchy

```
Study Instance UID
  └─ Series Instance UID #1
      ├─ SOP Instance UID #1 (Image 1)
      ├─ SOP Instance UID #2 (Image 2)
      └─ SOP Instance UID #3 (Image 3)
  └─ Series Instance UID #2
      ├─ SOP Instance UID #4
      └─ SOP Instance UID #5
```

### UID Types

| UID Type | DICOM Tag | Description | Example |
|----------|-----------|-------------|---------|
| **Study Instance UID** | (0020,000D) | Unique per imaging study | `1.2.840...23` |
| **Series Instance UID** | (0020,000E) | Unique per series in study | `1.2.840...55` |
| **SOP Instance UID** | (0008,0018) | Unique per image/object | `1.2.840...99` |

### UID Validation

- Valid characters: `0-9` and `.`
- Maximum length: 64 characters
- No leading/trailing dots
- Components separated by dots

---

## Frontend Integration Notes

### Best Practices

1. **Caching Strategy**:
   - Cache thumbnails for 1 hour (`max-age=3600`)
   - Cache rendered images for 5 minutes (`max-age=300`)
   - Implement browser cache for DICOM metadata
   - Use service workers for offline support

2. **Performance Optimization**:
   - Load thumbnails lazily (intersection observer)
   - Preload adjacent frames for cine loops
   - Use WebWorkers for DICOM parsing
   - Implement virtual scrolling for large study lists

3. **Error Handling**:
   - Retry failed image loads with exponential backoff
   - Show placeholder images for failed thumbnails
   - Gracefully handle missing metadata
   - Validate UIDs before API calls

4. **Pagination**:
   - Use infinite scroll or traditional pagination
   - Track `total_pages` for page navigation
   - Implement page size selector (10, 25, 50, 100)
   - Preserve filters across page changes

5. **OHIF Viewer Integration**:
   - All WADO-RS endpoints are OHIF compatible
   - Use standard DICOMweb configuration
   - Map UIDs correctly in study/series/instance hierarchy
   - Configure WADO-RS base URL in OHIF config

6. **Soft Delete Handling**:
   - Refresh study list after delete operations
   - Show confirmation dialogs before deletion
   - Optionally show "Undo" option (requires restore endpoint)
   - Filter deleted studies from UI automatically

### Common Workflows

**Study List View**:
1. Fetch studies with `GET /api/studies`
2. Display in table/grid with thumbnails
3. Implement filters (patient name, modality, date range)
4. Add pagination controls

**Study Viewer**:
1. Get study details: `GET /api/studies/{study_uid}`
2. Get series list: `GET /api/studies/{study_uid}/series`
3. For each series, get instances: `GET /wado-rs/studies/{study_id}/series/{series_id}`
4. Display thumbnails: `/wado-rs/.../thumbnail?size=150`
5. On selection, load rendered image: `/wado-rs/.../rendered`

**Image Viewer with Controls**:
1. Load initial image with auto windowing
2. Provide window/level sliders
3. On slider change, update URL params and reload
4. Implement preset buttons (lung, bone, etc.)
5. Add zoom/pan controls

**Multi-Frame Playback**:
1. Get instance metadata to determine frame count
2. Load frames sequentially or with smart prefetching
3. Implement play/pause/speed controls
4. Use frame number in URL path

### Security Considerations

1. **Authentication** (when enabled):
   - Include credentials in fetch requests: `credentials: 'include'`
   - Handle 401 Unauthorized responses
   - Implement token refresh logic
   - Store tokens securely (HttpOnly cookies preferred)

2. **Input Validation**:
   - Validate UIDs before API calls
   - Sanitize user input in filters
   - Prevent XSS in displayed patient names
   - Validate date formats

3. **CORS**:
   - Ensure frontend origin is in CORS allowed list
   - Production: Configure specific origins, not wildcards
   - Include credentials only when necessary

4. **PHI Protection**:
   - Implement access logging
   - Use HTTPS in production
   - Don't log patient data in browser console
   - Clear cached PHI on logout

---

## Backend Implementation Details

### Technology Stack

- **Framework**: FastAPI (Python)
- **Database**: PostgreSQL with SQLAlchemy ORM
- **DICOM Processing**: pydicom, PIL (Pillow), numpy
- **Storage**: Filesystem via `DicomStorageService`
- **Authentication**: RBAC middleware (currently disabled)

### Database Tables

- `pacs_studies`: Study metadata
- `pacs_series`: Series metadata
- `pacs_instances`: Instance metadata
- `dicom_files`: Physical file tracking

### File Storage Structure

```
/storage/
  └─ studies/
      └─ {study_uid}/
          ├─ {series_uid}/
          │   ├─ {instance_uid}.dcm
          │   └─ ...
          └─ ...
```

### WADO Service Implementation

**Location**: `app/services/wado_service.py`

**Key Methods**:
- `get_study_instances()`: Query instances for study
- `get_series_instances()`: Query instances for series
- `get_instance()`: Read DICOM file binary
- `get_instance_metadata()`: Parse DICOM tags (exclude pixel data)
- `get_thumbnail()`: Render thumbnail with pydicom + PIL
- `get_rendered_image()`: Apply windowing and render
- `get_frame()`: Extract specific frame from multi-frame

### Dependencies

```python
# Key packages
pydicom>=2.3.0      # DICOM parsing
Pillow>=9.0.0       # Image processing
numpy>=1.22.0       # Array operations
fastapi>=0.95.0     # Web framework
sqlalchemy>=2.0.0   # ORM
```

---

## Known Issues & Future Improvements

### Known Issues

1. ⚠️ **WADO Frames Endpoint Bug**: Query parameter alias is `"fram"` instead of `"frame"` in code (line 269 of `wado.py`). Use path parameter for reliability.

2. **Soft Delete Inconsistency**: Deleted studies are excluded from listing but can still be retrieved by UID and may be accessible via WADO-RS.

3. **No Permanent Delete**: Currently only soft delete is implemented. Physical file deletion requires separate implementation.

### Planned Improvements

1. **Pagination for Series/Instances**: Add pagination to series and instance listing endpoints
2. **Advanced Filtering**: Support for date ranges, multiple modalities, custom DICOM tags
3. **Bulk Operations**: Bulk delete, bulk download
4. **Search Optimization**: Full-text search on patient names, study descriptions
5. **Caching Layer**: Redis caching for metadata and rendered images
6. **Audit Logging**: Comprehensive access and modification logs
7. **DICOM C-STORE**: Support for DICOM network protocol
8. **Orthanc Integration**: Full integration with Orthanc PACS server

---

## API Version History

| Version | Date | Changes |
|---------|------|---------|
| 1.0.0 | 2025-11-21 | Initial documentation with all endpoints |

---

## Support & Contribution

**API Source Code**: `pacs-service/app/api/`
- `studies.py`: Studies API endpoints
- `wado.py`: WADO-RS API endpoints

**Schemas**: `pacs-service/app/schemas/`
- `study.py`: Study data models
- `series.py`: Series data models
- `common.py`: Shared models (PaginatedResponse, etc.)

**Services**: `pacs-service/app/services/`
- `wado_service.py`: WADO-RS implementation
- `dicom_storage_service.py`: File storage management

For issues, feature requests, or questions, please contact the development team or refer to the project repository.

---

*Last Updated: 2025-11-21*
*Documentation Version: 1.0.0*
*API Version: 1.0.0*
