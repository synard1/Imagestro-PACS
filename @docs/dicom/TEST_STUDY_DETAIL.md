# Test Study Detail Loading

## Quick Test in Browser Console

### 1. Check localStorage Data

```javascript
// Get all studies
const studies = JSON.parse(localStorage.getItem('pacs_studies'));
console.log('Studies in localStorage:', studies);

// Get first study
if (studies && studies.length > 0) {
  const study = studies[0];
  console.log('First study:');
  console.log('  Internal ID:', study.id);
  console.log('  Study UID:', study.studyUID);
  console.log('  Patient:', study.patientName);
  console.log('  Modality:', study.modality);
}
```

### 2. Test studyService

```javascript
// Import and test (in browser console with module support)
import { getAllStudies } from './services/dicomStorageService';
import { fetchStudyDetails } from './services/studyService';

// Get all studies
const allStudies = getAllStudies();
console.log('getAllStudies():', allStudies);

// Test fetchStudyDetails with Study UID
const studyUID = allStudies[0]?.studyUID;
console.log('Testing with Study UID:', studyUID);

const result = await fetchStudyDetails(studyUID);
console.log('fetchStudyDetails result:', result);
```

### 3. Manual Navigation Test

```javascript
// Get Study UID from localStorage
const studies = JSON.parse(localStorage.getItem('pacs_studies'));
const studyUID = studies[0]?.studyUID;

// Navigate manually
window.location.href = `/study/${studyUID}`;
```

## Expected Console Output

### When StudyDetail Loads Successfully

```
[StudyDetail] Loading study: 1.2.840.113619.1763238903842.511463
[StudyService] Found study in localStorage: 1.2.840.113619.1763238903842.511463
[StudyDetail] Study loaded from localStorage: 1.2.840.113619.1763238903842.511463
[StudyDetail] Service study data: { id: "1.2.840...", patient_name: "...", ... }
[StudyDetail] Normalized study: { id: "1.2.840...", patientName: "...", ... }
[StudyDetail] Study found and set: { ... }
```

### When Study Not Found

```
[StudyDetail] Loading study: 1.2.840.113619.1763238903842.511463
[StudyService] Loaded from localStorage: 0 studies  ❌ Problem!
[StudyDetail] Study not found in service, trying JSON files
[StudyDetail] Study not found after all attempts: 1.2.840.113619.1763238903842.511463
```

## Troubleshooting Steps

### Step 1: Verify localStorage Has Data

```javascript
const studies = JSON.parse(localStorage.getItem('pacs_studies'));
console.log('Number of studies:', studies?.length || 0);

if (!studies || studies.length === 0) {
  console.error('❌ No studies in localStorage!');
  console.log('Solution: Upload DICOM files first');
}
```

### Step 2: Verify Study UID Format

```javascript
const studies = JSON.parse(localStorage.getItem('pacs_studies'));
const study = studies[0];

console.log('Study UID format check:');
console.log('  studyUID:', study.studyUID);
console.log('  Starts with 1.2.840?', study.studyUID.startsWith('1.2.840'));
console.log('  Length:', study.studyUID.length);

if (!study.studyUID.startsWith('1.2.840')) {
  console.error('❌ Invalid Study UID format!');
}
```

### Step 3: Test studyService Directly

```javascript
// Simulate what StudyDetail does
const studyUID = '1.2.840.113619.1763238903842.511463';

// Import studyService functions
import { fetchStudyDetails } from './services/studyService';

const result = await fetchStudyDetails(studyUID);

if (result.study) {
  console.log('✅ Study found!');
  console.log('Source:', result.source);
  console.log('Study data:', result.study);
} else {
  console.error('❌ Study not found!');
  console.log('Check:');
  console.log('1. localStorage has data');
  console.log('2. Study UID matches');
  console.log('3. studyService is checking localStorage');
}
```

### Step 4: Check studyService Code

```javascript
// Verify studyService is using studyUID as id
import { getAllStudies } from './services/dicomStorageService';

const localStudies = getAllStudies();
console.log('Raw localStorage studies:', localStudies);

// Check if studyService normalizes correctly
import { fetchStudies } from './services/studyService';
const { studies } = await fetchStudies();

console.log('Normalized studies:', studies);
console.log('First study id:', studies[0]?.id);
console.log('First study study_instance_uid:', studies[0]?.study_instance_uid);

// Should be the same!
if (studies[0]?.id === studies[0]?.study_instance_uid) {
  console.log('✅ ID normalization correct');
} else {
  console.error('❌ ID mismatch!');
  console.log('  id:', studies[0]?.id);
  console.log('  study_instance_uid:', studies[0]?.study_instance_uid);
}
```

## Common Issues

### Issue 1: "Study not found" but localStorage has data

**Cause:** studyService not checking localStorage

**Check:**
```javascript
// Open studyService.js
// Line ~120: fetchStudyDetails function
// Should have:
const localStudies = getAllStudies();
const localStudy = localStudies.find(s => 
  s.studyUID === studyInstanceUid || 
  s.id === studyInstanceUid
);
```

**Fix:** Ensure studyService imports and uses `getAllStudies`

### Issue 2: ID mismatch

**Cause:** studyService returns wrong ID format

**Check:**
```javascript
// studyService.js line ~15
// Should return:
return localStudies.map(study => ({
  id: study.studyUID,  // ✅ Use studyUID
  study_instance_uid: study.studyUID,
  // NOT: id: study.id  ❌
}));
```

**Fix:** Change `id: study.id` to `id: study.studyUID`

### Issue 3: Study UID doesn't match

**Cause:** URL has wrong Study UID

**Check:**
```javascript
// Get Study UID from URL
const url = window.location.pathname;
const studyUID = url.split('/study/')[1];
console.log('Study UID from URL:', studyUID);

// Compare with localStorage
const studies = JSON.parse(localStorage.getItem('pacs_studies'));
const match = studies.find(s => s.studyUID === studyUID);

if (match) {
  console.log('✅ Study UID matches');
} else {
  console.error('❌ Study UID not found in localStorage');
  console.log('Available Study UIDs:');
  studies.forEach(s => console.log('  -', s.studyUID));
}
```

## Debug Checklist

Run these checks in order:

1. ✅ localStorage has studies
   ```javascript
   JSON.parse(localStorage.getItem('pacs_studies'))?.length > 0
   ```

2. ✅ Study UID format is correct
   ```javascript
   studies[0].studyUID.startsWith('1.2.840')
   ```

3. ✅ studyService returns correct ID
   ```javascript
   const { studies } = await fetchStudies();
   studies[0].id === studies[0].study_instance_uid
   ```

4. ✅ fetchStudyDetails finds study
   ```javascript
   const result = await fetchStudyDetails(studyUID);
   result.study !== null
   ```

5. ✅ StudyDetail receives study
   ```javascript
   // Check console logs
   // Should see: [StudyDetail] Study found and set
   ```

## Quick Fix Commands

### Clear and Reset

```javascript
// Clear all localStorage
localStorage.clear();

// Reload page
window.location.reload();

// Upload DICOM again
// Then test
```

### Force Reload Study

```javascript
// In StudyDetail page, run:
window.location.reload();
```

### Test with Debug Page

```javascript
// Navigate to debug page
window.location.href = '/debug-storage';

// Click "View Details" button
// Should work if data is correct
```

## Success Criteria

✅ Console shows: `[StudyDetail] Study found and set`
✅ Study details page displays patient info
✅ No "Study not found" error
✅ Series list shows (if available)
✅ Action buttons work (View Images, Create Report)

## Next Steps

If all checks pass but still not working:
1. Clear browser cache
2. Hard refresh (Ctrl+Shift+R)
3. Check for JavaScript errors
4. Verify React DevTools shows study state
5. Check network tab for failed requests
