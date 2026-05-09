# Fix: DICOM Hierarchy Storage

## 🔍 Issue

C-STORE berhasil tapi hanya `dicom_files` yang terisi. Tables `studies`, `series`, dan `instances` masih kosong.

```
Total studies: 0      ← Should have entries
Total DICOM files: 2  ← Has entries
Total series: 0       ← Should have entries
Total instances: 0    ← Should have entries
```

---

## 🔧 Root Cause

`DicomStorageService.store_dicom()` hanya menyimpan ke `dicom_files` table (denormalized storage) tanpa membuat proper DICOM hierarchy (Study → Series → Instance).

---

## ✅ Solution

Created `dicom_hierarchy.py` service yang membuat proper DICOM hierarchy:

```
Study (patient info, study metadata)
  ↓
Series (modality, body part, series info)
  ↓
Instance (SOP instance, image data)
```

### New Service Functions

1. **create_or_get_study()** - Create/get study entry
2. **create_or_get_series()** - Create/get series entry
3. **create_or_get_instance()** - Create/get instance entry
4. **store_dicom_hierarchy()** - Main function to create full hierarchy

---

## 🚀 Apply Fix

### Step 1: Update Files
```bash
./update-dicom-scp.sh
```

This will copy:
- `dicom_scp.py` (updated to use hierarchy)
- `dicom_hierarchy.py` (new service)

### Step 2: Restart SCP
```bash
./start-dicom-scp.sh
```

### Step 3: Test Again
```bash
./test-dicom-send-simple.sh
```

### Step 4: Verify Database
```bash
./check-database.sh
```

Expected output:
```
Total studies: 1      ← Now has entries!
Total DICOM files: 3
Total series: 1       ← Now has entries!
Total instances: 1    ← Now has entries!

Recent studies:
  Patient: TEST123 (Test^Patient)
  Study UID: 1.2.826...
  Description: Test Study
  Created: 2025-11-16 ...
```

---

## 📊 What Changed

### Before
```python
# Only stored to dicom_files
storage_service = DicomStorageService(db)
result = loop.run_until_complete(storage_service.store_dicom(temp_path))
# Result: dicom_files populated, but no studies/series/instances
```

### After
```python
# First create hierarchy
from app.services.dicom_hierarchy import store_dicom_hierarchy
result = store_dicom_hierarchy(db, ds)
# Result: studies, series, instances created

# Then store file (optional, for file management)
storage_service = DicomStorageService(db)
file_result = loop.run_until_complete(storage_service.store_dicom(temp_path))
# Result: dicom_files also populated
```

---

## 🎯 Benefits

### Proper DICOM Hierarchy
- ✅ Studies table populated
- ✅ Series table populated
- ✅ Instances table populated
- ✅ Proper foreign key relationships

### Better Queries
```sql
-- Get all series in a study
SELECT * FROM series WHERE study_id = 1;

-- Get all instances in a series
SELECT * FROM instances WHERE series_id = 1;

-- Get study with patient info
SELECT * FROM studies WHERE patient_id = 'TEST123';
```

### DICOM Compliance
- Follows DICOM information model
- Study → Series → Instance hierarchy
- Proper UIDs at each level

---

## ✅ Verification

### Check Tables
```bash
./check-database.sh
```

Should show:
- Studies > 0
- Series > 0
- Instances > 0
- DICOM files > 0

### Check Relationships
```bash
docker exec pacs-service python -c "
from app.database import engine
from sqlalchemy import text

with engine.connect() as conn:
    # Check study
    result = conn.execute(text('SELECT id, patient_id, study_instance_uid FROM studies LIMIT 1'))
    study = result.fetchone()
    print(f'Study: {study}')
    
    # Check series for that study
    result = conn.execute(text(f'SELECT id, series_instance_uid, modality FROM series WHERE study_id = {study[0]}'))
    series = result.fetchone()
    print(f'Series: {series}')
    
    # Check instances for that series
    result = conn.execute(text(f'SELECT id, sop_instance_uid FROM instances WHERE series_id = {series[0]}'))
    instance = result.fetchone()
    print(f'Instance: {instance}')
"
```

---

## 📝 Files Created/Modified

```
New:
+ pacs-service/app/services/dicom_hierarchy.py

Modified:
✓ pacs-service/app/services/dicom_scp.py
✓ update-dicom-scp.sh
```

---

## 🎯 Complete Test Flow

```bash
# 1. Update files
./update-dicom-scp.sh

# 2. Restart SCP
./start-dicom-scp.sh

# 3. Send test file
./test-dicom-send-simple.sh

# 4. Check database
./check-database.sh

# Expected:
# Total studies: 1 ✓
# Total series: 1 ✓
# Total instances: 1 ✓
# Total DICOM files: 3 ✓
```

---

**Problem Solved!** Run `./update-dicom-scp.sh` to apply fix! 🎉
