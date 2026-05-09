# DICOM Tag Validation Fix

## Problem
Error saat edit Accession Number: "Value too long! Maximum 8 characters allowed. Your value: 10 characters."

## Root Cause
Validasi tidak mengikuti standar DICOM dan praktis limits yang benar. Accession Number (0008,0050) memiliki VR (Value Representation) tipe **SH (Short String)** dengan:
- **DICOM Standard**: 16 karakter
- **AWS HealthImaging API**: 256 karakter (praktis limit)

## Solution
Implementasi validasi berdasarkan kombinasi DICOM standard dan AWS HealthImaging praktis limits:

### Tag-Specific Limits (AWS HealthImaging + DICOM)
| Tag | Name | VR | DICOM Std | AWS Limit | Used |
|-----|------|----|-----------|-----------|----- |
| 0008,0050 | Accession Number | SH | 16 | 256 | **256** |
| 0010,0010 | Patient Name | PN | 64 | 256 | **256** |
| 0010,0020 | Patient ID | LO | 64 | 256 | **256** |
| 0010,0030 | Patient Birth Date | DA | 8 | 18 | **18** |
| 0010,0040 | Patient Sex | CS | 16 | 16 | **16** |
| 0008,1030 | Study Description | LO | 64 | 256 | **256** |
| 0008,103E | Series Description | LO | 64 | 64 | **64** |
| 0020,0010 | Study ID | SH | 16 | 256 | **256** |
| 0008,0020 | Study Date | DA | 8 | 18 | **18** |
| 0008,0030 | Study Time | TM | 16 | 28 | **28** |
| 0020,000D | Study Instance UID | UI | 64 | 256 | **256** |
| 0020,000E | Series Instance UID | UI | 64 | 256 | **256** |

### VR Type Limits (DICOM Standard - Fallback)
| VR Code | Description | Max Length |
|---------|-------------|------------|
| SH | Short String | 16 chars |
| LO | Long String | 64 chars |
| PN | Person Name | 64 chars per component |
| ST | Short Text | 1024 chars |
| LT | Long Text | 10240 chars |
| CS | Code String | 16 chars |
| IS | Integer String | 12 chars |
| DS | Decimal String | 16 chars |
| DA | Date | 8 chars |
| TM | Time | 16 chars |
| UI | Unique Identifier | 64 chars |

### Changes Made

1. **Added tag-specific limits** - Priority untuk tags yang sering digunakan dengan AWS HealthImaging limits
2. **Enhanced `getVRMaxLength()` function**:
   - Check tag-specific limit first (AWS HealthImaging)
   - Fallback to DICOM VR standard limit
   - Returns practical maximum that works with modern PACS systems
3. **Enhanced `handleEditTag()` validation**:
   - Check against practical limit first
   - Then check against allocated space in file
   - Show clear error messages with reference
4. **Improved UI display**:
   - Show VR max length in table when it's less than allocated space
   - Display practical max in edit dialog
   - Clear messaging about AWS HealthImaging compatibility

### Example: Accession Number (0008,0050)
- **VR Type**: SH (Short String)
- **DICOM Standard Max**: 16 characters
- **AWS HealthImaging Max**: 256 characters
- **Practical Max Used**: **256 characters** ✅
- **Allocated Space**: May vary per file (e.g., 8, 16, or more bytes)
- **Effective Max**: Minimum of (practical limit, allocated space)

## Benefits
1. ✅ Compatible dengan AWS HealthImaging API
2. ✅ Lebih fleksibel untuk data real-world
3. ✅ Tetap comply dengan DICOM standard untuk tags yang tidak ada override
4. ✅ Clear error messages dengan referensi

## References
- DICOM Standard: https://dicom.innolitics.com/ciods/enhanced-sr/general-study
- AWS HealthImaging API: https://docs.aws.amazon.com/healthimaging/latest/APIReference/API_DICOMTags.html

## Files Modified
- `src/components/dicom/DicomTagViewer.jsx`

## Testing
1. Open DICOM Tag Viewer
2. Try to edit Accession Number with 10 characters - ✅ should work (within 256 char limit)
3. Try to edit with 100 characters - ✅ should work (within 256 char limit)
4. Try to edit with 257+ characters - ❌ should show practical limit violation error
5. Try to edit with value longer than allocated space - should offer truncate or export options
