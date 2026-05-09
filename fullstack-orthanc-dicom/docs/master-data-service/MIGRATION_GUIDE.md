# Procedures Migration Guide

## Overview

Ada dua cara untuk membuat tabel procedures:

1. **Via app.py (RECOMMENDED)** - Tabel dibuat otomatis saat service start
2. **Via migration script** - Manual migration untuk backward compatibility

## Recommended Approach: Via app.py

### Step 1: Restart Master Data Service

Tabel procedures sudah didefinisikan di `app.py` dalam fungsi `init_database()`. Tabel akan dibuat otomatis saat service start.

```bash
# Restart service via docker-compose
cd /home/apps/fullstack-orthanc-dicom
docker-compose restart master-data-service

# Or restart all services
docker-compose down
docker-compose up -d
```

### Step 2: Verify Tables Created

Check if tables exist:

```bash
# Connect to postgres
docker exec -it postgres psql -U dicom -d worklist_db

# Check tables
\dt

# You should see:
# - procedures
# - procedure_modalities
# - procedure_contraindications
# - procedure_equipment
# - procedure_protocols
# - procedure_audit_log
# - loinc_codes

# Exit psql
\q
```

### Step 3: Seed Initial Data

Once tables are created, seed with sample procedures:

```bash
cd master-data-service
python seed_procedures.py
```

## Alternative: Manual Migration (Legacy)

### Issue with migrate_procedures.py

The original `migrate_procedures.py` script has dependency issues:
- References `departments` table that doesn't exist
- References `doctors` table with wrong type (INTEGER vs UUID)

### Solution 1: Fix SQL Schema Order

The `procedures_schema.sql` has been updated to create tables in correct order:
1. `departments` (created first)
2. `procedures` (references departments)
3. `procedure_doctors` (references procedures)

**Fixed Issues:**
- ✅ Moved `departments` creation before `procedures`
- ✅ Removed foreign key to `doctors(id)` to avoid dependency
- ✅ Changed `procedure_doctors.doctor_id` to UUID type

### Solution 2: Use Simple Migration Script

For a simpler approach without complex dependencies:

```bash
cd master-data-service
python migrate_procedures_simple.py
```

This creates a basic `procedures_legacy` table without foreign key dependencies.

## Understanding the Two Schemas

### Full Schema (app.py)

**Tables:**
- `procedures` - Main table with UUID, LOINC codes, SATUSEHAT integration
- `procedure_modalities` - Multi-modality support
- `procedure_contraindications` - Contraindications
- `procedure_equipment` - Equipment requirements
- `procedure_protocols` - Imaging protocols
- `procedure_audit_log` - Audit trail
- `loinc_codes` - LOINC reference

**Features:**
- UUID primary keys
- LOINC integration
- SATUSEHAT ready
- Comprehensive metadata
- Full audit trail

### Legacy Schema (procedures_schema.sql)

**Tables:**
- `departments` - Department reference
- `procedures` - Basic procedure info
- `procedure_doctors` - Doctor-procedure mapping
- `procedure_audit_log` - Basic audit

**Features:**
- SERIAL primary keys
- Department integration
- Doctor assignments
- Basic audit trail

## Recommended Migration Path

### For New Installations

1. **Use app.py schema** (already implemented)
2. Just restart the service
3. Seed with `seed_procedures.py`

### For Existing Systems

If you already have `procedures` table from old schema:

1. **Backup existing data:**
```sql
-- Connect to database
docker exec -it postgres psql -U dicom -d worklist_db

-- Backup to CSV
\copy (SELECT * FROM procedures) TO '/tmp/procedures_backup.csv' CSV HEADER;
```

2. **Drop old table** (if compatible with app.py schema):
```sql
-- Only if structure is incompatible
DROP TABLE IF EXISTS procedure_doctors CASCADE;
DROP TABLE IF EXISTS procedures CASCADE;
DROP TABLE IF EXISTS departments CASCADE;
```

3. **Restart service** to create new schema
```bash
docker-compose restart master-data-service
```

4. **Migrate data** (if needed) using custom script

## Troubleshooting

### Error: "relation 'departments' does not exist"

**Cause:** `procedures_schema.sql` tries to create procedures before departments

**Solution:**
- Use `migrate_procedures_simple.py` instead
- OR use app.py schema (restart service)
- OR fix `procedures_schema.sql` (already fixed in latest version)

### Error: "column 'department_id' does not exist"

**Cause:** Mixing old and new schema

**Solution:**
1. Choose one schema (recommend app.py)
2. Drop old tables if incompatible
3. Let app.py create new schema

### Error: "could not connect to database"

**Cause:** Database not running or wrong credentials

**Solution:**
```bash
# Check postgres is running
docker ps | grep postgres

# Check credentials in .env file
cat .env | grep POSTGRES

# Test connection
docker exec -it postgres psql -U dicom -d worklist_db -c "SELECT version();"
```

### Error: "permission denied"

**Cause:** Insufficient database permissions

**Solution:**
```bash
# Grant permissions
docker exec -it postgres psql -U dicom -d worklist_db

GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO dicom;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO dicom;
```

## Verification Commands

### Check Tables Exist

```bash
docker exec -it postgres psql -U dicom -d worklist_db -c "\dt"
```

### Check Procedures Count

```bash
docker exec -it postgres psql -U dicom -d worklist_db -c "SELECT COUNT(*) FROM procedures;"
```

### Check Sample Data

```bash
docker exec -it postgres psql -U dicom -d worklist_db -c "SELECT code, name, loinc_code FROM procedures LIMIT 5;"
```

### Check Indexes

```bash
docker exec -it postgres psql -U dicom -d worklist_db -c "\di procedures*"
```

## Summary

**RECOMMENDED APPROACH:**

1. ✅ Use schema from `app.py` (already implemented)
2. ✅ Restart `master-data-service` to auto-create tables
3. ✅ Run `seed_procedures.py` to populate data
4. ✅ Access via API Gateway endpoints

**AVOID:**
- ❌ Using `migrate_procedures.py` directly (has dependency issues)
- ❌ Mixing old and new schemas
- ❌ Manual SQL migrations unless necessary

## Next Steps

After successful migration:

1. **Test API endpoints:**
```bash
# List procedures
curl -X GET "http://localhost:8080/procedures" \
  -H "Authorization: Bearer YOUR_TOKEN"

# Search procedures
curl -X GET "http://localhost:8080/procedures/search?q=chest" \
  -H "Authorization: Bearer YOUR_TOKEN"
```

2. **Integrate with Order Management**
3. **Configure permissions** for users
4. **Add custom procedures** as needed

## Support

For issues or questions:
1. Check logs: `docker-compose logs master-data-service`
2. Verify database: `docker exec -it postgres psql -U dicom -d worklist_db`
3. Review PROCEDURES_README.md for API documentation
