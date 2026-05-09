# Day 3 Quick Test Guide
**How to test the enhanced viewer components**

---

## 🚀 Quick Start

### 1. Start Development Server
```bash
npm run dev
```

### 2. Navigate to Studies Page
```
http://localhost:5173/studies
```

---

## ✅ Testing Steps

### Test 1: Study List Navigation ✅
1. Go to `/studies`
2. You should see the study list (grid or table view)
3. Click on any study card
4. **Expected:** Study details panel slides in from right
5. **Status:** ✅ WORKING

### Test 2: Study Detail Page ✅
1. From studies list, click the "View" button (eye icon)
2. **Expected:** Navigate to `/study/{id}` page
3. **Should see:**
   - Back button to studies
   - Quick stats cards (Series, Images, Modality, Status)
   - Patient information section
   - Study information section
   - Series grid with thumbnails
   - Quick action buttons
   - "Open in Viewer" button
4. **Status:** ✅ WORKING (404 FIXED)

### Test 3: Enhanced Viewer Navigation ✅
1. From study detail page, click "Open in Viewer"
2. **Expected:** Navigate to `/viewer/enhanced/{id}`
3. **Should see:**
   - Dark theme viewer interface
   - Top bar with study info
   - Toolbar with tools
   - Main viewport area
   - Series panel on left
   - Bottom status bar
4. **Status:** ✅ WORKING

### Test 4: Viewer Toolbar
1. In enhanced viewer, click toolbar buttons
2. **Test each tool:**
   - Pan tool
   - Zoom tool
   - Windowing tool (should open panel)
   - Measurements tool (should open panel)
   - Cine tool
   - Zoom in/out buttons
   - Reset button
   - Layout button (should open panel)
3. **Expected:** Tool buttons highlight when active
4. **Status:** ⏳ UI ONLY (logic pending)

### Test 5: Windowing Panel
1. Click "Window/Level" button in toolbar
2. **Expected:** Panel slides in from right
3. **Should see:**
   - Current W/L values
   - Width slider
   - Center slider
   - 8 preset buttons (Default, Lung, Bone, etc.)
   - Manual input fields
   - Apply button
4. **Test:** Click preset buttons
5. **Expected:** Values update
6. **Status:** ⏳ UI ONLY (not connected to viewport yet)

### Test 6: Measurement Tools Panel
1. Click "Measurements" button in toolbar
2. **Expected:** Panel slides in from left
3. **Should see:**
   - 8 measurement tools
   - Length, Angle, Rectangle ROI, etc.
   - Clear all button
4. **Test:** Click tool buttons
5. **Expected:** Tool highlights when selected
6. **Status:** ⏳ UI ONLY (logic pending)

### Test 7: Layout Selector
1. Click layout button (grid icon) in toolbar
2. **Expected:** Panel slides in from right
3. **Should see:**
   - 5 layout options (1x1, 1x2, 2x1, 2x2, 3x3)
   - Visual preview of each layout
   - Current layout highlighted
4. **Test:** Click different layouts
5. **Expected:** Layout changes in viewport area
6. **Status:** ⏳ UI ONLY (viewport not rendering yet)

### Test 8: Series Panel
1. Series panel should be visible on left by default
2. **Should see:**
   - List of series
   - Series thumbnails (placeholder)
   - Series information
   - Instance count
3. **Test:** Click series items
4. **Expected:** Series highlights when selected
5. **Status:** ⏳ UI ONLY (not loading images yet)

### Test 9: Cine Controls
1. Click "Cine" button in toolbar
2. **Expected:** Cine controls appear at bottom center
3. **Should see:**
   - Play/Pause button
   - Previous/Next frame buttons
   - Frame counter
   - FPS selector
   - Loop button
   - Progress bar
4. **Test:** Click play/pause
5. **Expected:** Button toggles
6. **Status:** ⏳ UI ONLY (playback not implemented)

### Test 10: Back Navigation
1. From enhanced viewer, click back button
2. **Expected:** Navigate back to study detail page
3. From study detail, click back button
4. **Expected:** Navigate back to studies list
5. **Status:** ✅ WORKING

---

## 🎨 Visual Checks

### Study Detail Page
- [ ] Quick stats cards display correctly
- [ ] Icons show in sections
- [ ] Series grid responsive
- [ ] Action buttons styled properly
- [ ] Status badges color-coded

### Enhanced Viewer
- [ ] Dark theme (gray-900 background)
- [ ] Toolbar buttons visible
- [ ] Panels slide in smoothly
- [ ] Viewport grid displays
- [ ] Bottom bar shows info

### Panels
- [ ] Windowing panel styled correctly
- [ ] Measurement tools panel organized
- [ ] Layout selector shows previews
- [ ] Series panel scrollable
- [ ] Cine controls centered

---

## 🐛 Known Issues

### Expected Behavior (Not Bugs):
1. **Viewport shows "No Image"** - Normal, image loading not implemented yet
2. **Tools don't affect viewport** - Normal, tool logic not implemented yet
3. **Cine doesn't play** - Normal, playback not implemented yet
4. **Series thumbnails are placeholders** - Normal, thumbnail generation pending
5. **Windowing doesn't change image** - Normal, not connected to Cornerstone yet

### Actual Bugs to Report:
- None currently! All navigation working ✅

---

## 📊 Test Results Template

```
Date: ___________
Tester: ___________

Navigation:
- Study List: ☐ Pass ☐ Fail
- Study Detail: ☐ Pass ☐ Fail
- Enhanced Viewer: ☐ Pass ☐ Fail
- Back Navigation: ☐ Pass ☐ Fail

Viewer Components:
- ViewerToolbar: ☐ Pass ☐ Fail
- WindowingPanel: ☐ Pass ☐ Fail
- MeasurementTools: ☐ Pass ☐ Fail
- LayoutSelector: ☐ Pass ☐ Fail
- SeriesPanel: ☐ Pass ☐ Fail
- CineControls: ☐ Pass ☐ Fail

Visual:
- Study Detail Design: ☐ Pass ☐ Fail
- Viewer Dark Theme: ☐ Pass ☐ Fail
- Panel Animations: ☐ Pass ☐ Fail
- Button States: ☐ Pass ☐ Fail

Overall: ☐ Pass ☐ Fail

Issues Found:
1. ___________
2. ___________

Notes:
___________
```

---

## 🔧 Troubleshooting

### Issue: 404 error on study detail
**Status:** ✅ FIXED
**Solution:** Navigation updated to use `/study/:studyId`

### Issue: Panels not showing
**Solution:** Click toolbar buttons to toggle panels

### Issue: Viewport empty
**Expected:** Normal, image loading not implemented yet

### Issue: Tools not working
**Expected:** Normal, tool logic pending Day 4

---

## ✅ Success Criteria

Day 3 is successful if:
- [x] No 404 errors
- [x] Study detail page loads
- [x] Enhanced viewer page loads
- [x] All panels can be opened
- [x] Navigation works
- [x] No console errors
- [x] UI looks professional

---

## 🎯 What's Next (Day 4)

### To Be Implemented:
1. Connect ViewportGrid to Cornerstone.js
2. Load actual DICOM images
3. Connect windowing to viewport
4. Implement measurement tools logic
5. Implement cine playback
6. Add keyboard shortcuts

---

**Last Updated**: 2025-11-15  
**Version**: 1.0  
**Status**: Ready for Testing ✅
