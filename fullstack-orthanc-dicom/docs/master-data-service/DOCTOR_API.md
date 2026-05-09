# Doctor Master Data API Documentation

This document describes the Doctor/Practitioner master data API endpoints in the master-data-service.

## Overview

The Doctor Master Data feature provides comprehensive management of healthcare practitioners (doctors, nurses, pharmacists, etc.) with support for:

- CRUD operations (Create, Read, Update, Delete)
- Advanced search and filtering
- Practitioner qualifications management
- Schedule management
- Audit logging
- Integration with SATUSEHAT (Indonesian health data standard)
- FHIR-compliant data model

## Database Schema

### Main Tables

#### `doctors`
Primary table storing doctor/practitioner information:
- `id` (UUID) - Primary key
- `ihs_number` (VARCHAR) - IHS (Indeks Halaman Sehat) number
- `national_id` (VARCHAR) - National ID (NIK in Indonesia)
- `name` (VARCHAR) - Full name
- `license` (VARCHAR) - Professional license number (e.g., STR)
- `specialty` (VARCHAR) - Medical specialty
- `phone` (VARCHAR) - Contact phone
- `email` (VARCHAR) - Email address
- `birth_date` (DATE) - Date of birth
- `gender` (VARCHAR) - Gender (M, F)
- `active` (BOOLEAN) - Active status
- `created_at`, `updated_at`, `deleted_at` - Timestamps

#### `doctor_qualifications`
Stores certifications, licenses, and training:
- `id` (UUID) - Primary key
- `doctor_id` (UUID) - Foreign key to doctors
- `qualification_type` (VARCHAR) - Type of qualification
- `qualification_code` (VARCHAR) - Qualification code
- `institution` (VARCHAR) - Issuing institution
- `year_obtained` (INTEGER) - Year obtained
- `expiry_date` (DATE) - Expiration date
- `issuer` (VARCHAR) - Issuing organization
- `notes` (TEXT) - Additional notes

#### `doctor_schedules`
Manages doctor availability schedules:
- `id` (UUID) - Primary key
- `doctor_id` (UUID) - Foreign key to doctors
- `day_of_week` (INTEGER) - 0-6 (Monday-Sunday)
- `start_time`, `end_time` (TIME) - Schedule times
- `location`, `room` (VARCHAR) - Practice location
- `max_patients` (INTEGER) - Maximum patients per session
- `active` (BOOLEAN) - Active status

#### `doctor_audit_log`
Audit trail for all doctor data changes

## API Endpoints

### Base URL
```
http://localhost:8888/doctors  (via API Gateway)
http://localhost:8002/doctors  (direct to master-data-service)
```

### Authentication
All endpoints require JWT authentication with appropriate permissions:
- `doctor:read` or `practitioner:read` - Read doctor data
- `doctor:create` or `practitioner:create` - Create new doctor
- `doctor:update` or `practitioner:update` - Update doctor data
- `doctor:delete` or `practitioner:delete` - Delete doctor
- `doctor:search` or `practitioner:search` - Search doctors

### 1. Create Doctor
**POST** `/doctors`

Creates a new doctor record.

**Required Permission:** `doctor:create` or `practitioner:create`

**Request Body:**
```json
{
  "ihs_number": "10009880728",
  "national_id": "7209061211900001",
  "name": "dr. Alexander",
  "license": "STR-7209061211900001",
  "specialty": "General",
  "phone": "+62-812-0001-0001",
  "email": "dr.alexander@hospital.com",
  "birth_date": "1994-01-01",
  "gender": "M"
}
```

**Response (201 Created):**
```json
{
  "status": "success",
  "message": "Doctor created successfully",
  "doctor_id": "d1a2b3c4-e5f6-7890-abcd-ef1234567890"
}
```

**Validation:**
- `name` is required
- `ihs_number`, `national_id`, and `license` must be unique (if provided)

### 2. Get Doctor
**GET** `/doctors/{doctor_id_or_identifier}`

Retrieves a doctor by ID, national ID, IHS number, or license number.

**Required Permission:** `doctor:read` or `practitioner:read`

**Path Parameters:**
- `doctor_id_or_identifier` - Can be:
  - UUID (36 characters)
  - National ID (NIK)
  - IHS number
  - License number

**Response (200 OK):**
```json
{
  "status": "success",
  "doctor": {
    "id": "d1a2b3c4-e5f6-7890-abcd-ef1234567890",
    "ihs_number": "10009880728",
    "national_id": "7209061211900001",
    "name": "dr. Alexander",
    "license": "STR-7209061211900001",
    "specialty": "General",
    "phone": "+62-812-0001-0001",
    "email": "dr.alexander@hospital.com",
    "birth_date": "1994-01-01",
    "gender": "M",
    "active": true,
    "created_at": "2025-01-15T10:30:00Z",
    "updated_at": "2025-01-15T10:30:00Z",
    "deleted_at": null,
    "qualifications": [...],
    "schedules": [...]
  }
}
```

### 3. Update Doctor
**PUT** `/doctors/{doctor_id}`

Updates an existing doctor record.

**Required Permission:** `doctor:update` or `practitioner:update`

**Request Body:** (all fields optional, only send fields to update)
```json
{
  "name": "dr. Alexander, M.D.",
  "email": "alexander.new@hospital.com",
  "specialty": "Internal Medicine",
  "active": true
}
```

**Response (200 OK):**
```json
{
  "status": "success",
  "message": "Doctor updated successfully",
  "doctor": { ...updated doctor object... }
}
```

### 4. Delete Doctor (Soft Delete)
**DELETE** `/doctors/{doctor_id}`

Soft deletes a doctor (sets `deleted_at` and `active=false`).

**Required Permission:** `doctor:delete` or `practitioner:delete`

**Response (200 OK):**
```json
{
  "status": "success",
  "message": "Doctor deleted successfully"
}
```

### 5. Search Doctors
**GET** `/doctors/search`

Searches doctors with multiple filter options.

**Required Permission:** `doctor:search` or `practitioner:search`

**Query Parameters:**
- `name` - Search by name (case-insensitive, partial match)
- `ihs_number` - Search by IHS number
- `national_id` - Search by national ID (NIK)
- `license` - Search by license number
- `specialty` - Search by specialty (case-insensitive, partial match)
- `active` - Filter by active status (default: `true`)

**Example:**
```
GET /doctors/search?specialty=Pediatrics&active=true
```

**Response (200 OK):**
```json
{
  "status": "success",
  "doctors": [
    {
      "id": "e2b3c4d5-f6a7-8901-bcde-f23456789012",
      "ihs_number": "10006926841",
      "national_id": "3322071302900002",
      "name": "dr. Yoga Yandika, Sp.A",
      "license": "STR-3322071302900002",
      "specialty": "Pediatrics",
      "phone": "+62-812-0002-0002",
      "email": "yoga@hospital.com",
      "gender": "M",
      "birth_date": "1995-02-02",
      "active": true,
      "created_at": "2025-01-15T10:30:00Z"
    },
    ...
  ],
  "count": 1
}
```

**Note:** Results are limited to 100 records and ordered by name.

### 6. Add Doctor Qualification
**POST** `/doctors/{doctor_id}/qualifications`

Adds a qualification/certification to a doctor.

**Required Permission:** `doctor:update` or `practitioner:update`

**Request Body:**
```json
{
  "qualification_type": "Specialist Certification",
  "qualification_code": "SP-PD",
  "institution": "Indonesian Medical Association",
  "year_obtained": 2020,
  "expiry_date": "2025-12-31",
  "issuer": "IDI",
  "notes": "Board certified in Internal Medicine"
}
```

**Response (201 Created):**
```json
{
  "status": "success",
  "message": "Qualification added successfully",
  "qualification_id": "f3c4d5e6-a7b8-9012-cdef-345678901234"
}
```

### 7. Delete Doctor Qualification
**DELETE** `/doctors/{doctor_id}/qualifications/{qualification_id}`

Removes a qualification from a doctor.

**Required Permission:** `doctor:update` or `practitioner:update`

**Response (200 OK):**
```json
{
  "status": "success",
  "message": "Qualification deleted successfully"
}
```

## Data Migration

### Importing Doctors from JSON

Use the provided migration script to import doctors from `docs/doctors.json`:

```bash
# From within the master-data-service directory
python migrate_doctors.py
```

The script will:
- Load doctors from `../docs/doctors.json`
- Check for duplicates (by national_id, ihs_number, or license)
- Insert new doctors
- Skip existing doctors
- Provide a summary report

**Environment Variables:**
```bash
POSTGRES_HOST=localhost
POSTGRES_DB=worklist_db
POSTGRES_USER=dicom
POSTGRES_PASSWORD=dicom123
```

## Integration Examples

### Creating a Doctor via API Gateway

```bash
curl -X POST http://localhost:8888/doctors \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "ihs_number": "10009880728",
    "national_id": "7209061211900001",
    "name": "dr. Alexander",
    "license": "STR-7209061211900001",
    "specialty": "General",
    "phone": "+62-812-0001-0001",
    "email": "dr.alexander@hospital.com",
    "birth_date": "1994-01-01",
    "gender": "M"
  }'
```

### Searching for Pediatricians

```bash
curl -X GET "http://localhost:8888/doctors/search?specialty=Pediatrics" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

### Getting Doctor by IHS Number

```bash
curl -X GET http://localhost:8888/doctors/10009880728 \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

### Updating Doctor Information

```bash
curl -X PUT http://localhost:8888/doctors/d1a2b3c4-e5f6-7890-abcd-ef1234567890 \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "email": "alexander.new@hospital.com",
    "phone": "+62-812-9999-9999"
  }'
```

## Error Responses

### 400 Bad Request
Missing required fields or invalid data:
```json
{
  "status": "error",
  "message": "Missing required field: name"
}
```

### 401 Unauthorized
Missing or invalid JWT token:
```json
{
  "status": "error",
  "message": "Invalid or expired token"
}
```

### 403 Forbidden
Insufficient permissions:
```json
{
  "status": "error",
  "message": "Permission denied",
  "required": ["doctor:create", "practitioner:create", "*"]
}
```

### 404 Not Found
Doctor not found:
```json
{
  "status": "error",
  "message": "Doctor not found"
}
```

### 409 Conflict
Duplicate data:
```json
{
  "status": "error",
  "message": "Doctor with this IHS number, national ID, or license already exists"
}
```

### 500 Internal Server Error
Server error:
```json
{
  "status": "error",
  "message": "Database connection failed"
}
```

## Audit Logging

All operations on doctor data are logged in the `doctor_audit_log` table:
- CREATE - When a new doctor is created
- UPDATE - When doctor fields are modified (logs each changed field)
- DELETE - When a doctor is soft deleted
- ADD_QUALIFICATION - When a qualification is added
- DELETE_QUALIFICATION - When a qualification is removed

Audit logs include:
- Action type
- Field name (for updates)
- Old and new values
- User ID (from JWT token)
- IP address
- User agent
- Timestamp

## SATUSEHAT Integration

The doctor master data is designed to integrate with SATUSEHAT (Indonesia's health data exchange):

- `ihs_number` maps to SATUSEHAT Practitioner resource ID
- `national_id` (NIK) is used for identity verification
- `license` stores STR (Surat Tanda Registrasi) number
- Gender codes: M/F align with SATUSEHAT standards

## FHIR Compliance

The data model aligns with HL7 FHIR Practitioner resource:
- Core identifiers (ihs_number, national_id, license)
- Demographics (name, gender, birth_date)
- Contact details (phone, email)
- Qualifications (certifications, licenses, training)
- Active status flag

## Best Practices

1. **Always use unique identifiers** - Ensure ihs_number, national_id, and license are unique
2. **Soft delete** - Use DELETE endpoint (soft delete) rather than hard deleting from database
3. **Search optimization** - Use indexed fields (name, specialty, ihs_number) for better performance
4. **Audit compliance** - All changes are logged automatically for compliance
5. **Permission granularity** - Use specific permissions (doctor:read, doctor:create, etc.) rather than wildcard (*)

## Future Enhancements

Planned features:
- [ ] Doctor schedule management API
- [ ] Integration with appointment scheduling
- [ ] Advanced qualification verification
- [ ] Real-time SATUSEHAT synchronization
- [ ] Bulk import/export functionality
- [ ] Doctor performance metrics