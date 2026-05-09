# Worklists API Documentation
## Fullstack Orthanc DICOM - Modality Worklist (MWL) Management

**Version**: 1.0.0  
**Base URL**: `http://localhost:8888` (API Gateway)  
**Authentication**: JWT Bearer Token (RBAC)  
**Service Backend**: mwl-writer (port 8000 internal)

---

## 📋 Table of Contents
- [Overview](#overview)
- [Authentication & Permissions](#authentication)
- [Endpoints](#endpoints)
  - [List Worklists](#list-worklists)
  - [Create Worklist](#create-worklist)
  - [Get Worklist](#get-worklist)
  - [Update Worklist](#update-worklist)
  - [Delete Worklist](#delete-worklist)
- [Query Parameters](#query-parameters)
- [Response Format](#response-format)
- [Error Codes](#error-codes)
- [Data Model](#data-model)
- [DICOM Integration](#dicom-integration)
- [Audit Trail](#audit-trail)

---

## 🔍 Overview

Complete **CRUD operations** for **DICOM Modality Worklist (MWL)** management:

| Feature | Status |
|---------|--------|
| **List/Search** | ✅ Pagination, filtering, sorting |
| **Create** | ✅ Auto DICOM `.wl` file generation |
| **Read** | ✅ UUID or `accession_number` lookup |
| **Update** | ✅ Partial updates, status tracking |
| **Delete** | ✅ Soft delete with audit trail |
| **Security** | ✅ JWT + RBAC permissions |
| **Audit** | ✅ Full change history |

---

## 🔐 Authentication & Permissions

### Required Headers
Authorization: Bearer <jwt_token>
Content-Type: application/json

### RBAC Permissions
| Endpoint | Method | Permission Required |
|----------|--------|-------------------|
| `GET /worklists` | `GET` | `worklist:read` |
| `POST /worklists` | `POST` | `worklist:create` |
| `GET /worklists/{id}` | `GET` | `worklist:read` |
| `PUT /worklists/{id}` | `PUT` | `worklist:update` |
| `DELETE /worklists/{id}` | `DELETE` | `worklist:delete` |
| `*` (all) | `*` | `superadmin` (`*` wildcard) |

**Backward Compatibility**: `/worklist/*` endpoints tetap berfungsi.

---

## 🌐 Endpoints

### 📋 List Worklists
GET /worklists

**List all worklists** with advanced filtering, pagination, and sorting.

#### Query Parameters
| Param | Type | Description | Example |
|-------|------|-------------|---------|
| `page` | `int` | Page number (1-based) | `1` |
| `page_size` | `int` | Items per page (1-100) | `20` |
| `status` | `string` | Filter by status | `SCHEDULED` |
| `modality` | `string` | Filter by modality | `CT` |
| `patient_id` | `string` | Filter by patient ID | `123456` |
| `accession_number` | `string` | Filter by accession | `ACC20251118` |
| `scheduled_date` | `string` | Filter by date (YYYYMMDD) | `20251118` |
| `station_aet` | `string` | Filter by station AE | `SCANNER01` |
| `include_deleted` | `bool` | Include soft-deleted | `true` |
| `sort_by` | `string` | Sort field | `created_at` |
| `sort_dir` | `string` | Sort direction | `desc` |

#### Example
GET /worklists?page=1&page_size=20&status=SCHEDULED&modality=CT&sort_by=scheduled_date&sort_dir=asc

#### Response
```json
{
  "status": "success",
  "worklists": [
    {
      "id": "550e8400-e29b-41d4-a716-446655440001",
      "accession_number": "ACC202511180001",
      "patient_id": "123456",
      "patient_name": "John Doe",
      "patient_birth_date": "19800101",
      "patient_sex": "M",
      "modality": "CT",
      "procedure_description": "CT Scan Head",
      "scheduled_date": "20251118",
      "scheduled_time": "080000",
      "physician_name": "Dr. Smith",
      "station_aet": "SCANNER01",
      "study_instance_uid": "1.2.840.113619...",
      "status": "SCHEDULED",
      "filename": "ACC202511180001.wl",
      "created_at": "2025-11-18T10:30:00Z",
      "updated_at": "2025-11-18T10:30:00Z",
      "record_status": "active"
    }
  ],
  "pagination": {
    "page": 1,
    "page_size": 20,
    "total": 150,
    "pages": 8,
    "count": 20
  },
  "filters": {
    "status": "SCHEDULED",
    "modality": "CT"
  }
}
```

---

### ➕ Create Worklist
POST /worklists

**Create new worklist** with automatic DICOM `.wl` file generation.

#### Request Body
```json
{
  "accession_number": "ACC202511180001",
  "patient_id": "123456",
  "patient_name": "John Doe",
  "patient_birth_date": "19800101",
  "patient_sex": "M",
  "modality": "CT",
  "procedure_description": "CT Scan Head",
  "scheduled_date": "2025-11-18",
  "scheduled_time": "08:00",
  "physician_name": "Dr. Smith",
  "station_aet": "SCANNER01"
}
```

**Required**: `accession_number`, `patient_id`, `patient_name`, `modality`

#### Response
```json
{
  "status": "success",
  "message": "Worklist created successfully",
  "data": {
    "id": "550e8400-e29b-41d4-a716-446655440001",
    "accession_number": "ACC202511180001",
    "filename": "ACC202511180001.wl",
    "status": "SCHEDULED",
    "created_at": "2025-11-18T10:30:00Z",
    "created_by": "admin"
  }
}
```

---

### 👁️ Get Worklist
GET /worklists/{identifier}

**Get single worklist** by UUID or `accession_number`.

#### Path Parameters
| Param | Type | Description |
|-------|------|-------------|
| `identifier` | `string` | UUID or accession_number |

#### Examples
GET /worklists/550e8400-e29b-41d4-a716-446655440001
GET /worklists/ACC202511180001

#### Response
```json
{
  "status": "success",
  "worklist": {
    "id": "550e8400-e29b-41d4-a716-446655440001",
    "accession_number": "ACC202511180001",
    "patient_id": "123456",
    "patient_name": "John Doe",
    "patient_birth_date": "19800101",
    "patient_sex": "M",
    "modality": "CT",
    "procedure_description": "CT Scan Head",
    "scheduled_date": "20251118",
    "scheduled_time": "080000",
    "physician_name": "Dr. Smith",
    "station_aet": "SCANNER01",
    "study_instance_uid": "1.2.840.113619...",
    "status": "SCHEDULED",
    "filename": "ACC202511180001.wl",
    "created_at": "2025-11-18T10:30:00Z",
    "updated_at": "2025-11-18T10:30:00Z",
    "created_by": "admin",
    "modified_by": "admin",
    "deletion_info": {"deleted": false}
  }
}
```

---

### ✏️ Update Worklist
PUT /worklists/{identifier}

**Update worklist** (partial updates supported).

#### Path Parameters
| Param | Type | Description |
|-------|------|-------------|
| `identifier` | `string` | UUID or accession_number |

#### Request Body
```json
{
  "status": "COMPLETED",
  "physician_name": "Dr. Johnson",
  "scheduled_time": "090000"
}
```

**Allowed fields**:
- `status` (SCHEDULED|IN_PROGRESS|COMPLETED|CANCELLED)
- `patient_name`, `patient_birth_date`, `patient_sex`
- `modality`, `procedure_description`
- `scheduled_date`, `scheduled_time`
- `physician_name`, `station_aet`
- `study_instance_uid`

#### Response
```json
{
  "status": "success",
  "message": "Worklist updated successfully",
  "data": {
    "id": "550e8400-e29b-41d4-a716-446655440001",
    "accession_number": "ACC202511180001",
    "status": "COMPLETED",
    "updated_at": "2025-11-18T11:00:00Z",
    "updated_by": "admin"
  }
}
```

---

### 🗑️ Delete Worklist
DELETE /worklists/{identifier}

**Soft delete worklist** (sets `status=DELETED`, `deleted_at`, preserves audit trail).

#### Path Parameters
| Param | Type | Description |
|-------|------|-------------|
| `identifier` | `string` | UUID or accession_number |

#### Response
```json
{
  "status": "success",
  "message": "Worklist soft-deleted successfully",
  "data": {
    "id": "550e8400-e29b-41d4-a716-446655440001",
    "accession_number": "ACC202511180001",
    "deleted_by": "admin"
  }
}
```

---

## 🔍 Query Parameters Reference

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `page` | `integer` | `1` | Page number (1-based) |
| `page_size` | `integer` | `20` | Items per page (max 100) |
| `status` | `string` | - | `SCHEDULED`, `IN_PROGRESS`, `COMPLETED`, `CANCELLED` |
| `modality` | `string` | - | `CT`, `MR`, `US`, `CR`, etc. |
| `patient_id` | `string` | - | Partial match |
| `accession_number` | `string` | - | Partial match |
| `scheduled_date` | `string` | - | `YYYYMMDD` format |
| `station_aet` | `string` | - | AE Title partial match |
| `include_deleted` | `boolean` | `false` | Include soft-deleted records |
| `sort_by` | `string` | `created_at` | `created_at`, `scheduled_date`, `updated_at`, `accession_number` |
| `sort_dir` | `string` | `desc` | `asc` or `desc` |

---

## 📊 Response Format

### Success Response Structure
```json
{
  "status": "success",
  "worklists": [...],
  "pagination": {
    "page": 1,
    "page_size": 20,
    "total": 150,
    "pages": 8,
    "count": 20
  },
  "filters": { ...applied filters... }
}
```

### Single Worklist Response
{
  "id": "uuid-string",
  "accession_number": "ACC202511180001",
  "patient_id": "123456",
  "patient_name": "John Doe",
  "patient_birth_date": "19800101",
  "patient_sex": "M",
  "modality": "CT",
  "procedure_description": "CT Scan Head",
  "scheduled_date": "20251118",
  "scheduled_time": "080000",
  "physician_name": "Dr. Smith",
  "station_aet": "SCANNER01",
  "study_instance_uid": "1.2.840...",
  "status": "SCHEDULED",
  "filename": "ACC202511180001.wl",
  "created_at": "2025-11-18T10:30:00Z",
  "updated_at": "2025-11-18T10:30:00Z",
  "created_by": "admin",
  "modified_by": "admin",
  "record_status": "active",
  "deletion_info": {
    "deleted": false
  }
}

---

## 🚨 Error Codes

| HTTP Code | Status | Message | Cause |
|-----------|--------|---------|-------|
| `400` | `error` | `Missing required fields` | Required fields missing |
| `400` | `error` | `Invalid status` | Status not in valid list |
| `401` | `error` | `Missing authorization header` | No JWT token |
| `403` | `error` | `Permission denied` | Insufficient RBAC permissions |
| `404` | `error` | `Worklist not found` | Invalid UUID/accession |
| `409` | `error` | `Accession number already exists` | Duplicate `accession_number` |
| `500` | `error` | `Internal server error` | Database/DICOM error |

---

## 🗄️ Data Model

### Worklist Schema
| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `id` | `UUID` | No | Auto-generated unique ID |
| `accession_number` | `string` | **Yes** | Unique accession (e.g. `ACC202511180001`) |
| `patient_id` | `string` | **Yes** | Patient ID/MRN |
| `patient_name` | `string` | **Yes** | DICOM format: `LASTNAME^FIRSTNAME` |
| `patient_birth_date` | `string` | No | `YYYYMMDD` format |
| `patient_sex` | `string` | No | `M`, `F`, `O` |
| `modality` | `string` | **Yes** | `CT`, `MR`, `US`, `CR`, etc. |
| `procedure_description` | `string` | No | Exam description |
| `scheduled_date` | `string` | No | `YYYYMMDD` format |
| `scheduled_time` | `string` | No | `HHMMSS` format |
| `physician_name` | `string` | No | Referring physician |
| `station_aet` | `string` | No | Modality AE Title |
| `study_instance_uid` | `string` | No | Auto-generated |
| `status` | `string` | No | `SCHEDULED`, `IN_PROGRESS`, `COMPLETED`, `CANCELLED` |
| `filename` | `string` | No | Generated: `{accession}.wl` |
| `created_at` | `ISO datetime` | No | Creation timestamp |
| `updated_at` | `ISO datetime` | No | Last update timestamp |
| `record_status` | `string` | No | `active` or `deleted` |

---

## 🔌 DICOM Integration

### Auto-generated Worklist Files
- **Location**: `/worklists/{accession_number}.wl` (volume mounted)
- **Format**: DICOM Modality Worklist (SOP Class: `1.2.840.10008.5.1.4.31`)
- **Auto-generated fields**:
  ```
  - StudyInstanceUID
  - ScheduledProcedureStepSequence
  - AccessionNumber
  - PatientName, PatientID, PatientBirthDate, PatientSex
  ```

### Orthanc Integration
- Files accessible via Orthanc MWL plugin (`/worklists/`)
- Modalities dapat query via C-FIND MWL
- Real-time status updates via API

---

## 📝 Audit Trail

### worklist_audit_log Table
| Field | Type | Description |
|-------|------|-------------|
| `worklist_id` | `UUID` | Reference to worklist |
| `accession_number` | `string` | Accession number |
| `action` | `string` | `CREATED`, `UPDATED`, `DELETED` |
| `before_data` | `JSONB` | Data before change |
| `after_data` | `JSONB` | Data after change |
| `user_info` | `string` | Username who made change |
| `ip_address` | `string` | Client IP |
| `created_at` | `timestamp` | Audit timestamp |

### Example Audit Entry
```json
{
  "action": "UPDATED",
  "before_data": {"status": "SCHEDULED"},
  "after_data": {"status": "COMPLETED"},
  "user_info": "admin",
  "ip_address": "172.28.0.10"
}
```

---

## 🧪 Example Usage

### 1. Login & Get Token
```bash
curl -X POST http://localhost:8888/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"Admin@12345"}'
```

### 2. Create Worklist
```bash
curl -X POST http://localhost:8888/worklists \
  -H "Authorization: Bearer <jwt_token>" \
  -H "Content-Type: application/json" \
  -d '{
    "accession_number": "ACC202511180001",
    "patient_id": "MRN123456",
    "patient_name": "DOE^JOHN",
    "modality": "CT",
    "scheduled_date": "20251118",
    "scheduled_time": "080000"
  }'
```

### 3. List Worklists (Filtered)
```bash
curl "http://localhost:8888/worklists?status=SCHEDULED&modality=CT&page=1&page_size=10" \
  -H "Authorization: Bearer <jwt_token>"
```

### 4. Update Status to COMPLETED
```bash
curl -X PUT http://localhost:8888/worklists/ACC202511180001 \
  -H "Authorization: Bearer <jwt_token>" \
  -H "Content-Type: application/json" \
  -d '{"status": "COMPLETED"}'
```

### 5. Soft Delete
```bash
curl -X DELETE http://localhost:8888/worklists/ACC202511180001 \
  -H "Authorization: Bearer <jwt_token>"
```

---

## 🚀 Quick Start cURL Commands

```bash
# 1. Get token
TOKEN=$(curl -s -X POST http://localhost:8888/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"Admin@12345"}' | jq -r '.access_token')

# 2. Create worklist
curl -X POST http://localhost:8888/worklists \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "accession_number": "ACC'$(date +%Y%m%d%H%M%S)'",
    "patient_id": "123456",
    "patient_name": "DOE^JOHN",
    "modality": "CT"
  }'

# 3. List today's SCHEDULED CT scans
curl "http://localhost:8888/worklists?status=SCHEDULED&modality=CT" \
  -H "Authorization: Bearer $TOKEN" | jq '.worklists[] | {accession_number, patient_name, scheduled_date}'
```

---

## 📱 Frontend Integration

### React/Vue Example
```javascript
const createWorklist = async (worklistData) => {
  const token = localStorage.getItem('jwt_token');
  const response = await fetch('/worklists', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(worklistData)
  });
  return response.json();
};
```

---

## 🛠️ Deployment Notes

- **API Gateway**: Port `8888` (single entry point)
- **mwl-writer**: Internal port `8000`
- **Database**: PostgreSQL `worklist_db`
- **Worklist Files**: `/worklists/` volume (Orthanc accessible)
- **Permissions**: Managed via `/auth/roles` & `/auth/permissions`

**🎉 Worklists API READY FOR PRODUCTION!**
