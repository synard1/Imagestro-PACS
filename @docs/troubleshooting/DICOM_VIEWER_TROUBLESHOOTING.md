# DICOM Viewer Demo - Troubleshooting Guide
**Created**: 2025-11-15  
**Issue**: Images not loading when clicked

---

## 🔍 Issue Analysis

### Problem
- Clicking sample images shows no response
- Images don't load in viewport
- No error messages displayed

### Root Causes Identified
1. **Path Resolution**: DICOM files need full URL path
2. **Viewport Initialization**: Viewport might not be properly enabled
3. **Cornerstone Configuration**: Web workers not properly configured
4. **Console Logging**: Need better debugging info

---

## ✅ Fixes Applied

### 1. Enhanced Image Loading
```javascript
// Before
const imageId = `wadouri:${imagePath}`;

// After
const fullPath = window.location.origin + imagePath;
const imageId = `wadouri:${fullPath}`;
```

### 2. Better Viewport Management
```javascript
// Check if already enabled before enabling
try {
  cornerstone.getEnabledElement(element);
} catch (e) {
  cornerstone.enable(element);
}
```

### 3. Added Console Logging
- Log when button clicked
- Log image path being loaded
- Log when image successfully loaded
- Log detailed errors

### 4. Added Visual Feedback
- Initialization status indicator
- Disabled buttons while initializing
- "Load First Sample" button
- Better error messages

### 5. Improved Error Handling
```javascript
setError('Failed to load DICOM image: ' + err.message + 
  '\n\nPlease check:\n' +
  '1. DICOM file exists in uploads folder\n' +
  '2. File is a valid DICOM format\n' +
  '3. Browser console for detailed errors');
```

---

## 🧪 Testing Steps

### Step 1: Check Initialization
1. Open DICOM Viewer Demo
2. Look at footer - should show green dot and "Ready"
3. If yellow dot and "Initializing..." - wait a few seconds

### Step 2: Test Image Loading
1. Click "SD 720×480" button
2. Check browser console for logs:
   ```
   [DicomViewerDemo] Button clicked for: SD 720×480
   [DicomViewerDemo] Loading image: /uploads/SD-720x480.dcm
   [DicomViewerDemo] Loading imageId: wadouri:http://localhost:5173/uploads/SD-720x480.dcm
   [DicomViewerDemo] Image loaded: {...}
   [DicomViewerDemo] Image displayed successfully
   ```

### Step 3: Verify Image Display
1. Image should appear in center viewport
2. Image info overlay should show in top-left
3. Controls overlay should show at bottom
4. W/L and zoom values should update

---

## 🐛 Common Issues & Solutions

### Issue 1: "Initializing..." Never Completes
**Symptoms**:
- Yellow dot in footer
- Buttons disabled
- No images load

**Solutions**:
1. Check browser console for errors
2. Verify Cornerstone.js loaded:
   ```javascript
   console.log(cornerstone);
   ```
3. Refresh page
4. Clear browser cache

### Issue 2: 404 Error for DICOM Files
**Symptoms**:
- Console shows 404 errors
- Error message about file not found

**Solutions**:
1. Verify files exist in `src/uploads/`:
   ```bash
   ls src/uploads/*.dcm
   ```
2. Check dev server is serving uploads folder
3. Try accessing file directly:
   ```
   http://localhost:5173/uploads/SD-720x480.dcm
   ```

### Issue 3: "Invalid DICOM" Error
**Symptoms**:
- Error about invalid DICOM format
- Image loads but doesn't display

**Solutions**:
1. Verify file is valid DICOM:
   ```bash
   file src/uploads/SD-720x480.dcm
   ```
2. Try different sample image
3. Check file isn't corrupted

### Issue 4: Black Screen After Loading
**Symptoms**:
- Console shows image loaded
- Viewport stays black
- No error messages

**Solutions**:
1. Click "Reset View" button
2. Try different W/L preset
3. Adjust Window Width slider
4. Check image dimensions in console

### Issue 5: Viewport Not Visible
**Symptoms**:
- Can't see viewport element
- Layout looks broken

**Solutions**:
1. Check browser zoom level (should be 100%)
2. Resize browser window
3. Check CSS is loaded
4. Inspect element in DevTools

---

## 🔧 Debug Commands

### Check Cornerstone Status
```javascript
// In browser console
console.log('Cornerstone:', cornerstone);
console.log('Version:', cornerstone.VERSION);
console.log('Enabled elements:', cornerstone.getEnabledElements());
```

### Check Image Loader
```javascript
console.log('DICOM Loader:', cornerstoneDICOMImageLoader);
console.log('Web Workers:', cornerstoneDICOMImageLoader.webWorkerManager);
```

### Test Image Loading Manually
```javascript
const imageId = 'wadouri:http://localhost:5173/uploads/SD-720x480.dcm';
cornerstone.loadImage(imageId)
  .then(image => console.log('Image loaded:', image))
  .catch(err => console.error('Load failed:', err));
```

### Check Viewport State
```javascript
const element = document.querySelector('[ref="viewportRef"]');
const viewport = cornerstone.getViewport(element);
console.log('Viewport:', viewport);
```

---

## 📊 Expected Console Output

### Successful Load
```
[DicomViewerDemo] Button clicked for: SD 720×480
[DicomViewerDemo] Loading image: /uploads/SD-720x480.dcm
[DicomViewerDemo] Loading imageId: wadouri:http://localhost:5173/uploads/SD-720x480.dcm
[DicomViewerDemo] Image loaded: {
  imageId: "wadouri:http://localhost:5173/uploads/SD-720x480.dcm",
  width: 720,
  height: 480,
  ...
}
[DicomViewerDemo] Image displayed successfully
```

### Failed Load
```
[DicomViewerDemo] Button clicked for: SD 720×480
[DicomViewerDemo] Loading image: /uploads/SD-720x480.dcm
[DicomViewerDemo] Loading imageId: wadouri:http://localhost:5173/uploads/SD-720x480.dcm
[DicomViewerDemo] Failed to load image: Error: ...
```

---

## 🎯 Quick Fixes

### Fix 1: Force Reload
```javascript
// In browser console
location.reload(true);
```

### Fix 2: Clear Cornerstone Cache
```javascript
cornerstone.imageCache.purgeCache();
```

### Fix 3: Re-enable Viewport
```javascript
const element = document.querySelector('[ref="viewportRef"]');
cornerstone.disable(element);
cornerstone.enable(element);
```

### Fix 4: Test with Direct URL
Open in new tab:
```
http://localhost:5173/uploads/SD-720x480.dcm
```
Should download or show DICOM file.

---

## 📝 Checklist for Developers

### Before Testing
- [ ] Dev server running (`npm run dev`)
- [ ] DICOM files exist in `src/uploads/`
- [ ] Browser console open (F12)
- [ ] No other errors in console

### During Testing
- [ ] Check initialization status (green dot)
- [ ] Click sample image button
- [ ] Watch console for logs
- [ ] Verify image appears
- [ ] Test W/L controls
- [ ] Test zoom controls

### If Issues
- [ ] Check console for errors
- [ ] Verify file paths
- [ ] Test with different image
- [ ] Try browser refresh
- [ ] Check network tab for 404s

---

## 🆘 Still Not Working?

### Collect Debug Info
1. Browser and version
2. Console errors (full text)
3. Network tab (any 404s?)
4. Steps to reproduce
5. Which sample image

### Temporary Workaround
Use original DICOM Viewer (Upload):
1. Go to Tools → DICOM Viewer (Upload)
2. Manually upload DICOM file
3. View in basic viewer

---

## ✅ Success Indicators

### Working Correctly When:
- ✅ Green "Ready" indicator in footer
- ✅ Clicking image loads it immediately
- ✅ Console shows successful load logs
- ✅ Image appears in viewport
- ✅ W/L controls work
- ✅ Zoom controls work
- ✅ Image info displays correctly

---

**Status**: Fixes Applied  
**Next**: Manual Testing Required  
**Version**: 1.1
