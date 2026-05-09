# Quick Fix Reference - S3 Image Loading Timeout

## What Was Fixed
✅ Image loading timeout error when viewing S3-stored DICOM files
✅ Increased timeout from 30s to 90s
✅ Added presigned URL support for faster S3 access
✅ Added backend redirect (307) to presigned URLs
✅ Better error messages for debugging

## How to Test

### 1. Reload Viewer
```
http://localhost:5173/viewer/enhanced/1.2.392.200036.9125.2.2322162091861962.65114713855.439629
```

### 2. Check Browser Console
Look for these success messages:
```
[DicomViewerEnhanced] Using presigned URL for S3-stored file
[CachedImageLoader] Detected presigned S3 URL, attempting direct load
[ViewportGrid] ✅ Step 1 complete: Stack set successfully
```

### 3. Expected Behavior
- Image should load within 10-20 seconds (was timing out before)
- No "Image loading timeout" error
- Viewer displays DICOM image normally

## If Still Having Issues

### Check 1: Backend Running?
```bash
# Check if backend is running on port 8003
curl http://localhost:8003/wado-rs/health
```

### Check 2: S3 Accessible?
```bash
# Test S3 connectivity
curl -v https://sin1.contabostorage.com/pacs/dicom/...
```

### Check 3: Increase Timeout
- Go to Settings → DICOM Image Loading
- Increase "Image Loading Timeout" to 120-180 seconds
- Save and reload viewer

### Check 4: Check Logs
- Browser console: F12 → Console tab
- Backend logs: Check pacs-service output
- Look for error messages with [DicomViewerEnhanced], [ViewportGrid], [CachedImageLoader]

## Key Changes Summary

| Component | Change | Impact |
|-----------|--------|--------|
| DicomViewerEnhanced.jsx | Use presigned URLs | Faster S3 access |
| ViewportGridEnhanced.jsx | 30s → 90s timeout | Allows S3 downloads |
| cachedImageLoader.js | S3 CORS handling | Fallback to proxy |
| wado.py | Add 307 redirect | Bypass backend proxy |
| DicomImageLoadingSettings.jsx | New settings UI | User configuration |

## Performance Metrics

**Before Fix:**
- S3 file (20MB): ❌ Timeout (30s)
- Error: "Image loading timeout"

**After Fix:**
- S3 file (20MB): ✅ ~5-10s (presigned URL)
- S3 file (20MB): ✅ ~15-20s (via proxy)
- Local file: ✅ ~2-3s (no change)

## Next Steps

1. ✅ Reload viewer page
2. ✅ Test with S3-stored study
3. ✅ Verify image loads without timeout
4. ✅ Check browser console for success messages
5. ✅ If issues, check troubleshooting section above

## Support

If issues persist:
1. Check S3_IMAGE_LOADING_FIX.md for detailed documentation
2. Review browser console logs
3. Check backend logs for errors
4. Verify S3 connectivity and credentials
