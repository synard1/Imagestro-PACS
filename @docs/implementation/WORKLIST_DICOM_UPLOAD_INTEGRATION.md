# Worklist DICOM Upload Integration

## Overview

The DICOM automatic tag update feature has been successfully integrated into the Worklist page, allowing users to upload DICOM files directly from the worklist with automatic tag extraction.

## Integration Points

### 1. Worklist Page (`src/pages/Worklist.jsx`)

**Added Features:**
- Global "Upload DICOM" button in the header
- Per-order DICOM upload button in the actions column
- DICOM upload modal with automatic tag extraction
- Integration with existing worklist workflow

**New UI Elements:**
```jsx
// Header button
<button onClick={() => setShowDicomUploadModal(true)}>
  <ArrowUpTrayIcon /> Upload DICOM
</button>

// Per-order action button
<button onClick={() => handleDicomUploadClick(order)}>
  <ArrowUpTrayIcon />
</button>
```

### 2. DICOM Uploader Component (`src/components/dicom/DicomUploader.jsx`)

**Features:**
- File selection with validation
- Upload progress indication
- Automatic DICOM tag extraction
- Display of extracted metadata
- AWS HealthImaging compatible tags display

### 3. Backend API (`pacs-service/app/api/dicom_upload.py`)

**Endpoints:**
- `POST /api/dicom/upload` - Upload DICOM with auto tag extraction
- `GET /api/dicom/files/{file_id}/tags` - Get extracted tags
- `POST /api/dicom/files/{file_id}/refresh-tags` - Refresh tags

## User Workflow

### From Worklist Header

1. Click "Upload DICOM" button in the header
2. Select DICOM file from file picker
3. Click "Upload DICOM File"
4. View extracted metadata and AWS tags
5. Modal closes automatically on success

### From Worklist Row

1. Click the upload icon (↑) in the Actions column for a specific order
2. Modal opens with order context (order number, patient name)
3. Select and upload DICOM file
4. Tags are automatically associated with the order
5. Worklist refreshes to show updated status

## Features

### Automatic Tag Extraction

When a DICOM file is uploaded, the system automatically:

1. **Validates** the DICOM file format
2. **Parses** DICOM metadata using pydicom
3. **Extracts** AWS HealthImaging compatible tags:
   - Patient Information (ID, Name, Sex, Birth Date)
   - Study Information (UID, Date, Time, Description)
   - Series Information (UID, Number, Modality, Body Part)
   - Accession Number
4. **Stores** tags in the database
5. **Displays** extracted metadata in the UI

### Order Association

When uploading from a worklist row:
- DICOM file is automatically linked to the order
- Order ID is included in the upload metadata
- Worklist status can be updated based on upload

### Visual Feedback

- **Success**: Green notification with extracted metadata
- **Error**: Red notification with error details
- **Loading**: Spinner during upload
- **Tags Display**: Formatted table of AWS HealthImaging tags

## Technical Details

### State Management

```javascript
const [showDicomUploadModal, setShowDicomUploadModal] = useState(false)
const [selectedOrder, setSelectedOrder] = useState(null)

const handleDicomUploadClick = (order) => {
  setSelectedOrder(order)
  setShowDicomUploadModal(true)
}

const handleDicomUploadComplete = (result) => {
  console.log('DICOM upload complete:', result)
  loadWorklist() // Refresh worklist
}
```

### Modal Implementation

```jsx
{showDicomUploadModal && (
  <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
    <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full">
      <DicomUploader
        orderId={selectedOrder?.order_id || selectedOrder?.id}
        onUploadComplete={(result) => {
          handleDicomUploadComplete(result)
          handleCloseModal()
        }}
      />
    </div>
  </div>
)}
```

### API Integration

```javascript
// Upload DICOM file
const formData = new FormData()
formData.append('file', selectedFile)
formData.append('category', 'dicom')
formData.append('order_id', orderId)

const response = await fetch('http://localhost:8003/api/dicom/upload', {
  method: 'POST',
  body: formData
})

const result = await response.json()
// result contains: file, dicom_metadata, dicom_tags
```

## Benefits

1. **Streamlined Workflow**: Upload DICOM files directly from worklist
2. **Context Awareness**: Automatic order association
3. **Data Quality**: Automatic tag extraction ensures accuracy
4. **AWS Compatibility**: Tags follow AWS HealthImaging specification
5. **User Experience**: Clear visual feedback and error handling
6. **Audit Trail**: All uploads tracked with metadata

## Testing

### Manual Testing

1. Start backend: `cd pacs-service && python -m uvicorn app.main:app --reload --port 8003`
2. Start frontend: `npm run dev`
3. Navigate to http://localhost:5173/worklist
4. Click "Upload DICOM" or upload icon on any order
5. Select a DICOM file and upload
6. Verify tags are extracted and displayed

### Test Script

```bash
# Run automated test
bash test-dicom-tag-update.sh src/uploads/modified_SD-720x480.dcm
```

## Configuration

### Backend Configuration

```bash
# .env or environment variables
DICOM_UPLOAD_DIR=/var/lib/pacs/uploads
MAX_DICOM_SIZE=104857600  # 100MB
```

### Frontend Configuration

No additional configuration required. The component uses the backend API URL from the environment.

## Error Handling

The integration handles various error scenarios:

1. **Invalid File Type**: Shows error message
2. **File Too Large**: Shows size limit error
3. **Upload Failed**: Shows detailed error message
4. **Network Error**: Shows connection error
5. **Backend Error**: Shows server error details

## Future Enhancements

1. **Batch Upload**: Upload multiple DICOM files at once
2. **Drag & Drop**: Drag and drop DICOM files
3. **Progress Bar**: Show upload progress for large files
4. **Tag Editing**: Allow manual tag editing after extraction
5. **Study Grouping**: Automatically group related DICOM files
6. **Status Update**: Automatically update order status on upload
7. **Notification**: Real-time notifications for upload completion

## Related Documentation

- [DICOM Auto Tag Update](DICOM_AUTO_TAG_UPDATE.md)
- [Worklist System Documentation](docs/WORKLIST_SYSTEM_DOCUMENTATION.md)
- [Backend Testing Guide](BACKEND_TESTING_GUIDE.md)

## Summary

The DICOM automatic tag update feature is now fully integrated into the Worklist page, providing a seamless workflow for uploading DICOM files with automatic metadata extraction. Users can upload files either globally or per-order, with all tags automatically extracted and stored following AWS HealthImaging specifications.
