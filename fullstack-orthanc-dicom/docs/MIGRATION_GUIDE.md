# NIK Nullable Migration Guide

## Overview
This guide provides multiple methods to run the patient_national_id nullable migration.

## Prerequisites
- Docker containers are running
- Database backup is recommended (see Backup section below)

## Method 1: Using SQL Script (RECOMMENDED - Simplest)

### Run from host machine:
```bash
cd /home/apps/fullstack-orthanc-dicom/master-data-service

# Check if database is accessible
psql -h localhost -p 5532 -U dicom -d worklist_db -c "SELECT version();"

# Run the migration
psql -h localhost -p 5532 -U dicom -d worklist_db -f migrate_nik_nullable.sql
```

**Password**: `dicom123` (or your configured password)

### Run from inside Docker container:
```bash
# Access the postgres container
docker exec -it dicom-postgres-secured psql -U dicom -d worklist_db

# Then run these commands:
-- Check current state
SELECT column_name, is_nullable, data_type
FROM information_schema.columns
WHERE table_name = 'patients' AND column_name = 'patient_national_id';

-- Make it nullable
ALTER TABLE patients ALTER COLUMN patient_national_id DROP NOT NULL;

-- Verify
SELECT column_name, is_nullable, data_type
FROM information_schema.columns
WHERE table_name = 'patients' AND column_name = 'patient_national_id';

-- Exit
\q
```

## Method 2: Using Python Script (from Docker container)

```bash
# Run from inside the master-data-service container
docker exec -it master-data-service bash

# Inside the container:
cd /app
python3 migrate_nik_nullable.py
exit
```

## Method 3: Using Python Script (from host with env vars)

```bash
cd /home/apps/fullstack-orthanc-dicom/master-data-service

# Set environment variables
export PGHOST=localhost
export PGPORT=5532
export PGDATABASE=worklist_db
export PGUSER=dicom
export PGPASSWORD=dicom123

# Run the migration
python3 migrate_nik_nullable.py
```

## Method 4: One-Line Docker Command

```bash
docker exec -it dicom-postgres-secured psql -U dicom -d worklist_db -c "ALTER TABLE patients ALTER COLUMN patient_national_id DROP NOT NULL;"
```

## Backup Database (IMPORTANT - Do this first!)

### Option A: Using docker exec
```bash
docker exec dicom-postgres-secured pg_dump -U dicom worklist_db > backup_before_nik_migration_$(date +%Y%m%d_%H%M%S).sql
```

### Option B: Using pg_dump from host
```bash
pg_dump -h localhost -p 5532 -U dicom worklist_db > backup_before_nik_migration_$(date +%Y%m%d_%H%M%S).sql
```

## Verification

After running the migration, verify the change:

```bash
# Check the column is now nullable
docker exec -it dicom-postgres-secured psql -U dicom -d worklist_db -c "
SELECT
    column_name,
    is_nullable,
    data_type,
    character_maximum_length
FROM information_schema.columns
WHERE table_name = 'patients'
  AND column_name = 'patient_national_id';"
```

Expected output:
```
     column_name      | is_nullable | data_type | character_maximum_length
----------------------+-------------+-----------+--------------------------
 patient_national_id | YES         | character varying | 16
```

## Test the Changes

### Test 1: Create patient without NIK
```bash
# Get a token first
TOKEN=$(curl -X POST http://localhost:8888/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"Admin@12345"}' | jq -r '.token')

# Create patient with MRN only (no NIK)
curl -X POST http://localhost:8888/patients \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "medical_record_number": "TEST-MRN-001",
    "patient_name": "Test Patient No NIK",
    "gender": "male",
    "birth_date": "1990-01-01"
  }' | jq
```

### Test 2: Search by MRN
```bash
curl -X GET "http://localhost:8888/patients/TEST-MRN-001" \
  -H "Authorization: Bearer $TOKEN" | jq
```

## Restart Services

After migration, restart the affected services:

```bash
docker-compose restart master-data-service order-management api-gateway
```

## Rollback (if needed)

If you need to rollback:

```bash
# Restore from backup
docker exec -i dicom-postgres-secured psql -U dicom worklist_db < backup_before_nik_migration_YYYYMMDD_HHMMSS.sql

# Or manually revert
docker exec -it dicom-postgres-secured psql -U dicom -d worklist_db -c "
ALTER TABLE patients ALTER COLUMN patient_national_id SET NOT NULL;"
```

## Troubleshooting

### Issue: "could not translate host name 'postgres'"
**Solution**: You're running from outside Docker. Use `localhost:5532` instead.

```bash
export PGHOST=localhost
export PGPORT=5532
```

### Issue: "Connection refused"
**Solution**: Check if postgres is running:

```bash
docker ps | grep postgres
docker logs dicom-postgres-secured
```

### Issue: "password authentication failed"
**Solution**: Check your password:

```bash
# Check environment variables in docker-compose
grep POSTGRES_PASSWORD docker-compose.yml
```

### Issue: "column is still NOT NULL after migration"
**Solution**: Check for existing NULL values:

```bash
docker exec -it dicom-postgres-secured psql -U dicom -d worklist_db -c "
SELECT COUNT(*) as null_count
FROM patients
WHERE patient_national_id IS NULL;"
```

If there are existing NULL values before migration, PostgreSQL won't allow adding NOT NULL constraint.

## Success Indicators

✅ Migration successful if:
1. No errors during migration
2. `is_nullable` shows 'YES' for patient_national_id
3. Can create patients without NIK
4. Can search patients by MRN
5. Services restart without errors

## Post-Migration Checklist

- [ ] Database backup completed
- [ ] Migration script executed successfully
- [ ] Verification query shows `is_nullable = YES`
- [ ] Services restarted
- [ ] Test patient created without NIK
- [ ] Test patient searchable by MRN
- [ ] No errors in service logs

## Support

If you encounter issues:

1. Check service logs:
   ```bash
   docker-compose logs master-data-service
   docker-compose logs order-management
   docker-compose logs postgres
   ```

2. Check database directly:
   ```bash
   docker exec -it dicom-postgres-secured psql -U dicom -d worklist_db
   ```

3. Review the summary document: `NIK_NULLABLE_REFACTORING_SUMMARY.md`

---

**Date**: 2025-01-06
**Status**: Ready for deployment
