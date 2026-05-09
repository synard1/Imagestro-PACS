# Troubleshooting DICOM Upload & Storage

## Problem: Upload berhasil tapi Studies tidak muncul

### Diagnosis Steps

1. **Check localStorage data**
   ```javascript
   // Open browser console (F12)
   localStorage.getItem('pacs_studies')
   localStorage.getItem('pacs_series')
   localStorage.getItem('pacs_instances')
   localStorage.getItem('pacs_files')
   ```

2. **Check StudyService logs**
   - Open browser console
   - Look for: `[StudyService] Loaded from localStorage: X studies`
   - Look for: `[StudyList] Loaded X studies from mock`
   - Look for: `[StudyList] Normalized studies:` (should show array)

3. **Check data format**
   ```javascript
   // In console
   const studies = JSON.parse(localStorage.getItem('pacs_studies'));
   console.log(studies);
   // Should show array with: id, studyUID, patientId, patientName, accessionNumber, etc.
   ```

### Common Issues

#### Issue 1: Data tersimpan tapi tidak ter-load

**Symptoms:**
- Console shows: `[StudyService] Loaded from localStorage: 1 studies`
- But Studies page empty

**Cause:**
- Data format tidak match dengan StudyListEnhanced expectations
- Missing required fields (accessionNumber, studyDescription, etc.)

**Solution:**
1. Clear old data:
   ```javascript
   localStorage.removeItem('pacs_studies');
   localStorage.removeItem('pacs_series');
   localStorage.removeItem('pacs_instances');
   localStorage.removeItem('pacs_files');
   ```

2. Upload ulang dengan format baru (sudah diperbaiki)

#### Issue 2: accessionNumber undefined

**Symptoms:**
- Studies muncul tapi accessionNumber kosong atau "undefined"

**Cause:**
- OrderUploadModal tidak mengirim accessionNumber ke DicomUpload
- dicomStorageService tidak menyimpan accessionNumber

**Solution:**
- Sudah diperbaiki di commit terbaru
- Clear localStorage dan upload ulang

#### Issue 3: studyDate format salah

**Symptoms:**
- Studies tidak ter-filter by date
- Date tampil aneh di UI

**Cause:**
- DICOM date format (YYYYMMDD) vs ISO format (YYYY-MM-DD)

**Solution:**
- Format sudah benar di dicomStorageService (YYYYMMDD)
- StudyListEnhanced harus handle both formats

#### Issue 4: Studies muncul tapi tidak bisa di-click

**Symptoms:**
- Studies card tampil
- Click tidak navigate ke detail

**Cause:**
- study_instance_uid tidak match dengan routing

**Solution:**
- Check normalized data has correct `id` field
- Should be: `s.study_instance_uid || s.studyInstanceUID || s.id`

### Testing Checklist

- [ ] Upload DICOM file dari Worklist
- [ ] Check console: "Mock upload success - stored in localStorage"
- [ ] Check localStorage has data
- [ ] Go to Studies page
- [ ] Check console: "Loaded from localStorage: X studies"
- [ ] Check console: "Normalized studies:" shows array
- [ ] Studies should appear in grid/table
- [ ] Click study should navigate to detail

### Debug Commands

```javascript
// Check storage stats
import { getStorageStats } from './services/dicomStorageService';
console.log(getStorageStats());

// Check all studies
import { getAllStudies } from './services/dicomStorageService';
console.log(getAllStudies());

// Check specific study
import { getStudyById } from './services/dicomStorageService';
console.log(getStudyById('study_1234567890'));

// Clear all (for testing)
import { clearAllStorage } from './services/dicomStorageService';
clearAllStorage();
```

### Manual Test Procedure

1. **Clear existing data**
   - Open browser console
   - Run: `localStorage.clear()`
   - Refresh page

2. **Upload test file**
   - Go to Worklist
   - Click "Upload" on any order
   - Select a .dcm file
   - Click "Upload 1 File"
   - Wait for success message

3. **Verify storage**
   - Open console
   - Run: `JSON.parse(localStorage.getItem('pacs_studies'))`
   - Should show array with 1 study object
   - Check all fields present: id, studyUID, patientId, patientName, accessionNumber, studyDate, modality, studyDescription

4. **Check Studies page**
   - Navigate to Studies
   - Should see 1 study card
   - Check all fields display correctly
   - Try clicking the card

5. **Check filters**
   - Try search by patient name
   - Try filter by modality
   - Try date range filter

### Storage Manager Tool

Use the Storage Manager component to inspect and manage localStorage:

1. **Create route** (if not exists):
   ```javascript
   // In App.jsx
   import StorageManagerPage from './pages/StorageManagerPage';
   
   <Route path="/storage-manager" element={<StorageManagerPage />} />
   ```

2. **Navigate to** `/storage-manager`

3. **Features:**
   - View storage stats (studies, series, instances, size)
   - List all stored studies
   - Delete individual studies
   - Clear all storage
   - View raw data for debugging

### Expected Data Structure

**Study in localStorage:**
```json
{
  "id": "study_1731763200000",
  "studyUID": "1.2.840.113619.1731763200000.123456",
  "patientId": "10000001",
  "patientName": "John Doe",
  "accessionNumber": "ACC001",
  "studyDate": "20241116",
  "studyTime": "140530",
  "modality": "CT",
  "studyDescription": "CT Chest",
  "orderId": "order_123",
  "numberOfSeries": 1,
  "numberOfInstances": 1,
  "createdAt": "2024-11-16T14:05:30.123Z"
}
```

**Normalized for StudyListEnhanced:**
```json
{
  "id": "study_1731763200000",
  "patientName": "John Doe",
  "patientId": "10000001",
  "accessionNumber": "ACC001",
  "studyDescription": "CT Chest",
  "studyDate": "20241116",
  "studyTime": "140530",
  "modality": "CT",
  "status": "completed",
  "numberOfSeries": 1,
  "numberOfInstances": 1
}
```

### Known Limitations

1. **Storage Size**: Browser localStorage limited to ~10MB
2. **File Size**: Large DICOM files (>2MB) may fail to convert to base64
3. **Performance**: Many files (>50) may slow down page load
4. **Persistence**: Data cleared when browser cache cleared
5. **Sharing**: Data not shared between browsers/devices

### Recommendations

1. **Small Files**: Use compressed DICOM files (<500KB)
2. **Few Studies**: Keep <10 studies in storage
3. **Regular Cleanup**: Clear old studies weekly
4. **Monitor Size**: Check storage stats before upload
5. **Backup**: Export important studies before clearing

### Migration to Backend

When backend is ready:

1. Set `VITE_USE_PACS_BACKEND=true`
2. Data will automatically load from backend
3. localStorage data will be ignored
4. Can clear localStorage safely

### Contact Support

If issues persist:
1. Export localStorage data
2. Check browser console for errors
3. Provide steps to reproduce
4. Include browser version and OS
