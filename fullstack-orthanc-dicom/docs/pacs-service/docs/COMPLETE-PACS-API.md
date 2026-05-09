# Complete PACS Service API Documentation

> **Version**: 1.0.0
> **Base URL**: `http://localhost:8003` (adjust for production)
> **Last Updated**: 2025-11-21

Complete documentation for all PACS-related APIs including Studies, WADO-RS, DICOM Upload, and Storage endpoints.

---

## Table of Contents

### Core APIs
1. [Studies API](#studies-api) - Study management and retrieval
2. [WADO-RS API](#wado-rs-api) - DICOMweb image serving
3. [DICOM Upload API](#dicom-upload-api) - Basic DICOM file upload
4. [DICOM Upload with Sync API](#dicom-upload-sync-api) - Upload with tag synchronization
5. [Storage API](#storage-api) - File storage management
6. [DICOM Router API](#dicom-router-api) - Kirim DICOM ke SatuSehat Router

### Reference
- [Workflow Guide](#workflow-guide) - Complete workflows for common tasks
- [Data Models](#data-models) - Response schemas
- [Error Handling](#error-handling) - Error codes and formats
- [Frontend Integration](#frontend-integration-examples) - Code examples

---

## Studies API

**Base Path**: `/api/studies`

Study management including listing, retrieval, series access, file information, and deletion.

### Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/studies` | List studies with filters |
| GET | `/api/studies/{study_uid}` | Get study details |
| GET | `/api/studies/{study_uid}/series` | Get study series |
| GET | `/api/studies/{study_uid}/files` | Get physical files |
| DELETE | `/api/studies/{study_uid}` | Soft delete study |

**See**: [STUDIES-WADO-API.md](./STUDIES-WADO-API.md#studies-api) for complete Studies API documentation.

---

## WADO-RS API

**Base Path**: `/wado-rs`

DICOMweb RESTful Services for medical image retrieval (DICOM PS3.18 compliant).

### Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/wado-rs/studies/{study_id}` | Get study instances |
| GET | `/wado-rs/studies/{study_id}/series/{series_id}` | Get series instances |
| GET | `/wado-rs/studies/{study_id}/series/{series_id}/instances/{instance_id}` | Download DICOM file |
| GET | `/wado-rs/.../instances/{instance_id}/metadata` | Get instance metadata |
| GET | `/wado-rs/.../instances/{instance_id}/thumbnail` | Get thumbnail (JPEG) |
| GET | `/wado-rs/.../instances/{instance_id}/rendered` | Get rendered image with windowing |
| GET | `/wado-rs/.../instances/{instance_id}/frames/{frame_number}` | Get specific frame |
| GET | `/wado-rs/health` | Health check |

**See**: [STUDIES-WADO-API.md](./STUDIES-WADO-API.md#wado-rs-api) for complete WADO-RS API documentation.

---

## DICOM Upload API

**Base Path**: `/api/dicom`

Basic DICOM file upload with automatic tag extraction and hierarchy creation.

### `POST /api/dicom/upload`

Upload DICOM file with basic tag extraction.

**Content-Type**: `multipart/form-data`

**Form Parameters**:

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `file` | File | **Yes** | DICOM file (.dcm or .dicom) |
| `order_id` | string (UUID) | **Yes** | Order ID (must exist, worklist must be COMPLETED) |
| `category` | string | No | File category (default: "dicom") |
| `description` | string | No | Optional description |

**Validation Rules**:
- File extension must be `.dcm` or `.dicom`
- File size max: 100MB (configurable via `MAX_DICOM_SIZE`)
- Order must exist in database
- Worklist for order must have status `COMPLETED`

**Process Flow**:
1. Validates order and worklist status
2. Saves DICOM file to storage
3. Validates DICOM format
4. Extracts metadata using DICOM parser
5. Creates/updates Study → Series hierarchy
6. Stores DicomFile record in database
7. Updates DICOM tags (optional, non-blocking)

**Response**: `201 Created` (new file) or `200 OK` (updated existing)

**Success Response**:
```json
{
  "success": true,
  "message": "DICOM file uploaded successfully - File persisted: /var/lib/pacs/storage/dicom/uploads/20251121_143000_abc123.dcm",
  "is_update": false,
  "file": {
    "id": "7c9e6679-7425-40de-944b-e07fc1f90ae7",
    "filename": "chest_ct_001.dcm",
    "file_size": 5242880,
    "file_hash": "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
    "category": "dicom",
    "uploaded_at": "2025-11-21T14:30:00.123456Z"
  },
  "dicom_metadata": {
    "patient_id": "PAT001",
    "patient_name": "Doe^John",
    "study_id": "1.2.840.113619.2.5.1762583154.215214.12321789.23",
    "series_id": "1.2.840.113619.2.5.1762583154.215214.55555555.01",
    "modality": "CT",
    "study_date": "2025-11-19",
    "study_description": "Chest CT with Contrast"
  },
  "dicom_tags": {
    "PatientName": "Doe^John",
    "StudyInstanceUID": "1.2.840.113619.2.5.1762583154.215214.12321789.23",
    "SeriesInstanceUID": "1.2.840.113619.2.5.1762583154.215214.55555555.01"
  }
}
```

**Error Responses**:

```json
// 400 Bad Request - Order ID required
{
  "detail": "order_id is required. Please provide a valid order ID."
}

// 400 Bad Request - Invalid order ID format
{
  "detail": "Invalid order_id format: 'invalid-uuid'. Must be a valid UUID."
}

// 404 Not Found - Order not found
{
  "detail": "Order with ID 'uuid' not found. Please create the order first."
}

// 404 Not Found - Worklist not found
{
  "detail": "Worklist not found for order 'uuid'. Please create a worklist item first."
}

// 400 Bad Request - Worklist not completed
{
  "detail": "Cannot upload DICOM file. Worklist status is 'SCHEDULED'. Status must be 'COMPLETED' before uploading DICOM files. Please complete the examination first."
}

// 400 Bad Request - Invalid file type
{
  "detail": "File 'document.pdf' must be a DICOM file (.dcm or .dicom). Current content-type: application/pdf"
}

// 400 Bad Request - Invalid DICOM
{
  "detail": "Invalid DICOM file"
}

// 413 Request Entity Too Large
{
  "detail": "File size exceeds maximum allowed size of 100MB"
}

// 500 Internal Server Error - File persistence failed
{
  "detail": "DICOM file failed to persist in storage: /path/to/file.dcm. Upload failed."
}
```

**Important Notes**:
- **Duplicate Handling**: If file with same SOP Instance UID exists, the existing record is **updated** instead of creating duplicate
- **Hierarchy Creation**: Automatically creates Study and Series records if they don't exist
- **Soft Delete Restore**: If study was soft-deleted, it will be restored
- **Tag Updates**: Tag updates are non-blocking (upload succeeds even if tag update fails)
- **File Persistence**: Multiple validation checks ensure file is actually written to disk before committing to database

**Example Requests**:

```bash
# cURL upload
curl -X POST "http://localhost:8003/api/dicom/upload" \
  -F "file=@/path/to/file.dcm" \
  -F "order_id=550e8400-e29b-41d4-a716-446655440000" \
  -F "category=dicom" \
  -F "description=Chest CT scan"

# Python requests
import requests

files = {'file': open('chest_ct.dcm', 'rb')}
data = {
    'order_id': '550e8400-e29b-41d4-a716-446655440000',
    'category': 'dicom',
    'description': 'Chest CT scan'
}

response = requests.post(
    'http://localhost:8003/api/dicom/upload',
    files=files,
    data=data
)
print(response.json())
```

**JavaScript/TypeScript**:

```javascript
async function uploadDicom(file, orderId, category = 'dicom', description = null) {
  const formData = new FormData();
  formData.append('file', file);
  formData.append('order_id', orderId);
  formData.append('category', category);
  if (description) {
    formData.append('description', description);
  }

  const response = await fetch('http://localhost:8003/api/dicom/upload', {
    method: 'POST',
    body: formData,
    credentials: 'include'
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.detail || 'Upload failed');
  }

  return await response.json();
}

// Usage
const fileInput = document.getElementById('dicomFile');
const file = fileInput.files[0];
const orderId = '550e8400-e29b-41d4-a716-446655440000';

try {
  const result = await uploadDicom(file, orderId, 'dicom', 'Chest CT scan');
  console.log('Upload successful:', result);
  console.log('File ID:', result.file.id);
  console.log('Study UID:', result.dicom_metadata.study_id);
} catch (error) {
  console.error('Upload failed:', error.message);
}
```

---

### `GET /api/dicom/files/{file_id}/tags`

Get DICOM tags for a specific uploaded file.

**Path Parameters**:

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `file_id` | string (UUID) | Yes | DicomFile database ID |

**Response**: `200 OK`

```json
{
  "file_id": "7c9e6679-7425-40de-944b-e07fc1f90ae7",
  "filename": "chest_ct_001.dcm",
  "dicom_tags": {
    "PatientName": "Doe^John",
    "PatientID": "PAT001",
    "StudyInstanceUID": "1.2.840.113619.2.5.1762583154.215214.12321789.23",
    "SeriesInstanceUID": "1.2.840.113619.2.5.1762583154.215214.55555555.01",
    "SOPInstanceUID": "1.2.840.113619.2.5.1762583154.215214.99999999.01",
    "Modality": "CT",
    "StudyDate": "20251119",
    "SeriesNumber": "1",
    "InstanceNumber": "1"
  },
  "metadata": {
    "patient_id": "PAT001",
    "patient_name": "Doe^John",
    "patient_sex": "M",
    "study_id": "1.2.840.113619.2.5.1762583154.215214.12321789.23",
    "series_id": "1.2.840.113619.2.5.1762583154.215214.55555555.01",
    "modality": "CT",
    "study_date": "2025-11-19",
    "study_description": "Chest CT with Contrast"
  }
}
```

**Error**: `404 Not Found` if file not found

---

### `POST /api/dicom/files/{file_id}/refresh-tags`

Refresh DICOM tags by re-parsing the file.

**Path Parameters**:

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `file_id` | string (UUID) | Yes | DicomFile database ID |

**Response**: `200 OK`

```json
{
  "success": true,
  "message": "DICOM tags refreshed successfully",
  "file_id": "7c9e6679-7425-40de-944b-e07fc1f90ae7",
  "dicom_tags": {
    "PatientName": "Doe^John",
    "StudyInstanceUID": "1.2.840.113619.2.5.1762583154.215214.12321789.23"
  }
}
```

**Error**: `404 Not Found` if file not found or file missing on disk

---

## DICOM Upload Sync API

**Base Path**: `/api/dicom`

Advanced DICOM upload with **automatic tag synchronization** to PACS worklist data. Maintains audit trail of tag changes.

### `POST /api/dicom/upload-sync`

Upload DICOM file with automatic tag synchronization to worklist/patient data.

**Content-Type**: `multipart/form-data`

**Form Parameters**:

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `file` | File | **Yes** | - | DICOM file (.dcm or .dicom) |
| `order_id` | string (UUID) | **Yes** | - | Order ID (must exist, worklist COMPLETED) |
| `sync_tags` | boolean | No | `true` | Enable tag synchronization |
| `preserve_original` | boolean | No | `true` | Keep original file for audit trail |
| `category` | string | No | `"dicom"` | File category |
| `description` | string | No | - | Optional description |

**What is Tag Synchronization?**

Tag synchronization ensures DICOM file tags match the PACS worklist data:
- **Patient Name** synced from worklist
- **Patient ID (MRN)** synced from patient database
- **Accession Number** synced from worklist
- **Study Description** synced from worklist procedure
- Other demographic/administrative tags updated

**Audit Trail**:
- Original file preserved (if `preserve_original=true`)
- Synchronized file created with updated tags
- All tag changes logged to `DicomTagAuditLog` table
- Complete before/after comparison available

**Process Flow**:
1. Validates order and worklist (must be COMPLETED)
2. Saves uploaded file temporarily
3. Validates DICOM format
4. **Synchronizes tags** with worklist data:
   - Reads worklist item (patient name, accession, etc.)
   - Queries patient database for MRN
   - Updates DICOM tags in file
   - Preserves original file (optional)
   - Creates synchronized file
5. Creates audit log with tag changes
6. Stores DicomFile record (using synchronized file)
7. Creates Study → Series hierarchy
8. Cleans up temporary files

**Response**: `200 OK`

**Success Response**:
```json
{
  "status": "success",
  "message": "DICOM file uploaded and synchronized successfully",
  "dicom_file": {
    "id": "8d0f7680-8536-51ef-a55c-f18gd2ga1bf8",
    "sop_instance_uid": "1.2.840.113619.2.5.1762583154.215214.99999999.01",
    "study_instance_uid": "1.2.840.113619.2.5.1762583154.215214.12321789.23",
    "series_instance_uid": "1.2.840.113619.2.5.1762583154.215214.55555555.01",
    "patient_id": "PAT001",
    "patient_name": "Doe^John",
    "modality": "CT",
    "file_size": 5242880,
    "file_path": "/var/lib/pacs/storage/dicom/temp_uploads/20251121_143000_abc123_synchronized.dcm",
    "created_at": "2025-11-21T14:30:00.123456Z"
  },
  "tag_sync": {
    "synchronized": true,
    "changes_count": 5,
    "changes": {
      "PatientName": {
        "original": "Anonymous",
        "synchronized": "Doe^John",
        "tag": "(0010,0010)"
      },
      "PatientID": {
        "original": "",
        "synchronized": "MRN12345",
        "tag": "(0010,0020)"
      },
      "AccessionNumber": {
        "original": "",
        "synchronized": "ACC123456",
        "tag": "(0008,0050)"
      },
      "StudyDescription": {
        "original": "CT Scan",
        "synchronized": "Chest CT with Contrast",
        "tag": "(0008,1030)"
      },
      "ReferringPhysicianName": {
        "original": "",
        "synchronized": "Dr. Smith",
        "tag": "(0008,0090)"
      }
    },
    "original_file": "/var/lib/pacs/storage/dicom/temp_uploads/20251121_143000_abc123_original.dcm",
    "synchronized_file": "/var/lib/pacs/storage/dicom/temp_uploads/20251121_143000_abc123_synchronized.dcm",
    "audit_log_id": "9f1e8791-9647-62fg-b66d-g29he3hb2cg9"
  },
  "worklist": {
    "id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
    "patient_name": "Doe^John",
    "patient_id": "PAT001",
    "accession_number": "ACC123456"
  }
}
```

**Tag Sync Disabled Response** (`sync_tags=false`):
```json
{
  "status": "success",
  "message": "DICOM file uploaded and synchronized successfully",
  "dicom_file": { /* ... */ },
  "tag_sync": {
    "synchronized": false,
    "reason": "Tag synchronization disabled"
  },
  "worklist": { /* ... */ }
}
```

**Tag Sync Failed Response** (upload still succeeds):
```json
{
  "status": "success",
  "message": "DICOM file uploaded and synchronized successfully",
  "dicom_file": { /* ... */ },
  "tag_sync": {
    "synchronized": false,
    "error": "Failed to synchronize tags: error message"
  },
  "worklist": { /* ... */ }
}
```

**Error Responses**: Same as `/api/dicom/upload` endpoint

**Example Requests**:

```bash
# cURL with tag sync enabled (default)
curl -X POST "http://localhost:8003/api/dicom/upload-sync" \
  -F "file=@/path/to/file.dcm" \
  -F "order_id=550e8400-e29b-41d4-a716-446655440000" \
  -F "sync_tags=true" \
  -F "preserve_original=true"

# Without original file preservation
curl -X POST "http://localhost:8003/api/dicom/upload-sync" \
  -F "file=@/path/to/file.dcm" \
  -F "order_id=550e8400-e29b-41d4-a716-446655440000" \
  -F "preserve_original=false"

# Disable tag sync (behaves like /upload)
curl -X POST "http://localhost:8003/api/dicom/upload-sync" \
  -F "file=@/path/to/file.dcm" \
  -F "order_id=550e8400-e29b-41d4-a716-446655440000" \
  -F "sync_tags=false"
```

**JavaScript/TypeScript**:

```javascript
async function uploadDicomWithSync(
  file,
  orderId,
  options = {}
) {
  const {
    syncTags = true,
    preserveOriginal = true,
    category = 'dicom',
    description = null
  } = options;

  const formData = new FormData();
  formData.append('file', file);
  formData.append('order_id', orderId);
  formData.append('sync_tags', syncTags);
  formData.append('preserve_original', preserveOriginal);
  formData.append('category', category);
  if (description) {
    formData.append('description', description);
  }

  const response = await fetch('http://localhost:8003/api/dicom/upload-sync', {
    method: 'POST',
    body: formData,
    credentials: 'include'
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.detail || 'Upload failed');
  }

  return await response.json();
}

// Usage
const file = document.getElementById('dicomFile').files[0];
const orderId = '550e8400-e29b-41d4-a716-446655440000';

try {
  const result = await uploadDicomWithSync(file, orderId, {
    syncTags: true,
    preserveOriginal: true,
    category: 'dicom',
    description: 'Chest CT with tag sync'
  });

  console.log('Upload successful:', result);

  if (result.tag_sync.synchronized) {
    console.log('Tags synchronized:', result.tag_sync.changes_count, 'changes');
    console.log('Changes:', result.tag_sync.changes);
    console.log('Audit log ID:', result.tag_sync.audit_log_id);
  } else {
    console.warn('Tag sync skipped or failed:', result.tag_sync.reason || result.tag_sync.error);
  }
} catch (error) {
  console.error('Upload failed:', error.message);
}
```

---

### `GET /api/dicom/tag-audit/{audit_log_id}`

Get tag synchronization audit log details.

**Path Parameters**:

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `audit_log_id` | string (UUID) | Yes | Audit log ID from upload-sync response |

**Response**: `200 OK`

```json
{
  "status": "success",
  "audit_log": {
    "id": "9f1e8791-9647-62fg-b66d-g29he3hb2cg9",
    "worklist_id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
    "order_id": "550e8400-e29b-41d4-a716-446655440000",
    "dicom_file_id": "8d0f7680-8536-51ef-a55c-f18gd2ga1bf8",
    "sop_instance_uid": "1.2.840.113619.2.5.1762583154.215214.99999999.01",
    "study_instance_uid": "1.2.840.113619.2.5.1762583154.215214.12321789.23",
    "series_instance_uid": "1.2.840.113619.2.5.1762583154.215214.55555555.01",
    "accession_number": "ACC123456",
    "original_file_path": "/var/lib/pacs/storage/dicom/temp_uploads/original.dcm",
    "synchronized_file_path": "/var/lib/pacs/storage/dicom/temp_uploads/synchronized.dcm",
    "original_file_size": 5242880,
    "synchronized_file_size": 5243000,
    "tag_changes": {
      "PatientName": {
        "original": "Anonymous",
        "synchronized": "Doe^John",
        "tag": "(0010,0010)"
      }
    },
    "patient_id": "PAT001",
    "patient_name": "Doe^John",
    "operation_type": "TAG_SYNC",
    "performed_by": "SYSTEM",
    "operation_reason": "Synchronize DICOM tags with PACS worklist data (partial bridging)",
    "is_bridged": "PARTIAL",
    "requires_review": "N",
    "sync_status": "SUCCESS",
    "synchronized_at": "2025-11-21T14:30:00.123456Z"
  },
  "changes_summary": {
    "total_changes": 5,
    "tags_modified": ["PatientName", "PatientID", "AccessionNumber", "StudyDescription", "ReferringPhysicianName"]
  }
}
```

**Error**: `404 Not Found` if audit log not found

---

### `GET /api/dicom/tag-audit`

List tag synchronization audit logs with filtering.

**Query Parameters**:

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `patient_id` | string | No | Filter by patient ID |
| `order_id` | string (UUID) | No | Filter by order ID |
| `sync_status` | string | No | Filter by status (SUCCESS, FAILED, PENDING) |
| `limit` | integer | No | Max results (default: 50) |
| `offset` | integer | No | Offset for pagination (default: 0) |

**Response**: `200 OK`

```json
{
  "status": "success",
  "total": 147,
  "limit": 50,
  "offset": 0,
  "data": [
    {
      "id": "9f1e8791-9647-62fg-b66d-g29he3hb2cg9",
      "patient_name": "Doe^John",
      "accession_number": "ACC123456",
      "sync_status": "SUCCESS",
      "tag_changes": { /* ... */ },
      "synchronized_at": "2025-11-21T14:30:00.123456Z"
    }
  ]
}
```

**Example**:

```bash
# List all successful syncs for an order
curl "http://localhost:8003/api/dicom/tag-audit?order_id=550e8400-e29b-41d4-a716-446655440000&sync_status=SUCCESS"

# List failed syncs
curl "http://localhost:8003/api/dicom/tag-audit?sync_status=FAILED&limit=20"

# Pagination
curl "http://localhost:8003/api/dicom/tag-audit?limit=50&offset=100"
```

---

## Storage API

**Base Path**: `/api/storage`

Low-level DICOM file storage and retrieval management.

### `POST /api/storage/upload`

Upload DICOM file with storage tier management.

**Content-Type**: `multipart/form-data`

**Form Parameters**:

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `file` | File | Yes | - | DICOM file (.dcm or .dicom) |
| `tier` | string | No | `hot` | Storage tier: `hot`, `warm`, or `cold` |

**Storage Tiers**:
- **hot**: Fast access, frequently accessed files
- **warm**: Medium access speed, less frequently accessed
- **cold**: Slow access, archival storage

**Response**: `200 OK`

```json
{
  "id": "7c9e6679-7425-40de-944b-e07fc1f90ae7",
  "sop_instance_uid": "1.2.840.113619.2.5.1762583154.215214.99999999.01",
  "study_id": "1.2.840.113619.2.5.1762583154.215214.12321789.23",
  "series_id": "1.2.840.113619.2.5.1762583154.215214.55555555.01",
  "patient_id": "PAT001",
  "patient_name": "Doe^John",
  "modality": "CT",
  "file_size": 5242880,
  "file_size_mb": 5.0,
  "storage_tier": "hot",
  "status": "stored",
  "created_at": "2025-11-21T14:30:00.123456Z"
}
```

**Error**: `400 Bad Request` for invalid file type or format

**Example**:

```bash
curl -X POST "http://localhost:8003/api/storage/upload" \
  -F "file=@chest_ct.dcm" \
  -F "tier=hot"
```

---

### `GET /api/storage/files/{sop_instance_uid}`

Get DICOM file metadata by SOP Instance UID.

**Response**: `200 OK` - Returns DicomFile metadata

**Error**: `404 Not Found` if file doesn't exist

---

### `GET /api/storage/files/{sop_instance_uid}/download`

Download DICOM file by SOP Instance UID.

**Response**: `200 OK`

**Content-Type**: `application/dicom`

**Headers**:
```
Content-Disposition: attachment; filename={sop_instance_uid}.dcm
```

**Response Body**: Binary DICOM file

**Error**: `404 Not Found` if file or physical file missing

---

### `GET /api/storage/search`

Search DICOM files with filters.

**Query Parameters**:

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `study_id` | string | No | Study Instance UID |
| `series_id` | string | No | Series Instance UID |
| `patient_id` | string | No | Patient ID |
| `modality` | string | No | Modality (CT, MR, etc.) |
| `study_date_from` | string | No | From date (YYYY-MM-DD) |
| `study_date_to` | string | No | To date (YYYY-MM-DD) |
| `limit` | integer | No | Max results (1-1000, default: 100) |
| `offset` | integer | No | Offset for pagination (default: 0) |

**Response**: `200 OK`

```json
{
  "total": 150,
  "limit": 100,
  "offset": 0,
  "files": [
    {
      "id": "7c9e6679-7425-40de-944b-e07fc1f90ae7",
      "sop_instance_uid": "1.2.840.113619.2.5.1762583154.215214.99999999.01",
      "study_id": "1.2.840.113619.2.5.1762583154.215214.12321789.23",
      "modality": "CT",
      "file_size": 5242880,
      "created_at": "2025-11-21T14:30:00.123456Z"
    }
  ]
}
```

**Example**:

```bash
# Search by study
curl "http://localhost:8003/api/storage/search?study_id=1.2.840.113619.2.5.1762583154.215214.12321789.23"

# Search by modality and date range
curl "http://localhost:8003/api/storage/search?modality=CT&study_date_from=2025-01-01&study_date_to=2025-11-21&limit=50"
```

---

### `DELETE /api/storage/files/{sop_instance_uid}`

Delete DICOM file (soft or hard delete).

**Query Parameters**:

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `hard_delete` | boolean | No | `false` | Permanently delete file |

**Response**: `200 OK`

```json
{
  "message": "File deleted successfully",
  "sop_instance_uid": "1.2.840.113619.2.5.1762583154.215214.99999999.01",
  "hard_delete": false
}
```

**Error**: `404 Not Found` if file not found

---

### `GET /api/storage/stats`

Get storage statistics.

**Response**: `200 OK`

```json
{
  "total_files": 1547,
  "total_size_bytes": 8234567890,
  "total_size_gb": 7.67,
  "by_tier": {
    "hot": {
      "files": 1200,
      "size_gb": 6.0
    },
    "warm": {
      "files": 300,
      "size_gb": 1.5
    },
    "cold": {
      "files": 47,
      "size_gb": 0.17
    }
  },
  "by_modality": {
    "CT": {
      "files": 800,
      "size_gb": 4.5
    },
    "MR": {
      "files": 600,
      "size_gb": 2.8
    },
    "XA": {
      "files": 147,
      "size_gb": 0.37
    }
  }
}
```

---

### `GET /api/storage/health`

Storage service health check.

**Response**: `200 OK`

```json
{
  "status": "healthy",
  "service": "DICOM Storage",
  "total_files": 1547,
  "total_size_gb": 7.67
}
```

**Error**: `503 Service Unavailable` if unhealthy

---

## DICOM Router API

**Base Path**: `/api/dicom/router`

Kirim DICOM yang sudah tersimpan ke **SatuSehat DICOM Router** via C-STORE. Mendukung pencarian file otomatis berdasarkan Worklist ID agar data order/pasien ikut tercatat.

### `POST /api/dicom/router/send`

Kirim satu atau lebih instance DICOM ke router.

**Content-Type**: `application/json`

**Body Parameters**:

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `worklist_id` | string (UUID) | Conditional | Worklist item ID. Jika diisi, layanan akan mengambil `study_instance_uid` dan `accession_number` dari worklist yang masih aktif (is_active = true). Menolak permintaan jika worklist tidak ditemukan atau tidak aktif. |
| `study_uid` | string | Conditional | Study Instance UID. Tidak wajib jika `worklist_id` diberikan, wajib jika tidak ada filter lain. |
| `series_uid` | string | Conditional | Series Instance UID filter (opsional untuk memperkecil ruang kirim). |
| `sop_instance_uid` | string | Conditional | SOP Instance UID filter (opsional untuk kirim 1 file). |
| `accession_number` | string | Conditional | Alternatif filter berdasarkan Accession Number. Layanan akan mencari study UID aktif dengan accession ini jika `study_uid` tidak dikirim. |
| `imaging_study_id` | string | No | Jika sudah punya ImagingStudy ID dari router, sertakan di sini. Jika kosong, layanan akan lookup otomatis via `SATUSEHAT_GATEWAY_URL/satusehat/imagingstudy/search/{accession}`. |
| `router_host` | string | No | Override host router (default: env `DICOM_ROUTER_HOST`). |
| `router_port` | integer | No | Override port router (default: env `DICOM_ROUTER_PORT`). |
| `router_ae_title` | string | No | Override AE Title router (default: env `DICOM_ROUTER_AE_TITLE`). |
| `calling_ae_title` | string | No | Override AE Title pengirim (default: env `DICOM_ROUTER_CALLING_AE_TITLE`). |
| `timeout` | integer | No | Timeout asosiasi DICOM (detik, default dari env `DICOM_ROUTER_TIMEOUT`). |

**Validasi & Perilaku**:
- Minimal satu filter harus diisi: `worklist_id` **atau** salah satu dari `study_uid`, `series_uid`, `sop_instance_uid`, `accession_number`.
- Jika `worklist_id` dikirim:
  - Sistem mencari worklist aktif (`is_active = true`). Jika tidak ditemukan → `404`.
  - `study_uid` otomatis diisi dari `study_instance_uid` worklist (akan error jika Anda mengirim `study_uid` berbeda).
  - `accession_number` dari worklist dipakai untuk lookup `imaging_study_id` jika belum diberikan.
  - Response menyertakan ringkasan worklist (patient, modality, jadwal) untuk ditampilkan di UI.
- File yang dikirim diambil dari storage/hierarchy berdasarkan filter dan status `active`/`archived`.
- Untuk setiap file, detail status dikembalikan (`sent`/`failed`, status code C-STORE).
- Audit dicatat di tabel `satusehat_router_logs` (payload permintaan + hasil lookup).

**Respons Sukses** `200 OK`:

```json
{
  "success": true,
  "router_host": "dicom-router-secured",
  "router_port": 11112,
  "router_ae_title": "DCMROUTER",
  "calling_ae_title": "PACS_SCU",
  "worklist_id": "7c9e6679-7425-40de-944b-e07fc1f90ae7",
  "worklist": {
    "id": "7c9e6679-7425-40de-944b-e07fc1f90ae7",
    "order_id": "8d4d4c05-2cd8-40b8-a778-44aa1ae5f111",
    "study_instance_uid": "1.2.840.113619.2.55.3.604688210.23.1574949783.467",
    "accession_number": "ACC-2025-0001",
    "sps_id": "SPS-1001",
    "sps_status": "COMPLETED",
    "modality": "CT",
    "patient_id": "MRN-001",
    "patient_name": "DOE^JOHN",
    "scheduled_date": "2025-11-24",
    "scheduled_time": "09:00:00"
  },
  "imaging_study_id": "d4f8a6c9-31cc-4c5b-b2be-9b6f7d123456",
  "total": 12,
  "sent": 12,
  "failed": 0,
  "details": [
    {
      "sop_instance_uid": "1.2.3.4.5.6.7.1",
      "study_instance_uid": "1.2.3.4.5.6.7",
      "series_instance_uid": "1.2.3.4.5.6.7.2",
      "metadata": {
        "accession_number": "ACC-2025-0001",
        "patient_id": "MRN-001",
        "patient_name": "DOE^JOHN",
        "modality": "CT"
      },
      "status": "sent",
      "message": "Status 0x0000",
      "status_code": "0x0000"
    }
  ]
}
```

**Respons Gagal** (contoh `404` karena worklist tidak ada):

```json
{
  "detail": "Worklist item not found or inactive"
}
```

**Contoh Permintaan**:

Kirim semua file berdasarkan Worklist ID:

```bash
curl -X POST "http://localhost:8003/api/dicom/router/send" \
  -H "Content-Type: application/json" \
  -d '{
    "worklist_id": "7c9e6679-7425-40de-944b-e07fc1f90ae7"
  }'
```

Kirim file tertentu (tanpa worklist):

```bash
curl -X POST "http://localhost:8003/api/dicom/router/send" \
  -H "Content-Type: application/json" \
  -d '{
    "study_uid": "1.2.3.4.5.6.7",
    "series_uid": "1.2.3.4.5.6.7.2"
  }'
```

**Alur Integrasi Frontend (singkat)**:
1. User pilih worklist di UI → kirim `POST /api/dicom/router/send` hanya dengan `worklist_id`. UI dapat langsung menampilkan info pasien/modality dari field `worklist` di respons.
2. Tampilkan progress: gunakan `total`, `sent`, `failed`, dan array `details` untuk status per SOP Instance.
3. Simpan `imaging_study_id` (jika muncul) untuk dipakai UI lain (misal push ke SatuSehat FHIR/ImagingStudy).
4. Jika perlu override router (sandbox/QA), isi `router_host`/`router_port`/`router_ae_title` di request body; UI bisa expose sebagai opsi advanced.

Contoh kode JS singkat:

```javascript
const sendToRouter = async (worklistId) => {
  const resp = await fetch('/api/dicom/router/send', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ worklist_id: worklistId })
  });
  if (!resp.ok) throw new Error(`Router send failed: ${resp.status}`);
  const data = await resp.json();
  renderPatientBanner(data.worklist);
  renderProgress({ total: data.total, sent: data.sent, failed: data.failed, details: data.details });
  cacheImagingStudyId(data.imaging_study_id);
};
```

---

## Workflow Guide

### Complete DICOM Upload & Viewing Workflow

This section describes the complete workflow from DICOM upload to image viewing in a DICOM viewer.

#### Workflow 1: Basic DICOM Upload (No Tag Sync)

**Prerequisites**:
- Order created in system
- Worklist item created and marked as COMPLETED

**Steps**:

1. **Upload DICOM file**
   ```bash
   POST /api/dicom/upload
   - file: chest_ct_001.dcm
   - order_id: {order_uuid}
   ```

   **Result**: File stored, Study/Series created, DicomFile record created

2. **Verify upload in study list**
   ```bash
   GET /api/studies?patient_name=Doe
   ```

   **Result**: Study appears in list with metadata

3. **Get study details**
   ```bash
   GET /api/studies/{study_uid}
   ```

   **Result**: Complete study information

4. **Get series list**
   ```bash
   GET /api/studies/{study_uid}/series
   ```

   **Result**: All series in study

5. **Display thumbnails** (one per series)
   ```bash
   GET /wado-rs/studies/{study_uid}/series/{series_uid}/instances/{instance_uid}/thumbnail?size=200
   ```

   **Result**: JPEG thumbnail for preview

6. **Open in viewer** (click thumbnail)
   ```bash
   GET /wado-rs/studies/{study_uid}/series/{series_uid}/instances/{instance_uid}/rendered?quality=90
   ```

   **Result**: Full resolution JPEG for viewing

7. **Apply window/level** (user adjusts controls)
   ```bash
   GET /wado-rs/.../rendered?window_center=-600&window_width=1500&quality=90
   ```

   **Result**: Image with CT Lung window applied

8. **Download DICOM** (if needed)
   ```bash
   GET /wado-rs/studies/{study_uid}/series/{series_uid}/instances/{instance_uid}
   ```

   **Result**: Native DICOM file download

---

#### Workflow 2: DICOM Upload with Tag Synchronization

**Prerequisites**:
- Order created with patient demographics
- Worklist item created with procedure details and marked COMPLETED
- Patient exists in database with MRN

**Steps**:

1. **Upload DICOM with tag sync**
   ```bash
   POST /api/dicom/upload-sync
   - file: anonymous_ct.dcm (uploaded by modality without patient info)
   - order_id: {order_uuid}
   - sync_tags: true
   - preserve_original: true
   ```

   **What happens**:
   - Original file saved as `*_original.dcm`
   - Tags synchronized with worklist data:
     - Patient Name: "" → "Doe^John"
     - Patient ID: "" → "MRN12345"
     - Accession Number: "" → "ACC123456"
     - Study Description: "CT Scan" → "Chest CT with Contrast"
   - Synchronized file saved as `*_synchronized.dcm`
   - Audit log created with all changes

   **Result**:
   ```json
   {
     "dicom_file": { "id": "...", "file_path": "*_synchronized.dcm" },
     "tag_sync": {
       "synchronized": true,
       "changes_count": 5,
       "changes": { /* detailed tag changes */ },
       "audit_log_id": "..."
     }
   }
   ```

2. **Review tag changes** (compliance/audit)
   ```bash
   GET /api/dicom/tag-audit/{audit_log_id}
   ```

   **Result**: Complete before/after tag comparison

3. **Verify in study list** (with corrected patient name)
   ```bash
   GET /api/studies?patient_name=Doe
   ```

   **Result**: Study appears with synchronized patient data

4. **Continue with viewing workflow** (same as Workflow 1 steps 3-8)

---

#### Workflow 3: Multi-Frame Cine Loop Viewing

**Prerequisites**:
- Multi-frame DICOM file uploaded (cardiac MR, ultrasound, etc.)
- File has NumberOfFrames > 1

**Steps**:

1. **Get instance metadata** (determine frame count)
   ```bash
   GET /wado-rs/studies/{study_uid}/series/{series_uid}/instances/{instance_uid}/metadata
   ```

   **Extract**: `NumberOfFrames` = 24

2. **Load frame 1** (initial display)
   ```bash
   GET /wado-rs/.../frames/1?quality=85
   ```

3. **Preload adjacent frames** (for smooth playback)
   ```bash
   Parallel requests:
   GET /wado-rs/.../frames/2?quality=85
   GET /wado-rs/.../frames/3?quality=85
   GET /wado-rs/.../frames/4?quality=85
   ```

4. **Play cine loop** (iterate through frames)
   ```javascript
   for (let frame = 1; frame <= 24; frame++) {
     await loadFrame(frame);
     await delay(1000 / fps); // 15 fps
   }
   ```

5. **Loop back to frame 1** and repeat

---

#### Workflow 4: Bulk Upload with Progress Tracking

**Scenario**: Upload 100 DICOM files from a single study

**Steps**:

1. **Upload files sequentially** (or parallel with concurrency limit)
   ```javascript
   const files = [...]; // 100 files
   const results = [];

   for (const file of files) {
     try {
       const result = await uploadDicomWithSync(file, orderId);
       results.push({ success: true, file: file.name, id: result.dicom_file.id });
       updateProgress(results.length, files.length);
     } catch (error) {
       results.push({ success: false, file: file.name, error: error.message });
     }
   }
   ```

2. **Check upload results**
   ```javascript
   const successful = results.filter(r => r.success).length;
   const failed = results.filter(r => !r.success);

   console.log(`Uploaded: ${successful}/${files.length}`);
   if (failed.length > 0) {
     console.error('Failed uploads:', failed);
   }
   ```

3. **Verify study completeness**
   ```bash
   GET /api/studies/{study_uid}
   ```

   **Check**: `number_of_instances` matches expected count

4. **Get all series**
   ```bash
   GET /api/studies/{study_uid}/series
   ```

   **Verify**: All series present with correct instance counts

5. **Display in study viewer** (continue with Workflow 1 steps 5-8)

---

#### Workflow 5: Delete Study

**Steps**:

1. **Soft delete study**
   ```bash
   DELETE /api/studies/{study_uid}
   ```

   **Result**: Study marked as deleted (`deleted_at` set)

2. **Verify removal from listing**
   ```bash
   GET /api/studies
   ```

   **Result**: Deleted study not in list

3. **Study still retrievable by UID** (for audit)
   ```bash
   GET /api/studies/{study_uid}
   ```

   **Result**: Study details still accessible (with `deleted_at` timestamp)

4. **WADO-RS may still serve images** (implementation-dependent)

**Important**: Physical files remain on disk. Implement cleanup job for permanent deletion.

---

## Data Models

### Complete Schema Reference

**See**: [STUDIES-WADO-API.md](./STUDIES-WADO-API.md#data-models) for complete data model documentation including:
- StudyList
- StudyResponse
- SeriesResponse
- PaginatedResponse

### Additional Models

#### DicomFile

Database model for uploaded DICOM files.

| Field | Type | Description |
|-------|------|-------------|
| `id` | UUID | Primary key |
| `sop_instance_uid` | string | SOP Instance UID (unique) |
| `sop_class_uid` | string | SOP Class UID |
| `study_id` | string | Study Instance UID |
| `series_id` | string | Series Instance UID |
| `instance_id` | string | Instance UID |
| `patient_id` | string | Patient ID |
| `patient_name` | string | Patient name (Last^First) |
| `patient_birth_date` | date | Birth date |
| `patient_sex` | string | Sex (M/F/O) |
| `study_date` | date | Study date |
| `study_time` | time | Study time |
| `study_description` | string | Study description |
| `modality` | string | Modality |
| `body_part` | string | Body part examined |
| `series_number` | integer | Series number |
| `instance_number` | integer | Instance number |
| `file_path` | string | Absolute filesystem path |
| `file_size` | integer | File size in bytes |
| `file_hash` | string | SHA-256 hash |
| `storage_tier` | string | hot/warm/cold |
| `rows` | integer | Image rows |
| `columns` | integer | Image columns |
| `bits_allocated` | integer | Bits allocated |
| `bits_stored` | integer | Bits stored |
| `number_of_frames` | integer | Number of frames |
| `transfer_syntax_uid` | string | Transfer syntax UID |
| `is_compressed` | boolean | Is compressed |
| `status` | string | Status (active/archived/deleted) |
| `dicom_metadata` | JSON | Additional metadata |
| `created_at` | datetime | Creation timestamp |
| `updated_at` | datetime | Update timestamp |

#### DicomTagAuditLog

Audit log for tag synchronization operations.

| Field | Type | Description |
|-------|------|-------------|
| `id` | UUID | Primary key |
| `worklist_id` | UUID | Worklist item ID |
| `order_id` | UUID | Order ID |
| `dicom_file_id` | UUID | DicomFile ID |
| `sop_instance_uid` | string | SOP Instance UID |
| `study_instance_uid` | string | Study Instance UID |
| `series_instance_uid` | string | Series Instance UID |
| `accession_number` | string | Accession number |
| `original_file_path` | string | Original file path |
| `synchronized_file_path` | string | Synchronized file path |
| `original_file_size` | integer | Original file size |
| `synchronized_file_size` | integer | Synchronized file size |
| `original_tags` | JSON | Original DICOM tags |
| `synchronized_tags` | JSON | Synchronized DICOM tags |
| `tag_changes` | JSON | Detailed tag changes |
| `patient_id` | string | Patient ID |
| `patient_name` | string | Patient name |
| `operation_type` | string | Operation type (TAG_SYNC) |
| `performed_by` | string | User/system performing operation |
| `operation_reason` | string | Reason for operation |
| `is_bridged` | string | Bridge status (FULL/PARTIAL/NONE) |
| `requires_review` | string | Requires review (Y/N) |
| `sync_status` | string | Sync status (SUCCESS/FAILED/PENDING) |
| `synchronized_at` | datetime | Synchronization timestamp |

---

## Error Handling

**See**: [STUDIES-WADO-API.md](./STUDIES-WADO-API.md#error-handling) for complete error handling documentation.

### Additional Error Codes

| Error Code | HTTP Status | Context | Description |
|------------|-------------|---------|-------------|
| `ORDER_REQUIRED` | 400 | DICOM Upload | order_id parameter is required |
| `INVALID_ORDER_FORMAT` | 400 | DICOM Upload | order_id is not a valid UUID |
| `ORDER_NOT_FOUND` | 404 | DICOM Upload | Order does not exist in database |
| `WORKLIST_NOT_FOUND` | 404 | DICOM Upload | Worklist not found for order |
| `WORKLIST_NOT_COMPLETED` | 400 | DICOM Upload | Worklist status is not COMPLETED |
| `FILE_TOO_LARGE` | 413 | DICOM Upload | File exceeds MAX_DICOM_SIZE |
| `FILE_PERSISTENCE_FAILED` | 500 | DICOM Upload | File failed to persist to disk |
| `TAG_SYNC_FAILED` | 200 | Tag Sync | Tag sync failed but upload succeeded |
| `AUDIT_LOG_NOT_FOUND` | 404 | Tag Audit | Audit log not found |

---

## Frontend Integration Examples

**See**: [STUDIES-WADO-API.md](./STUDIES-WADO-API.md#frontend-integration-examples) for extensive frontend integration examples including:
- List studies with filtering
- Study viewer with series
- Thumbnail grids
- DICOM image viewer with windowing
- Multi-frame cine loop player
- React/TypeScript components

### Additional Examples

#### Complete Upload Form (React)

```typescript
import React, { useState } from 'react';

interface UploadOptions {
  syncTags: boolean;
  preserveOriginal: boolean;
}

const DicomUploadForm: React.FC = () => {
  const [file, setFile] = useState<File | null>(null);
  const [orderId, setOrderId] = useState('');
  const [options, setOptions] = useState<UploadOptions>({
    syncTags: true,
    preserveOriginal: true
  });
  const [uploading, setUploading] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);

  const handleUpload = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!file || !orderId) {
      setError('File and Order ID are required');
      return;
    }

    setUploading(true);
    setError(null);
    setResult(null);

    const formData = new FormData();
    formData.append('file', file);
    formData.append('order_id', orderId);
    formData.append('sync_tags', String(options.syncTags));
    formData.append('preserve_original', String(options.preserveOriginal));

    try {
      const endpoint = options.syncTags
        ? '/api/dicom/upload-sync'
        : '/api/dicom/upload';

      const response = await fetch(`http://localhost:8003${endpoint}`, {
        method: 'POST',
        body: formData,
        credentials: 'include'
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.detail || 'Upload failed');
      }

      const data = await response.json();
      setResult(data);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setUploading(false);
    }
  };

  return (
    <div>
      <h2>DICOM Upload</h2>

      <form onSubmit={handleUpload}>
        <div>
          <label>DICOM File:</label>
          <input
            type="file"
            accept=".dcm,.dicom"
            onChange={(e) => setFile(e.target.files?.[0] || null)}
            required
          />
        </div>

        <div>
          <label>Order ID:</label>
          <input
            type="text"
            value={orderId}
            onChange={(e) => setOrderId(e.target.value)}
            placeholder="550e8400-e29b-41d4-a716-446655440000"
            required
          />
        </div>

        <div>
          <label>
            <input
              type="checkbox"
              checked={options.syncTags}
              onChange={(e) => setOptions({
                ...options,
                syncTags: e.target.checked
              })}
            />
            Synchronize DICOM tags with worklist
          </label>
        </div>

        {options.syncTags && (
          <div>
            <label>
              <input
                type="checkbox"
                checked={options.preserveOriginal}
                onChange={(e) => setOptions({
                  ...options,
                  preserveOriginal: e.target.checked
                })}
              />
              Preserve original file for audit
            </label>
          </div>
        )}

        <button type="submit" disabled={uploading}>
          {uploading ? 'Uploading...' : 'Upload'}
        </button>
      </form>

      {error && (
        <div style={{ color: 'red', marginTop: '1rem' }}>
          <strong>Error:</strong> {error}
        </div>
      )}

      {result && (
        <div style={{ marginTop: '1rem' }}>
          <h3>Upload Successful!</h3>
          <p><strong>File ID:</strong> {result.dicom_file?.id || result.file?.id}</p>
          <p><strong>Study UID:</strong> {result.dicom_metadata?.study_id}</p>

          {result.tag_sync?.synchronized && (
            <div>
              <h4>Tag Synchronization</h4>
              <p><strong>Changes:</strong> {result.tag_sync.changes_count} tags updated</p>
              <p><strong>Audit Log:</strong> {result.tag_sync.audit_log_id}</p>

              {result.tag_sync.changes && (
                <details>
                  <summary>View Tag Changes</summary>
                  <pre>{JSON.stringify(result.tag_sync.changes, null, 2)}</pre>
                </details>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default DicomUploadForm;
```

---

## API Reference Summary

### Quick Reference Table

| Category | Endpoint | Method | Description |
|----------|----------|--------|-------------|
| **Studies** | `/api/studies` | GET | List studies |
| | `/api/studies/{study_uid}` | GET | Get study details |
| | `/api/studies/{study_uid}/series` | GET | Get study series |
| | `/api/studies/{study_uid}/files` | GET | Get study files |
| | `/api/studies/{study_uid}` | DELETE | Soft delete study |
| **WADO-RS** | `/wado-rs/studies/{study_id}` | GET | Get study instances |
| | `/wado-rs/.../series/{series_id}` | GET | Get series instances |
| | `/wado-rs/.../instances/{instance_id}` | GET | Download DICOM |
| | `/wado-rs/.../instances/{instance_id}/metadata` | GET | Get metadata |
| | `/wado-rs/.../instances/{instance_id}/thumbnail` | GET | Get thumbnail |
| | `/wado-rs/.../instances/{instance_id}/rendered` | GET | Get rendered image |
| | `/wado-rs/.../frames/{frame_number}` | GET | Get frame |
| | `/wado-rs/health` | GET | Health check |
| **DICOM Upload** | `/api/dicom/upload` | POST | Upload DICOM (basic) |
| | `/api/dicom/files/{file_id}/tags` | GET | Get file tags |
| | `/api/dicom/files/{file_id}/refresh-tags` | POST | Refresh tags |
| **Tag Sync** | `/api/dicom/upload-sync` | POST | Upload with tag sync |
| | `/api/dicom/tag-audit/{audit_log_id}` | GET | Get audit log |
| | `/api/dicom/tag-audit` | GET | List audit logs |
| **Storage** | `/api/storage/upload` | POST | Upload with tier |
| | `/api/storage/files/{sop_uid}` | GET | Get file metadata |
| | `/api/storage/files/{sop_uid}/download` | GET | Download file |
| | `/api/storage/search` | GET | Search files |
| | `/api/storage/files/{sop_uid}` | DELETE | Delete file |
| | `/api/storage/stats` | GET | Get statistics |
| | `/api/storage/health` | GET | Health check |

---

## Configuration

### Environment Variables

```bash
# Storage
STORAGE_PATH=/var/lib/pacs/storage
DICOM_UPLOAD_DIR=/var/lib/pacs/storage/dicom/uploads
MAX_DICOM_SIZE=104857600  # 100MB in bytes

# Database
DATABASE_URL=postgresql://user:pass@localhost:5432/pacs

# CORS
CORS_ORIGINS=http://localhost:5173,http://localhost:3000

# Authentication (when enabled)
JWT_SECRET=your-secret-key
JWT_ALGORITHM=HS256
```

---

## Support & Contribution

**Documentation**:
- Complete Studies & WADO-RS docs: [STUDIES-WADO-API.md](./STUDIES-WADO-API.md)
- This document: `COMPLETE-PACS-API.md`

**Source Code**:
- Studies API: `pacs-service/app/api/studies.py`
- WADO-RS API: `pacs-service/app/api/wado.py`
- DICOM Upload: `pacs-service/app/api/dicom_upload.py`
- DICOM Upload Sync: `pacs-service/app/api/dicom_upload_sync.py`
- Storage API: `pacs-service/app/api/storage.py`

**Schemas**:
- `pacs-service/app/schemas/study.py`
- `pacs-service/app/schemas/series.py`
- `pacs-service/app/schemas/common.py`

**Services**:
- `pacs-service/app/services/wado_service.py`
- `pacs-service/app/services/dicom_parser.py`
- `pacs-service/app/services/dicom_tag_synchronizer.py`
- `pacs-service/app/services/dicom_storage.py`

---

*Last Updated: 2025-11-21*
*Documentation Version: 1.0.0*
*API Version: 1.0.0*
