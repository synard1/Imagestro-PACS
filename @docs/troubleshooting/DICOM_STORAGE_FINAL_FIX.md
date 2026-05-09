# DICOM Storage Final Fix Guide

**Date**: November 16, 2025  
**Status**: Tables Created, Service Needs Restart  
**Issue**: Internal Server Error after migration

---

## 🎯 Current Status

### ✅ What's Working
- Database tables created successfully
- Migration completed
- Storage directories exist
- Service starts without errors

### ❌ What's Not Working
- Search endpoint returns Internal Server Error
- Service needs to reload models after migration

---

## 🔧 Quick Fix (1 minute)

### Solution: Clean Restart
```bash
chmod +x restart-pacs-clean.sh
./restart-pacs-clean.sh
```

This will:
1. Stop service
2. Clear Python cache
3. Start service
4. Wait for ready
5. Test all endpoints

### Alternative: Manual Restart
```bash
# Stop service
docker-compose stop pacs-service

# Clear cache
docker exec -it pacs-service find /app -type d -name __pycache__ -exec rm -rf {} +
docker exec -it pacs-service find /app -type f -name "*.pyc" -delete

# Start service
docker-compose up -d pacs-service

# Wait and test
sleep 10
curl "http://localhost:8003/api/storage/search?limit=1"
```

---

## 🔍 If Still Failing: Run Diagnostic

```bash
chmod +x diagnose-dicom-storage.sh
./diagnose-dicom-storage.sh
```

This will check:
1. Database tables and columns
2. Python model imports
3. Database queries
4. Search service
5. Service logs
6. API endpoints

---

## 📋 Verification Steps

### 1. Check Service Logs
```bash
docker logs pacs-service --tail=50
```

Look for:
- ✅ "PACS Service Ready"
- ✅ "Database connection established"
- ❌ Any Python errors
- ❌ SQLAlchemy errors

### 2. Test Endpoints
```bash
# Health check
curl http://localhost:8003/api/health

# Storage health
curl http://localhost:8003/api/storage/health

# Storage stats
curl http://localhost:8003/api/storage/stats

# Search (should return empty array)
curl "http://localhost:8003/api/storage/search?limit=1"
```

### 3. Check Database
```bash
# Verify tables
docker exec -it dicom-postgres-secured psql -U dicom -d worklist_db -c "\dt dicom_*"

# Check columns
docker exec -it dicom-postgres-secured psql -U dicom -d worklist_db -c "
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'dicom_files' 
AND column_name LIKE '%metadata%';
"
```

**Expected Output**:
```
   column_name   | data_type
-----------------+-----------
 dicom_metadata  | jsonb
```

---

## 🎯 Expected Results

### After Clean Restart

**Search Endpoint**:
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

**Stats Endpoint**:
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

## 🔧 Troubleshooting

### Issue 1: Still getting Internal Server Error

**Check logs for specific error**:
```bash
docker logs pacs-service --tail=100 | grep -A 10 "ERROR"
```

**Common causes**:
1. Model not reloaded → Restart service
2. Database connection issue → Check PostgreSQL
3. Column mismatch → Run diagnostic

**Solution**:
```bash
# Force restart
docker-compose restart pacs-service
sleep 10
curl "http://localhost:8003/api/storage/search?limit=1"
```

### Issue 2: Column does not exist error

**Check if column name matches**:
```bash
docker exec -it dicom-postgres-secured psql -U dicom -d worklist_db -c "
SELECT column_name 
FROM information_schema.columns 
WHERE table_name = 'dicom_files' 
ORDER BY ordinal_position;
"
```

**If `metadata` instead of `dicom_metadata`**:
```bash
# Rename column
docker exec -it dicom-postgres-secured psql -U dicom -d worklist_db -c "
ALTER TABLE dicom_files RENAME COLUMN metadata TO dicom_metadata;
"

# Restart service
docker-compose restart pacs-service
```

### Issue 3: Service won't start

**Check container status**:
```bash
docker ps -a | grep pacs-service
docker logs pacs-service --tail=50
```

**Restart container**:
```bash
docker-compose down pacs-service
docker-compose up -d pacs-service
```

---

## 📊 Complete Test Suite

After fix, run complete test:
```bash
chmod +x test-dicom-storage.sh
./test-dicom-storage.sh
```

**Expected Output**:
```
============================================================================
DICOM Storage Integration Test
============================================================================

Phase 1: Service Health Checks
============================================================================
✓ PASS: Main health check
✓ PASS: Storage health check

Phase 2: Storage Statistics
============================================================================
✓ PASS: Storage statistics

Phase 3: File Search
============================================================================
✓ PASS: File search

Phase 4: API Documentation
============================================================================
✓ PASS: API documentation accessible

============================================================================
Test Summary
============================================================================
Total Tests: 5
Passed: 5
Failed: 0

============================================================================
✓ ALL TESTS PASSED!
============================================================================
```

---

## 🚀 Next Steps After Fix

### 1. Test File Upload
```bash
curl -X POST http://localhost:8003/api/storage/upload \
  -F "file=@src/uploads/modified_SD-720x480.dcm" \
  -F "tier=hot"
```

### 2. Verify in Database
```bash
docker exec -it dicom-postgres-secured psql -U dicom -d worklist_db -c "
SELECT sop_instance_uid, patient_name, modality, file_size 
FROM dicom_files 
LIMIT 5;
"
```

### 3. Check Storage Directory
```bash
ls -lah /data/dicom-storage/hot/
```

### 4. View API Documentation
```
http://localhost:8003/api/docs
```

---

## 📁 Helper Scripts Created

1. **run-dicom-migration.sh** - Run database migration
2. **restart-pacs-clean.sh** - Clean restart service
3. **diagnose-dicom-storage.sh** - Diagnostic tool
4. **test-dicom-storage.sh** - Integration tests
5. **fix-dicom-storage.sh** - Quick fix script

---

## ✅ Success Checklist

- [ ] Migration completed (tables created)
- [ ] Service restarted cleanly
- [ ] Health check returns "healthy"
- [ ] Storage health returns "healthy"
- [ ] Stats endpoint returns zeros
- [ ] Search endpoint returns empty array (not error)
- [ ] No errors in service logs
- [ ] API docs accessible

---

## 🎯 Quick Commands Reference

```bash
# Run migration
./run-dicom-migration.sh

# Clean restart
./restart-pacs-clean.sh

# Run diagnostic
./diagnose-dicom-storage.sh

# Run tests
./test-dicom-storage.sh

# Check logs
docker logs pacs-service --tail=50 -f

# Test search
curl "http://localhost:8003/api/storage/search?limit=1"

# Test upload
curl -X POST http://localhost:8003/api/storage/upload \
  -F "file=@test.dcm" -F "tier=hot"
```

---

**Document Version**: 1.0  
**Created**: November 16, 2025  
**Status**: Migration Complete, Restart Required  
**Priority**: HIGH - Run clean restart to fix
