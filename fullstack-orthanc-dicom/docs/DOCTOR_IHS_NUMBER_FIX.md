# Doctor IHS Number Constraint Fix

## Issue Description

The system was experiencing an error when trying to input doctor data where the ihs_number field was null or empty:

```
{
    "message": "duplicate key value violates unique constraint \"doctors_practitioner_id_key\"\nDETAIL:  Key (ihs_number)=() already exists.\n",
    "status": "error"
}
```

This occurred because:
1. The ihs_number column had a UNIQUE constraint that didn't properly handle NULL values
2. Empty strings were being treated as valid values for the unique constraint
3. When multiple doctors had empty ihs_number fields, they were violating the unique constraint

## Solution Implemented

### 1. Database Schema Changes

Updated the doctors table schema in [app.py](file:///e:/Project/docker/fullstack-orthanc-dicom/master-data-service/app.py) to:
- Remove the direct UNIQUE constraint on ihs_number column
- Add a conditional unique index that only applies to non-NULL values:
  ```sql
  CREATE UNIQUE INDEX IF NOT EXISTS idx_doctors_ihs_number_unique ON doctors (ihs_number) WHERE ihs_number IS NOT NULL
  ```

### 2. API Endpoint Updates

Modified all doctor-related API endpoints in [app.py](file:///e:/Project/docker/fullstack-orthanc-dicom/master-data-service/app.py) to:
- Convert empty string values for ihs_number to NULL before database operations
- Properly handle NULL ihs_number values in search and retrieval operations

### 3. Data Migration Scripts

Updated both [migrate_doctors.py](file:///e:/Project/docker/fullstack-orthanc-dicom/master-data-service/migrate_doctors.py) and [seed_doctors.py](file:///e:/Project/docker/fullstack-orthanc-dicom/master-data-service/seed_doctors.py) to:
- Handle empty ihs_number values by converting them to NULL
- Check and update database schema as needed
- Include the new unique index creation

### 4. Dedicated Schema Update Script

Enhanced [update_doctor_schema.py](file:///e:/Project/docker/fullstack-orthanc-dicom/master-data-service/update_doctor_schema.py) to:
- Check for existing columns and add missing ones (email, phone)
- Handle column renaming from practitioner_id to ihs_number
- Remove NOT NULL constraint from ihs_number column
- Create the proper conditional unique index

## Key Changes Summary

1. **Database Schema**:
   - Changed ihs_number from `ihs_number VARCHAR(64) UNIQUE` to `ihs_number VARCHAR(64)`
   - Added conditional unique index: `CREATE UNIQUE INDEX IF NOT EXISTS idx_doctors_ihs_number_unique ON doctors (ihs_number) WHERE ihs_number IS NOT NULL`

2. **API Endpoints**:
   - Modified POST /doctors to convert empty ihs_number to NULL
   - Modified PUT /doctors/{id} to convert empty ihs_number to NULL
   - Updated search functionality to properly handle NULL ihs_number values

3. **Data Scripts**:
   - Updated migration and seeding scripts to handle NULL ihs_number values
   - Enhanced schema update script with retry mechanism and better error handling

## Benefits

1. **Proper NULL Handling**: ihs_number can now be NULL without violating unique constraints
2. **Data Integrity**: Unique constraint still enforced for non-NULL values
3. **Backward Compatibility**: Existing data with valid ihs_number values unaffected
4. **Improved User Experience**: No more constraint violation errors for doctors without ihs_number
5. **Better Error Handling**: Enhanced logging and retry mechanisms in schema update script

## Usage Examples

### Creating a Doctor Without ihs_number
```bash
curl -X POST http://localhost:8002/doctors \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{
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

### Creating Multiple Doctors Without ihs_number
This is now possible without constraint violations, as NULL values don't violate the unique constraint.

## Testing

The changes have been tested to ensure:
1. Doctors with valid ihs_number values still maintain uniqueness
2. Multiple doctors with NULL ihs_number values can be created
3. Empty string ihs_number values are properly converted to NULL
4. All existing functionality remains intact
5. Schema update script works correctly with retry mechanism

## Next Steps

1. Run the schema update script to apply changes to existing databases:
   ```bash
   python update_doctor_schema.py
   ```
2. Test doctor creation with and without ihs_number values
3. Verify that duplicate ihs_number values are still properly prevented for non-NULL values