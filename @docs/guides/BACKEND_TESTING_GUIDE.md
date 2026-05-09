# Backend Testing Guide - UUID Migration

**Date**: November 16, 2025  
**Purpose**: Guide untuk testing backend server setelah UUID migration  
**Target**: User/Developer yang akan menguji di server mereka

---

## ⚠️ IMPORTANT NOTICE

**Jangan test di workspace development ini!**

Silakan test di server backend Anda sendiri dengan mengikuti panduan di bawah ini.

---

## Prerequisites

Sebelum memulai testing, pastikan Anda memiliki:

- ✅ PostgreSQL 12+ installed dan running
- ✅ Python 3.8+ installed
- ✅ Database backup terbaru
- ✅ Access ke server backend
- ✅ Minimal 1GB free disk space

---

## Step 1: Backup Database (CRITICAL!)

**WAJIB dilakukan sebelum migration!**

```bash
# Backup database
pg_dump -U postgres -d pacs_db > backup_before_uuid_$(date +%Y%m%d_%H%M%S).sql

# Verify backup
ls -lh backup_before_uuid_*.sql

# Test restore (optional, on test database)
psql -U postgres -d pacs_db_test < backup_before_uuid_*.sql
```

---

## Step 2: Stop All Services

```bash
# Stop backend service
sudo systemctl stop pacs-service
# or
pkill -f "uvicorn app.main:app"

# Stop frontend
sudo systemctl stop pacs-frontend
# or
pkill -f "vite"

# Verify no services running
ps aux | grep -E "uvicorn|vite"
```

---

## Step 3: Update Backend Code

```bash
# Navigate to backend directory
cd /path/to/pacs-service

# Pull latest changes (if using git)
git pull origin main

# Or copy updated files manually:
# - app/models/report.py
# - app/models/signature.py
# - migrations/004_refactor_ids_to_uuid.sql
```

---

## Step 4: Install/Update Dependencies

```bash
# Activate virtual environment
source venv/bin/activate  # Linux/Mac
# or
venv\Scripts\activate  # Windows

# Install/update dependencies
pip install -r requirements.txt

# Verify SQLAlchemy version (should support UUID)
pip show sqlalchemy
```

---

## Step 5: Run Database Migration

### Option A: Using psql (Recommended)

```bash
# Navigate to migrations directory
cd migrations

# Run migration
psql -U postgres -d pacs_db -f 004_refactor_ids_to_uuid.sql

# Check for errors in output
# Should see: "Migration 004: ID Refactoring to UUID - COMPLETED"
```

### Option B: Using Python script

```bash
# From pacs-service directory
python migrations/run_migration.py 004_refactor_ids_to_uuid.sql
```

### Option C: Using init script

```bash
# From pacs-service directory
python migrations/init_pacs_db.py
```

---

## Step 6: Verify Migration

### 6.1 Check Tables

```bash
psql -U postgres -d pacs_db
```

```sql
-- List report tables
\dt reports*

-- Expected output:
--              List of relations
--  Schema |        Name         | Type  |  Owner
-- --------+---------------------+-------+----------
--  public | report_attachments  | table | postgres
--  public | report_history      | table | postgres
--  public | reports             | table | postgres

-- Check reports table structure
\d reports

-- Verify id column is UUID
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'reports' 
AND column_name = 'id';

-- Expected output:
--  column_name | data_type
-- -------------+-----------
--  id          | uuid
```

### 6.2 Test UUID Generation

```sql
-- Test UUID generation
SELECT gen_random_uuid();

-- Should return something like:
-- 550e8400-e29b-41d4-a716-446655440000

-- Test report_id generation
SELECT generate_report_id();

-- Should return something like:
-- RPT-A1B2C3D4E5F6
```

### 6.3 Test Insert

```sql
-- Insert test report
INSERT INTO reports (
    study_id, patient_id, patient_name,
    template_id, findings, impression, created_by
) VALUES (
    '1.2.3.4.5', 'P001', 'Test Patient',
    'test_template', 'Test findings', 'Test impression', 'test_user'
);

-- Verify UUID and report_id were generated
SELECT id, report_id, patient_name FROM reports WHERE patient_id = 'P001';

-- Expected output:
--                   id                  |    report_id     | patient_name
-- --------------------------------------+------------------+--------------
--  550e8400-e29b-41d4-a716-446655440000 | RPT-A1B2C3D4E5F6 | Test Patient

-- Clean up
DELETE FROM reports WHERE patient_id = 'P001';
```

---

## Step 7: Start Backend Service

```bash
# From pacs-service directory
python -m uvicorn app.main:app --reload --port 8003

# Or using systemd
sudo systemctl start pacs-service

# Check logs
tail -f logs/app.log
# or
journalctl -u pacs-service -f
```

---

## Step 8: Test API Endpoints

### 8.1 Health Check

```bash
curl http://localhost:8003/api/health

# Expected response:
# {
#   "status": "healthy",
#   "service": "PACS Service",
#   "version": "1.0.0",
#   "database": "healthy",
#   "timestamp": "2025-11-16T..."
# }
```

### 8.2 Create Report

```bash
curl -X POST http://localhost:8003/api/reports \
  -H "Content-Type: application/json" \
  -d '{
    "study_id": "1.2.3.4.5",
    "patient_id": "P002",
    "patient_name": "Test Patient 2",
    "template_id": "ct_brain",
    "findings": "Test findings",
    "impression": "Test impression",
    "created_by": "test_user"
  }'

# Expected response (201 Created):
# {
#   "id": "550e8400-e29b-41d4-a716-446655440000",
#   "report_id": "RPT-ABC123DEF456",
#   "study_id": "1.2.3.4.5",
#   "patient_id": "P002",
#   "status": "draft",
#   ...
# }
```

### 8.3 Get Report

```bash
# Get by report_id (recommended)
curl http://localhost:8003/api/reports/RPT-ABC123DEF456

# Expected response (200 OK):
# {
#   "id": "550e8400-e29b-41d4-a716-446655440000",
#   "report_id": "RPT-ABC123DEF456",
#   ...
# }
```

### 8.4 Update Report

```bash
curl -X PUT http://localhost:8003/api/reports/RPT-ABC123DEF456 \
  -H "Content-Type: application/json" \
  -d '{
    "findings": "Updated findings",
    "updated_by": "test_user"
  }'

# Expected response (200 OK):
# {
#   "id": "550e8400-e29b-41d4-a716-446655440000",
#   "report_id": "RPT-ABC123DEF456",
#   "findings": "Updated findings",
#   ...
# }
```

### 8.5 Search Reports

```bash
curl "http://localhost:8003/api/reports?patient_id=P002&limit=10"

# Expected response (200 OK):
# [
#   {
#     "id": "550e8400-e29b-41d4-a716-446655440000",
#     "report_id": "RPT-ABC123DEF456",
#     "patient_id": "P002",
#     ...
#   }
# ]
```

---

## Step 9: Test Frontend Integration

### 9.1 Start Frontend

```bash
# Navigate to frontend directory
cd /path/to/frontend

# Start frontend
npm run dev

# Or using systemd
sudo systemctl start pacs-frontend
```

### 9.2 Test in Browser

1. Open browser: `http://localhost:5173`
2. Navigate to Studies
3. Click on a study
4. Click "Create Report"
5. Fill in report fields
6. Click "Save Draft"
7. Check browser console for API calls
8. Verify no errors

### 9.3 Verify Database

```sql
-- Check reports created from frontend
SELECT id, report_id, patient_name, status, created_at 
FROM reports 
ORDER BY created_at DESC 
LIMIT 5;
```

---

## Step 10: Performance Testing

### 10.1 Create Multiple Reports

```bash
# Create 100 test reports
for i in {1..100}; do
  curl -X POST http://localhost:8003/api/reports \
    -H "Content-Type: application/json" \
    -d "{
      \"study_id\": \"1.2.3.4.$i\",
      \"patient_id\": \"P$i\",
      \"patient_name\": \"Test Patient $i\",
      \"template_id\": \"ct_brain\",
      \"findings\": \"Test findings $i\",
      \"impression\": \"Test impression $i\",
      \"created_by\": \"test_user\"
    }" &
done
wait

echo "Created 100 reports"
```

### 10.2 Check Performance

```sql
-- Check query performance
EXPLAIN ANALYZE 
SELECT * FROM reports WHERE patient_id = 'P50';

-- Check table size
SELECT 
    schemaname,
    tablename,
    pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename)) AS size
FROM pg_tables
WHERE tablename LIKE '%report%'
ORDER BY pg_total_relation_size(schemaname||'.'||tablename) DESC;

-- Check index usage
SELECT 
    schemaname,
    tablename,
    indexname,
    idx_scan,
    idx_tup_read
FROM pg_stat_user_indexes
WHERE tablename LIKE '%report%'
ORDER BY idx_scan DESC;
```

---

## Troubleshooting

### Issue 1: Migration Fails

**Error**: `ERROR: relation "reports" already exists`

**Solution**:
```sql
-- Check if old tables exist
\dt reports*

-- If migration partially completed, drop and retry
DROP TABLE IF EXISTS report_attachments CASCADE;
DROP TABLE IF EXISTS report_history CASCADE;
DROP TABLE IF EXISTS reports CASCADE;

-- Re-run migration
\i 004_refactor_ids_to_uuid.sql
```

### Issue 2: UUID Not Generating

**Error**: `ERROR: null value in column "id" violates not-null constraint`

**Solution**:
```sql
-- Check if gen_random_uuid() is available
SELECT gen_random_uuid();

-- If error, enable extension
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Verify
SELECT gen_random_uuid();
```

### Issue 3: Foreign Key Error

**Error**: `ERROR: insert or update on table "report_signatures" violates foreign key constraint`

**Solution**:
```sql
-- Check foreign key constraints
SELECT 
    tc.table_name, 
    kcu.column_name, 
    ccu.table_name AS foreign_table_name
FROM information_schema.table_constraints AS tc 
JOIN information_schema.key_column_usage AS kcu
    ON tc.constraint_name = kcu.constraint_name
WHERE tc.constraint_type = 'FOREIGN KEY'
AND tc.table_name = 'report_signatures';

-- Verify reports table exists
\dt reports

-- If reports table missing, re-run migration
```

### Issue 4: Backend Won't Start

**Error**: `ModuleNotFoundError: No module named 'sqlalchemy.dialects.postgresql'`

**Solution**:
```bash
# Update SQLAlchemy
pip install --upgrade sqlalchemy

# Verify version (should be 1.4+)
pip show sqlalchemy

# Reinstall if needed
pip uninstall sqlalchemy
pip install sqlalchemy
```

### Issue 5: API Returns 500 Error

**Error**: `Internal Server Error`

**Solution**:
```bash
# Check backend logs
tail -f logs/app.log

# Check for database connection
psql -U postgres -d pacs_db -c "SELECT 1;"

# Restart backend
sudo systemctl restart pacs-service
```

---

## Rollback Procedure

### If Critical Issues Found

1. **Stop all services**
   ```bash
   sudo systemctl stop pacs-service
   sudo systemctl stop pacs-frontend
   ```

2. **Restore database**
   ```bash
   # Drop current database
   psql -U postgres -c "DROP DATABASE pacs_db;"
   
   # Recreate database
   psql -U postgres -c "CREATE DATABASE pacs_db;"
   
   # Restore from backup
   psql -U postgres -d pacs_db < backup_before_uuid_YYYYMMDD_HHMMSS.sql
   ```

3. **Revert code changes**
   ```bash
   cd /path/to/pacs-service
   git checkout HEAD -- app/models/report.py
   git checkout HEAD -- app/models/signature.py
   ```

4. **Restart services**
   ```bash
   sudo systemctl start pacs-service
   sudo systemctl start pacs-frontend
   ```

5. **Verify restoration**
   ```sql
   SELECT COUNT(*) FROM reports;
   SELECT column_name, data_type FROM information_schema.columns 
   WHERE table_name = 'reports' AND column_name = 'id';
   ```

---

## Success Criteria

Migration is successful when:

- ✅ All tables use UUID primary keys
- ✅ UUID auto-generation working
- ✅ report_id auto-generation working
- ✅ Foreign keys working correctly
- ✅ API endpoints responding correctly
- ✅ Frontend can create/read/update reports
- ✅ No errors in backend logs
- ✅ No errors in frontend console
- ✅ Performance acceptable (< 3s response time)

---

## Monitoring

### After Migration

Monitor these metrics for 24-48 hours:

1. **Database Performance**
   ```sql
   -- Query performance
   SELECT query, mean_exec_time, calls
   FROM pg_stat_statements
   WHERE query LIKE '%reports%'
   ORDER BY mean_exec_time DESC
   LIMIT 10;
   ```

2. **Table Size**
   ```sql
   SELECT pg_size_pretty(pg_total_relation_size('reports'));
   ```

3. **Error Logs**
   ```bash
   tail -f logs/app.log | grep ERROR
   ```

4. **API Response Times**
   ```bash
   # Use monitoring tool or check logs
   grep "GET /api/reports" logs/access.log | awk '{print $NF}'
   ```

---

## Support

If you encounter issues:

1. Check this guide's Troubleshooting section
2. Review `docs/UUID_MIGRATION_GUIDE.md`
3. Check backend logs: `logs/app.log`
4. Check database logs: `/var/log/postgresql/`
5. Review `QUICK_UUID_REFERENCE.md` for code examples

---

## Checklist

### Pre-Migration
- [ ] Database backup created
- [ ] All services stopped
- [ ] Disk space verified
- [ ] Dependencies updated

### Migration
- [ ] Migration script executed
- [ ] No errors in output
- [ ] Tables verified
- [ ] UUID generation tested
- [ ] Foreign keys verified

### Post-Migration
- [ ] Backend started successfully
- [ ] Health check passing
- [ ] API endpoints working
- [ ] Frontend integration working
- [ ] Performance acceptable
- [ ] No errors in logs

### Monitoring
- [ ] Database performance monitored
- [ ] Table sizes checked
- [ ] Error logs reviewed
- [ ] API response times acceptable

---

**Good luck with your testing!** 🚀

**Date**: November 16, 2025  
**Version**: 1.0
