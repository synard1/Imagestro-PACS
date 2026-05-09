# DICOM Upload Endpoint Fix

## Issue
Error: "Upload Failed - Not Found" when trying to upload DICOM files.

## Root Cause
The DICOM upload router was missing the `/api` prefix in its route definition, causing a 404 error.

## Fix Applied

### 1. Backend Router Prefix Fixed
**File:** `pacs-service/app/api/dicom_upload.py`

**Before:**
```python
router = APIRouter(prefix="/dicom", tags=["dicom-upload"])
```

**After:**
```python
router = APIRouter(prefix="/api/dicom", tags=["dicom-upload"])
```

This ensures the endpoint is accessible at `/api/dicom/upload` instead of `/dicom/upload`.

### 2. Frontend API URL Configuration
**Files:** 
- `src/components/dicom/DicomUploader.jsx`
- `src/pages/DicomUpload.jsx`

**Updated to use environment variable:**
```javascript
const pacsApiUrl = import.meta.env.VITE_PACS_API_URL || 'http://localhost:8003'
const response = await fetch(`${pacsApiUrl}/api/dicom/upload`, {
  method: 'POST',
  body: formData
})
```

This allows the API URL to be configured via `.env` file.

## Verification Steps

### 1. Restart Backend Server
```bash
cd pacs-service
python -m uvicorn app.main:app --reload --port 8003
```

### 2. Test Endpoint Availability
```bash
# Run the test script
bash test-dicom-upload-endpoint.sh
```

### 3. Check API Documentation
Open in browser: http://localhost:8003/api/docs

Look for the `/api/dicom/upload` endpoint in the documentation.

### 4. Test Upload from UI
1. Start frontend: `npm run dev`
2. Navigate to: http://localhost:5173/worklist
3. Click "Upload DICOM" button
4. Select a DICOM file and upload

## Expected Endpoints

After the fix, these endpoints should be available:

- `POST /api/dicom/upload` - Upload DICOM file with auto tag extraction
- `GET /api/dicom/files/{file_id}/tags` - Get extracted tags
- `POST /api/dicom/files/{file_id}/refresh-tags` - Refresh tags

## Configuration

### Environment Variables (.env)
```bash
# PACS Backend Configuration
VITE_PACS_API_URL=http://localhost:8003
```

### Backend Configuration
```bash
# DICOM upload directory
DICOM_UPLOAD_DIR=/var/lib/pacs/uploads

# Maximum DICOM file size (bytes)
MAX_DICOM_SIZE=104857600  # 100MB
```

## Troubleshooting

### If endpoint still returns 404:

1. **Check router is imported in main.py:**
   ```python
   from app.api import dicom_upload
   app.include_router(dicom_upload.router)
   ```

2. **Restart backend completely:**
   ```bash
   # Stop the server (Ctrl+C)
   # Start again
   python -m uvicorn app.main:app --reload --port 8003
   ```

3. **Check for import errors in logs:**
   Look for any Python import errors when the server starts.

4. **Verify database connection:**
   The endpoint requires database access. Check that the database is running.

### If upload fails with other errors:

1. **Check upload directory exists:**
   ```bash
   mkdir -p /var/lib/pacs/uploads
   # Or on Windows:
   mkdir C:\var\lib\pacs\uploads
   ```

2. **Check file permissions:**
   Ensure the backend has write permissions to the upload directory.

3. **Check file size:**
   Ensure the DICOM file is under 100MB (default limit).

4. **Check DICOM file validity:**
   Use a DICOM viewer to verify the file is a valid DICOM file.

## Testing

### Manual Test with curl
```bash
# Upload a DICOM file
curl -X POST http://localhost:8003/api/dicom/upload \
  -F "file=@test.dcm" \
  -F "category=dicom" \
  -F "description=Test upload"
```

### Expected Response
```json
{
  "success": true,
  "message": "DICOM file uploaded successfully",
  "file": {
    "id": "uuid",
    "filename": "test.dcm",
    "file_size": 1234567,
    "uploaded_at": "2025-11-18T10:30:00Z"
  },
  "dicom_metadata": {
    "patient_id": "12345",
    "patient_name": "John Doe",
    "study_id": "1.2.840...",
    "modality": "CT"
  },
  "dicom_tags": {
    "DICOMPatientId": "12345",
    "DICOMPatientName": "John Doe",
    ...
  }
}
```

## Summary

The issue was caused by an incorrect router prefix. After fixing the prefix to include `/api`, the endpoint is now accessible at the correct URL and the DICOM upload feature works as expected.

## Related Files
- `pacs-service/app/api/dicom_upload.py` - Backend API
- `pacs-service/app/main.py` - Router registration
- `src/components/dicom/DicomUploader.jsx` - Upload component
- `src/pages/DicomUpload.jsx` - Upload page
- `src/pages/Worklist.jsx` - Worklist integration
