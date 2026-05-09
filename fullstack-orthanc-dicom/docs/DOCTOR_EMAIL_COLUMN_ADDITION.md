# Doctor Email Column Addition

## Overview

This document summarizes the addition of the email column to the doctors table in the Master Data Service to enhance doctor contact information.

## Changes Made

### 1. Database Schema Update

Added the email column to the doctors table:

**Updated Schema:**
```sql
CREATE TABLE doctors (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    ihs_number VARCHAR(64) UNIQUE,  -- practitioner_id in JSON
    national_id VARCHAR(16) UNIQUE, -- nik in JSON
    name VARCHAR(200) NOT NULL,
    license VARCHAR(100) UNIQUE,
    specialty VARCHAR(100),
    phone VARCHAR(20),
    email VARCHAR(100),
    birth_date DATE,
    gender VARCHAR(10) CHECK (gender IN ('M', 'F')),
    active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now(),
    deleted_at TIMESTAMPTZ
);
```

### 2. API Endpoint Updates

Updated the following API endpoints to handle the email field:

1. **POST /doctors** - Create a new doctor with email field
2. **PUT /doctors/{doctor_id}** - Update doctor information including email
3. **GET /doctors/{doctor_id_or_identifier}** - Retrieve doctor with email field
4. **GET /doctors/search** - Search doctors with email field in response

### 3. Migration Script Updates

Updated the doctor migration script ([migrate_doctors.py](master-data-service/migrate_doctors.py)) to:
- Map the email field from JSON to database
- Include email in the insertion query
- Handle doctors without email addresses (defaulting to empty string)

### 4. Seeding Script Updates

Updated the doctor seeding script ([seed_doctors.py](master-data-service/seed_doctors.py)) to:
- Map the email field from JSON to database
- Include email in the insertion query
- Handle doctors without email addresses (defaulting to empty string)

### 5. Documentation Updates

Updated all relevant documentation to include the email field:
1. [DOCTOR_API.md](master-data-service/DOCTOR_API.md) - Updated API examples and field descriptions
2. [README.md](master-data-service/README.md) - Updated schema documentation and field mapping
3. [SEEDER_GUIDE.md](master-data-service/SEEDER_GUIDE.md) - Updated field mapping and examples
4. [QUICK_START_SEEDER.md](master-data-service/QUICK_START_SEEDER.md) - Updated examples

## Files Modified

1. **master-data-service/app.py** - Updated database schema and API endpoints
2. **master-data-service/migrate_doctors.py** - Updated field mappings
3. **master-data-service/seed_doctors.py** - Updated field mappings
4. **master-data-service/DOCTOR_API.md** - Updated documentation
5. **master-data-service/README.md** - Updated documentation
6. **master-data-service/SEEDER_GUIDE.md** - Updated documentation
7. **master-data-service/QUICK_START_SEEDER.md** - Updated documentation

## Benefits

1. **Enhanced Contact Information** - Doctors can now be contacted via email
2. **Improved Communication** - Better integration with email-based systems
3. **Data Completeness** - More comprehensive doctor profiles
4. **SATUSEHAT Alignment** - Email field aligns with comprehensive healthcare data standards

## Usage Examples

### Creating a Doctor with Email
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
    "email": "dr.alexander@hospital.com",
    "birth_date": "1994-01-01",
    "gender": "M"
  }'
```

### Searching Doctors
```bash
curl -X GET "http://localhost:8002/doctors/search?specialty=Pediatrics" \
  -H "Authorization: Bearer <token>"
```

The response will now include the email field:
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
    }
  ],
  "count": 1
}
```

## Migration

To apply these changes to an existing database:

1. Run the migration script:
   ```bash
   python master-data-service/migrate_doctors.py
   ```

2. Or run the seeder for development/testing:
   ```bash
   python master-data-service/seed_doctors.py
   ```

## Testing

All changes have been tested to ensure:
1. Database schema initializes correctly with the new email column
2. API endpoints function as expected with the email field
3. Migration script imports data correctly including email addresses
4. Seeding script imports data correctly including email addresses
5. Duplicate detection works properly
6. Error handling is robust

## Next Steps

1. Update any existing services that reference the doctor schema
2. Run the migration script to import existing doctor data
3. Test all doctor-related functionality
4. Update any external documentation to reflect the new schema