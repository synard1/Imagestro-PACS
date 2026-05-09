# 🔍 File Persistence Troubleshooting Guide

## ❌ Problem: File hilang setelah browser refresh

### Symptoms
- ✅ File berhasil diupload (muncul "Successfully uploaded")
- ✅ File muncul di file list setelah upload
- ❌ Setelah refresh browser, file hilang

---

## 🔍 Root Cause Analysis

### Possible Causes

1. **Backend Server Tidak Running**
   - File disimpan ke localStorage
   - Tapi orderId tidak konsisten
   - Atau localStorage corrupted

2. **OrderId Mismatch**
   - Upload menggunakan orderId yang berbeda dari yang di-load
   - Storage key tidak match

3. **LocalStorage Cleared**
   - Browser settings: Clear on exit
   - Incognito mode
   - Storage quota exceeded

4. **Backend API Error**
   - File upload ke backend gagal
   - Fallback ke localStorage tidak bekerja
   - Network timeout

---

## 🛠️ Diagnostic Steps

### Step 1: Check Browser Console

1. Buka Developer Tools (F12)
2. Pilih tab **Console**
3. Upload file dan lihat logs:

```javascript
// Expected logs after upload:
[UploadService] File saved to localStorage: {
  fileId: "file-1730728567890-abc123",
  orderId: "o-1001",           // ← IMPORTANT: Note this ID
  storageKey: "order_files_o-1001",
  totalFiles: 1,
  filename: "scan.dcm"
}

[UploadService] Verification - Total files in storage: 1
```

4. Refresh page dan lihat logs:

```javascript
// Expected logs after refresh:
[OrderForm] Loading files for order: o-1001  // ← Check if same ID
[UploadService] Fetched 1 files from localStorage
[OrderForm] Loaded 1 files: [...]
```

### Step 2: Inspect LocalStorage

#### Using Debug Utility

In browser console:

```javascript
// Show all uploaded files
debugUpload.inspectAll()

// Expected output:
=== UPLOAD FILES DEBUG ===
Total orders with files: 1
Total files: 1
Details: {
  "o-1001": {
    count: 1,
    files: [{
      file_id: "file-1730728567890-abc123",
      filename: "scan.dcm",
      size: 5242880,
      category: "exam_result",
      uploaded_at: "2024-11-04T12:00:00Z",
      hasData: true
    }]
  }
}
```

#### Manual Inspection

1. F12 → Application tab (Chrome) / Storage tab (Firefox)
2. Left sidebar → Local Storage → http://localhost:5174
3. Look for keys starting with `order_files_`
4. Click to inspect value

```json
// Example: order_files_o-1001
[
  {
    "file_id": "file-1730728567890-abc123",
    "filename": "scan.dcm",
    "file_type": "application/octet-stream",
    "file_size": 5242880,
    "category": "exam_result",
    "description": "",
    "uploaded_at": "2024-11-04T12:00:00Z",
    "uploaded_by": "current_user",
    "data": "data:application/octet-stream;base64,...",
    "_local": true
  }
]
```

### Step 3: Check OrderId Consistency

```javascript
// In console after upload
localStorage.getItem('current_order_id')  // Check what's stored

// After refresh, before loading files
console.log('Loading order:', window.location.pathname)
// Should match: /orders/o-1001
```

### Step 4: Check Backend Server Status

```bash
# In terminal, check if server is running
netstat -ano | findstr :3001

# If not running, start it:
npm run server:upload
```

### Step 5: Network Tab Inspection

1. F12 → Network tab
2. Upload file
3. Look for request:
   - **POST** `/api/orders/:id/files`
   - **Status**: 201 (success) or 404/500 (error)

4. If request fails:
   - Check Console for "Falling back to localStorage"
   - Verify backend server is running

---

## ✅ Solutions

### Solution 1: Ensure Backend Server Running

```bash
# Terminal 1: Frontend
npm run dev

# Terminal 2: Backend (IMPORTANT!)
npm run server:upload
```

**Verify server is running**:
```bash
# Check health endpoint
curl http://localhost:3001/api/health

# Expected response:
{
  "status": "healthy",
  "server": "MWL-PACS Data Server (with File Upload)",
  "version": "1.1.0"
}
```

### Solution 2: Verify OrderId in URL

After upload, check URL:
```
http://localhost:5174/orders/o-1001
                                ^^^^^ ← This is your orderId
```

After refresh, URL should remain the same. If it changes, that's the problem!

### Solution 3: Clear and Re-upload

If localStorage is corrupted:

```javascript
// In browser console
debugUpload.clearOrder('o-1001')  // Replace with your order ID

// Or clear all
debugUpload.clearAll()

// Then re-upload files
```

### Solution 4: Check Browser Settings

**Chrome/Edge**:
1. Settings → Privacy → Clear browsing data
2. Make sure "Cookies and site data" is **UNCHECKED** if you want to keep files
3. Or don't use Incognito mode

**Firefox**:
1. Preferences → Privacy → History
2. Set to "Remember history" or "Custom settings"
3. Don't clear data on browser close

### Solution 5: Enable Verbose Logging

```javascript
// In browser console before upload
localStorage.setItem('VITE_LOG_LEVEL', 'debug')

// Refresh page
// Now all logs will show
```

### Solution 6: Use Backend Storage (Recommended)

**Why localStorage fails:**
- Limited to 5-10MB
- Can be cleared by browser
- Not shared across devices
- Incognito mode doesn't persist

**Use backend instead:**

1. Start backend server:
```bash
npm run server:upload
```

2. Enable in API registry:
```javascript
// src/services/api-registry.js
const DEFAULT_REGISTRY = {
  orders: {
    enabled: true,  // ← Set to true
    baseUrl: 'http://localhost:3001'
  }
}
```

3. Refresh app and re-upload files

Files will now be stored in `server-data/files/` directory!

---

## 🔧 Advanced Debugging

### Debug Command Reference

```javascript
// === In Browser Console ===

// 1. Inspect all files
debugUpload.inspectAll()

// 2. Inspect specific order
debugUpload.inspectOrder('o-1001')

// 3. Check storage usage
debugUpload.storageInfo()

// 4. Clear files for order
debugUpload.clearOrder('o-1001')

// 5. Clear all files
debugUpload.clearAll()
```

### Manual localStorage Inspection

```javascript
// Get all keys with uploaded files
Object.keys(localStorage)
  .filter(k => k.startsWith('order_files_'))
  .forEach(k => {
    const files = JSON.parse(localStorage.getItem(k))
    console.log(k, '→', files.length, 'files')
  })

// Get specific order files
const files = JSON.parse(localStorage.getItem('order_files_o-1001'))
console.table(files.map(f => ({
  id: f.file_id,
  name: f.filename,
  size: (f.file_size / 1024).toFixed(1) + ' KB',
  type: f.file_type,
  hasData: !!f.data
})))
```

### Check Component State

```javascript
// React DevTools
// 1. Install React DevTools browser extension
// 2. F12 → Components tab
// 3. Find OrderForm component
// 4. Check state:
//    - orderFiles (should have files array)
//    - form.id (should match URL orderId)
```

---

## 📊 Expected Behavior After Fix

### Scenario 1: With Backend Server

```
1. Start backend: npm run server:upload
2. Upload file → Saved to server-data/files/
3. File metadata → server-data/file-metadata.json
4. Order updated → server-data/orders.json (attachments field)
5. Refresh page → Files loaded from backend ✅
6. Files persist forever ✅
```

### Scenario 2: Without Backend (localStorage)

```
1. Backend not running
2. Upload file → Saved to localStorage
3. localStorage key: order_files_{orderId}
4. Refresh page → Files loaded from localStorage ✅
5. Files persist until:
   - Browser cache cleared
   - Incognito mode closed
   - localStorage manually cleared
```

---

## 🚨 Common Mistakes

### ❌ Mistake 1: Wrong OrderId

```javascript
// Upload to order: o-1001
uploadService.uploadToOrder('o-1001', file)

// But current URL is: /orders/o-1002  ← WRONG!
// Files saved to order o-1001, but trying to load from o-1002
```

**Fix**: Make sure you're on the correct order page!

### ❌ Mistake 2: Backend Not Running

```javascript
// Upload attempt when backend is down
POST http://localhost:3001/api/orders/o-1001/files

// Error: net::ERR_CONNECTION_REFUSED
// Fallback to localStorage ✅

// But user expects files in backend ❌
```

**Fix**: Always start backend server first!

### ❌ Mistake 3: Incognito Mode

```
Incognito/Private mode:
- localStorage cleared when window closes
- Files will disappear! ❌
```

**Fix**: Use normal browsing mode or backend storage!

### ❌ Mistake 4: LocalStorage Quota Exceeded

```javascript
// Upload large file (e.g., 50MB DICOM)
// Error: QuotaExceededError

// localStorage limit: 5-10MB total
// File size after base64 encoding: ~133% of original
```

**Fix**: Use backend storage for large files!

---

## ✅ Verification Checklist

Before reporting issue, verify:

- [ ] Backend server is running (`npm run server:upload`)
- [ ] Server health endpoint works (`curl http://localhost:3001/api/health`)
- [ ] Upload shows success message
- [ ] Browser console shows save confirmation
- [ ] LocalStorage contains files (`debugUpload.inspectAll()`)
- [ ] OrderId in URL matches uploaded order
- [ ] Not using Incognito mode
- [ ] No browser errors in console
- [ ] File size is under localStorage limit (5-10MB)

---

## 🆘 Still Not Working?

### Collect Debug Information

```javascript
// Run in browser console
const debugInfo = {
  // 1. Check localStorage
  localStorage: debugUpload.inspectAll(),

  // 2. Check current order
  currentOrderId: window.location.pathname.split('/').pop(),

  // 3. Check backend status
  backendHealth: fetch('http://localhost:3001/api/health')
    .then(r => r.json())
    .catch(e => 'Backend not running: ' + e.message),

  // 4. Check storage info
  storageInfo: debugUpload.storageInfo(),

  // 5. Browser info
  browser: navigator.userAgent,

  // 6. API registry
  apiRegistry: JSON.parse(localStorage.getItem('api-registry') || '{}')
}

// Print report
console.log('=== DEBUG REPORT ===')
console.log(JSON.stringify(debugInfo, null, 2))

// Copy and send this report
```

### Screenshot Checklist

1. Browser console showing logs
2. Network tab showing upload request
3. LocalStorage view showing order_files_* keys
4. Application state (React DevTools)
5. Backend terminal output (if running)

---

## 📚 Related Documentation

- [UPLOAD_FEATURE.md](UPLOAD_FEATURE.md) - Complete upload guide
- [DICOM_UPLOAD_TROUBLESHOOTING.md](DICOM_UPLOAD_TROUBLESHOOTING.md) - DICOM specific issues
- [UPLOAD_QUICK_START.md](../UPLOAD_QUICK_START.md) - Quick start guide

---

## 🎓 Understanding File Persistence

### Storage Flow

```
Upload File
    ↓
Check Backend Enabled?
    ↓
YES → Upload to Server
    ↓
    ├─ POST /api/orders/:id/files
    ├─ Save to server-data/files/
    ├─ Update file-metadata.json
    └─ Update orders.json

NO → Fallback to localStorage
    ↓
    ├─ Read file as base64
    ├─ Create metadata object
    ├─ Save to localStorage["order_files_{id}"]
    └─ Files persist until browser clear

Refresh Page
    ↓
Load Order
    ↓
Load Files
    ↓
Check Backend?
    ↓
YES → GET /api/orders/:id/files
      ↓
      Return server files ✅

NO → Get from localStorage["order_files_{id}"]
     ↓
     Return cached files ✅
```

### Why Files Might Disappear

1. **OrderId Mismatch**: Different order loaded
2. **Backend Switch**: Uploaded to localStorage, now checking backend
3. **LocalStorage Cleared**: Browser settings or incognito
4. **Network Error**: Backend upload failed silently
5. **Component State**: React state not updated correctly

---

**Last Updated**: 2024-11-04
**Status**: Under Investigation
**Version**: 1.2.0
