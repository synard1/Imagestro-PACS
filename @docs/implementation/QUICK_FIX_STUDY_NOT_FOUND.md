# Quick Fix: Study Not Found in ReportEditor

## Problem
After uploading DICOM files successfully, clicking "Create Report" shows error:
```
[ReportEditor] Study not found: 1.2.840.113619.1763238903842.511463
```

## Root Cause
1. DICOM files uploaded and stored in localStorage with `studyUID` (DICOM UID format)
2. StudyListEnhanced displays studies correctly with `id` field
3. ReportEditor only searched in JSON files, not in localStorage
4. Study exists in localStorage but ReportEditor couldn't find it

## Solution Applied

### 1. Updated `studyService.js` - `fetchStudyDetails()`

**Before:**
```javascript
export async function fetchStudyDetails(studyInstanceUid) {
  // Only searched in mock JSON files
  const studies = await getMockStudies();
  const study = studies.find(s => s.study_instance_uid === studyInstanceUid);
  return { study, source: 'mock' };
}
```

**After:**
```javascript
export async function fetchStudyDetails(studyInstanceUid) {
  // Try localStorage first
  const localStudies = getAllStudies();
  const localStudy = localStudies.find(s => 
    s.studyUID === studyInstanceUid || 
    s.id === studyInstanceUid
  );
  
  if (localStudy) {
    // Normalize and return
    return { study: normalizedStudy, source: 'localStorage' };
  }
  
  // Fallback to mock data
  const studies = await getMockStudies();
  const study = studies.find(s => 
    s.study_instance_uid === studyInstanceUid ||
    s.id === studyInstanceUid
  );
  
  return { study, source: 'mock' };
}
```

### 2. Updated `ReportEditor.jsx`

**Before:**
```javascript
useEffect(() => {
  // Only searched in ENHANCED_STUDIES and MOCK_STUDIES JSON files
  let foundStudy = ENHANCED_STUDIES.find(s => 
    s.id?.toString() === studyId || 
    s.studyInstanceUID === studyId
  );
  // ...
}, [studyId]);
```

**After:**
```javascript
useEffect(() => {
  const loadStudy = async () => {
    // Use studyService which checks localStorage first
    const { study: serviceStudy, source } = await fetchStudyDetails(studyId);
    
    if (serviceStudy) {
      // Normalize format
      foundStudy = {
        id: serviceStudy.study_instance_uid || serviceStudy.id,
        patientName: serviceStudy.patient_name || serviceStudy.patientName,
        // ... normalize all fields
      };
    }
    // Fallback to JSON files if not found
  };
  
  loadStudy();
}, [studyId]);
```

## Data Flow

### Upload Flow
```
1. User uploads DICOM via Worklist
   ↓
2. DicomUpload → storeDicomFile()
   ↓
3. localStorage['pacs_studies'] = {
     id: "study_1234567890",
     studyUID: "1.2.840.113619.1763238903842.511463",
     patientName: "Elizabeth Dior",
     ...
   }
   ↓
4. StudyListEnhanced loads from localStorage
   ↓
5. Displays study with id = studyUID
```

### Report Flow
```
1. User clicks "Create Report" on study
   ↓
2. Navigate to /report/{studyUID}
   ↓
3. ReportEditor loads study
   ↓
4. fetchStudyDetails(studyUID)
   ↓
5. Searches localStorage first
   ↓
6. Finds study by studyUID or id
   ↓
7. Normalizes format
   ↓
8. Report editor displays study info
```

## Testing

### Test Upload → Report Flow

1. **Clear localStorage** (for clean test):
   ```javascript
   localStorage.clear();
   ```

2. **Upload DICOM**:
   - Go to Worklist
   - Click "Upload" on any order
   - Select .dcm file
   - Upload successfully

3. **Verify storage**:
   ```javascript
   const studies = JSON.parse(localStorage.getItem('pacs_studies'));
   console.log(studies);
   // Should show array with study object
   ```

4. **View Studies**:
   - Go to Studies page
   - Should see uploaded study
   - Note the study ID

5. **Create Report**:
   - Click "Create Report" on the study
   - Should navigate to `/report/{studyUID}`
   - Report editor should load study info
   - No "Study not found" error

6. **Verify console**:
   ```
   [StudyService] Found study in localStorage: 1.2.840.113619...
   [ReportEditor] Study loaded from localStorage: 1.2.840.113619...
   ```

### Expected Results

✅ Study loads successfully in ReportEditor
✅ Patient info displays correctly
✅ Template auto-selected based on modality
✅ No "Study not found" error

## ID Mapping

### localStorage Study
```json
{
  "id": "study_1731763200000",
  "studyUID": "1.2.840.113619.1731763200000.123456"
}
```

### Normalized for StudyList
```json
{
  "id": "1.2.840.113619.1731763200000.123456",  // Uses studyUID as id
  "study_instance_uid": "1.2.840.113619.1731763200000.123456"
}
```

### ReportEditor Search
```javascript
// Searches by studyId parameter
fetchStudyDetails("1.2.840.113619.1731763200000.123456")

// Finds in localStorage by:
localStudy.studyUID === studyInstanceUid  // ✅ Match!
// OR
localStudy.id === studyInstanceUid  // ✅ Also works
```

## Related Files

- `src/services/studyService.js` - Study data service
- `src/services/dicomStorageService.js` - localStorage management
- `src/pages/reporting/ReportEditor.jsx` - Report editor page
- `src/pages/studies/StudyListEnhanced.jsx` - Studies list page

## Troubleshooting

### Still getting "Study not found"

1. **Check localStorage has data**:
   ```javascript
   localStorage.getItem('pacs_studies')
   ```

2. **Check study ID format**:
   ```javascript
   const studies = JSON.parse(localStorage.getItem('pacs_studies'));
   console.log(studies[0].studyUID);  // Should be DICOM UID format
   ```

3. **Check URL parameter**:
   - URL should be: `/report/1.2.840.113619...`
   - Not: `/report/study_1234567890`

4. **Clear cache and retry**:
   ```javascript
   localStorage.clear();
   // Upload again
   ```

### Study loads but data is wrong

1. **Check normalization**:
   - studyService normalizes field names
   - patient_name → patientName
   - study_description → studyDescription

2. **Check data in localStorage**:
   ```javascript
   const studies = JSON.parse(localStorage.getItem('pacs_studies'));
   console.log(studies[0]);
   // Verify all fields present
   ```

## Future Improvements

1. **Consistent ID format**: Use studyUID everywhere
2. **Better error messages**: Show which source was checked
3. **Fallback chain**: localStorage → Backend → JSON files
4. **Cache management**: Clear old studies automatically
5. **Data validation**: Ensure all required fields present

## Summary

The fix ensures ReportEditor can find studies stored in localStorage by:
1. Updating `fetchStudyDetails()` to check localStorage first
2. Updating ReportEditor to use studyService instead of direct JSON access
3. Proper ID matching (studyUID or id)
4. Field normalization for consistent format

Now the complete workflow works:
**Upload DICOM → Store in localStorage → View in Studies → Create Report → Report loads successfully**
