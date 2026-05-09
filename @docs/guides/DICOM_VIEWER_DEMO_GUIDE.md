# DICOM Viewer Demo - User Guide
**Created**: 2025-11-15  
**Feature**: Interactive DICOM Viewer with Sample Images

---

## 🎯 Overview

DICOM Viewer Demo adalah viewer interaktif yang menggunakan **Cornerstone.js** untuk menampilkan sample DICOM images dari folder `src/uploads`. Viewer ini mendemonstrasikan kemampuan dasar PACS viewer dengan fitur windowing, zoom, dan preset W/L.

---

## 🚀 How to Access

### Via Menu
1. Login ke aplikasi
2. Klik menu **Tools** di sidebar
3. Pilih **DICOM Viewer Demo**

### Direct URL
```
http://localhost:5173/dicom-viewer-demo
```

---

## 📁 Sample Images Available

Viewer ini sudah include 6 sample DICOM images:

| Image | Resolution | Description |
|-------|-----------|-------------|
| SD 720×480 | 720×480 | Standard Definition |
| SD 720×480 (Modified) | 720×480 | Modified version |
| SD 720×480 (Modified 2) | 720×480 | Modified copy |
| Square 1080×1080 | 1080×1080 | Square format |
| HD 1080×1920 | 1080×1920 | High Definition Portrait |
| 4K 2160×3840 | 2160×3840 | Ultra High Definition |

---

## 🎨 Features

### 1. Image Loading
- Click any sample image from sidebar
- Image loads automatically
- Shows loading state

### 2. Window/Level (W/L) Adjustment
**Presets Available**:
- Default (400/40)
- Lung (1500/-600)
- Bone (2000/300)
- Brain (80/40)
- Soft Tissue (350/50)

**Manual Adjustment**:
- Window Width slider (1-4000)
- Window Center slider (-1000 to 1000)
- Real-time preview

### 3. Zoom Controls
- Zoom In (+) button
- Zoom Out (-) button
- Range: 10% - 500%
- Current zoom displayed

### 4. Reset View
- Reset button to restore original view
- Resets zoom and W/L to defaults

### 5. Image Information
- Image dimensions
- Rows and columns
- Current W/L values
- Zoom percentage

---

## 🎮 User Interface

### Layout
```
┌─────────────────────────────────────────────────────┐
│  Header: DICOM Viewer Demo                         │
├──────────┬──────────────────────────────────────────┤
│          │                                          │
│ Sidebar  │         Main Viewport                    │
│          │                                          │
│ - Images │    [DICOM Image Display]                │
│ - Presets│                                          │
│ - Tools  │    [Image Info Overlay]                 │
│          │    [Controls Overlay]                   │
│          │                                          │
├──────────┴──────────────────────────────────────────┤
│  Footer: Tips and Version Info                     │
└─────────────────────────────────────────────────────┘
```

### Sidebar Sections

#### 1. Sample Images
- List of available DICOM files
- Click to load
- Active image highlighted in blue

#### 2. W/L Presets
- Quick access to common presets
- One-click application
- Shows W/L values

#### 3. Tools
- Reset View button
- Zoom controls with +/- buttons
- Window Width slider
- Window Center slider

### Main Viewport

#### Image Display
- Black background
- Centered image
- Responsive sizing

#### Overlays
- **Top-left**: Image information
- **Bottom**: Current W/L and zoom values

---

## 💡 Usage Tips

### For Radiologists
1. Start with appropriate W/L preset for modality
2. Fine-tune using sliders
3. Use zoom for detailed inspection
4. Reset view when switching images

### For Developers
1. Study the Cornerstone.js integration
2. Check console for any errors
3. Inspect network tab for image loading
4. Test with different image sizes

### For Testing
1. Load each sample image
2. Test all W/L presets
3. Verify zoom functionality
4. Check reset button
5. Test on different browsers

---

## 🔧 Technical Details

### Technology Stack
- **Cornerstone.js Core**: Image rendering engine
- **Cornerstone Tools**: Interaction tools
- **DICOM Image Loader**: DICOM file parsing
- **dicom-parser**: DICOM tag parsing

### Image Loading
```javascript
// Image ID format
const imageId = `wadouri:/uploads/filename.dcm`;

// Load and display
const image = await cornerstone.loadImage(imageId);
cornerstone.displayImage(element, image);
```

### Viewport Manipulation
```javascript
// Get viewport
const viewport = cornerstone.getViewport(element);

// Modify W/L
viewport.voi.windowWidth = 400;
viewport.voi.windowCenter = 40;

// Modify zoom
viewport.scale = 1.5;

// Apply changes
cornerstone.setViewport(element, viewport);
```

---

## 🐛 Troubleshooting

### Issue: Image not loading
**Possible Causes**:
- DICOM file not found in uploads folder
- Cornerstone not initialized
- CORS issues

**Solutions**:
1. Check browser console for errors
2. Verify file exists in `src/uploads/`
3. Ensure dev server is running
4. Check network tab for 404 errors

### Issue: Black screen
**Possible Causes**:
- Invalid DICOM file
- Viewport not enabled
- Image dimensions too large

**Solutions**:
1. Try different sample image
2. Click Reset View
3. Check console for errors
4. Refresh page

### Issue: W/L not working
**Possible Causes**:
- No image loaded
- Invalid W/L values

**Solutions**:
1. Load an image first
2. Try preset values
3. Reset viewport

---

## 📊 Comparison with Existing Viewer

### DICOM Viewer (Upload) - `/dicom-viewer`
- **Purpose**: Development tool
- **Input**: Manual file upload
- **Features**: Basic display, tag viewing
- **Use Case**: Testing uploaded DICOM files

### DICOM Viewer Demo - `/dicom-viewer-demo`
- **Purpose**: Feature demonstration
- **Input**: Pre-loaded sample images
- **Features**: Full W/L, zoom, presets
- **Use Case**: Testing viewer capabilities

---

## 🎯 Future Enhancements

### Phase 1 Week 5-8
- [ ] Measurement tools (distance, angle, ROI)
- [ ] Annotations
- [ ] Multi-viewport (2×2, 3×3)
- [ ] Cine playback for series
- [ ] Hanging protocols

### Phase 2
- [ ] Integration with study list
- [ ] Load studies directly from database
- [ ] Series navigation
- [ ] Key image selection
- [ ] Export to JPEG/PNG

### Phase 3
- [ ] MPR (Multi-planar reconstruction)
- [ ] 3D rendering
- [ ] Fusion imaging
- [ ] Advanced measurements
- [ ] AI integration

---

## 📝 Notes

### Important
- This is a **demo viewer** for testing and development
- Sample images are for demonstration only
- Not for clinical use yet
- Full PACS integration coming in Phase 2

### Performance
- Loads images on-demand
- Uses web workers for parsing
- Optimized for modern browsers
- Tested with images up to 4K

### Browser Support
- ✅ Chrome 90+
- ✅ Firefox 88+
- ✅ Safari 14+
- ✅ Edge 90+

---

## 🆘 Support

### Questions?
- Check browser console for errors
- Review Cornerstone.js documentation
- Check DICOM file format
- Test with different sample images

### Report Issues
- Document steps to reproduce
- Include browser and version
- Attach console errors
- Note which sample image

---

## ✅ Quick Test Checklist

- [ ] Access viewer via menu
- [ ] Load SD 720×480 image
- [ ] Apply Lung preset
- [ ] Zoom in to 200%
- [ ] Adjust Window Width slider
- [ ] Adjust Window Center slider
- [ ] Click Reset View
- [ ] Load HD 1080×1920 image
- [ ] Apply Brain preset
- [ ] Test all sample images
- [ ] Check image info overlay
- [ ] Verify controls overlay

---

**Status**: ✅ Ready for Testing  
**Version**: 1.0  
**Last Updated**: 2025-11-15
