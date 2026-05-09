# DICOM Storage Error Fix Guide

**Date**: November 16, 2025  
**Error**: Service startup failure after adding DICOM storage models  
**Status**: Troubleshooting

---

## 🔍 Error Analysis

### Error Message
```
2025-11-16 03:04:41,630 - app.database - INFO - ================================================================================
Process SpawnProcess-1:
Traceback (most recent call last):
  File "/usr/local/lib/python3.11/multiprocessing/process.py", line 314, in _bootstrap
    self.run()
  File "/usr/local/lib/python3.11/multiprocessing/process.py", line 108, in run
    self._target(*self._args, **self._kwargs)
  File "/root/.local/lib/python3.11/site-packages/uvicorn/_subprocess.py", line 76, in subprocess_started
    target(sockets=sockets)
  File "/root/.local/lib/python3.11/site-packages/uvicorn/server.py", line 61, in run
    return asyncio.run(self.serve(sockets=sockets))
```

### Possible Causes
1. ❌ Missing pydicom dependency
2. ❌ Circular import between models
3. ❌ Missing model in __all__ export
4. ❌ Database connection issue
5. ❌ API router registration issue

---

## 🔧 Quick Fixes

### Fix 1: Check Dependencies (Most Likely)
```bash
# Check if pydicom is installed
docker exec -it pacs-service python -c "import pydicom; print(pydicom.__version__)"

# If not installed:
docker exec -it pacs-service pip install pydicom pillow

# Restart service
docker-compose restart pacs-service
```

### Fix 2: Test Imports
```bash
# Run import test
docker exec -it pacs-service python test_imports.py

# Check for errors
docker logs pacs-service --tail=100
```

### Fix 3: Temporarily Disable Storage API
If you need to get service running quickly, comment out storage router:

**File**: `pacs-service/app/main.py`
```python
# Temporarily comment out
# from app.api import storage
# app.include_router(storage.router)
```

Then restart:
```bash
docker-compose restart pacs-service
```

### Fix 4: Check Model Imports
**File**: `pacs-service/app/models/__init__.py`

Ensure all models are properly exported:
```python
from app.models.dicom_file import DicomFile
from app.models.storage_location import StorageLocation

__all__ = [
    "Study",
    "Series",
    "Instance",
    "DicomFile",           # ← Must be here
    "StorageLocation",     # ← Must be here
    "Report",
    "ReportHistory",
    "ReportAttachment",
    "StorageStats",
    "AuditLog",
    "ReportSignature",
    "SignatureAuditLog",
]
```

---

## 🧪 Diagnostic Steps

### Step 1: Check Service Status
```bash
docker ps | grep pacs-service
docker logs pacs-service --tail=50
```

### Step 2: Check Python Environment
```bash
docker exec -it pacs-service python --version
docker exec -it pacs-service pip list | grep pydicom
docker exec -it pacs-service pip list | grep pillow
```

### Step 3: Test Database Connection
```bash
docker exec -it pacs-service python -c "
from app.database import engine
try:
    with engine.connect() as conn:
        print('✓ Database connection OK')
except Exception as e:
    print(f'✗ Database connection failed: {e}')
"
```

### Step 4: Test Model Imports
```bash
docker exec -it pacs-service python -c "
from app.models import DicomFile, StorageLocation
print('✓ Models imported successfully')
"
```

### Step 5: Test Service Imports
```bash
docker exec -it pacs-service python -c "
from app.services.dicom_parser import DicomParser
from app.services.storage_manager import StorageManager
from app.services.dicom_storage import DicomStorageService
print('✓ Services imported successfully')
"
```

---

## 🔄 Complete Recovery Steps

### Option A: Install Dependencies Only
```bash
# 1. Install dependencies
docker exec -it pacs-service pip install pydicom pillow numpy

# 2. Restart service
docker-compose restart pacs-service

# 3. Check logs
docker logs pacs-service --tail=50 -f
```

### Option B: Rebuild Container
```bash
# 1. Stop service
docker-compose stop pacs-service

# 2. Update requirements.txt
cat >> pacs-service/requirements.txt << EOF
pydicom>=2.4.0
pillow>=10.0.0
numpy>=1.24.0
EOF

# 3. Rebuild
docker-compose build pacs-service

# 4. Start service
docker-compose up -d pacs-service

# 5. Check logs
docker logs pacs-service --tail=50 -f
```

### Option C: Rollback (If Needed)
```bash
# 1. Revert models/__init__.py
git checkout pacs-service/app/models/__init__.py

# 2. Remove new files temporarily
mv pacs-service/app/models/dicom_file.py pacs-service/app/models/dicom_file.py.bak
mv pacs-service/app/models/storage_location.py pacs-service/app/models/storage_location.py.bak
mv pacs-service/app/services/dicom_parser.py pacs-service/app/services/dicom_parser.py.bak
mv pacs-service/app/services/storage_manager.py pacs-service/app/services/storage_manager.py.bak
mv pacs-service/app/services/dicom_storage.py pacs-service/app/services/dicom_storage.py.bak
mv pacs-service/app/api/storage.py pacs-service/app/api/storage.py.bak

# 3. Restart service
docker-compose restart pacs-service

# 4. Verify service is running
curl http://localhost:8003/api/health
```

---

## 📋 Verification Checklist

After applying fixes, verify:

- [ ] Service starts without errors
- [ ] Health check responds: `curl http://localhost:8003/api/health`
- [ ] Database connection works
- [ ] Existing endpoints work: `curl http://localhost:8003/api/reports/`
- [ ] No errors in logs: `docker logs pacs-service --tail=50`

---

## 🎯 Most Likely Solution

Based on the error, the most likely cause is **missing pydicom dependency**.

**Quick Fix**:
```bash
# Install pydicom
docker exec -it pacs-service pip install pydicom pillow

# Restart
docker-compose restart pacs-service

# Verify
docker logs pacs-service --tail=20
curl http://localhost:8003/api/health
```

**Expected Result**:
```json
{
  "status": "healthy",
  "service": "PACS Service",
  "version": "1.0.0"
}
```

---

## 📞 If Still Failing

### Get Full Error Log
```bash
docker logs pacs-service > pacs-error.log
cat pacs-error.log
```

### Check Specific Import
```bash
docker exec -it pacs-service python -c "
import sys
import traceback
try:
    from app.services.dicom_parser import DicomParser
    print('✓ DicomParser OK')
except Exception as e:
    print(f'✗ DicomParser failed: {e}')
    traceback.print_exc()
"
```

### Manual Service Start (Debug Mode)
```bash
docker exec -it pacs-service bash
cd /app
python -m uvicorn app.main:app --host 0.0.0.0 --port 8003 --reload
```

---

## 🔍 Common Issues & Solutions

### Issue 1: ModuleNotFoundError: No module named 'pydicom'
**Solution**: Install pydicom
```bash
docker exec -it pacs-service pip install pydicom pillow
```

### Issue 2: ImportError: cannot import name 'DicomFile'
**Solution**: Check models/__init__.py has DicomFile in __all__

### Issue 3: Circular import detected
**Solution**: Models use string references in relationships (already done)

### Issue 4: Database table doesn't exist
**Solution**: Run migration first
```bash
docker exec -it dicom-postgres-secured psql -U dicom -d worklist_db -f /tmp/004_create_dicom_storage_tables.sql
```

---

## ✅ Success Indicators

Service is working when:
- ✅ No errors in startup logs
- ✅ Health check returns 200 OK
- ✅ Can access API docs: http://localhost:8003/api/docs
- ✅ Existing endpoints still work
- ✅ New storage endpoints appear in docs

---

**Document Version**: 1.0  
**Created**: November 16, 2025  
**Status**: Troubleshooting Guide  
**Priority**: HIGH
