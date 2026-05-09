# Fix: Study ID Consistency Issue

## Problem
After uploading DICOM files:
- Studies appear in StudyListEnhanced ✅
- Clicking "View Details" → "Study not found" ❌
- Clicking "Create Report" → "Study not found" ❌

## Root Cause

### ID Mismatch in localStorage
```javascript
// localStorage structure
{
  "id": "study_1731763200000",           // Internal ID
  "studyUID": "1.2.840.113619.1731..."   // DICOM UID
}
```

### ID Usage in Components

**studyService.js (BEFORE):**
```javascript
return localStudies.map(study => ({
  id: study.id,  // ❌ Uses internal ID
  study_instance_uid: study.studyUID
}));
```

**StudyListEnhanced:**
```javascript
const normalized = result.studies.map(s => ({
  id: s.study_instance_uid || s.studyInstanceUID || s.id  // Uses study_instance_uid
}));
```

**Result:**
- StudyList displays with `id = "1.2.840.113619.1731..."`
- User clicks → Navigate to `/study/1.2.840.113619.1731...`
- StudyDetail searches for study with that ID
- fetchStudyDetails returns study with `id = "study_1731763200000"` ❌
- Mismatch! Study not found

## Solution

### Use studyUID as Primary ID

**studyService.js (AFTER):**
```javascript
return localStudies.map(study => ({
  id: study.studyUID,  // ✅ Use studyUID as primary ID
  study_instance_uid: study.studyUID,
  _localStorage_id: study.id  // Keep original for reference
}));
```

**fetchStudyDetails (AFTER):**
```javascript
if (localStudy) {
  return {
    study: {
      id: localStudy.studyUID,  // ✅ Consistent ID
      study_instance_uid: localStudy.studyUID,
      _localStorage_id: localStudy.id
    }
  };
}
```

### Update All Components

**StudyDetail.jsx:**
```javascript
// Use studyService instead of direct JSON access
const { study: serviceStudy, source } = await fetchStudyDetails(studyUID);

if (serviceStudy) {
  foundStudy = {
    id: serviceStudy.study_instance_uid || serviceStudy.id,
    studyInstanceUID: serviceStudy.study_instance_uid,
    // ... normalize all fields
  };
}
```

**ReportEditor.jsx:**
```javascript
// Same pattern - use studyService
const { study: serviceStudy, source } = await fetchStudyDetails(studyId);

if (serviceStudy) {
  foundStudy = {
    id: serviceStudy.study_instance_uid || serviceStudy.id,
    // ... normalize
  };
}
```

## Data Flow (FIXED)

```
1. Upload DICOM
   ↓
2. localStorage stores:
   {
     id: "study_1731763200000",
     studyUID: "1.2.840.113619.1731..."
   }
   ↓
3. studyService.getMockStudies() returns:
   {
     id: "1.2.840.113619.1731...",  // ✅ studyUID
     study_instance_uid: "1.2.840.113619.1731..."
   }
   ↓
4. StudyListEnhanced normalizes:
   {
     id: "1.2.840.113619.1731..."  // ✅ Matches!
   }
   ↓
5. User clicks → Navigate to /study/1.2.840.113619.1731...
   ↓
6. StudyDetail calls fetchStudyDetails("1.2.840.113619.1731...")
   ↓
7. Finds in localStorage by studyUID
   ↓
8. Returns study with id = "1.2.840.113619.1731..."  // ✅ Matches!
   ↓
9. Study displays successfully ✅
```

## Key Changes

### 1. studyService.js
- `getMockStudies()`: Use `study.studyUID` as `id`
- `fetchStudyDetails()`: Return `study.studyUID` as `id`
- Keep `_localStorage_id` for reference

### 2. StudyDetail.jsx
- Import `fetchStudyDetails` from studyService
- Use async load pattern
- Normalize field names
- Fallback to JSON files

### 3. ReportEditor.jsx
- Already updated in previous fix
- Uses studyService consistently

## Testing

### Test Complete Flow

1. **Clear localStorage**:
   ```javascript
   localStorage.clear();
   ```

2. **Upload DICOM**:
   - Go to Worklist
   - Click "Upload" on order
   - Upload .dcm file
   - Success message appears

3. **Check localStorage**:
   ```javascript
   const studies = JSON.parse(localStorage.getItem('pacs_studies'));
   console.log(studies[0]);
   // Should have: id, studyUID, patientName, etc.
   ```

4. **View Studies List**:
   - Go to Studies page
   - Should see uploaded study
   - Note the study ID in URL when hovering

5. **View Study Details**:
   - Click on study card
   - Should navigate to `/study/1.2.840.113619...`
   - Study details should load ✅
   - No "Study not found" error

6. **Create Report**:
   - Click "Create Report" button
   - Should navigate to `/report/1.2.840.113619...`
   - Report editor should load ✅
   - Patient info displays correctly

7. **Check Console**:
   ```
   [StudyService] Loaded from localStorage: 1 studies
   [StudyDetail] Study loaded from localStorage: 1.2.840.113619...
   [ReportEditor] Study loaded from localStorage: 1.2.840.113619...
   ```

### Expected Results

✅ Studies list displays correctly
✅ Study details page loads
✅ Report editor loads
✅ All IDs are consistent
✅ No "Study not found" errors

## ID Mapping Reference

### localStorage
```json
{
  "id": "study_1731763200000",
  "studyUID": "1.2.840.113619.1731763200000.123456"
}
```

### studyService Output
```json
{
  "id": "1.2.840.113619.1731763200000.123456",
  "study_instance_uid": "1.2.840.113619.1731763200000.123456",
  "_localStorage_id": "study_1731763200000"
}
```

### StudyListEnhanced
```json
{
  "id": "1.2.840.113619.1731763200000.123456"
}
```

### URL
```
/study/1.2.840.113619.1731763200000.123456
/report/1.2.840.113619.1731763200000.123456
```

## Troubleshooting

### Still getting "Study not found"

1. **Clear localStorage and retry**:
   ```javascript
   localStorage.clear();
   // Upload again
   ```

2. **Check ID in URL**:
   - Should be DICOM UID format: `1.2.840.113619...`
   - Not internal format: `study_1234567890`

3. **Check studyService output**:
   ```javascript
   import { getAllStudies } from './services/dicomStorageService';
   const studies = getAllStudies();
   console.log(studies[0].studyUID);
   ```

4. **Verify normalization**:
   - Open Studies page
   - Check console: `[StudyList] Normalized studies:`
   - Verify `id` field matches `studyUID`

### ID format is wrong

If you see `study_1234567890` in URL:
1. Old data in localStorage
2. Clear and re-upload
3. Check studyService is using `study.studyUID` as `id`

## Related Files

- `src/services/studyService.js` - Study data service
- `src/services/dicomStorageService.js` - localStorage management
- `src/pages/studies/StudyListEnhanced.jsx` - Studies list
- `src/pages/viewer/StudyDetail.jsx` - Study details page
- `src/pages/reporting/ReportEditor.jsx` - Report editor

## Summary

The fix ensures consistent ID usage across all components:
1. **localStorage** stores both `id` (internal) and `studyUID` (DICOM)
2. **studyService** uses `studyUID` as primary `id`
3. **All components** use `studyUID` for navigation and lookup
4. **No more ID mismatches** - everything works end-to-end

Complete workflow now functional:
**Upload → Studies List → View Details → Create Report** ✅
