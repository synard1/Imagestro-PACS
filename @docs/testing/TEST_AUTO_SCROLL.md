# Test Guide: Auto-Scroll Feature

## Quick Test Steps

### Test 1: Last Row (Critical)
1. Scroll ke bagian paling bawah tabel
2. Klik action button (⋮ Actions) pada row terakhir
3. **Expected**: 
   - Page auto-scroll smooth ke atas
   - Button menjadi semi-transparent saat scroll
   - Dropdown muncul setelah scroll selesai
   - Semua 4 menu items terlihat penuh
4. **Check Console**: Lihat log auto-scroll

### Test 2: Second-to-Last Row
1. Klik action button pada row kedua dari bawah
2. **Expected**:
   - Auto-scroll jika perlu
   - Dropdown fully visible
3. **Check**: Tidak ada menu item yang terpotong

### Test 3: Middle Row
1. Klik action button pada row di tengah
2. **Expected**:
   - Mungkin tidak perlu scroll (sudah cukup space)
   - Dropdown langsung muncul
   - Console log: "Enough space, no scroll needed"

### Test 4: Top Row
1. Klik action button pada row pertama
2. **Expected**:
   - Tidak ada scroll
   - Dropdown muncul di bawah button
   - Semua items visible

### Test 5: Rapid Clicking
1. Klik action button beberapa kali cepat
2. **Expected**:
   - Button disabled saat scrolling
   - Tidak ada multiple scrolls
   - Dropdown hanya muncul sekali

### Test 6: Click Outside
1. Buka dropdown
2. Klik di luar dropdown
3. **Expected**:
   - Dropdown close
   - No errors

### Test 7: Scroll While Open
1. Buka dropdown
2. Scroll page manual
3. **Expected**:
   - Dropdown position update
   - Tetap aligned dengan button

### Test 8: Resize Window
1. Buka dropdown
2. Resize browser window
3. **Expected**:
   - Dropdown position adjust
   - Tidak off-screen

## Console Log Checklist

Saat klik action button di bawah, harus muncul:
```
[Auto-Scroll] Button bottom: XXX
[Auto-Scroll] Viewport height: XXX
[Auto-Scroll] Space below: XXX
[Auto-Scroll] Required space: 280
[Auto-Scroll] Need to scroll by: XXX px
[Auto-Scroll] Scroll complete, opening dropdown
[Position] Space below: XXX Space above: XXX
[Position] Placing below button
[Position] Final position: { top: XXX, left: XXX, placement: 'bottom' }
```

## Visual Checklist

### Button States
- [ ] Normal: Solid, clickable
- [ ] Scrolling: Semi-transparent, disabled
- [ ] After scroll: Normal again

### Dropdown Appearance
- [ ] Fade-in animation smooth
- [ ] All 4 menu items visible:
  - [ ] Show/Hide Series
  - [ ] Open Viewer
  - [ ] Edit Study
  - [ ] Delete Study
- [ ] Hover effects work
- [ ] Icons visible
- [ ] Text readable

### Scroll Behavior
- [ ] Smooth animation (not instant)
- [ ] Correct amount (not too much/little)
- [ ] Completes before dropdown shows
- [ ] No jank or stutter

## Browser Testing

### Desktop
- [ ] Chrome (Windows)
- [ ] Chrome (Mac)
- [ ] Firefox (Windows)
- [ ] Firefox (Mac)
- [ ] Safari (Mac)
- [ ] Edge (Windows)

### Mobile
- [ ] Chrome Mobile (Android)
- [ ] Safari Mobile (iOS)
- [ ] Samsung Internet

## Edge Cases

### Large Dataset
1. Load 50+ studies
2. Scroll to bottom
3. Test last row
4. **Expected**: Still works

### Small Screen
1. Resize to 1024x768
2. Test last row
3. **Expected**: Dropdown fits

### Slow Connection
1. Throttle network
2. Test auto-scroll
3. **Expected**: No delay in scroll

### Multiple Tables
1. Open multiple tabs with Studies
2. Test each tab
3. **Expected**: Independent behavior

## Performance Testing

### Metrics to Check
- [ ] Scroll starts within 50ms of click
- [ ] Scroll completes in ~450ms
- [ ] Dropdown appears within 100ms after scroll
- [ ] No memory leaks (check DevTools)
- [ ] No console errors

### Load Testing
1. Open Studies page
2. Click 20 different action buttons
3. **Check**:
   - [ ] No slowdown
   - [ ] No memory increase
   - [ ] All dropdowns work

## Accessibility Testing

### Keyboard
- [ ] Tab to action button
- [ ] Enter to open (future feature)
- [ ] Esc to close (future feature)

### Screen Reader
- [ ] Button has proper label
- [ ] Menu items announced
- [ ] Actions describable

## Regression Testing

### Existing Features
- [ ] Create study still works
- [ ] Edit study still works
- [ ] Delete study still works
- [ ] Filter still works
- [ ] Search still works
- [ ] Series expand/collapse works

## Bug Reporting Template

If you find issues, report with:

```
**Issue**: [Brief description]

**Steps to Reproduce**:
1. 
2. 
3. 

**Expected**: [What should happen]

**Actual**: [What actually happened]

**Console Logs**: [Paste relevant logs]

**Screenshot**: [Attach if possible]

**Browser**: [Chrome 120, etc]

**Screen Size**: [1920x1080, etc]
```

## Success Criteria

All tests must pass:
- ✅ Auto-scroll works for last row
- ✅ Dropdown fully visible
- ✅ No manual scroll needed
- ✅ Smooth animations
- ✅ No console errors
- ✅ Works on all browsers
- ✅ Mobile-friendly

## Quick Smoke Test (30 seconds)

1. Open Studies page
2. Scroll to bottom
3. Click last row action button
4. Verify dropdown fully visible
5. Click a menu item
6. Verify action executes

**Pass**: ✅ All steps work
**Fail**: ❌ Report issue

---

**Test Duration**: ~10 minutes (full test)
**Quick Test**: ~30 seconds
**Recommended**: Run full test before deployment
