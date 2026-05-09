# DICOM Automatic Tag Update Feature

## Overview

This feature automatically extracts and updates DICOM tags when DICOM images are uploaded to the system. The implementation follows the AWS HealthImaging DICOMTags specification to ensure compatibility with cloud-based medical imaging services.

## Reference

AWS HealthImaging DICOMTags API:
https://docs.aws.amazon.com/healthimaging/latest/APIReference/API_DICOMTags.html

## Architecture

### Backend Components

1. **DICOM Parser Service** (`pacs-service/app/services/dicom_parser.py`)
   - Parses DICOM files using pydicom
   - Extracts metadata including patient info, study details, series info
   - Validates DICOM file integrity

2. **DICOM Tag Updater Service** (`pacs-service/app/services/dicom_tag_updater.py`)
   - Automatically updates DICOM tags on upload
   - Converts metadata to AWS HealthImaging compatible format
   - Updates database records with extracted tags

3. **DICOM Upload API** (`pacs-service/app/api/dicom_upload.py`)
   - Handles file uploads via multipart/form-data
   - Validates DICOM files
   - Triggers automatic tag extraction and update
   - Returns extracted metadata and tags

### Frontend Components

1. **DicomUploader Component** (`src/components/dicom/DicomUploader.jsx`)
   - File upload interface
   - Displays extracted metadata
   - Shows AWS HealthImaging tags

2. **DicomUpload Page** (`src/pages/DicomUpload.jsx`)
   - Full-featured upload interface
   - Lists uploaded files
   - View and refresh DICOM tags
   - Documentation and examples

## AWS HealthImaging Compatible Tags

The system extracts and stores the following DICOM tags according to AWS specification:

### Patient Information
- `DICOMPatientId` - Patient identifier (max 256 chars)
- `DICOMPatientName` - Patient name (max 256 chars)
- `DICOMPatientSex` - Patient sex (max 16 chars)
- `DICOMPatientBirthDate` - Birth date in YYYYMMDD format (max 18 chars)

### Study Information
- `DICOMStudyInstanceUID` - Study instance UID (max 256 chars)
- `DICOMStudyId` - Study ID (max 256 chars)
- `DICOMStudyDescription` - Study description (max 256 chars)
- `DICOMStudyDate` - Study date in YYYYMMDD format (max 18 chars)
- `DICOMStudyTime` - Study time in HHMMSS format (max 28 chars)
- `DICOMAccessionNumber` - Accession number (max 256 chars)

### Series Information
- `DICOMSeriesInstanceUID` - Series instance UID (max 256 chars)
- `DICOMSeriesNumber` - Series number (integer)
- `DICOMSeriesModality` - Modality (max 16 chars)
- `DICOMSeriesBodyPart` - Body part examined (max 64 chars)

### Study/Series Counts
- `DICOMNumberOfStudyRelatedSeries` - Total series in study (integer, 0-1000000)
- `DICOMNumberOfStudyRelatedInstances` - Total instances in study (integer, 0-1000000)

## API Endpoints

### Upload DICOM File
```
POST /api/dicom/upload
Content-Type: multipart/form-data

Parameters:
- file: DICOM file (required)
- category: File category (optional, default: "dicom")
- description: File description (optional)
- order_id: Associated order ID (optional)

Response:
{
  "success": true,
  "message": "DICOM file uploaded successfully",
  "file": {
    "id": "uuid",
    "filename": "example.dcm",
    "file_size": 1234567,
    "file_hash": "sha256...",
    "category": "dicom",
    "uploaded_at": "2025-11-18T10:30:00Z"
  },
  "dicom_metadata": {
    "patient_id": "12345",
    "patient_name": "John Doe",
    "study_id": "1.2.840...",
    "series_id": "1.2.840...",
    "modality": "CT",
    "study_date": "2025-11-18",
    "study_description": "CT Head"
  },
  "dicom_tags": {
    "DICOMPatientId": "12345",
    "DICOMPatientName": "John Doe",
    "DICOMStudyInstanceUID": "1.2.840...",
    ...
  }
}
```

### Get DICOM Tags
```
GET /api/dicom/files/{file_id}/tags

Response:
{
  "file_id": "uuid",
  "filename": "example.dcm",
  "dicom_tags": {
    "DICOMPatientId": "12345",
    ...
  },
  "metadata": {
    "patient_id": "12345",
    "patient_name": "John Doe",
    ...
  }
}
```

### Refresh DICOM Tags
```
POST /api/dicom/files/{file_id}/refresh-tags

Response:
{
  "success": true,
  "message": "DICOM tags refreshed successfully",
  "file_id": "uuid",
  "dicom_tags": {
    ...
  }
}
```

## Usage

### Frontend Usage

1. Navigate to `/dicom-upload` in the application
2. Select a DICOM file (.dcm or .dicom)
3. Click "Upload DICOM File"
4. View extracted metadata and AWS HealthImaging tags
5. Use "View Tags" to see detailed tag information
6. Use "Refresh" button to re-parse and update tags

### Backend Integration

```python
from app.services.dicom_tag_updater import get_dicom_tag_updater

# Upload and update tags
tag_updater = get_dicom_tag_updater()
dicom_tags = await tag_updater.update_tags_on_upload(
    db=db,
    file_path="/path/to/file.dcm",
    dicom_file_id="uuid"
)
```

## Configuration

### Environment Variables

```bash
# DICOM upload directory
DICOM_UPLOAD_DIR=/var/lib/pacs/uploads

# Maximum DICOM file size (bytes)
MAX_DICOM_SIZE=104857600  # 100MB
```

### Database

DICOM tags are stored in the `dicom_files` table:
- Standard fields: patient_id, patient_name, study_id, etc.
- JSON metadata field: stores AWS compatible tags in `dicom_metadata.aws_dicom_tags`

## Benefits

1. **Automatic Extraction**: No manual tag entry required
2. **AWS Compatibility**: Tags follow AWS HealthImaging specification
3. **Data Integrity**: Validates DICOM files before processing
4. **Searchability**: Extracted tags enable efficient querying
5. **Interoperability**: Compatible with cloud-based imaging services
6. **Audit Trail**: Tracks when tags were parsed and updated

## Testing

### Test DICOM Upload

```bash
# Upload a DICOM file
curl -X POST http://localhost:8003/api/dicom/upload \
  -F "file=@test.dcm" \
  -F "category=dicom" \
  -F "description=Test upload"

# Get tags for uploaded file
curl http://localhost:8003/api/dicom/files/{file_id}/tags

# Refresh tags
curl -X POST http://localhost:8003/api/dicom/files/{file_id}/refresh-tags
```

### Frontend Testing

1. Start the backend: `cd pacs-service && python -m uvicorn app.main:app --reload --port 8003`
2. Start the frontend: `npm run dev`
3. Navigate to http://localhost:5173/dicom-upload
4. Upload a test DICOM file
5. Verify tags are extracted and displayed

## Error Handling

The system handles various error scenarios:

- **Invalid DICOM file**: Returns 400 Bad Request
- **File too large**: Returns 413 Request Entity Too Large
- **Missing file**: Returns 400 Bad Request
- **Database errors**: Returns 500 Internal Server Error with rollback
- **Parsing errors**: Logs error and returns detailed message

## Future Enhancements

1. Batch upload support
2. Background tag extraction for large files
3. Tag validation and normalization
4. Integration with PACS systems
5. Export tags to AWS HealthImaging
6. Tag-based search and filtering
7. Automatic study/series aggregation

## Related Documentation

- [DICOM Storage Implementation](DICOM_STORAGE_INTEGRATION_SUCCESS.md)
- [PACS Architecture](PACS_ARCHITECTURE_DIAGRAM.md)
- [Backend Testing Guide](BACKEND_TESTING_GUIDE.md)
