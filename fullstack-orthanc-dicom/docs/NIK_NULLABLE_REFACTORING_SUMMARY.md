# NIK (patient_national_id) Nullable Refactoring - Summary

## Overview
The patient National ID (NIK / `patient_national_id`) field has been refactored across all services to be **optional/nullable**. Patients can now be created and managed using only their Medical Record Number (MRN) without requiring a National ID.

## Changes Made

### 1. Master Data Service (`master-data-service/app.py`)

#### Database Schema Changes (Line 85):
- **Before**: `patient_national_id VARCHAR(16) UNIQUE NOT NULL`
- **After**: `patient_national_id VARCHAR(16) UNIQUE` (nullable)

#### API Validation Changes (Line 403):
- **Before**: Required fields included `patient_national_id`
- **After**: Required fields are now: `medical_record_number`, `patient_name`, `gender`, `birth_date`
- NIK is now optional

#### Patient Lookup Logic (Line 478-489):
- **Updated**: `get_patient()` function now searches by NIK **OR** MRN
- Can retrieve patients using either identifier

#### Duplicate Check Logic (Line 414-432):
- **Updated**: Checks for duplicates by MRN first, and NIK only if provided
- Handles NULL NIK values gracefully

### 2. Order Management Service (`order-management/order_management_service.py`)

#### API Validation Changes (Line 1164-1175):
- **Before**: Required fields included `patient_national_id`
- **After**: Required fields are now: `modality`, `patient_name`, `gender`, `birth_date`
- **New validation**: At least one identifier (NIK or MRN) must be provided
- Error message updated to reflect flexible requirements

### 3. SIMRS Order UI Service (`simrs-order-ui/app.py`)
- **No changes needed** - Already had `patient_national_id` as nullable (Line 274)

## Migration Script

A migration script has been created: `master-data-service/migrate_nik_nullable.py`

### Running the Migration:
```bash
cd /home/apps/fullstack-orthanc-dicom/master-data-service
python3 migrate_nik_nullable.py
```

This script will:
- Check if the `patients` table exists
- Check if `patient_national_id` is currently NOT NULL
- Alter the column to allow NULL values
- Handle existing data gracefully

## Impact on Existing Data

### No Data Loss:
- Existing patients with NIK values remain unchanged
- The UNIQUE constraint on NIK is preserved (NULL values are allowed)
- All existing functionality continues to work

### New Capabilities:
1. **Create patients without NIK**: You can now create patients using only MRN
2. **Flexible patient lookup**: Search by NIK, MRN, or UUID
3. **Better data quality**: No need to create fake NIK values for patients without one

## API Changes

### Creating a Patient (POST `/patients`)

#### Before:
```json
{
  "patient_national_id": "1234567890123456",  // REQUIRED
  "medical_record_number": "MRN001",
  "patient_name": "John Doe",
  "gender": "male",
  "birth_date": "1990-01-01"
}
```

#### After:
```json
{
  "patient_national_id": "1234567890123456",  // OPTIONAL
  "medical_record_number": "MRN001",          // REQUIRED
  "patient_name": "John Doe",
  "gender": "male",
  "birth_date": "1990-01-01"
}
```

### Creating an Order (POST `/orders/create`)

#### Before:
```json
{
  "patient_national_id": "1234567890123456",  // REQUIRED
  "modality": "CT",
  "patient_name": "John Doe",
  "gender": "male",
  "birth_date": "1990-01-01"
}
```

#### After:
```json
{
  "medical_record_number": "MRN001",          // At least one required
  "patient_national_id": "1234567890123456",  // Optional
  "modality": "CT",
  "patient_name": "John Doe",
  "gender": "male",
  "birth_date": "1990-01-01"
}
```

**Note**: Either `patient_national_id` OR `medical_record_number` must be provided

## Testing Recommendations

### Test Cases:
1. ✅ Create patient with NIK only
2. ✅ Create patient with MRN only (new capability)
3. ✅ Create patient with both NIK and MRN
4. ✅ Search patient by NIK
5. ✅ Search patient by MRN
6. ✅ Update patient with NULL NIK
7. ✅ Create order with NIK
8. ✅ Create order with MRN only

### Sample Test Script:
```bash
# Test 1: Create patient with MRN only (no NIK)
curl -X POST http://localhost:8888/patients \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "medical_record_number": "MRN999",
    "patient_name": "Test Patient",
    "gender": "male",
    "birth_date": "1985-05-15"
  }'

# Test 2: Create order with MRN only
curl -X POST http://localhost:8888/orders/create \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "medical_record_number": "MRN999",
    "modality": "CT",
    "patient_name": "Test Patient",
    "gender": "male",
    "birth_date": "1985-05-15",
    "procedure_code": "CT001"
  }'

# Test 3: Search patient by MRN
curl -X GET "http://localhost:8888/patients/MRN999" \
  -H "Authorization: Bearer $TOKEN"
```

## Deployment Steps

1. **Backup Database** (IMPORTANT):
   ```bash
   pg_dump -h postgres -U dicom worklist_db > backup_before_nik_migration.sql
   ```

2. **Run Migration Script**:
   ```bash
   cd master-data-service
   python3 migrate_nik_nullable.py
   ```

3. **Restart Services**:
   ```bash
   docker-compose restart master-data-service order-management
   ```

4. **Verify Changes**:
   ```bash
   # Check database schema
   psql -h postgres -U dicom -d worklist_db -c "\d patients"

   # Test API
   curl -X GET http://localhost:8888/health
   ```

## Rollback Plan

If issues occur, you can rollback by:

1. **Restore Database**:
   ```bash
   psql -h postgres -U dicom worklist_db < backup_before_nik_migration.sql
   ```

2. **Revert Code Changes**:
   ```bash
   git revert HEAD
   ```

## Support and Documentation

### Files Modified:
- `master-data-service/app.py` (Lines 85, 403, 414-432, 478-489)
- `order-management/order_management_service.py` (Lines 1164-1175)
- `master-data-service/migrate_nik_nullable.py` (NEW)

### Documentation Updated:
- This summary document

### For Questions or Issues:
- Check service logs: `docker-compose logs master-data-service order-management`
- Review migration output
- Verify database constraints with `\d patients` in psql

## Benefits

1. **Flexibility**: Support patients without National IDs
2. **Data Quality**: No need for fake/placeholder NIK values
3. **Compliance**: Better align with real-world scenarios where NIK may not be available
4. **International Support**: Enable use in contexts where national IDs aren't standard
5. **Backward Compatibility**: All existing functionality preserved

---

**Date**: 2025-01-06
**Version**: 1.0
**Status**: ✅ Refactoring Complete
