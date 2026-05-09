# DICOM Tag Edit Fix - Using dcmjs

## Problem
Modified DICOM tags gagal tersimpan dengan benar. File hasil modifikasi corrupt atau tags tidak berubah.

## Root Cause
Menggunakan pendekatan **byte-level editing** dengan `dicom-parser` yang hanya untuk **read-only**:
```javascript
// ❌ WRONG: Byte-level editing (unreliable)
const modifiedBytes = new Uint8Array(bytes);
for (let i = 0; i < valueBytes.length; i++) {
  modifiedBytes[element.dataOffset + i] = valueBytes[i];
}
```

Masalah dengan pendekatan ini:
1. **DICOM structure complex** - Tidak hanya data, ada metadata, sequences, dll
2. **Length fields** - Perlu update length fields di berbagai level
3. **Encoding issues** - Character set, VR encoding, padding rules
4. **No validation** - Tidak ada validasi struktur DICOM

## Solution
Menggunakan **dcmjs** library yang proper untuk read/write DICOM:

### 1. Install dcmjs
```bash
npm install dcmjs
```

### 2. Rewrite dicomTagService.js
```javascript
import dcmjs from 'dcmjs';

const { DicomMetaDictionary, DicomDict } = dcmjs.data;

// Parse DICOM
const dicomDict = DicomMetaDictionary.naturalizeDataset(
  DicomDict.read(bytes.buffer)
);

// Modify tags by keyword
dicomDict['PatientName'] = 'New Name';
dicomDict['AccessionNumber'] = 'ACC123456';

// Write back to DICOM
const denaturalized = DicomMetaDictionary.denaturalizeDataset(dicomDict);
const modifiedBytes = DicomDict.write(denaturalized);
```

### 3. Tag Hex to Keyword Mapping
```javascript
const tagMap = {
  'x00100010': 'PatientName',
  'x00100020': 'PatientID',
  'x00100030': 'PatientBirthDate',
  'x00100040': 'PatientSex',
  'x00080050': 'AccessionNumber',
  'x00081030': 'StudyDescription',
  'x0008103e': 'SeriesDescription',
  'x00080090': 'ReferringPhysicianName',
  'x00200010': 'StudyID',
  // ... etc
};
```

## Comparison with dicom-web-meta-editor

### Python (pydicom) - Reference Implementation
```python
from pydicom.datadict import tag_for_keyword, dictionary_VR

def _set_keyword(ds: Dataset, keyword: str, value):
    tg = tag_for_keyword(keyword)
    if tg is None:
        return
    try:
        if tg in ds:
            ds[tg].value = value
        else:
            vr = dictionary_VR(tg)
            ds.add_new(tg, vr, value)
    except Exception:
        # Fallback to string
        ds[tg].value = str(value)

# Save
ds.save_as(out_path, write_like_original=False)
```

### JavaScript (dcmjs) - Our Implementation
```javascript
// Parse - Correct API
const dicomData = dcmjs.data.DicomMessage.readFile(bytes.buffer);
const dataset = dcmjs.data.DicomMetaDictionary.naturalizeDataset(dicomData.dict);

// Modify
dataset[keyword] = value;

// Save
const denaturalized = dcmjs.data.DicomMetaDictionary.denaturalizeDataset(dataset);
const part10Buffer = dicomData.write();
```

## Benefits

### ✅ Proper DICOM Handling
- Automatic length field updates
- Correct VR encoding
- Proper padding (space for strings, null for binary)
- Sequence handling

### ✅ Validation
- dcmjs validates DICOM structure
- Prevents corrupt files
- Handles edge cases

### ✅ Flexibility
- Can add new tags (not just modify existing)
- Handles all VR types correctly
- Supports sequences and nested structures

### ✅ Maintainability
- Standard library approach
- Well-documented API
- Active community support

## Testing

### Test Case 1: Modify Existing Tag
```javascript
editedTags = {
  'x00080050': 'ACC123456789'  // Accession Number
};
// ✅ Should work: Tag exists, value valid
```

### Test Case 2: Long Value
```javascript
editedTags = {
  'x00100010': 'Very Long Patient Name That Exceeds Normal Length'
};
// ✅ Should work: dcmjs handles length properly
```

### Test Case 3: Multiple Tags
```javascript
editedTags = {
  'x00100010': 'John Doe',
  'x00100020': 'PAT123',
  'x00080050': 'ACC456',
  'x00081030': 'CT Chest with Contrast'
};
// ✅ Should work: All tags modified correctly
```

### Test Case 4: Special Characters
```javascript
editedTags = {
  'x00100010': 'José García'  // Accented characters
};
// ✅ Should work: dcmjs handles character encoding
```

## Files Modified
- `src/services/dicomTagService.js` - Complete rewrite using dcmjs
- `package.json` - Added dcmjs dependency

## References
- dcmjs: https://github.com/dcmjs-org/dcmjs
- pydicom (reference): https://pydicom.github.io/
- dicom-web-meta-editor: Local reference implementation

## Migration Notes

### Before (dicom-parser)
```javascript
// ❌ Byte-level editing
const valueBytes = new TextEncoder().encode(newValue);
for (let i = 0; i < valueBytes.length; i++) {
  modifiedBytes[element.dataOffset + i] = valueBytes[i];
}
```

### After (dcmjs)
```javascript
// ✅ Proper DICOM editing - Correct API
const dicomData = dcmjs.data.DicomMessage.readFile(bytes.buffer);
const dataset = dcmjs.data.DicomMetaDictionary.naturalizeDataset(dicomData.dict);
dataset[keyword] = newValue;
const part10Buffer = dicomData.write();
```

## Next Steps
1. ✅ Install dcmjs
2. ✅ Rewrite dicomTagService.js
3. 🔄 Test with real DICOM files
4. 🔄 Verify exported files can be opened in DICOM viewers
5. 🔄 Test with various tag types (PN, LO, SH, DA, TM, etc.)
