# Temporary localStorage Disable - Testing Guide

## 🔧 Changes Made

### 1. localStorage Loading DISABLED ❌

**File**: `src/pages/viewer/DicomViewerEnhanced.jsx`

**Lines 63-148**: localStorage handling logic **commented out**

```javascript
// ⚠️ TEMPORARILY DISABLED: localStorage source handling
// Re-enable by uncommenting this block
/* ... localStorage code ... */

// Force use backend/WADO or mock data
console.log('[DicomViewerEnhanced] localStorage DISABLED - using backend/mock data');
```

### 2. Diagnostic Tools ACTIVE ✅

**Still enabled**:
- ✅ DICOM Inspector (`src/utils/dicomInspector.js`)
- ✅ Enhanced console logging
- ✅ Transfer syntax detection
- ✅ Codec requirement checking
- ✅ Web worker status monitoring

---

## 🎯 Current Configuration

### Environment:
```bash
VITE_USE_PACS_BACKEND=false
VITE_PACS_API_URL=http://localhost:8003
```

### Vite Proxy:
```javascript
'/wado-rs': {
  target: 'http://localhost:8003',  // ACTIVE
  changeOrigin: true,
  secure: false,
}
```

### Expected Behavior:
1. ❌ localStorage studies **WON'T** load in viewer
2. ✅ Backend WADO-RS **WILL** be used (via proxy)
3. ✅ Mock data **WILL** be fallback if backend fails
4. ✅ Diagnostic logs **WILL** show transfer syntax info

---

## 🧪 Testing Steps

### Step 1: Clear Browser Cache
```javascript
// In browser console:
localStorage.clear();
location.reload();
```

### Step 2: Start Backend (if using WADO-RS)
```bash
# Ensure backend is running on port 8003
cd pacs-service
python -m uvicorn main:app --host 0.0.0.0 --port 8003 --reload
```

### Step 3: Test Viewer

1. **Open viewer** with a study
2. **Check console** for:

```
[DicomViewerEnhanced] localStorage DISABLED - using backend/mock data
[DicomViewerEnhanced] Study source: backend
[ViewportGrid] Loading images: X images
[ViewportGrid] Inspecting first DICOM: wadouri:/wado-rs/...

📋 DICOM File Inspection
✅ Valid: true
🔄 Transfer Syntax
  UID: 1.2.840.10008.1.2.XXX
  Name: ...
  Requires Codec: ⚠️ YES/NO
```

### Step 4: Check Network Tab

1. Open **DevTools** → **Network**
2. Filter by **"wado-rs"**
3. Verify requests to: `http://localhost:5173/wado-rs/studies/.../series/.../instances/...`
4. Check response:
   - Status: **200 OK**
   - Type: **application/dicom**
   - Size: **should match file size**

### Step 5: Analyze Results

| Scenario | Console Shows | Expected | Action |
|----------|--------------|----------|--------|
| **Backend Works** | Transfer Syntax info | Image displays | ✅ Backend OK |
| **Backend Works** | "Requires Codec: YES" | Image **BLANK** | Check codecs |
| **Backend Works** | "No pixel data" | Image BLANK | Bad DICOM file |
| **Backend Fails** | 404 errors | Falls to mock | Start backend |
| **No logs** | Nothing | Nothing loads | Check imports |

---

## 🔍 Diagnostic Scenarios

### Scenario A: Image Displays ✅

**Console**:
```
✅ Valid: true
Requires Codec: ✅ NO
Pixel Data Present: ✅ YES
[ViewportGrid] ✅ Images loaded successfully
```

**Conclusion**:
- Backend WADO-RS works fine
- Issue was with localStorage implementation
- Can re-enable localStorage after fixing

---

### Scenario B: Image Still Blank ❌

**Console**:
```
✅ Valid: true
Requires Codec: ⚠️ YES
Transfer Syntax: JPEG 2000 Lossless
```

**Conclusion**:
- DICOM uses compressed transfer syntax
- Requires codecs from CDN
- Check Network tab for codec downloads

**Fix**: Use Solution #2 from `DICOM_BLANK_IMAGE_DIAGNOSTIC.md`

---

### Scenario C: Invalid DICOM ⚠️

**Console**:
```
❌ Valid: false
Error: ... (parse error)
```

**Conclusion**:
- Backend serving invalid DICOM
- Or DICOM file corrupted

**Fix**: Check backend WADO-RS implementation

---

## 🔄 Re-enabling localStorage

Once issue identified and fixed:

**Edit**: `src/pages/viewer/DicomViewerEnhanced.jsx`

**Find** (line 63):
```javascript
// ⚠️ TEMPORARILY DISABLED: localStorage source handling
// Re-enable by uncommenting this block
/*
```

**Uncomment** the entire localStorage block (lines 65-141)

**Remove** override logic (lines 143-148):
```javascript
// DELETE THIS:
console.log('[DicomViewerEnhanced] localStorage DISABLED - using backend/mock data');
if (source === 'localStorage') {
  console.log('[DicomViewerEnhanced] Overriding localStorage source to backend');
}
```

**Result**: localStorage functionality restored

---

## 📊 Comparison Matrix

| Feature | localStorage ENABLED | localStorage DISABLED |
|---------|---------------------|----------------------|
| **Upload to localStorage** | ✅ Works | ✅ Still works (stores data) |
| **View from localStorage** | ✅ Loads from cache | ❌ Ignored, uses backend |
| **View from backend** | ✅ Fallback | ✅ Primary |
| **WADO-RS proxy** | ✅ Active | ✅ Active |
| **Diagnostic tools** | ✅ Active | ✅ Active |
| **Mock data fallback** | ✅ Available | ✅ Available |

---

## 🎯 Expected Test Results

### Test 1: Backend Available

**URL hit**: `/wado-rs/studies/.../series/.../instances/...`

**Expected**:
- ✅ File downloads (200 OK)
- ✅ Diagnostic info in console
- ❓ Image may be blank if codec issue
- 📋 Console shows transfer syntax details

### Test 2: Backend NOT Available

**Expected**:
- ❌ 404 errors in Network tab
- ✅ Falls back to mock data
- ✅ Mock images should display (if available)

---

## 💡 Next Steps

### If Image Displays ✅

1. Issue was localStorage implementation
2. Debug localStorage code
3. Fix blob URL creation or DICOM parsing
4. Re-enable localStorage

### If Image Still Blank ❌

1. Issue is NOT localStorage
2. Check diagnostic console output
3. Likely codec or transfer syntax issue
4. Follow `DICOM_BLANK_IMAGE_DIAGNOSTIC.md`

---

## 🚨 Important Notes

1. **localStorage data is NOT deleted** - only viewer ignores it
2. **Upload still stores to localStorage** - can re-enable later
3. **Diagnostic tools remain active** - for troubleshooting
4. **Backend proxy is active** - WADO-RS requests work

---

## 📝 Quick Reference

### Check if localStorage disabled:
```javascript
// Should see in console:
"[DicomViewerEnhanced] localStorage DISABLED - using backend/mock data"
```

### Force backend mode:
```bash
# Already disabled by code change
# No env variable change needed
```

### Check diagnostic output:
```javascript
// Look for in console:
"📋 DICOM File Inspection"
```

---

**Status**: ✅ localStorage DISABLED for testing
**Diagnostic**: ✅ ACTIVE
**Backend Proxy**: ✅ ACTIVE
**Date**: 2025-11-21
