# DICOM Blank Image - Comprehensive Diagnostic Guide

## 🔬 Problem Statement

**Symptom**: DICOM file downloads successfully but image appears blank/black in viewer

**URL Pattern**: `http://localhost:5173/wado-rs/studies/.../series/.../instances/...`

**Status**: File download ✅ SUCCESS | Image display ❌ BLANK/BLACK

---

## 🎯 Root Cause Discovery

### Issue #1: Vite Proxy Configuration ⚠️

**Location**: `vite.config.js` lines 15-19

```javascript
'/wado-rs': {
  target: 'http://localhost:8003',  // Backend PACS server
  changeOrigin: true,
  secure: false,
}
```

**Impact**:
- ✅ Proxy is ACTIVE even when `VITE_USE_PACS_BACKEND=false`
- 🔄 ALL `/wado-rs/` requests are redirected to backend (localhost:8003)
- 📥 File download SUCCESS (backend serves DICOM)
- ❌ Image display FAILS (Cornerstone parsing issue)

---

### Issue #2: DICOM Parsing / Transfer Syntax

**Potential Causes**:

#### A. Transfer Syntax Requires Codec 🔧

Some DICOM files use **compressed** transfer syntaxes that require special codecs:

| Transfer Syntax | Requires Codec? |
|----------------|-----------------|
| Implicit VR Little Endian | ✅ NO |
| Explicit VR Little Endian | ✅ NO |
| JPEG Baseline | ⚠️ **YES** |
| JPEG Lossless | ⚠️ **YES** |
| JPEG 2000 | ⚠️ **YES** |
| JPEG-LS | ⚠️ **YES** |
| RLE Lossless | ⚠️ **YES** |

**If codec required but not loaded** → **BLANK IMAGE**

#### B. Codec Loading from CDN Failed 🌐

**Location**: `DicomViewerEnhanced.jsx` line 270

```javascript
codecsPath: 'https://unpkg.com/@cornerstonejs/dicom-image-loader@1.80.4/dist/codecs/'
```

**Potential Issues**:
- Network blocked (firewall, corporate proxy)
- CDN unavailable
- CORS error
- Version mismatch

#### C. Web Workers Not Initialized 👷

Cornerstone uses web workers to decode DICOM files. If workers fail to initialize:
- Compressed images won't decode
- Result: **BLANK IMAGE**

---

## 🔍 Diagnostic Tools (Auto-Enabled)

### Tool #1: DICOM Inspector

**File**: `src/utils/dicomInspector.js`

**Features**:
- ✅ Parse DICOM metadata
- ✅ Detect transfer syntax
- ✅ Check if codec required
- ✅ Validate pixel data presence
- ✅ Calculate expected vs actual size
- ✅ Auto-diagnostic messages

**Auto-runs** when loading images in viewer.

### Tool #2: Enhanced Console Logging

**Locations**:
- `DicomViewerEnhanced.jsx` - Cornerstone init, request logging
- `ViewportGridEnhanced.jsx` - Image loading, DICOM inspection

**Output Format**:
```
[DicomViewerEnhanced] Study source: localStorage
[ViewportGrid] Loading images: 5 images
[ViewportGrid] Inspecting first DICOM: wadouri:blob:...
[ViewportGrid] First DICOM blob size: 512.34 KB

📋 DICOM File Inspection
✅ Valid: true
🔄 Transfer Syntax
  UID: 1.2.840.10008.1.2.4.90
  Name: JPEG 2000 Lossless
  Requires Codec: ⚠️ YES
🖼️ Image Info
  Dimensions: 512 x 512
  Bits Allocated: 16
  Samples Per Pixel: 1
  Photometric: MONOCHROME2
💾 Pixel Data
  Present: ✅ YES
  Size: 245.67 KB
📦 File Size: 246.12 KB

⚠️ Potential Issue
  Issue: Compressed Transfer Syntax Requires Codec
  Cause: Transfer Syntax: JPEG 2000 Lossless
  Solution: Ensure web workers and codecs loaded from CDN
```

### Tool #3: Web Worker Status Check

**Auto-runs** 1 second after initialization:

```
[DicomViewerEnhanced] Web workers status:
{
  maxWebWorkers: 8,
  numWebWorkers: 0,  // ⚠️ Should be > 0
  workers: 0
}
```

**If `numWebWorkers: 0`** → Workers failed to initialize → **BLANK IMAGE**

---

## 🧪 Testing Steps

### Step 1: Check Console for Diagnostic Info

1. Open DICOM viewer
2. Open **Browser DevTools** (F12)
3. Go to **Console** tab
4. Look for:
   - `📋 DICOM File Inspection` group
   - Transfer Syntax info
   - Potential Issue warnings

### Step 2: Verify Transfer Syntax

Look for in console:
```
🔄 Transfer Syntax
  Requires Codec: ⚠️ YES
```

**If YES**:
- Check if codecs loaded from CDN
- Check Network tab for codec files (.wasm, .js)
- Verify no CORS errors

### Step 3: Check Web Workers

Look for in console:
```
[DicomViewerEnhanced] Web workers status: { numWebWorkers: 0 }
```

**If 0**:
- Workers failed to initialize
- Check browser console for errors
- Check Network tab for codec downloads

### Step 4: Check Network Tab

1. Open DevTools → **Network** tab
2. Filter by "codecs" or ".wasm"
3. Look for:
   - `openjpeg.js` (for JPEG 2000)
   - `openjpeg.wasm`
   - `charls.js` (for JPEG-LS)
   - Other codec files

**Expected**: Status 200 OK

**If 404 or blocked**: Codecs failed to load → **BLANK IMAGE**

---

## 🔧 Solutions

### Solution #1: Use Uncompressed DICOM Files ✅ **EASIEST**

**If possible**, use DICOM files with uncompressed transfer syntax:
- Implicit VR Little Endian (1.2.840.10008.1.2)
- Explicit VR Little Endian (1.2.840.10008.1.2.1)

**How to convert**:
```bash
# Using dcmtk
dcmconv --write-xfer-little input.dcm output.dcm
```

**Pros**:
- ✅ No codec required
- ✅ Always works
- ✅ Faster loading

**Cons**:
- ❌ Larger file size

---

### Solution #2: Local Codecs (Offline Mode) 🔧

Instead of CDN, use **local codecs**:

**Step 1**: Download codecs
```bash
cd public
mkdir codecs
cd codecs

# Download from unpkg
curl -O https://unpkg.com/@cornerstonejs/dicom-image-loader@1.80.4/dist/codecs/openjpeg.js
curl -O https://unpkg.com/@cornerstonejs/dicom-image-loader@1.80.4/dist/codecs/openjpeg.wasm
curl -O https://unpkg.com/@cornerstonejs/dicom-image-loader@1.80.4/dist/codecs/charls.js
# ... download all codec files
```

**Step 2**: Update codec path in `DicomViewerEnhanced.jsx`
```javascript
// BEFORE:
codecsPath: 'https://unpkg.com/@cornerstonejs/dicom-image-loader@1.80.4/dist/codecs/'

// AFTER:
codecsPath: '/codecs/'  // Local path
```

**Pros**:
- ✅ Works offline
- ✅ No CDN dependency
- ✅ Faster (no network latency)

**Cons**:
- ❌ Requires manual setup
- ❌ Need to manage codec updates

---

### Solution #3: Disable Vite Proxy (Use localStorage Only) 🏠

If you want **pure localStorage mode** without backend:

**Edit `vite.config.js`**:
```javascript
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    open: true,
    proxy: {
      '/api': {
        target: 'http://localhost:8003',
        changeOrigin: true,
        secure: false,
      },
      // ❌ REMOVE or COMMENT OUT '/wado-rs' proxy
      // '/wado-rs': {
      //   target: 'http://localhost:8003',
      //   changeOrigin: true,
      //   secure: false,
      // }
    }
  }
})
```

**Pros**:
- ✅ Forces localStorage usage
- ✅ No backend dependency

**Cons**:
- ❌ Backend WADO-RS won't work (even when enabled)
- ❌ Need to restart dev server

---

### Solution #4: Fix Backend WADO-RS Response 🔧

If backend is serving DICOM but Cornerstone can't parse:

**Check backend WADO-RS implementation**:
1. Verify `Content-Type: application/dicom`
2. Ensure raw DICOM bytes (no JSON wrapper)
3. Check transfer syntax support

**Test with curl**:
```bash
curl -v http://localhost:8003/wado-rs/studies/.../series/.../instances/... > test.dcm

# Verify it's valid DICOM
file test.dcm  # Should say "DICOM medical imaging data"
```

---

## 📊 Decision Tree

```
Image Blank?
│
├─ Console shows "📋 DICOM File Inspection"?
│  ├─ YES → Check "Requires Codec"
│  │  ├─ YES → Check Network tab for codec downloads
│  │  │  ├─ 200 OK → Check "Web workers status"
│  │  │  │  ├─ numWebWorkers > 0 → **UNKNOWN ISSUE** (report bug)
│  │  │  │  └─ numWebWorkers = 0 → **Workers failed** (check browser console)
│  │  │  └─ 404/Error → **Codecs not loaded** → Use Solution #2 (Local Codecs)
│  │  └─ NO → **Should work** → Check pixel data present
│  │     ├─ YES → **UNKNOWN ISSUE** (report bug)
│  │     └─ NO → **No pixel data** → Use different DICOM file
│  └─ NO → **Inspector not running** → Check imports
│
└─ No console logs at all?
   └─ DevTools not open or page not loaded
```

---

## 🎯 Quick Fix Checklist

Use this checklist to diagnose quickly:

- [ ] Open browser DevTools (F12)
- [ ] Go to Console tab
- [ ] Load DICOM in viewer
- [ ] Check for `📋 DICOM File Inspection`
- [ ] Note "Requires Codec" value
- [ ] If YES:
  - [ ] Check Network tab for codec files
  - [ ] Check Web workers status
  - [ ] Apply Solution #2 (Local Codecs) if needed
- [ ] If NO:
  - [ ] Check "Pixel Data Present"
  - [ ] If NO → Use different DICOM file
  - [ ] If YES → Report as unknown issue

---

## 📝 Reporting Issues

If image still blank after following this guide, report with:

**Required Info**:
1. Console output (copy full `📋 DICOM File Inspection` section)
2. Web workers status
3. Network tab screenshot (filter: "codecs")
4. DICOM file source (scanner make/model if known)
5. Transfer Syntax UID

**Example Report**:
```
Image is blank after loading DICOM file.

Console Output:
[Paste DICOM File Inspection output]

Web Workers Status:
{ maxWebWorkers: 8, numWebWorkers: 0, workers: 0 }

Network Tab:
Codec files returned 404

Transfer Syntax:
UID: 1.2.840.10008.1.2.4.90
Name: JPEG 2000 Lossless
```

---

## 🚀 Expected Console Output (Working)

When everything works correctly, you should see:

```
[DicomViewerEnhanced] Cornerstone initialized with codec support
[DicomViewerEnhanced] Using Cornerstone wadouri loader
[DicomViewerEnhanced] Web workers status:
  { maxWebWorkers: 8, numWebWorkers: 8, workers: 8 }

[ViewportGrid] Loading images: 5 images
[ViewportGrid] Inspecting first DICOM: wadouri:blob:...
[ViewportGrid] First DICOM blob size: 512.34 KB

📋 DICOM File Inspection
✅ Valid: true
🔄 Transfer Syntax
  UID: 1.2.840.10008.1.2
  Name: Implicit VR Little Endian (Default)
  Requires Codec: ✅ NO    <-- GOOD!
🖼️ Image Info
  Dimensions: 512 x 512
  Bits Allocated: 16
💾 Pixel Data
  Present: ✅ YES
  Size: 524.29 KB
📦 File Size: 524.58 KB

[ViewportGrid] ✅ Images loaded successfully
```

**Key Indicators**:
- ✅ `Requires Codec: ✅ NO` (or codecs loaded successfully)
- ✅ `Pixel Data Present: ✅ YES`
- ✅ `Web workers: 8` (or > 0)
- ✅ `Images loaded successfully`

---

## 💡 Pro Tips

1. **Use simple DICOM files first**: Test with uncompressed files to rule out codec issues
2. **Check file validity**: Use `dcmdump` or online DICOM validator
3. **Network matters**: Corporate firewalls may block CDN access
4. **Browser matters**: Some browsers have stricter CORS policies
5. **File size**: Large compressed files may timeout on decode

---

## 📚 References

- [Cornerstone Documentation](https://www.cornerstonejs.org/)
- [DICOM Standard](https://www.dicomstandard.org/)
- [Transfer Syntaxes List](https://dicom.nema.org/dicom/2013/output/chtml/part05/chapter_10.html)
- [JPEG 2000 Codec Info](https://github.com/cornerstonejs/cornerstoneWADOImageLoader/tree/master/codecs)

---

**Status**: ✅ **DIAGNOSTIC TOOLS ACTIVE**
**Version**: 1.0
**Date**: 2025-11-21
