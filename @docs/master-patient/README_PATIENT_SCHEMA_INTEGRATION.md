# Patient Schema Integration - Testing Instructions

## Overview

This document provides instructions for testing the integration of the comprehensive patient database schema with the existing healthcare system. The integration adds new patient management capabilities without disrupting existing services.

## Files Created

1. `PATIENT_SCHEMA.md` - High-level overview of the patient schema design
2. `PATIENT_DATABASE_SCHEMA.sql` - Complete SQL schema with all tables, indexes, constraints, and relationships
3. `PATIENT_SCHEMA_DOCUMENTATION.md` - Detailed documentation explaining the schema structure and implementation
4. `PATIENT_SCHEMA_ERD.md` - Entity Relationship Diagram showing table relationships
5. `PATIENT_SCHEMA_INTEGRATION.md` - Integration plan explaining how the schema fits with existing services
6. `PATIENT_SCHEMA_INTEGRATION.sql` - SQL script to add the new patient tables to the existing database
7. `PATIENT_SCHEMA_CORRECTION.md` - Document explaining the correction made to remove registration_number from patient table
8. `PATIENT_SCHEMA_VERIFICATION.sql` - SQL script with verification queries
9. `PATIENT_SCHEMA_SAMPLE_DATA.sql` - SQL script with sample data insertion queries

## Integration Summary

The integration adds a comprehensive patient management system to the existing database without disrupting any existing services. The key points are:

1. **No Existing Service Disruption**: All existing tables and services remain unchanged
2. **New Patient Tables**: Adds new tables for comprehensive patient management
3. **No Conflicts**: No column name conflicts exist between existing and new tables
4. **Backward Compatibility**: Existing services continue to work as before
5. **Corrected Schema**: Patient table no longer contains registration_number field (moved to visit-specific tables)
6. **Updated Gender Field**: Patient table now uses 'gender' column with only 'male' and 'female' options instead of 'sex'

## Testing Instructions

### Prerequisites

1. Ensure the Docker environment is running with all services up:
   ```bash
   docker-compose up -d
   ```

2. Wait for all services to be healthy (check with `docker-compose ps`)

### Step 1: Apply the Integration Schema

1. Connect to the PostgreSQL database:
   ```bash
   docker exec -it dicom-postgres-secured psql -U dicom -d worklist_db
   ```

2. Apply the integration schema:
   ```sql
   \i /path/to/PATIENT_SCHEMA_INTEGRATION.sql
   ```

   Or copy and paste the contents of `PATIENT_SCHEMA_INTEGRATION.sql` into the PostgreSQL prompt.

### Step 2: Verify Schema Creation

1. Check that all new tables were created:
   ```sql
   \i /path/to/PATIENT_SCHEMA_VERIFICATION.sql
   ```

### Step 3: Test Data Insertion

1. Insert sample data:
   ```sql
   \i /path/to/PATIENT_SCHEMA_SAMPLE_DATA.sql
   ```

### Step 4: Test Existing Services

1. Access the SIMRS Order UI at `http://localhost:8095` and verify it works as before
2. Access the MWL UI at `http://localhost:8096` and verify it works as before
3. Access the SSO UI at `http://localhost:3000` and verify it works as before
4. Test creating orders through the existing workflow to ensure no disruption

### Step 5: Test New Patient Features

1. Use direct database queries to test the new patient management features
2. Test the audit logging functionality by updating patient records
3. Verify that triggers work correctly by checking updated_at timestamps

## Rollback Procedure

If issues are encountered during testing:

1. Drop the newly created tables:
   ```sql
   DROP TABLE IF EXISTS patient_audit_log, patient_medications, patient_family_history, patient_medical_history, patient_allergies, patients CASCADE;
   ```

2. Verify that existing services continue to work normally

## Expected Results

1. All existing services should continue to function normally
2. New patient tables should be created successfully
3. Sample data insertion should work without errors
4. No disruption to existing workflows

## Troubleshooting

### Common Issues

1. **UUID Extension Not Available**:
   - Error: "type "uuid" does not exist"
   - Solution: Run `CREATE EXTENSION IF NOT EXISTS "uuid-ossp";`

2. **Permission Denied**:
   - Error: "permission denied for table ..."
   - Solution: Ensure you're connected as the `dicom` user

3. **Foreign Key Constraint Violations**:
   - Error: "insert or update on table violates foreign key constraint"
   - Solution: Ensure referenced patient records exist before inserting related data

### Verification Queries

Use these queries to verify the integration:

1. Check table structure:
   ```sql
   \d patients
   \d patient_allergies
   ```

2. Check constraints:
   ```sql
   SELECT conname, pg_get_constraintdef(c.oid)
   FROM pg_constraint c
   JOIN pg_namespace n ON n.oid = c.connamespace
   WHERE n.nspname = 'public' AND conname LIKE 'patients%';
   ```

3. Check triggers:
   ```sql
   SELECT tgname, proname
   FROM pg_trigger t
   JOIN pg_proc p ON p.oid = t.tgfoid
   WHERE tgname LIKE 'update_patients%';
   ```

## Conclusion

The integration should work seamlessly with the existing system. All existing functionality should remain intact while providing the foundation for enhanced patient management capabilities.