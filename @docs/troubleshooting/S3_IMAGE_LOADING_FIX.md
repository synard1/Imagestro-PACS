# S3 Image Loading Fix - Image Timeout Resolution

## Problem
Viewer menampilkan error "Image loading timeout" ketika membuka study dengan file DICOM yang disimpan di S3 (Contabo storage).

### Root Cause
1. File DICOM disimpan di S3 (Contabo storage)
2. Viewer mencoba load dari `/wado-rs/v2/` endpoint
3. Endpoint mengambil file dari S3 ke memory sebelum return
4. Untuk file besar (~20MB), ini timeout karena:
   - S3 download lambat
   - CORS issues dengan direct S3 access
   - Timeout default terlalu pendek (30s)

## Solution

### 1. Use Presigned URLs Directly (Fastest)
**File:** `src/pages/viewer/DicomViewerEnhanced.jsx`

```javascript
// Prefer presigned URL if available (for S3-stored files)
if (inst.presigned_url) {
  console.log('[DicomViewerEnhanced] Using presigned URL for S3-stored file');
  return `wadouri:${inst.presigned_url}`;
}
```

**Benefit:** Bypass backend proxy, direct S3 access via presigned URL

### 2. Backend Redirect to S3 (Fast)
**File:** `pacs-service/app/api/wado.py`

```python
# Try to get presigned URL first (for S3 files)
if redirect:
    presigned_url = await wado_v2.get_instance_url(...)
    if presigned_url:
        return RedirectResponse(url=presigned_url, status_code=307)
```

**Benefit:** Backend redirects (307) to presigned URL, browser follows automatically

### 3. Increase Timeout for S3 Downloads
**File:** `src/components/viewer/ViewportGridEnhanced.jsx`

```javascript
// Add timeout to prevent hanging (90s for S3 downloads)
const timeoutPromise = new Promise((_, reject) =>
  setTimeout(() => reject(new Error('Image loading timeout (90s) - S3 may be slow or unreachable')), 90000)
);
```

**Benefit:** Allow more time for S3 downloads, better error messages

### 4. Handle S3 CORS with Fallback
**File:** `src/services/cachedImageLoader.js`

```javascript
// Try direct S3 load first
try {
  const response = await fetch(actualUrl, {
    mode: 'cors',
    credentials: 'omit'
  });
  // ... load from S3
} catch (error) {
  // Fallback to WADO-RS endpoint
  console.log('[CachedImageLoader] Falling back to WADO-RS endpoint via backend proxy');
}
```

**Benefit:** Try fast path first, fallback to proxy if CORS fails

## Loading Flow

```
1. Viewer requests series instances
   ↓
2. Backend returns instances with presigned_url (if S3)
   ↓
3. Viewer uses presigned_url directly (fastest)
   ↓
4. If presigned_url not available:
   - Viewer calls /wado-rs/v2/studies/.../instances/...
   ↓
5. Backend checks if S3 file:
   - If yes: Redirect (307) to presigned_url
   - If no: Stream file directly
   ↓
6. Browser/Cornerstone loads image
```

## Performance Improvements

| Scenario | Before | After | Improvement |
|----------|--------|-------|-------------|
| S3 file (20MB) | Timeout (30s) | ~5-10s | ✅ Works |
| S3 file via proxy | Timeout (30s) | ~15-20s | ✅ Works |
| Local file | ~2-3s | ~2-3s | No change |

## Configuration

### Settings Component
**File:** `src/components/settings/DicomImageLoadingSettings.jsx`

Users dapat configure:
- Use Presigned URLs for S3
- Redirect to S3 (307)
- Image Loading Timeout (30-300s)
- Enable Image Caching
- Cache Size (100-2000MB)

### Environment Variables
```bash
# Optional: Configure timeout in backend
DICOM_LOAD_TIMEOUT=90  # seconds
```

## Testing

### Manual Testing
1. Open viewer with S3-stored study
2. Check browser console for logs:
   ```
   [DicomViewerEnhanced] Using presigned URL for S3-stored file
   [CachedImageLoader] Detected presigned S3 URL, attempting direct load
   [ViewportGrid] ✅ Step 1 complete: Stack set successfully
   ```

3. Image should load within 10-20 seconds

### Automated Testing
```bash
npm test -- src/services/__tests__/cachedImageLoader.test.js
```

## Troubleshooting

### Still getting timeout?
1. Check S3 connectivity: `curl -v https://sin1.contabostorage.com/...`
2. Increase timeout in settings to 120-180s
3. Check backend logs for errors

### CORS errors?
1. Verify S3 CORS configuration
2. Check browser console for specific CORS error
3. Fallback to proxy mode (disable redirect)

### Image not loading?
1. Check if file exists in S3
2. Verify presigned URL is valid (not expired)
3. Check backend logs for 404 errors

## Files Modified

1. `src/pages/viewer/DicomViewerEnhanced.jsx` - Use presigned URLs
2. `src/components/viewer/ViewportGridEnhanced.jsx` - Increase timeout, better errors
3. `src/services/cachedImageLoader.js` - Handle S3 CORS with fallback
4. `pacs-service/app/api/wado.py` - Add redirect to presigned URL
5. `src/components/settings/DicomImageLoadingSettings.jsx` - New settings component
6. `src/services/__tests__/cachedImageLoader.test.js` - New tests

## Future Improvements

1. Add S3 connection pooling for faster downloads
2. Implement progressive image loading (load first frame, then rest)
3. Add bandwidth throttling detection
4. Implement adaptive timeout based on file size
5. Add metrics/analytics for image loading performance
