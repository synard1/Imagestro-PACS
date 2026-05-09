# Phase 1 - Testing Guide
**Date**: 2025-11-15  
**Status**: Ready for Testing

---

## 🧪 Testing Checklist

### Pre-Testing Setup

#### 1. Start Development Server
```bash
# Terminal 1: Start Vite dev server
npm run dev

# Terminal 2: Start backend (optional)
npm run server:upload
```

#### 2. Login
- Navigate to: http://localhost:5173/login
- Use your credentials
- Should redirect to dashboard

---

## 📋 Test Cases

### Test 1: Enhanced Studies Page - Grid View ✅

**Steps**:
1. Navigate to `/studies`
2. Should see "Studies" page with Grid/Table toggle
3. Should see study cards in grid layout
4. Should see 10 studies with different modalities

**Expected Results**:
- ✅ Grid view displays cards
- ✅ Each card shows:
  - Patient name
  - Patient ID (MRN)
  - Study description
  - Modality badge (colored)
  - Status badge (colored)
  - Study date
  - Series count
- ✅ Cards are clickable
- ✅ Hover effect works

**Test Data Available**:
- 10 studies total
- Modalities: CT (4), MR (4), CR (1), DR (1), US (1)
- Statuses: completed (7), in_progress (1), scheduled (2)
- Dates: 2025-11-12 to 2025-11-15

---

### Test 2: Enhanced Studies Page - Table View ✅

**Steps**:
1. On `/studies` page
2. Click "Table View" button
3. Should switch to table layout

**Expected Results**:
- ✅ Table view displays
- ✅ Columns visible:
  - Patient
  - MRN
  - Study Description
  - Modality
  - Date
  - Status
  - Series
- ✅ Rows are clickable
- ✅ Hover effect works

---

### Test 3: Search Filter ✅

**Steps**:
1. On `/studies` page
2. Type in search box: "Andi"
3. Should filter to 1 study

**Test Cases**:
- Search "Andi" → 1 result (Andi Saputra)
- Search "MRN0002" → 1 result (Budi Santoso)
- Search "ACC-2025-00103" → 1 result (Citra Dewi)
- Search "Brain" → 2 results (CT Head, MRI Brain)
- Search "xyz" → 0 results (empty state)

**Expected Results**:
- ✅ Results update immediately
- ✅ Results count updates
- ✅ Empty state shows when no results

---

### Test 4: Modality Filter ✅

**Steps**:
1. On `/studies` page
2. Select "CT" from Modality dropdown
3. Should show only CT studies (4 studies)

**Test Cases**:
- ALL → 10 studies
- CT → 4 studies
- MR → 4 studies
- CR → 1 study
- DR → 1 study
- US → 1 study

**Expected Results**:
- ✅ Filter works correctly
- ✅ Results count updates
- ✅ Grid/Table view updates

---

### Test 5: Status Filter ✅

**Steps**:
1. On `/studies` page
2. Select "completed" from Status dropdown
3. Should show only completed studies (7 studies)

**Test Cases**:
- ALL → 10 studies
- completed → 7 studies
- in_progress → 1 study
- scheduled → 2 studies

**Expected Results**:
- ✅ Filter works correctly
- ✅ Results count updates

---

### Test 6: Date Range Filter ✅

**Steps**:
1. On `/studies` page
2. Set "From" date: 2025-11-15
3. Should show only today's studies (5 studies)

**Test Cases**:
- From: 2025-11-15 → 5 studies
- From: 2025-11-14, To: 2025-11-14 → 2 studies
- From: 2025-11-13, To: 2025-11-13 → 2 studies
- From: 2025-11-12, To: 2025-11-12 → 1 study

**Expected Results**:
- ✅ Date filter works
- ✅ Results update correctly

---

### Test 7: Combined Filters ✅

**Steps**:
1. On `/studies` page
2. Search: "MRI"
3. Modality: "MR"
4. Status: "completed"
5. Should show 3 MRI studies

**Expected Results**:
- ✅ All filters work together
- ✅ Results are correct
- ✅ Can clear all filters

---

### Test 8: Clear All Filters ✅

**Steps**:
1. Apply multiple filters
2. Click "Clear all filters" button
3. Should reset all filters

**Expected Results**:
- ✅ Search cleared
- ✅ Modality reset to ALL
- ✅ Status reset to ALL
- ✅ Date range cleared
- ✅ All studies shown (10)

---

### Test 9: Study Card Click ✅

**Steps**:
1. On `/studies` page (Grid view)
2. Click on any study card
3. Should navigate to DICOM viewer

**Expected Results**:
- ✅ Navigates to `/dicom-viewer?studyId=...`
- ✅ Study ID passed in URL
- ✅ Viewer page loads (may show placeholder)

---

### Test 10: Quick Search in Header ✅

**Steps**:
1. Look at header (top of page)
2. Find "Quick search" input box
3. Type "Andi" and press Enter
4. Should navigate to `/studies?search=Andi`

**Expected Results**:
- ✅ Quick search visible in header
- ✅ Can type in search box
- ✅ Press Enter navigates to studies
- ✅ Search parameter passed
- ✅ Studies page shows filtered results

---

### Test 11: Worklist Widget - Open/Close ✅

**Steps**:
1. Look for "WORKLIST" button on right edge of screen
2. Click to open widget
3. Should see sidebar slide in from right
4. Click X to close

**Expected Results**:
- ✅ Button visible on right edge
- ✅ Click opens sidebar
- ✅ Sidebar shows "Today's Worklist"
- ✅ Shows pending studies count
- ✅ Click X closes sidebar
- ✅ Can reopen

---

### Test 12: Worklist Widget - Content ✅

**Steps**:
1. Open Worklist Widget
2. Should see list of pending studies
3. Studies should be in compact format

**Expected Results**:
- ✅ Shows today's pending studies
- ✅ Compact study cards visible
- ✅ Each card shows:
  - Modality icon
  - Patient name
  - Study description
  - Study date
- ✅ Cards are clickable
- ✅ "View Full Worklist" button visible

---

### Test 13: Worklist Widget - Navigation ✅

**Steps**:
1. Open Worklist Widget
2. Click on a study card
3. Should navigate to viewer

**Alternative**:
1. Open Worklist Widget
2. Click "View Full Worklist" button
3. Should navigate to `/worklist` page

**Expected Results**:
- ✅ Study card click navigates to viewer
- ✅ Button navigates to worklist page
- ✅ Widget closes after navigation

---

### Test 14: Responsive Design 📱

**Steps**:
1. Open browser DevTools
2. Toggle device toolbar (mobile view)
3. Test on different screen sizes

**Screen Sizes to Test**:
- Mobile: 375px width
- Tablet: 768px width
- Desktop: 1920px width

**Expected Results**:
- ✅ Grid adjusts columns (1 → 2 → 3 → 4)
- ✅ Table scrolls horizontally on mobile
- ✅ Filters stack vertically on mobile
- ✅ Quick search responsive
- ✅ Worklist widget responsive

---

### Test 15: Browser Compatibility 🌐

**Browsers to Test**:
- Chrome (latest)
- Firefox (latest)
- Edge (latest)
- Safari (if available)

**Expected Results**:
- ✅ All features work in Chrome
- ✅ All features work in Firefox
- ✅ All features work in Edge
- ✅ All features work in Safari

---

## 🐛 Known Issues / Limitations

### Current Limitations
1. **Thumbnails**: Placeholder only (no real DICOM thumbnails)
2. **Viewer**: Navigates but may show basic viewer
3. **Real-time Updates**: No WebSocket yet
4. **Batch Operations**: Not implemented yet
5. **Export**: Not implemented yet

### Expected Behavior
- All filters should work
- Navigation should work
- No console errors
- No visual glitches

---

## 📊 Test Results Template

### Test Session Info
- **Date**: ___________
- **Tester**: ___________
- **Browser**: ___________
- **Screen Size**: ___________

### Results

| Test # | Test Name | Status | Notes |
|--------|-----------|--------|-------|
| 1 | Grid View | ⬜ Pass / ⬜ Fail | |
| 2 | Table View | ⬜ Pass / ⬜ Fail | |
| 3 | Search Filter | ⬜ Pass / ⬜ Fail | |
| 4 | Modality Filter | ⬜ Pass / ⬜ Fail | |
| 5 | Status Filter | ⬜ Pass / ⬜ Fail | |
| 6 | Date Range | ⬜ Pass / ⬜ Fail | |
| 7 | Combined Filters | ⬜ Pass / ⬜ Fail | |
| 8 | Clear Filters | ⬜ Pass / ⬜ Fail | |
| 9 | Card Click | ⬜ Pass / ⬜ Fail | |
| 10 | Quick Search | ⬜ Pass / ⬜ Fail | |
| 11 | Widget Open/Close | ⬜ Pass / ⬜ Fail | |
| 12 | Widget Content | ⬜ Pass / ⬜ Fail | |
| 13 | Widget Navigation | ⬜ Pass / ⬜ Fail | |
| 14 | Responsive | ⬜ Pass / ⬜ Fail | |
| 15 | Browser Compat | ⬜ Pass / ⬜ Fail | |

### Issues Found
1. ___________________________________________
2. ___________________________________________
3. ___________________________________________

### Overall Assessment
- ⬜ Ready for production
- ⬜ Needs minor fixes
- ⬜ Needs major fixes

---

## 🔧 Troubleshooting

### Issue: Studies page shows "Loading..."
**Solution**: Check if `studies.json` exists and is valid JSON

### Issue: No studies showing
**Solution**: 
1. Check browser console for errors
2. Verify `studies.json` has data
3. Check filters (try "Clear all filters")

### Issue: Quick search not visible
**Solution**: 
1. Make sure you're logged in
2. Check if Layout.jsx imported QuickSearch
3. Check browser console for errors

### Issue: Worklist button not visible
**Solution**:
1. Check if user has proper role
2. Look at right edge of screen
3. Try scrolling or resizing window

### Issue: Filters not working
**Solution**:
1. Check browser console
2. Try clearing browser cache
3. Restart dev server

---

## ✅ Success Criteria

### Phase 1 Day 1 is successful if:
- ✅ All 15 tests pass
- ✅ No console errors
- ✅ No visual glitches
- ✅ Responsive design works
- ✅ Cross-browser compatible
- ✅ User feedback positive

---

## 📝 Feedback Form

### What works well?
- ___________________________________________
- ___________________________________________

### What needs improvement?
- ___________________________________________
- ___________________________________________

### Suggestions for next phase?
- ___________________________________________
- ___________________________________________

---

**Happy Testing! 🧪**
