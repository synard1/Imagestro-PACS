# DICOM Storage Migration Fix

**Date**: November 16, 2025  
**Error**: `column dicom_files.dicom_metadata does not exist`  
**Root Cause**: Database tables not created yet  
**Solution**: Run migration script

---

## 🔍 Error Details

### Error Message
```
psycopg2.errors.UndefinedColumn: column dicom_files.dicom_metadata does not exist
LINE 1: ...com_files.accessed_at AS dicom_files_accessed_at, dicom_file...
```

### Root Cause
The `dicom_files` table doesn't exist in the database yet. The migration script `004_create_dicom_storage_tables.sql` needs to be run first.

---

## ✅ Quick Fix (2 minutes)

### Option 1: Automated Script (Recommended)
```bash
chmod +x run-dicom-migration.sh
./run-dicom-migration.sh
```

This script will:
1. Check database connection
2. Backup database
3. Copy migration file
4. Run migration
5. Verify tables
6. Create storage directories
7. Restart service
8. Test endpoints

### Option 2: Manual Steps
```bash
# 1. Copy migration file
docker cp pacs-service/migrations/004_create_dicom_storage_tables.sql dicom-postgres-secured:/tmp/

# 2. Run migration
docker exec -it dicom-postgres-secured psql -U dicom -d worklist_db -f /tmp/004_create_dicom_storage_tables.sql

# 3. Verify tables
docker exec -it dicom-postgres-secured psql -U dicom -d worklist_db -c "\dt dicom_*"

# 4. Create storage directories
sudo mkdir -p /data/dicom-storage/{hot,warm,cold}
sudo chown -R 1000:1000 /data/dicom-storage

# 5. Restart service
docker-compose restart pacs-service

# 6. Test
curl "http://localhost:8003/api/storage/search?limit=1"
```

---

## 🧪 Verification

### 1. Check Tables Created
```bash
docker exec -it dicom-postgres-secured psql -U dicom -d worklist_db -c "
SELECT table_name 
FROM information_schema.tables 
WHERE table_schema = 'public' 
AND (table_name LIKE 'dicom_%' OR table_name LIKE 'storage_%')
ORDER BY table_name;
"
```

**Expected Output**:
```
 table_name
------------------
 dicom_files
 dicom_series
 storage_locations
 storage_stats
```

### 2. Check Storage Locations
```bash
docker exec -it dicom-postgres-secured psql -U dicom -d worklist_db -c "
SELECT name, tier, max_size_gb, is_active 
FROM storage_locations;
"
```

**Expected Output**:
```
     name      | tier | max_size_gb | is_active
---------------+------+-------------+-----------
 Hot Storage   | hot  |         500 | t
 Warm Storage  | warm |        2000 | t
 Cold Storage  | cold |       10000 | t
```

### 3. Test Search Endpoint
```bash
curl "http://localhost:8003/api/storage/search?limit=1"
```

**Expected Response**:
```json
{
  "total": 0,
  "limit": 1,
  "offset": 0,
  "files": []
}
```

### 4. Test Stats Endpoint
```bash
curl http://localhost:8003/api/storage/stats
```

**Expected Response**:
```json
{
  "total_files": 0,
  "total_size_bytes": 0,
  "total_size_gb": 0.0,
  "files_by_modality": {},
  "files_by_tier": {}
}
```

---

## 📋 Migration Details

### Tables Created
1. **dicom_files** - Main DICOM file storage
   - 40+ columns for DICOM metadata
   - 10+ indexes for performance
   - Foreign key to storage_locations

2. **storage_locations** - Storage tier management
   - Hot/Warm/Cold tiers
   - Capacity tracking
   - Status monitoring

3. **storage_stats** - Daily statistics
   - File counts by modality
   - Size tracking by tier
   - Growth metrics

4. **dicom_series** - Series grouping
   - Series metadata
   - Instance counts
   - Total size tracking

### Views Created
1. **v_dicom_files_with_location** - Files with storage info
2. **v_storage_summary** - Storage usage summary
3. **v_storage_growth** - Daily growth tracking

### Functions Created
1. **update_storage_location_stats()** - Update location statistics
2. **update_series_stats()** - Update series statistics
3. **generate_daily_stats()** - Generate daily statistics

### Initial Data
- 3 storage locations (Hot, Warm, Cold)
- Configured with retention policies
- Ready for immediate use

---

## 🔧 Troubleshooting

### Issue 1: Migration fails with "relation already exists"
**Solution**: Tables already exist, skip migration
```bash
# Check if tables exist
docker exec -it dicom-postgres-secured psql -U dicom -d worklist_db -c "\dt dicom_*"

# If tables exist, just restart service
docker-compose restart pacs-service
```

### Issue 2: Permission denied on /data/dicom-storage
**Solution**: Fix permissions
```bash
sudo chown -R 1000:1000 /data/dicom-storage
sudo chmod -R 755 /data/dicom-storage
```

### Issue 3: Search still returns error after migration
**Solution**: Restart service
```bash
docker-compose restart pacs-service
sleep 5
curl "http://localhost:8003/api/storage/search?limit=1"
```

### Issue 4: Database connection failed
**Solution**: Check PostgreSQL container
```bash
docker ps | grep postgres
docker logs dicom-postgres-secured --tail=20
```

---

## ✅ Success Indicators

Migration is successful when:
- ✅ 4 tables created (dicom_files, storage_locations, storage_stats, dicom_series)
- ✅ 3 storage locations initialized
- ✅ Search endpoint returns empty array (not error)
- ✅ Stats endpoint returns zeros (not error)
- ✅ No errors in service logs

---

## 🚀 After Migration

### Test File Upload
```bash
curl -X POST http://localhost:8003/api/storage/upload \
  -F "file=@src/uploads/modified_SD-720x480.dcm" \
  -F "tier=hot"
```

### Check Database
```bash
docker exec -it dicom-postgres-secured psql -U dicom -d worklist_db -c "
SELECT sop_instance_uid, patient_name, modality, file_size 
FROM dicom_files 
LIMIT 5;
"
```

### View Storage Summary
```bash
docker exec -it dicom-postgres-secured psql -U dicom -d worklist_db -c "
SELECT * FROM v_storage_summary;
"
```

---

## 📊 Expected Results After Migration

### Before Migration
```
❌ Search: Internal Server Error (500)
❌ Error: column dicom_files.dicom_metadata does not exist
```

### After Migration
```
✅ Search: {"total": 0, "limit": 1, "offset": 0, "files": []}
✅ Stats: {"total_files": 0, "total_size_gb": 0.0, ...}
✅ Health: {"status": "healthy", "service": "DICOM Storage", ...}
```

---

## 🎯 Quick Commands

```bash
# Run migration (automated)
chmod +x run-dicom-migration.sh && ./run-dicom-migration.sh

# Verify tables
docker exec -it dicom-postgres-secured psql -U dicom -d worklist_db -c "\dt dicom_*"

# Test endpoints
curl http://localhost:8003/api/storage/health
curl http://localhost:8003/api/storage/stats
curl "http://localhost:8003/api/storage/search?limit=1"

# Run full test
chmod +x test-dicom-storage.sh && ./test-dicom-storage.sh
```

---

**Document Version**: 1.0  
**Created**: November 16, 2025  
**Status**: Migration Required  
**Priority**: HIGH - Run migration to fix error
