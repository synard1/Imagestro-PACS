# DICOM LocalStorage Workflow

## Overview
Sistem upload DICOM dengan penyimpanan di localStorage memungkinkan simulasi workflow PACS lengkap tanpa memerlukan backend. Data gambar DICOM disimpan sebagai base64 di browser localStorage.

## Architecture

### Storage Structure

```
localStorage:
  - pacs_studies      → Study records
  - pacs_series       → Series records  
  - pacs_instances    → Instance records
  - pacs_files        → Base64 encoded DICOM files
```

### Data Model

**Study:**
```javascript
{
  id: "study_1234567890",
  studyUID: "1.2.840.113619.1234567890.123456",
  patientId: "10000001",
  patientName: "John Doe",
  studyDate: "20241116",
  studyTime: "140530",
  modality: "CT",
  studyDescription: "CT Chest",
  orderId: "order_123",
  numberOfSeries: 1,
  numberOfInstances: 5,
  createdAt: "2024-11-16T14:05:30.123Z"
}
```

**Series:**
```javascript
{
  id: "series_1234567890",
  seriesUID: "1.2.840.113619.1234567890.123457",
  studyUID: "1.2.840.113619.1234567890.123456",
  seriesNumber: 1,
  modality: "CT",
  seriesDescription: "Axial",
  numberOfInstances: 5,
  createdAt: "2024-11-16T14:05:30.123Z"
}
```

**Instance:**
```javascript
{
  id: "instance_1234567890_abc123",
  instanceUID: "1.2.840.113619.1234567890.123458",
  seriesUID: "1.2.840.113619.1234567890.123457",
  studyUID: "1.2.840.113619.1234567890.123456",
  instanceNumber: 1,
  fileName: "image001.dcm",
  fileSize: 524288,
  createdAt: "2024-11-16T14:05:30.123Z"
}
```

**File:**
```javascript
{
  id: "instance_1234567890_abc123",
  instanceUID: "1.2.840.113619.1234567890.123458",
  fileName: "image001.dcm",
  fileSize: 524288,
  mimeType: "application/dicom",
  base64Data: "data:application/dicom;base64,SUkqAAgAAAA...",
  createdAt: "2024-11-16T14:05:30.123Z"
}
```

## Workflow

### 1. Upload Process

```
User → Worklist → Click "Upload" → OrderUploadModal
  ↓
Select DICOM files (.dcm)
  ↓
DicomUpload Component
  ↓
Check VITE_USE_PACS_BACKEND
  ↓
If false → storeDicomFile()
  ↓
Convert file to base64
  ↓
Generate UIDs (Study, Series, Instance)
  ↓
Store in localStorage:
  - pacs_studies
  - pacs_series
  - pacs_instances
  - pacs_files
  ↓
Update order status
  ↓
Refresh worklist
```

### 2. View Studies

```
User → Studies Page
  ↓
StudyService.fetchStudies()
  ↓
Check VITE_USE_PACS_BACKEND
  ↓
If false → getAllStudies() from localStorage
  ↓
Display in StudyListEnhanced
  ↓
Grid or Table view
```

### 3. View Study Details

```
User → Click Study Card
  ↓
Navigate to /study/:studyId
  ↓
Load study from localStorage
  ↓
Load series from localStorage
  ↓
Load instances from localStorage
  ↓
Display study details
```

### 4. View DICOM Image

```
User → Click Instance
  ↓
getFileByInstanceId()
  ↓
Retrieve base64Data from localStorage
  ↓
Convert to Blob
  ↓
Display in DICOM Viewer (Cornerstone.js)
```

## API Reference

### dicomStorageService.js

#### storeDicomFile(file, metadata)
Store DICOM file in localStorage
```javascript
const result = await storeDicomFile(file, {
  patientId: "10000001",
  orderId: "order_123"
});
// Returns: { success, studyUID, seriesUID, instanceUID, studyId }
```

#### getAllStudies()
Get all studies from localStorage
```javascript
const studies = getAllStudies();
// Returns: Array of study objects
```

#### getStudyById(studyId)
Get specific study
```javascript
const study = getStudyById("study_1234567890");
// Returns: Study object or undefined
```

#### getSeriesByStudyUID(studyUID)
Get all series for a study
```javascript
const series = getSeriesByStudyUID("1.2.840.113619.1234567890.123456");
// Returns: Array of series objects
```

#### getInstancesBySeriesUID(seriesUID)
Get all instances for a series
```javascript
const instances = getInstancesBySeriesUID("1.2.840.113619.1234567890.123457");
// Returns: Array of instance objects
```

#### getFileByInstanceId(instanceId)
Get file data for an instance
```javascript
const file = getFileByInstanceId("instance_1234567890_abc123");
// Returns: { id, instanceUID, fileName, fileSize, mimeType, base64Data, createdAt }
```

#### deleteStudy(studyId)
Delete study and all related data
```javascript
const success = deleteStudy("study_1234567890");
// Returns: boolean
```

#### getStorageStats()
Get storage statistics
```javascript
const stats = getStorageStats();
// Returns: { studyCount, seriesCount, instanceCount, fileCount, totalSize, totalSizeMB }
```

#### clearAllStorage()
Clear all DICOM storage
```javascript
const success = clearAllStorage();
// Returns: boolean
```

## Storage Limits

### Browser localStorage Limits
- Chrome/Edge: ~10MB
- Firefox: ~10MB
- Safari: ~5MB

### Recommendations
1. **Small Studies Only**: Limit to 5-10 images per study
2. **Compressed Images**: Use compressed DICOM files
3. **Regular Cleanup**: Clear old studies regularly
4. **Monitor Storage**: Use `getStorageStats()` to check usage

### Storage Warning
```javascript
const stats = getStorageStats();
if (stats.totalSize > 8 * 1024 * 1024) { // 8MB
  console.warn('Storage nearly full!');
  // Show warning to user
}
```

## Integration with Existing Components

### 1. DicomUpload Component
```javascript
// Already integrated
import { storeDicomFile } from '../../services/dicomStorageService';

// In uploadFiles():
const result = await storeDicomFile(fileItem.file, {
  patientId,
  orderId
});
```

### 2. StudyService
```javascript
// Already integrated
import { getAllStudies } from './dicomStorageService';

// In getMockStudies():
const localStudies = getAllStudies();
if (localStudies && localStudies.length > 0) {
  return localStudies.map(study => ({ /* normalize */ }));
}
```

### 3. StudyListEnhanced
```javascript
// Already works - uses StudyService
const result = await fetchStudies(filters);
// Automatically loads from localStorage if backend disabled
```

## Testing

### Test Upload Workflow

1. **Start Dev Server**
   ```bash
   npm run dev
   ```

2. **Ensure Mock Mode**
   ```env
   # .env
   VITE_USE_PACS_BACKEND=false
   # or remove the variable
   ```

3. **Upload Test Files**
   - Go to Worklist
   - Click "Upload" on any order
   - Select DICOM files (.dcm)
   - Click "Upload X Files"
   - Wait for success message

4. **Verify Storage**
   ```javascript
   // In browser console
   import { getStorageStats } from './services/dicomStorageService';
   console.log(getStorageStats());
   ```

5. **View Studies**
   - Go to Studies page
   - Should see uploaded studies
   - Click to view details

### Test Data Persistence

1. Upload files
2. Refresh browser (F5)
3. Go to Studies page
4. Studies should still be there

### Test Storage Cleanup

```javascript
// In browser console
import { clearAllStorage } from './services/dicomStorageService';
clearAllStorage();
```

## Troubleshooting

### Upload fails silently
- Check browser console for errors
- Verify localStorage is not full
- Check file is valid DICOM (.dcm extension)

### Studies not showing
- Check `VITE_USE_PACS_BACKEND` is false
- Verify data in localStorage:
  ```javascript
  localStorage.getItem('pacs_studies')
  ```
- Check browser console for errors

### Storage quota exceeded
- Clear old studies:
  ```javascript
  import { deleteStudy } from './services/dicomStorageService';
  deleteStudy('study_id_here');
  ```
- Or clear all:
  ```javascript
  import { clearAllStorage } from './services/dicomStorageService';
  clearAllStorage();
  ```

### Base64 conversion fails
- File might be too large (>2MB)
- Try smaller DICOM files
- Check browser memory

## Migration to Backend

When ready to use real backend:

1. **Enable Backend**
   ```env
   VITE_USE_PACS_BACKEND=true
   VITE_PACS_SERVICE_URL=http://localhost:8001
   ```

2. **Data Migration** (optional)
   ```javascript
   // Export localStorage data
   const studies = getAllStudies();
   const series = getSeriesByStudyUID(studyUID);
   const instances = getInstancesBySeriesUID(seriesUID);
   
   // Upload to backend
   for (const instance of instances) {
     const file = getFileByInstanceId(instance.id);
     // Convert base64 back to File
     // Upload to backend
   }
   ```

3. **Clear Local Storage**
   ```javascript
   clearAllStorage();
   ```

## Best Practices

1. **File Size**: Keep DICOM files small (<500KB each)
2. **Batch Upload**: Upload 5-10 files at a time
3. **Regular Cleanup**: Clear old studies weekly
4. **Monitor Storage**: Check stats before upload
5. **User Feedback**: Show storage warnings
6. **Error Handling**: Catch quota exceeded errors
7. **Data Validation**: Validate DICOM metadata
8. **Backup**: Export important studies before clearing

## Future Enhancements

1. **IndexedDB Storage**: Use IndexedDB for larger files
2. **Compression**: Compress base64 data
3. **Lazy Loading**: Load files on-demand
4. **Export/Import**: Export studies as ZIP
5. **Cloud Sync**: Sync to cloud storage
6. **Offline Mode**: Full offline PACS capability
