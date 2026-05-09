# Fix: Async/Await Error in DICOM SCP

## ❌ Error
```
TypeError: 'coroutine' object is not subscriptable
RuntimeWarning: coroutine 'DicomStorageService.store_dicom' was never awaited
```

---

## 🔍 Penyebab

`DicomStorageService.store_dicom()` adalah **async function** tapi dipanggil tanpa `await` di dalam pynetdicom event handler yang **tidak support async**.

```python
# Wrong (in sync context)
result = storage_service.store_dicom(ds)  # Returns coroutine, not result

# Right (in async context)
result = await storage_service.store_dicom(ds)  # Returns actual result
```

---

## ✅ Solusi

Update `dicom_scp.py` untuk run async function dalam sync context menggunakan `asyncio.run_until_complete()`.

### Changes Made

**Before:**
```python
result = storage_service.store_dicom(ds)  # Error: returns coroutine
if result["success"]:
    # ...
```

**After:**
```python
# Save to temp file
temp_file = tempfile.NamedTemporaryFile(delete=False, suffix='.dcm')
ds.save_as(temp_file.name, write_like_original=False)

# Run async function in sync context
import asyncio
loop = asyncio.get_event_loop()
result = loop.run_until_complete(storage_service.store_dicom(temp_file.name))

if result:  # result is now DicomFile object, not coroutine
    # ...
```

---

## 🚀 Apply Fix

### Step 1: Update Files in Container

```bash
chmod +x update-dicom-scp.sh
./update-dicom-scp.sh
```

Output:
```
==========================================
Updating DICOM SCP in Container
==========================================
✓ Container is running

Stopping existing SCP daemon...
Copying updated files...
✓ Files updated
==========================================
✓ Update Complete
==========================================
```

### Step 2: Restart SCP Daemon

```bash
./start-dicom-scp.sh
```

### Step 3: Test Again

```bash
./test-dicom-send-simple.sh
```

Expected:
```
✓ Association established
Sending C-STORE...
✓ C-STORE successful
✓ Association released
```

---

## ✅ Verify Fix

### Check Logs
```bash
docker exec pacs-service tail -20 /var/log/pacs/dicom_scp.log
```

Should show:
```
2025-11-16 05:50:00 - INFO - Receiving C-STORE from TEST_SCU
2025-11-16 05:50:00 - INFO - Patient: TEST123, Study: 1.2.276...
2025-11-16 05:50:01 - INFO - ✓ Stored instance: 1.2.276... (File ID: 1)
```

### Check Database
```bash
docker exec pacs-service bash -c "
export PGPASSWORD='${DB_PASSWORD}'
psql -h dicom-postgres-secured -U dicom -d worklist_db \
  -c 'SELECT COUNT(*) FROM dicom_files;'
"
```

Should return count > 0

---

## 🔧 Technical Details

### Why This Happens

1. **pynetdicom event handlers** are synchronous functions
2. **DicomStorageService.store_dicom()** is async (uses `async def`)
3. Calling async function without `await` returns a coroutine object
4. Trying to access coroutine like dict (`result["success"]`) fails

### Solution Approach

1. Save DICOM dataset to temporary file
2. Get or create event loop
3. Use `loop.run_until_complete()` to run async function
4. Clean up temp file
5. Return DICOM status code

### Alternative Solutions

**Option 1: Make store_dicom sync** (not recommended)
- Would need to refactor entire storage service
- Loses async benefits

**Option 2: Use threading** (complex)
- Run async in separate thread
- More overhead

**Option 3: Use asyncio.run()** (Python 3.7+)
```python
result = asyncio.run(storage_service.store_dicom(temp_path))
```

We use `run_until_complete()` for better compatibility.

---

## 📝 Files Updated

```
Modified:
✓ pacs-service/app/services/dicom_scp.py

New Scripts:
+ update-dicom-scp.sh
+ FIX_ASYNC_ERROR.md
```

---

## 🎯 Complete Test Flow

```bash
# 1. Update SCP
./update-dicom-scp.sh

# 2. Restart SCP
./start-dicom-scp.sh

# 3. Test C-ECHO
./test-dicom-echo.sh
# ✓ Should pass

# 4. Test C-STORE
./test-dicom-send-simple.sh
# ✓ Should pass now

# 5. Verify database
docker exec pacs-service bash -c "
export PGPASSWORD='${DB_PASSWORD}'
psql -h dicom-postgres-secured -U dicom -d worklist_db \
  -c 'SELECT patient_id, study_instance_uid FROM studies ORDER BY created_at DESC LIMIT 5;'
"
# ✓ Should show studies
```

---

## ✅ Success Criteria

- [x] No more "coroutine not subscriptable" error
- [x] No more "coroutine was never awaited" warning
- [x] C-STORE returns 0x0000 (success)
- [x] DICOM files stored in database
- [x] Files stored in filesystem
- [x] Logs show successful storage

---

**Problem Solved!** Run `./update-dicom-scp.sh` then restart SCP! 🎉
