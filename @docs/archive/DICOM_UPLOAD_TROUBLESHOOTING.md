# 🏥 DICOM File Upload - Troubleshooting Guide

## 🔍 Common Issues & Solutions

### ❌ Problem: "File type not allowed" error untuk file .dcm

**Possible Causes**:
1. MIME type file DICOM tidak dikenali oleh browser
2. File DICOM memiliki MIME type `application/octet-stream` atau kosong
3. Extension file bukan `.dcm` atau `.dicom`

**Solutions**:

#### ✅ Solution 1: Check File Extension

File DICOM harus memiliki extension `.dcm` atau `.dicom`:

```bash
# Good ✅
patient_ct_scan.dcm
mri_brain.dcm
xray_chest.dicom

# Bad ❌
patient_scan.dat
image.bin
file
```

#### ✅ Solution 2: Check Browser Console

1. Buka Developer Tools (F12)
2. Pilih tab **Console**
3. Coba upload file
4. Lihat log detail:

```javascript
[Upload] File validation failed:
{
  filename: "scan.dcm",
  mimeType: "application/octet-stream",  // ← Check this
  extension: ".dcm",
  category: "exam_result",
  size: 5242880
}
```

#### ✅ Solution 3: Verify DICOM File

Pastikan file adalah DICOM valid:

```bash
# Using dcmdump (DICOM Toolkit)
dcmdump scan.dcm | head -20

# Should show DICOM header
# (0002,0000) UL 194    # FileMetaInformationGroupLength
# (0002,0001) OB 00\01  # FileMetaInformationVersion
# (0002,0002) UI [1.2.840.10008.5.1.4.1.1.2]  # MediaStorageSOPClassUID
```

#### ✅ Solution 4: Check Error Message

Setelah update, error message sekarang lebih detail:

```
❌ Upload failed: scan.dcm: File type "application/octet-stream"
with extension ".dcm" is not allowed for category "exam_result"
(Type: application/octet-stream, Size: 5.0 MB)
```

### ✅ Fixes Implemented

#### 1. Extension-Based Fallback Validation

```javascript
// Old behavior (STRICT)
if (!isTypeAllowed(file.type, allowedTypes)) {
  return error  // ❌ Rejected all DICOM with unknown MIME type
}

// New behavior (LENIENT)
const isTypeValid = this.isTypeAllowed(file.type, allowedTypes)
const isExtensionValid = this.isExtensionAllowedForCategory(ext, category)

if (isTypeValid || isExtensionValid) {
  return valid  // ✅ Accept if extension is valid
}
```

#### 2. Special DICOM MIME Type Handling

```javascript
// Accept common DICOM MIME types
if (allowedTypes.includes('application/dicom') ||
    allowedTypes.includes('image/dicom+jpeg') ||
    allowedTypes.includes('image/dicom+rle')) {

  // Also accept generic types for DICOM files
  if (mimeType === 'application/octet-stream' ||
      mimeType === '' ||
      !mimeType) {
    return true  // ✅ Accept DICOM regardless of MIME type
  }
}
```

#### 3. Detailed Error Logging

```javascript
// Console logs now show:
logger.warn('[Upload] File validation failed:', {
  filename: file.name,
  mimeType: file.type,        // Actual MIME type from browser
  extension: ext,             // File extension
  category: category,         // Upload category
  size: file.size            // File size in bytes
})
```

---

## 🧪 Testing DICOM Upload

### Test Case 1: Valid DICOM File

**File**: `ct_scan_head.dcm`
**MIME Type**: `application/dicom`
**Expected**: ✅ Upload success

```
✅ Successfully uploaded 1 file(s)
```

### Test Case 2: DICOM with Generic MIME Type

**File**: `mri_brain.dcm`
**MIME Type**: `application/octet-stream`
**Expected**: ✅ Upload success (accepted by extension)

```
[Upload] File accepted by extension despite MIME type:
{
  filename: "mri_brain.dcm",
  mimeType: "application/octet-stream",
  extension: ".dcm",
  category: "exam_result"
}

✅ Successfully uploaded 1 file(s)
```

### Test Case 3: Invalid Extension

**File**: `scan.dat`
**MIME Type**: `application/octet-stream`
**Expected**: ❌ Upload rejected

```
❌ Upload failed: scan.dat: File type "application/octet-stream"
with extension ".dat" is not allowed for category "exam_result"
```

### Test Case 4: Multiple DICOM Files

**Files**:
- `ct_001.dcm` (MIME: `application/dicom`)
- `ct_002.dcm` (MIME: `application/octet-stream`)
- `ct_003.dcm` (MIME: empty)

**Expected**: ✅ All 3 files uploaded

```
✅ Successfully uploaded 3 file(s)
```

---

## 🔧 Debug Workflow

### Step 1: Open Browser Console

```
Chrome/Edge: F12 → Console tab
Firefox: F12 → Console tab
Safari: Cmd+Option+C
```

### Step 2: Enable Verbose Logging

```javascript
// In browser console, set log level
localStorage.setItem('VITE_LOG_LEVEL', 'debug')
```

### Step 3: Try Upload

Drag DICOM file ke upload area dan lihat console log:

```
[UploadService] Uploading 1 files to order: o-1001

[Upload] File accepted by extension despite MIME type:
{
  filename: "scan.dcm",
  mimeType: "application/octet-stream",
  extension: ".dcm",
  category: "exam_result"
}

[UploadService] Successfully uploaded: scan.dcm
```

### Step 4: Check Network Tab

1. Buka tab **Network**
2. Filter: `XHR` atau `Fetch`
3. Look for: `POST /api/orders/:id/files`
4. Check:
   - **Request Headers**: `Content-Type: multipart/form-data`
   - **Request Payload**: File binary data
   - **Response**: `201 Created` dengan file metadata

### Step 5: Verify Server

```bash
# Check server logs
npm run server:upload

# Look for:
[File Upload] 1 file(s) uploaded to order o-1001

# Check file stored
ls -lh server-data/files/
# -rw-r--r-- 1 user group 5.0M Nov 04 12:00 1730724567890-abc-scan.dcm
```

---

## 📊 Supported DICOM MIME Types

| MIME Type | Description | Support |
|-----------|-------------|---------|
| `application/dicom` | Standard DICOM | ✅ Full |
| `image/dicom+jpeg` | JPEG compressed DICOM | ✅ Full |
| `image/dicom+rle` | RLE compressed DICOM | ✅ Full |
| `application/octet-stream` | Generic binary | ✅ Via extension |
| Empty/Unknown | No MIME type | ✅ Via extension |

---

## 🔍 File Inspection Tools

### 1. Check DICOM Header

```bash
# Install DICOM Toolkit
# Ubuntu/Debian
sudo apt-get install dcmtk

# macOS
brew install dcmtk

# Windows
# Download from: https://dicom.offis.de/dcmtk.php.en

# Check DICOM file
dcmdump scan.dcm | head -50
```

### 2. Check File Type

```bash
# Linux/macOS
file scan.dcm
# Output: scan.dcm: DICOM medical imaging data

# Check MIME type
file --mime-type scan.dcm
# Output: scan.dcm: application/dicom
```

### 3. Browser File API

```javascript
// In browser console
const input = document.createElement('input')
input.type = 'file'
input.accept = '.dcm'
input.onchange = (e) => {
  const file = e.target.files[0]
  console.log({
    name: file.name,
    type: file.type,      // MIME type
    size: file.size,
    lastModified: file.lastModified
  })
}
input.click()
```

---

## 🚨 Known Issues

### Issue 1: Safari MIME Type Detection

**Problem**: Safari sometimes reports DICOM files as `application/octet-stream`

**Solution**: ✅ Fixed - Extension-based fallback validation

### Issue 2: Large DICOM Files (>100MB)

**Problem**: Upload timeout or memory issues

**Solution**:
```javascript
// Increase timeout
const UPLOAD_TIMEOUT = 5 * 60 * 1000  // 5 minutes

// Or implement chunked upload (future enhancement)
```

### Issue 3: DICOMDIR Files

**Problem**: DICOMDIR (directory files) not supported

**Solution**: Upload individual DICOM instances, not DICOMDIR

---

## 📝 Checklist for DICOM Upload

Before reporting an issue, verify:

- [ ] File has `.dcm` or `.dicom` extension
- [ ] File size is under 100MB
- [ ] File is a valid DICOM file (check with dcmdump)
- [ ] Browser console shows no errors
- [ ] Server is running (`npm run server:upload`)
- [ ] Order exists and is in editable state
- [ ] User has upload permissions

---

## 🆘 Still Not Working?

### Collect Debug Information

```javascript
// In browser console
const debugInfo = {
  browser: navigator.userAgent,
  file: {
    name: file.name,
    type: file.type,
    size: file.size,
    extension: file.name.split('.').pop()
  },
  category: 'exam_result',
  orderId: 'o-1001',
  timestamp: new Date().toISOString()
}

console.log('Debug Info:', JSON.stringify(debugInfo, null, 2))
```

### Check Server Logs

```bash
# Terminal running server
npm run server:upload

# Look for errors:
[File Upload] Error: ...
```

### Contact Support

Provide:
1. Debug info (from above)
2. Browser console screenshot
3. Server logs
4. Sample DICOM file (if possible)

---

## ✅ Expected Behavior (After Fix)

### Scenario 1: Standard DICOM File

```
File: ct_head.dcm
MIME: application/dicom
Extension: .dcm

Result: ✅ Upload success immediately
Log: "File type validated successfully"
```

### Scenario 2: DICOM with Unknown MIME

```
File: mri_brain.dcm
MIME: application/octet-stream
Extension: .dcm

Result: ✅ Upload success via extension fallback
Log: "File accepted by extension despite MIME type"
```

### Scenario 3: Invalid File

```
File: not_dicom.txt
MIME: text/plain
Extension: .txt

Result: ❌ Upload rejected
Error: "File type 'text/plain' with extension '.txt' is not allowed"
```

---

## 🎓 Understanding the Fix

### Before Fix

```javascript
// ❌ OLD: Rejected DICOM with unknown MIME type
if (file.type !== 'application/dicom') {
  reject("File type not allowed")
}
```

### After Fix

```javascript
// ✅ NEW: Multi-layer validation
const isTypeValid = validateMimeType(file.type)
const isExtensionValid = validateExtension(file.name)

if (isTypeValid || isExtensionValid) {
  accept()  // Pass if EITHER is valid
} else {
  reject("Neither MIME type nor extension is valid")
}
```

### Why This Works

1. **Browser Limitation**: Browsers can't always detect DICOM MIME type correctly
2. **Extension Fallback**: We trust `.dcm` extension as valid DICOM indicator
3. **Safe Approach**: Still validate dangerous extensions separately
4. **Best of Both**: Get both type safety AND flexibility

---

## 📚 References

- [DICOM Standard](https://www.dicomstandard.org/)
- [DICOM MIME Types](https://www.iana.org/assignments/media-types/media-types.xhtml#application)
- [File API Specification](https://w3c.github.io/FileAPI/)
- [DCMTK Tools](https://dicom.offis.de/dcmtk.php.en)

---

**Last Updated**: 2024-11-04
**Status**: ✅ Fixed and Tested
**Version**: 1.1.0
