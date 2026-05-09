# DICOM Duplicate Handling

## Problem

When uploading the same DICOM file multiple times, the system was throwing a database error:

```
psycopg2.errors.UniqueViolation: duplicate key value violates unique constraint "dicom_files_sop_instance_uid_key"
```

This happened because each DICOM file has a unique `SOP Instance UID`, and the database has a unique constraint on this field to prevent duplicate DICOM instances.

## Solution

Updated the upload endpoint to handle duplicates gracefully by:

1. **Checking for existing files** before inserting
2. **Updating existing records** instead of creating duplicates
3. **Returning appropriate status codes** (200 for updates, 201 for new uploads)
4. **Cleaning up duplicate files** to avoid wasting storage

## Implementation

### Before (Error on Duplicate)

```python
# Always tried to create new record
dicom_file = DicomFile(...)
db.add(dicom_file)
db.commit()  # ❌ Fails if SOP Instance UID already exists
```

### After (Update on Duplicate)

```python
# Check if file already exists
existing_file = db.query(DicomFile).filter(
    DicomFile.sop_instance_uid == sop_instance_uid
).first()

if existing_file:
    # ✅ Update existing record
    existing_file.file_size = len(content)
    existing_file.file_hash = file_hash
    # ... update other fields
    db.commit()
else:
    # ✅ Create new record
    dicom_file = DicomFile(...)
    db.add(dicom_file)
    db.commit()
```

## Behavior

### First Upload (New File)
- **Status Code:** 201 Created
- **Message:** "DICOM file uploaded successfully"
- **Action:** Creates new database record
- **File:** Saved to disk

### Subsequent Uploads (Duplicate)
- **Status Code:** 200 OK
- **Message:** "DICOM file updated successfully"
- **Action:** Updates existing database record
- **File:** New file deleted, existing file path retained
- **Metadata:** Updated with latest upload information

## Response Format

```json
{
  "success": true,
  "message": "DICOM file uploaded successfully",
  "is_update": false,
  "file": {
    "id": "uuid",
    "filename": "example.dcm",
    "file_size": 283522,
    "file_hash": "sha256...",
    "category": "dicom",
    "uploaded_at": "2025-11-18T13:23:31Z"
  },
  "dicom_metadata": {
    "patient_id": "12345678",
    "patient_name": "John Doe",
    "study_id": "1.2.840...",
    "modality": "CT",
    ...
  },
  "dicom_tags": {
    "DICOMPatientId": "12345678",
    "DICOMPatientName": "John Doe",
    ...
  }
}
```

For updates, `is_update` will be `true` and the message will indicate it was updated.

## Benefits

1. **No More Errors:** Duplicate uploads don't crash the system
2. **Data Integrity:** SOP Instance UID uniqueness is maintained
3. **Storage Efficiency:** Duplicate files are removed
4. **Metadata Updates:** Latest information is always stored
5. **User Friendly:** Clear feedback on whether file was new or updated

## Use Cases

### Use Case 1: Re-uploading Same Study
A user accidentally uploads the same DICOM file twice:
- First upload: Creates new record
- Second upload: Updates existing record with latest metadata

### Use Case 2: Correcting Metadata
A DICOM file was uploaded with incorrect order association:
- Re-upload with correct order_id
- System updates the existing record
- No duplicate entries created

### Use Case 3: Batch Upload with Duplicates
Uploading a folder containing some files already in the system:
- New files: Created
- Existing files: Updated
- All uploads succeed without errors

## Testing

### Test 1: Upload New File
```bash
curl -X POST http://localhost:8003/api/dicom/upload \
  -F "file=@test.dcm" \
  -F "category=dicom"
```

Expected: 201 Created, `is_update: false`

### Test 2: Upload Same File Again
```bash
curl -X POST http://localhost:8003/api/dicom/upload \
  -F "file=@test.dcm" \
  -F "category=dicom"
```

Expected: 200 OK, `is_update: true`

### Test 3: Upload with Different Order ID
```bash
# First upload
curl -X POST http://localhost:8003/api/dicom/upload \
  -F "file=@test.dcm" \
  -F "order_id=order-123"

# Second upload with different order
curl -X POST http://localhost:8003/api/dicom/upload \
  -F "file=@test.dcm" \
  -F "order_id=order-456"
```

Expected: Second upload updates order_id in metadata

## Database Schema

The unique constraint on `sop_instance_uid` ensures DICOM integrity:

```sql
CREATE TABLE dicom_files (
    id UUID PRIMARY KEY,
    sop_instance_uid VARCHAR(64) NOT NULL UNIQUE,  -- ✅ Unique constraint
    ...
);

CREATE UNIQUE INDEX idx_dicom_files_sop_instance_uid 
ON dicom_files(sop_instance_uid);
```

## Frontend Handling

The frontend can detect updates and show appropriate messages:

```javascript
const result = await uploadDicom(file)

if (result.is_update) {
  showMessage('DICOM file updated successfully')
} else {
  showMessage('DICOM file uploaded successfully')
}
```

## Logging

The system logs both scenarios:

```
INFO: DICOM file already exists (SOP Instance UID: 1.2.840...), updating...
INFO: Updated existing DicomFile record: uuid
```

or

```
INFO: Created new DicomFile record: uuid
```

## Error Handling

If the update fails for any reason:
- Transaction is rolled back
- Temporary file is cleaned up
- Error is returned to user
- Original database record remains unchanged

## Future Enhancements

1. **Version History:** Keep track of all uploads of the same file
2. **Conflict Resolution:** Allow user to choose between update or keep both
3. **Audit Trail:** Log all updates with timestamps and user info
4. **Bulk Operations:** Optimize for batch uploads with many duplicates
5. **Smart Merge:** Merge metadata from multiple uploads intelligently

## Related Documentation

- [DICOM Auto Tag Update](DICOM_AUTO_TAG_UPDATE.md)
- [CORS Fix and Backend Restart](CORS_FIX_AND_BACKEND_RESTART.md)
- [Worklist DICOM Upload Integration](WORKLIST_DICOM_UPLOAD_INTEGRATION.md)

## Summary

The DICOM upload endpoint now gracefully handles duplicate files by updating existing records instead of throwing errors. This provides a better user experience and maintains data integrity while allowing users to re-upload files when needed.
