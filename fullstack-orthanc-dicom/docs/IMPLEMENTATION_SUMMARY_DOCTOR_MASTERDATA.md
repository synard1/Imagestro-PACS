# Doctor Master Data Implementation Summary

## Overview

This document summarizes the implementation of the Doctor Master Data service, which has been refactored to align with the SATUSEHAT doctors.json format.

## Changes Made

### 1. Database Schema Updates

The doctor database schema in `master-data-service/app.py` has been updated to match the doctors.json format:

**Before:**
- `practitioner_id` (unique identifier)
- `national_id` (NIK)
- `name` (doctor name)
- `license` (medical license)
- `specialty` (medical specialty)
- `phone` (contact phone)
- `email` (contact email)
- `birth_date` (date of birth)
- `gender` (M/F/other/unknown)
- `address` (physical address)
- `photo_url` (profile picture)
- `active` (status)

**After:**
- `ihs_number` (IHS number - matches `ihs_number` in doctors.json)
- `national_id` (NIK - matches `national_id` in doctors.json)
- `name` (doctor name - matches `name` in doctors.json)
- `license` (medical license - matches `license` in doctors.json)
- `specialty` (medical specialty - matches `specialty` in doctors.json)
- `phone` (contact phone - matches `phone` in doctors.json)
- `birth_date` (date of birth - matches `birth_date` in doctors.json)
- `gender` (M/F - matches `gender` in doctors.json)
- `active` (status)

### 2. API Endpoint Updates

All doctor-related API endpoints have been updated to use the new field names:

- **POST /doctors** - Create a new doctor with the updated field names
- **GET /doctors/<doctor_id_or_identifier>** - Retrieve doctor by ID, IHS number, national ID, or license
- **PUT /doctors/<doctor_id>** - Update doctor information
- **DELETE /doctors/<doctor_id>** - Delete (soft delete) a doctor
- **GET /doctors/search** - Search doctors by various criteria

### 3. Migration Script Updates

The doctor migration script (`migrate_doctors.py`) has been updated to:

- Load doctors from `docs/doctors.json`
- Map JSON fields to database fields correctly:
  - `ihs_number` (JSON) → `ihs_number` (database)
  - `national_id` (JSON) → `national_id` (database)
  - `name` (JSON) → `name` (database)
  - `license` (JSON) → `license` (database)
  - `specialty` (JSON) → `specialty` (database)
  - `phone` (JSON) → `phone` (database)
  - `birth_date` (JSON) → `birth_date` (database)
  - `gender` (JSON) → `gender` (database)

### 4. Seeding Script Updates

The doctor seeding script (`seed_doctors.py`) has been updated with the same field mappings as the migration script.

## Field Mapping

| JSON Field     | Database Field | Description                     |
|----------------|----------------|---------------------------------|
| `ihs_number`   | `ihs_number`   | IHS (Indeks Halaman Sehat) number |
| `national_id`  | `national_id`  | National ID (NIK)               |
| `name`         | `name`         | Doctor's full name              |
| `license`      | `license`      | Medical license number          |
| `specialty`    | `specialty`    | Medical specialty               |
| `phone`        | `phone`        | Contact phone number            |
| `birth_date`   | `birth_date`   | Date of birth (YYYY-MM-DD)      |
| `gender`       | `gender`       | Gender (M/F)                    |

## Usage

### API Examples

1. **Create a Doctor:**
```
curl -X POST http://localhost:8002/doctors \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{
    "ihs_number": "10009880728",
    "national_id": "7209061211900001",
    "name": "dr. Alexander",
    "license": "STR-7209061211900001",
    "specialty": "General",
    "phone": "+62-812-0001-0001",
    "birth_date": "1994-01-01",
    "gender": "M"
  }'
```

2. **Get a Doctor:**
```
curl -X GET http://localhost:8002/doctors/10009880728 \
  -H "Authorization: Bearer <token>"
```

3. **Search Doctors:**
```
curl -X GET "http://localhost:8002/doctors/search?name=dr.%20Alexander" \
  -H "Authorization: Bearer <token>"
```

### Migration

To migrate existing doctor data:

```
python master-data-service/migrate_doctors.py
```

### Seeding

To seed doctor data from the JSON file:

```
python master-data-service/seed_doctors.py
```

## Benefits

1. **Consistency**: The database schema now matches the official SATUSEHAT doctors.json format
2. **Interoperability**: Easier integration with SATUSEHAT systems
3. **Simplified Data Model**: Removed unnecessary fields that weren't in the JSON format
4. **Better Alignment**: All field names and data types now align with the official documentation

## Next Steps

1. Update any existing services that reference the old doctor schema
2. Run the migration script to import existing doctor data
3. Test all doctor-related functionality
4. Update documentation to reflect the new schema
