# Order Status Refactoring Summary

## Objective
Hide ENQUEUED and PUBLISHED statuses from the UI since modality/integration with radiology machines is not currently available.

## Changes Made

### 1. Updated Order Status Configuration (`src/config/orderStatus.js`)

Added `hidden: true` property to the ENQUEUED and PUBLISHED statuses:

```javascript
ENQUEUED: {
  key: 'enqueued',
  label: 'Enqueued',
  description: 'Order added to MWL queue, pending publish',
  color: 'blue',
  bgColor: 'bg-blue-100',
  textColor: 'text-blue-700',
  phase: 'pre-exam',
  allowTransitions: ['published', 'cancelled'],
  icon: '📋',
  order: 3,
  hidden: true // Hidden due to lack of modality integration
},
PUBLISHED: {
  key: 'published',
  label: 'Published',
  description: 'Order published to DICOM Modality Worklist (MWL)',
  color: 'indigo',
  bgColor: 'bg-indigo-100',
  textColor: 'text-indigo-700',
  phase: 'pre-exam',
  allowTransitions: ['scheduled', 'cancelled'],
  icon: '📤',
  order: 4,
  hidden: true // Hidden due to lack of modality integration
}
```

### 2. Enhanced Helper Functions

Updated helper functions to respect the `hidden` property:

- `getAllStatuses(includeHidden = false)` - Filter out hidden statuses by default
- `getStatusesByPhase(phase, includeHidden = false)` - Filter out hidden statuses by default
- `getAvailableTransitions(currentStatus, includeHidden = false)` - Filter out hidden statuses by default
- `isValidTransition(currentStatus, newStatus, includeHidden = false)` - Prevent transitions to hidden statuses by default

### 3. Updated Components

Updated all components to use the new functions with `includeHidden = false`:

#### StatusChanger.jsx
- Updated to use `getAvailableTransitions(currentStatus, false)`
- Updated to use `isValidTransition(currentStatus, selectedStatus, false)`

#### OrderWorkflow.jsx
- Updated to use `getAllStatuses(false)` for status selection
- Updated to use `getStatusesByPhase(key, false)` for workflow phases summary
- Updated to use `getAvailableTransitions(selectedStatus, false)` for allowed transitions

#### StatusFlowDiagram.jsx
- Updated to use `getStatusesByPhase(key, false)` for both compact and full views

#### OrderList.jsx
- Updated to use `getAllStatuses(false)` for status filter dropdown

#### Orders.jsx
- Updated to use `getAllStatuses(false)` for status filter dropdown

#### OrderActionButtons.jsx
- Updated to use `getAvailableTransitions(order.status, false)`

## Impact

1. **User Interface**: ENQUEUED and PUBLISHED statuses are no longer visible in:
   - Status selection dropdowns
   - Workflow documentation
   - Status change options
   - Workflow diagrams

2. **Functionality**: 
   - Status transitions to hidden statuses are prevented
   - Existing order data with these statuses will still display correctly
   - All other functionality remains intact

3. **Backward Compatibility**: 
   - The changes are backward compatible
   - Hidden statuses can still be accessed by setting `includeHidden = true`
   - No data is lost or modified

## Future Considerations

When modality integration becomes available:
1. Remove the `hidden: true` property from ENQUEUED and PUBLISHED statuses
2. All UI elements will automatically show these statuses again
3. No code changes will be required