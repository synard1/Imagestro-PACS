# DICOM Storage Quick Start Guide

**Date**: November 16, 2025  
**Status**: Ready for Integration  
**Estimated Time**: 30 minutes

---

## 🚀 Quick Start (5 Steps)

### Step 1: Install Dependencies (5 min)
```bash
cd pacs-service
pip install -r requirements-storage.txt
```

**Required packages**:
- pydicom>=2.4.0
- pillow>=10.0.0

### Step 2: Run Database Migration (2 min)
```bash
# SSH to server
ssh user@103.42.117.19

# Run migration
docker exec -it dicom-postgres-secured psql -U dicom -d worklist_db -f /path/to/004_create_dicom_storage_tables.sql

# Verify tables
docker exec -it dicom-postgres-secured psql -U dicom -d worklist_db -c "\dt dicom_*"
```

**Expected output**:
```
              List of relations
 Schema |        Name         | Type  |  Owner
--------+---------------------+-------+--------
 public | dicom_files         | table | dicom
 public | dicom_series        | table | dicom
```

### Step 3: Register API Router (3 min)
Update `pacs-service/app/main.py`:

```python
# Add import
from app.api import storage

# Register router
app.include_router(storage.router)
```

### Step 4: Restart Service (2 min)
```bash
# Restart PACS service
docker-compose restart pacs-service

# Check logs
docker logs pacs-service --tail=50
```

### Step 5: Test Upload (5 min)
```bash
# Upload test DICOM file
curl -X POST http://103.42.117.19:8003/api/storage/upload \
  -F "file=@test.dcm" \
  -F "tier=hot"

# Check storage stats
curl http://103.42.117.19:8003/api/storage/stats
```

---

## 📋 Detailed Integration Steps

### 1. Prepare Environment

#### 1.1 Check Python Version
```bash
python --version  # Should be 3.8+
```

#### 1.2 Install Dependencies
```bash
cd pacs-service
pip install pydicom pillow numpy
```

#### 1.3 Verify Installation
```python
python -c "import pydicom; print(pydicom.__version__)"
```

### 2. Database Setup

#### 2.1 Backup Current Database
```bash
docker exec -it dicom-postgres-secured pg_dump -U dicom worklist_db > backup_before_storage.sql
```

#### 2.2 Run Migration
```bash
# Copy migration file to container
docker cp pacs-service/migrations/004_create_dicom_storage_tables.sql dicom-postgres-secured:/tmp/

# Run migration
docker exec -it dicom-postgres-secured psql -U dicom -d worklist_db -f /tmp/004_create_dicom_storage_tables.sql
```

#### 2.3 Verify Migration
```bash
# Check tables
docker exec -it dicom-postgres-secured psql -U dicom -d worklist_db -c "
SELECT table_name 
FROM information_schema.tables 
WHERE table_schema = 'public' 
AND table_name LIKE 'dicom_%' 
OR table_name LIKE 'storage_%'
ORDER BY table_name;
"

# Check views
docker exec -it dicom-postgres-secured psql -U dicom -d worklist_db -c "\dv"

# Check functions
docker exec -it dicom-postgres-secured psql -U dicom -d worklist_db -c "\df"
```

### 3. Code Integration

#### 3.1 Update main.py
```python
# pacs-service/app/main.py

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

# Import routers
from app.api import reports, signatures, storage  # Add storage

app = FastAPI(
    title="PACS Service API",
    description="Medical Imaging PACS Service",
    version="1.0.0"
)

# CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Register routers
app.include_router(reports.router)
app.include_router(signatures.router)
app.include_router(storage.router)  # Add this line

@app.get("/")
async def root():
    return {"message": "PACS Service API"}

@app.get("/api/health")
async def health():
    return {
        "status": "healthy",
        "service": "PACS Service",
        "version": "1.0.0"
    }
```

#### 3.2 Create Storage Directory
```bash
# On server
sudo mkdir -p /data/dicom-storage/{hot,warm,cold}
sudo chown -R 1000:1000 /data/dicom-storage
sudo chmod -R 755 /data/dicom-storage
```

#### 3.3 Update Docker Compose (if needed)
```yaml
# docker-compose.yml
services:
  pacs-service:
    volumes:
      - ./pacs-service:/app
      - /data/dicom-storage:/data/dicom-storage  # Add this line
```

### 4. Testing

#### 4.1 Health Check
```bash
curl http://103.42.117.19:8003/api/storage/health
```

**Expected response**:
```json
{
  "status": "healthy",
  "service": "DICOM Storage",
  "total_files": 0,
  "total_size_gb": 0
}
```

#### 4.2 Upload Test File
```bash
# Upload DICOM file
curl -X POST http://103.42.117.19:8003/api/storage/upload \
  -F "file=@src/uploads/modified_SD-720x480.dcm" \
  -F "tier=hot"
```

**Expected response**:
```json
{
  "id": "550e8400-e29b-41d4-a716-446655440000",
  "sop_instance_uid": "1.2.840.113619.2.55.3.123456789",
  "study_id": "1.2.840.113619.2.55.3.123456",
  "series_id": "1.2.840.113619.2.55.3.123457",
  "patient_id": "PAT001",
  "patient_name": "Test Patient",
  "modality": "CT",
  "file_size": 524288,
  "file_size_mb": 0.5,
  "storage_tier": "hot",
  "status": "stored",
  "created_at": "2025-11-16T10:30:00"
}
```

#### 4.3 Search Files
```bash
curl "http://103.42.117.19:8003/api/storage/search?limit=10"
```

#### 4.4 Get Statistics
```bash
curl http://103.42.117.19:8003/api/storage/stats
```

#### 4.5 Download File
```bash
curl -O http://103.42.117.19:8003/api/storage/files/1.2.840.113619.2.55.3.123456789/download
```

### 5. Verification

#### 5.1 Check Database
```bash
docker exec -it dicom-postgres-secured psql -U dicom -d worklist_db -c "
SELECT 
    sop_instance_uid, 
    patient_name, 
    modality, 
    file_size, 
    storage_tier,
    created_at 
FROM dicom_files 
ORDER BY created_at DESC 
LIMIT 5;
"
```

#### 5.2 Check Filesystem
```bash
ls -lah /data/dicom-storage/hot/
```

#### 5.3 Check Storage Stats
```bash
docker exec -it dicom-postgres-secured psql -U dicom -d worklist_db -c "
SELECT * FROM v_storage_summary;
"
```

---

## 🧪 Test Scenarios

### Scenario 1: Upload Single File
```bash
# 1. Upload
curl -X POST http://103.42.117.19:8003/api/storage/upload \
  -F "file=@test.dcm" \
  -F "tier=hot"

# 2. Verify in database
# 3. Verify on filesystem
# 4. Check statistics
```

### Scenario 2: Upload Multiple Files
```bash
# Upload 10 files
for i in {1..10}; do
  curl -X POST http://103.42.117.19:8003/api/storage/upload \
    -F "file=@test${i}.dcm" \
    -F "tier=hot"
done

# Check statistics
curl http://103.42.117.19:8003/api/storage/stats
```

### Scenario 3: Search and Download
```bash
# 1. Search by patient
curl "http://103.42.117.19:8003/api/storage/search?patient_id=PAT001"

# 2. Get SOP Instance UID from response

# 3. Download file
curl -O http://103.42.117.19:8003/api/storage/files/{sop_instance_uid}/download
```

### Scenario 4: Delete File
```bash
# Soft delete
curl -X DELETE http://103.42.117.19:8003/api/storage/files/{sop_instance_uid}

# Hard delete
curl -X DELETE "http://103.42.117.19:8003/api/storage/files/{sop_instance_uid}?hard_delete=true"
```

---

## 🔧 Troubleshooting

### Issue 1: pydicom not installed
```bash
# Error: ModuleNotFoundError: No module named 'pydicom'
# Solution:
pip install pydicom pillow
```

### Issue 2: Database migration failed
```bash
# Error: relation "dicom_files" already exists
# Solution: Drop tables and re-run
docker exec -it dicom-postgres-secured psql -U dicom -d worklist_db -c "
DROP TABLE IF EXISTS dicom_files CASCADE;
DROP TABLE IF EXISTS storage_locations CASCADE;
DROP TABLE IF EXISTS storage_stats CASCADE;
DROP TABLE IF EXISTS dicom_series CASCADE;
"
# Then re-run migration
```

### Issue 3: Permission denied on storage directory
```bash
# Error: Permission denied: '/data/dicom-storage'
# Solution:
sudo chown -R 1000:1000 /data/dicom-storage
sudo chmod -R 755 /data/dicom-storage
```

### Issue 4: Invalid DICOM file
```bash
# Error: Invalid DICOM file
# Solution: Verify file is valid DICOM
python -c "from pydicom import dcmread; dcmread('test.dcm')"
```

---

## 📊 Performance Benchmarks

### Expected Performance
- Upload: < 2s per file
- Search: < 500ms
- Download: < 1s per file
- Statistics: < 200ms

### Test Performance
```bash
# Upload 100 files
time for i in {1..100}; do
  curl -X POST http://103.42.117.19:8003/api/storage/upload \
    -F "file=@test.dcm" \
    -F "tier=hot" > /dev/null 2>&1
done

# Search performance
time curl "http://103.42.117.19:8003/api/storage/search?limit=100"
```

---

## 📝 Checklist

### Pre-Integration
- [ ] Python 3.8+ installed
- [ ] Database backup created
- [ ] Storage directory created
- [ ] Dependencies installed

### Integration
- [ ] Database migration run
- [ ] API router registered
- [ ] Service restarted
- [ ] Health check passed

### Testing
- [ ] Upload test file
- [ ] Search files
- [ ] Download file
- [ ] Check statistics
- [ ] Verify database
- [ ] Verify filesystem

### Post-Integration
- [ ] Performance tested
- [ ] Error handling verified
- [ ] Documentation updated
- [ ] Team notified

---

## 🎯 Success Criteria

✅ **Integration successful when**:
- Health check returns "healthy"
- File upload works
- Files stored in correct location
- Database records created
- Search returns results
- Statistics accurate
- Download works
- No errors in logs

---

## 📞 Support

### Logs
```bash
# PACS service logs
docker logs pacs-service --tail=100 -f

# Database logs
docker logs dicom-postgres-secured --tail=100 -f
```

### Debug Mode
```python
# Enable debug logging in main.py
import logging
logging.basicConfig(level=logging.DEBUG)
```

---

**Document Version**: 1.0  
**Created**: November 16, 2025  
**Estimated Time**: 30 minutes  
**Status**: Ready for Integration ✅
