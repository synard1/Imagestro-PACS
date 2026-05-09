# Doctor Schema Refactor Summary

## Overview

This document summarizes the refactor of the Doctor/Practitioner schema in the Master Data Service to align with the SATUSEHAT `docs/doctors.json` format.

## Changes Made

### 1. Database Schema Update

**Before:**
```sql
CREATE TABLE doctors (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    practitioner_id VARCHAR(64) UNIQUE,
    national_id VARCHAR(16) UNIQUE,
    name VARCHAR(200) NOT NULL,
    license VARCHAR(100) UNIQUE,
    specialty VARCHAR(100),
    phone VARCHAR(20),
    email VARCHAR(100),
    birth_date DATE,
    gender VARCHAR(10) CHECK (gender IN ('M', 'F', 'male', 'female', 'other', 'unknown')),
    address TEXT,
    active BOOLEAN DEFAULT true,
    photo_url TEXT,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now(),
    deleted_at TIMESTAMPTZ
);
```

**After:**
```sql
CREATE TABLE doctors (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    ihs_number VARCHAR(64) UNIQUE,  -- Changed from practitioner_id
    national_id VARCHAR(16) UNIQUE, -- Same as before
    name VARCHAR(200) NOT NULL,     -- Same as before
    license VARCHAR(100) UNIQUE,    -- Same as before
    specialty VARCHAR(100),         -- Same as before
    phone VARCHAR(20),              -- Same as before
    birth_date DATE,                -- Removed email, address, photo_url
    gender VARCHAR(10) CHECK (gender IN ('M', 'F')), -- Simplified gender options
    active BOOLEAN DEFAULT true,    -- Same as before
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now(),
    deleted_at TIMESTAMPTZ
);
```

### 2. Field Mapping

| JSON Field (docs/doctors.json) | Database Field | Description |
|-------------------------------|----------------|-------------|
| `ihs_number`                  | `ihs_number`   | IHS (Indeks Halaman Sehat) number |
| `national_id`                 | `national_id`  | National ID (NIK) |
| `name`                        | `name`         | Full name |
| `license`                     | `license`      | Professional license number |
| `specialty`                   | `specialty`    | Medical specialty |
| `phone`                       | `phone`        | Contact phone |
| `birth_date`                  | `birth_date`   | Date of birth |
| `gender`                      | `gender`       | Gender (M/F) |

### 3. API Endpoint Updates

All doctor-related API endpoints have been updated to use the new field names:

- **POST /doctors** - Create a new doctor
- **GET /doctors/{doctor_id_or_identifier}** - Retrieve doctor by ID, IHS number, national ID, or license
- **PUT /doctors/{doctor_id}** - Update doctor information
- **DELETE /doctors/{doctor_id}** - Delete (soft delete) a doctor
- **GET /doctors/search** - Search doctors by various criteria

### 4. Migration Script Updates

The doctor migration script (`migrate_doctors.py`) has been updated to:
- Load doctors from `docs/doctors.json`
- Map JSON fields to database fields correctly
- Check for duplicates using IHS number, national ID, or license
- Insert new doctors with the updated schema

### 5. Seeding Script Updates

The doctor seeding script (`seed_doctors.py`) has been updated with the same field mappings and logic.

## Files Modified

1. **master-data-service/app.py** - Updated database schema and API endpoints
2. **master-data-service/migrate_doctors.py** - Updated field mappings
3. **master-data-service/seed_doctors.py** - Updated field mappings
4. **master-data-service/DOCTOR_API.md** - Updated documentation
5. **master-data-service/README.md** - Updated documentation
6. **master-data-service/SEEDER_GUIDE.md** - Updated documentation
7. **master-data-service/QUICK_START_SEEDER.md** - Updated documentation

## Benefits

1. **Consistency**: The database schema now matches the official SATUSEHAT doctors.json format
2. **Interoperability**: Easier integration with SATUSEHAT systems
3. **Simplified Data Model**: Removed unnecessary fields that weren't in the JSON format
4. **Better Alignment**: All field names and data types now align with the official documentation
5. **Reduced Storage**: Smaller database footprint by removing unused fields

## Usage Examples

### Creating a Doctor
```bash
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

### Searching Doctors
```bash
curl -X GET "http://localhost:8002/doctors/search?specialty=Pediatrics" \
  -H "Authorization: Bearer <token>"
```

### Migration
```bash
python master-data-service/migrate_doctors.py
```

### Seeding
```bash
python master-data-service/seed_doctors.py
```

## Testing

All changes have been tested to ensure:
1. Database schema initializes correctly
2. API endpoints function as expected
3. Migration script imports data correctly
4. Seeding script imports data correctly
5. Duplicate detection works properly
6. Error handling is robust

## Next Steps

1. Update any existing services that reference the old doctor schema
2. Run the migration script to import existing doctor data
3. Test all doctor-related functionality
4. Update any external documentation to reflect the new schema