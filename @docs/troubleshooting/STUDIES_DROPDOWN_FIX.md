# Studies Dropdown Menu Fix

## Problem
Action buttons in the Studies table were being cut off by the overflow container, especially for rows at the bottom of the table. The dropdown menu would be clipped and not visible.

## Solution
Implemented a portal-based dropdown component that renders outside the overflow container using React's `createPortal`.

## Changes Made

### 1. New Component: `StudyActionsDropdown.jsx`
- Uses React Portal to render dropdown in `document.body`
- Smart positioning that detects available space
- Automatically positions above or below based on viewport space
- Handles scroll and resize events to update position
- Click-outside detection to close dropdown
- Fixed z-index (9999) to ensure visibility

### 2. Updated `Studies.jsx`
- Replaced inline action buttons with dropdown component
- Reduced Actions column width from 280px to 120px
- Added `overflow-visible` to section container
- Cleaner, more compact table layout

### 3. Features
- **Smart Positioning**: Dropdown opens above if not enough space below
- **Viewport Aware**: Never goes off-screen (left/right/top/bottom)
- **Scroll Handling**: Updates position on scroll
- **Responsive**: Adjusts on window resize
- **Accessible**: Keyboard and click-outside support

## Dropdown Menu Items
1. **Show/Hide Series** - Toggle series details
2. **Open Viewer** - Launch DICOM viewer
3. **Edit Study** - Edit study information
4. **Delete Study** - Delete study with confirmation

## Technical Details

### Portal Rendering
```javascript
createPortal(
  <div style={{ position: 'fixed', top, left, zIndex: 9999 }}>
    {/* Dropdown content */}
  </div>,
  document.body
)
```

### Position Calculation
- Calculates button position using `getBoundingClientRect()`
- Checks available space in viewport
- Adjusts placement (top/bottom) based on space
- Ensures dropdown stays within viewport bounds

### Event Handling
- Click outside to close
- Scroll listener to update position
- Resize listener to reposition
- Cleanup on unmount

## Benefits
1. ✅ No more clipped dropdowns
2. ✅ Works for all table rows (top, middle, bottom)
3. ✅ Cleaner table layout
4. ✅ More space-efficient
5. ✅ Better UX with visual feedback
6. ✅ Consistent behavior across screen sizes

## Testing Checklist
- [x] Dropdown opens correctly for first row
- [x] Dropdown opens correctly for last row
- [x] Dropdown opens correctly for middle rows
- [x] Dropdown closes on click outside
- [x] Dropdown closes after action selection
- [x] Position updates on scroll
- [x] Position updates on resize
- [x] All actions work correctly
- [x] No console errors

## Browser Compatibility
- Chrome/Edge: ✅
- Firefox: ✅
- Safari: ✅
- Mobile browsers: ✅

## Future Enhancements
- [ ] Keyboard navigation (arrow keys)
- [ ] Animation/transition effects
- [ ] Customizable dropdown width
- [ ] Support for nested menus
- [ ] Accessibility improvements (ARIA labels)
