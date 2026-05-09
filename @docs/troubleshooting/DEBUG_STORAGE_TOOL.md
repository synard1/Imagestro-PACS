# Debug Storage Tool

## Access the Tool

Navigate to: **`http://localhost:5173/debug-storage`**

## What It Shows

### 1. Storage Statistics
- Number of studies
- Number of series
- Number of instances
- Total storage size (MB)

### 2. Studies List
For each study, you can see:
- Patient Name
- Study Description & Modality
- **Internal ID** (e.g., `study_1731763200000`)
- **Study UID** (e.g., `1.2.840.113619.1731763200000.123456`)
- Accession Number
- Study Date
- Number of series and instances

### 3. Action Buttons
- **Copy Study UID** - Copy DICOM UID to clipboard
- **Copy Internal ID** - Copy internal ID to clipboard
- **View Details** - Navigate to `/study/{studyUID}`
- **Create Report** - Navigate to `/report/{studyUID}`

### 4. Selected Study Details
Click on a study to see:
- Complete study object (JSON)
- All series for that study
- Series details (UID, description, instance count)

### 5. Raw localStorage Data
Expand to see raw data from:
- `pacs_studies`
- `pacs_series`
- `pacs_instances`
- `pacs_files`

## How to Use

### Check if Studies Exist

1. Go to `/debug-storage`
2. Look at "Studies in localStorage" section
3. Should see uploaded studies

**If empty:**
- No studies uploaded yet
- localStorage was cleared
- Upload failed silently

### Verify Study IDs

1. Click on a study
2. Check "Study Object" section
3. Verify fields:
   ```json
   {
     "id": "study_1731763200000",
     "studyUID": "1.2.840.113619.1731763200000.123456",
     "patientName": "John Doe",
     "accessionNumber": "ACC001",
     ...
   }
   ```

### Test Navigation

1. Click "View Details" button
2. Should navigate to `/study/{studyUID}`
3. Check if study loads

**If "Study not found":**
- Copy the Study UID from debug page
- Check console logs
- Verify studyService is searching correctly

### Compare IDs

**What to check:**
1. **Internal ID** (study.id): `study_1731763200000`
2. **Study UID** (study.studyUID): `1.2.840.113619...`
3. **URL parameter**: Should use Study UID
4. **studyService output**: Should use Study UID as `id`

**Correct flow:**
```
localStorage: { id: "study_123", studyUID: "1.2.840..." }
     ↓
studyService: { id: "1.2.840...", study_instance_uid: "1.2.840..." }
     ↓
StudyList: { id: "1.2.840..." }
     ↓
URL: /study/1.2.840...
     ↓
fetchStudyDetails("1.2.840...")
     ↓
Found! ✅
```

## Troubleshooting

### No Studies Showing

**Check:**
1. localStorage has data:
   ```javascript
   localStorage.getItem('pacs_studies')
   ```
2. Upload was successful (check console)
3. No JavaScript errors

**Fix:**
- Upload DICOM again
- Check upload success message
- Refresh debug page

### Study UID vs Internal ID Mismatch

**Problem:**
- URL uses internal ID: `/study/study_1731763200000`
- Should use Study UID: `/study/1.2.840.113619...`

**Fix:**
- Check studyService.js
- Ensure `id: study.studyUID` (not `study.id`)
- Clear localStorage and re-upload

### "Study not found" Error

**Debug steps:**
1. Go to `/debug-storage`
2. Copy Study UID
3. Manually navigate to `/study/{studyUID}`
4. Check console logs:
   ```
   [StudyService] Found study in localStorage: {studyUID}
   [StudyDetail] Study loaded from localStorage: {studyUID}
   ```

**If not found:**
- studyService not checking localStorage
- ID format mismatch
- Study UID doesn't match

### Series/Instances Not Showing

**Check:**
1. Click on study in debug page
2. Look at "Series" section
3. Should show series list

**If empty:**
- Upload didn't create series
- Check `pacs_series` in raw data
- Re-upload DICOM

## Console Commands

### Check localStorage Directly

```javascript
// Get all studies
const studies = JSON.parse(localStorage.getItem('pacs_studies'));
console.log(studies);

// Get specific study
const study = studies[0];
console.log('Internal ID:', study.id);
console.log('Study UID:', study.studyUID);

// Check series
const series = JSON.parse(localStorage.getItem('pacs_series'));
console.log(series);
```

### Test studyService

```javascript
// Import in console (if available)
import { getAllStudies } from './services/dicomStorageService';
const studies = getAllStudies();
console.log(studies);

// Check normalized format
import { fetchStudies } from './services/studyService';
const result = await fetchStudies();
console.log(result.studies);
```

### Clear and Reset

```javascript
// Clear all PACS data
localStorage.removeItem('pacs_studies');
localStorage.removeItem('pacs_series');
localStorage.removeItem('pacs_instances');
localStorage.removeItem('pacs_files');

// Or clear everything
localStorage.clear();
```

## Expected Data Structure

### localStorage Study
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
  "orderId": "o-1001",
  "numberOfSeries": 1,
  "numberOfInstances": 5,
  "createdAt": "2024-11-16T14:05:30.123Z"
}
```

### studyService Output
```json
{
  "id": "1.2.840.113619.1731763200000.123456",
  "study_instance_uid": "1.2.840.113619.1731763200000.123456",
  "patient_id": "10000001",
  "patient_name": "John Doe",
  "accession_number": "ACC001",
  "study_date": "20241116",
  "study_time": "140530",
  "modality": "CT",
  "study_description": "CT Chest",
  "number_of_series": 1,
  "number_of_instances": 5,
  "_localStorage_id": "study_1731763200000"
}
```

## Quick Checks

✅ Studies appear in debug page
✅ Study UID is DICOM format (1.2.840...)
✅ "View Details" button works
✅ "Create Report" button works
✅ Series data exists
✅ No console errors

## Next Steps

If everything looks good in debug page but still not working:

1. **Check studyService.js**:
   - Verify `id: study.studyUID`
   - Not `id: study.id`

2. **Check StudyDetail.jsx**:
   - Uses `fetchStudyDetails()`
   - Normalizes field names correctly

3. **Check ReportEditor.jsx**:
   - Uses `fetchStudyDetails()`
   - Handles localStorage source

4. **Clear and retry**:
   - `localStorage.clear()`
   - Upload DICOM again
   - Check debug page
   - Test navigation

## Support

If issues persist:
1. Take screenshot of debug page
2. Copy raw localStorage data
3. Check console errors
4. Provide steps to reproduce
