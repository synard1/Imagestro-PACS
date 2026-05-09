# Worklist Component Architecture

**Date**: November 18, 2025

---

## Component Hierarchy

```
┌─────────────────────────────────────────────────────────────────┐
│                        Worklist Page                             │
│                    (src/pages/Worklist.jsx)                      │
│                                                                   │
│  ┌────────────────────────────────────────────────────────────┐ │
│  │                    Header Section                           │ │
│  │  • Title: "Worklist Management"                            │ │
│  │  • Storage Indicator                                       │ │
│  │  • Date Picker                                             │ │
│  └────────────────────────────────────────────────────────────┘ │
│                                                                   │
│  ┌────────────────────────────────────────────────────────────┐ │
│  │                  Summary Dashboard                          │ │
│  │  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐     │ │
│  │  │  Total   │ │Scheduled │ │In Progress│ │Completed │     │ │
│  │  │  Orders  │ │  Orders  │ │  Orders   │ │  Orders  │     │ │
│  │  └──────────┘ └──────────┘ └──────────┘ └──────────┘     │ │
│  └────────────────────────────────────────────────────────────┘ │
│                                                                   │
│  ┌────────────────────────────────────────────────────────────┐ │
│  │                    Filters Section                          │ │
│  │  • Search Input (patient, accession, order)                │ │
│  │  • Modality Dropdown (CT, MR, CR, etc.)                    │ │
│  │  • Status Dropdown (scheduled, arrived, etc.)              │ │
│  │  • Priority Dropdown (STAT, urgent, routine)               │ │
│  │  • Clear Filters Button                                    │ │
│  └────────────────────────────────────────────────────────────┘ │
│                                                                   │
│  ┌────────────────────────────────────────────────────────────┐ │
│  │                   Worklist Table                            │ │
│  │  ┌──────────────────────────────────────────────────────┐  │ │
│  │  │ Order Info │ Patient │ Procedure │ Schedule │ ... │  │  │ │
│  │  ├──────────────────────────────────────────────────────┤  │ │
│  │  │ ORD-001    │ John    │ CT Brain  │ 10:00    │ ... │  │  │ │
│  │  │            │         │           │          │     │  │  │ │
│  │  │  ┌─────────────────────────────────────────────┐   │  │  │ │
│  │  │  │        WorklistStatusBadge                  │   │  │  │ │
│  │  │  │  • Icon + Label                             │   │  │  │ │
│  │  │  │  • Color-coded                              │   │  │  │ │
│  │  │  └─────────────────────────────────────────────┘   │  │  │ │
│  │  │            │         │           │          │     │  │  │ │
│  │  │  ┌─────────────────────────────────────────────┐   │  │  │ │
│  │  │  │       WorklistPriorityBadge                 │   │  │  │ │
│  │  │  │  • Icon + Label                             │   │  │  │ │
│  │  │  │  • Color-coded                              │   │  │  │ │
│  │  │  └─────────────────────────────────────────────┘   │  │  │ │
│  │  │            │         │           │          │     │  │  │ │
│  │  │  ┌─────────────────────────────────────────────┐   │  │  │ │
│  │  │  │         WorklistActions                     │   │  │  │ │
│  │  │  │  • Check In Button                          │   │  │  │ │
│  │  │  │  • Start Exam Button                        │   │  │  │ │
│  │  │  │  • Upload Button                            │   │  │  │ │
│  │  │  │  • Reschedule Button                        │   │  │  │ │
│  │  │  │  • Cancel Button                            │   │  │  │ │
│  │  │  └─────────────────────────────────────────────┘   │  │  │ │
│  │  └──────────────────────────────────────────────────────┘  │ │
│  └────────────────────────────────────────────────────────────┘ │
│                                                                   │
│  ┌────────────────────────────────────────────────────────────┐ │
│  │                      Modals                                 │ │
│  │                                                             │ │
│  │  ┌──────────────────────────────────────────────────────┐ │ │
│  │  │            OrderUploadModal                          │ │ │
│  │  │  • Order Context Display                             │ │ │
│  │  │  • Patient Information                               │ │ │
│  │  │  • DicomUpload Component                             │ │ │
│  │  │  • Upload Result Display                             │ │ │
│  │  └──────────────────────────────────────────────────────┘ │ │
│  │                                                             │ │
│  │  ┌──────────────────────────────────────────────────────┐ │ │
│  │  │           RescheduleModal                            │ │ │
│  │  │  • Current Schedule Display                          │ │ │
│  │  │  • Date Picker                                       │ │ │
│  │  │  • Available Slots Grid                              │ │ │
│  │  │  • Manual Time Input                                 │ │ │
│  │  │  • Reason Text Area                                  │ │ │
│  │  └──────────────────────────────────────────────────────┘ │ │
│  │                                                             │ │
│  │  ┌──────────────────────────────────────────────────────┐ │ │
│  │  │           CancelOrderModal                           │ │ │
│  │  │  • Warning Message                                   │ │ │
│  │  │  • Order Details Display                             │ │ │
│  │  │  • Reason Text Area (Required)                       │ │ │
│  │  │  • Confirmation Buttons                              │ │ │
│  │  └──────────────────────────────────────────────────────┘ │ │
│  └────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────┘
```

---

## Data Flow

```
┌─────────────────────────────────────────────────────────────────┐
│                         User Actions                             │
└────────────────────────┬────────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────────┐
│                    Component Handlers                            │
│  • handleStatusChange()                                          │
│  • handleUploadClick()                                           │
│  • handleRescheduleClick()                                       │
│  • handleCancelClick()                                           │
└────────────────────────┬────────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────────┐
│                   Worklist Service                               │
│                (worklistService.js)                              │
│  • getWorklist()                                                 │
│  • updateOrderStatus()                                           │
│  • rescheduleOrder()                                             │
│  • cancelOrder()                                                 │
│  • getAvailableSlots()                                           │
└────────────────────────┬────────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────────┐
│                      API Layer                                   │
│                   (fetchJson / api.js)                           │
└────────────────────────┬────────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────────┐
│                  Backend API / Mock Data                         │
│  • /api/worklist                                                 │
│  • /api/orders/:id/status                                        │
│  • /api/orders/:id/reschedule                                    │
│  • /api/orders/:id/cancel                                        │
│  • /api/schedule/slots                                           │
└────────────────────────┬────────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────────┐
│                      Database                                    │
│  • orders table                                                  │
│  • worklist_items table                                          │
│  • worklist_history table                                        │
│  • schedule_slots table                                          │
└─────────────────────────────────────────────────────────────────┘
```

---

## State Management Flow

```
┌─────────────────────────────────────────────────────────────────┐
│                    Worklist Page State                           │
│                                                                   │
│  ┌────────────────────────────────────────────────────────────┐ │
│  │                    Data State                               │ │
│  │  • rows: []              (worklist items)                   │ │
│  │  • summary: {}           (statistics)                       │ │
│  │  • loading: false        (loading indicator)                │ │
│  └────────────────────────────────────────────────────────────┘ │
│                                                                   │
│  ┌────────────────────────────────────────────────────────────┐ │
│  │                   Filter State                              │ │
│  │  • searchQuery: ''       (search text)                      │ │
│  │  • selectedModality: ''  (modality filter)                  │ │
│  │  • selectedStatus: ''    (status filter)                    │ │
│  │  • selectedPriority: ''  (priority filter)                  │ │
│  │  • selectedDate: ''      (date filter)                      │ │
│  └────────────────────────────────────────────────────────────┘ │
│                                                                   │
│  ┌────────────────────────────────────────────────────────────┐ │
│  │                   Modal State                               │ │
│  │  • selectedOrder: null   (current order)                    │ │
│  │  • showUploadModal: false                                   │ │
│  │  • showRescheduleModal: false                               │ │
│  │  • showCancelModal: false                                   │ │
│  └──────────��─────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────┘
```

---

## Component Props

### WorklistStatusBadge
```jsx
<WorklistStatusBadge 
  status="scheduled"           // Required: order status
  showIcon={true}              // Optional: show icon
  showDescription={false}      // Optional: show tooltip
  className=""                 // Optional: additional classes
/>
```

### WorklistPriorityBadge
```jsx
<WorklistPriorityBadge 
  priority="urgent"            // Required: order priority
  showIcon={true}              // Optional: show icon
  className=""                 // Optional: additional classes
/>
```

### WorklistActions
```jsx
<WorklistActions
  order={order}                // Required: order object
  onStatusChange={handler}     // Optional: status change callback
  onUpload={handler}           // Optional: upload callback
  onReschedule={handler}       // Optional: reschedule callback
  onCancel={handler}           // Optional: cancel callback
  compact={false}              // Optional: compact mode
/>
```

### OrderUploadModal
```jsx
<OrderUploadModal
  order={order}                // Required: order object
  onClose={handler}            // Required: close callback
  onUploadComplete={handler}   // Optional: upload complete callback
/>
```

### RescheduleModal
```jsx
<RescheduleModal
  order={order}                // Required: order object
  onClose={handler}            // Required: close callback
  onComplete={handler}         // Optional: reschedule complete callback
/>
```

### CancelOrderModal
```jsx
<CancelOrderModal
  order={order}                // Required: order object
  onClose={handler}            // Required: close callback
  onComplete={handler}         // Optional: cancel complete callback
/>
```

---

## Event Flow Examples

### Status Change Flow
```
User clicks "Check In" button
    ↓
WorklistActions.handleStatusChange()
    ↓
worklistService.updateOrderStatus(orderId, 'arrived')
    ↓
API: PATCH /api/orders/:id/status
    ↓
Backend updates order status
    ↓
Response: { status: 'arrived', updated_at: '...' }
    ↓
Worklist.handleStatusChange()
    ↓
Worklist.loadWorklist() (refresh data)
    ↓
UI updates with new status
```

### Upload Flow
```
User clicks "Upload" button
    ↓
Worklist.handleUploadClick(order)
    ↓
Set selectedOrder = order
Set showUploadModal = true
    ↓
OrderUploadModal renders
    ↓
User uploads DICOM files
    ↓
DicomUpload component processes files
    ↓
Files uploaded to backend
    ↓
Order status updated to 'completed'
    ↓
OrderUploadModal.handleUploadComplete()
    ↓
Worklist.handleUploadComplete()
    ↓
Worklist.loadWorklist() (refresh data)
    ↓
Modal closes, UI updates
```

### Reschedule Flow
```
User clicks "Reschedule" button
    ↓
Worklist.handleRescheduleClick(order)
    ↓
Set selectedOrder = order
Set showRescheduleModal = true
    ↓
RescheduleModal renders
    ↓
User selects new date
    ↓
RescheduleModal.loadAvailableSlots()
    ↓
API: GET /api/schedule/slots?date=...
    ↓
Display available slots
    ↓
User selects time and provides reason
    ↓
User clicks "Reschedule Order"
    ↓
RescheduleModal.handleSubmit()
    ↓
worklistService.rescheduleOrder(orderId, newDateTime, reason)
    ↓
API: POST /api/orders/:id/reschedule
    ↓
Backend updates schedule
    ↓
RescheduleModal.onComplete()
    ↓
Worklist.handleRescheduleComplete()
    ↓
Worklist.loadWorklist() (refresh data)
    ↓
Modal closes, UI updates
```

---

## Styling Architecture

### Color System
```css
/* Status Colors */
.status-draft     { @apply bg-gray-100 text-gray-800 border-gray-300; }
.status-created   { @apply bg-blue-100 text-blue-800 border-blue-300; }
.status-scheduled { @apply bg-indigo-100 text-indigo-800 border-indigo-300; }
.status-arrived   { @apply bg-cyan-100 text-cyan-800 border-cyan-300; }
.status-progress  { @apply bg-blue-100 text-blue-800 border-blue-300; }
.status-completed { @apply bg-green-100 text-green-800 border-green-300; }
.status-cancelled { @apply bg-red-100 text-red-800 border-red-300; }

/* Priority Colors */
.priority-stat    { @apply bg-red-100 text-red-800 border-red-300; }
.priority-urgent  { @apply bg-orange-100 text-orange-800 border-orange-300; }
.priority-routine { @apply bg-blue-100 text-blue-800 border-blue-300; }
.priority-low     { @apply bg-gray-100 text-gray-800 border-gray-300; }
```

### Component Classes
```css
/* Badges */
.badge-base {
  @apply inline-flex items-center gap-1 px-2.5 py-1 
         rounded-full text-xs font-semibold border;
}

/* Buttons */
.btn-primary {
  @apply px-3 py-1.5 text-sm font-medium rounded-lg 
         bg-blue-600 text-white hover:bg-blue-700 
         transition-colors;
}

.btn-danger {
  @apply px-3 py-1.5 text-sm font-medium rounded-lg 
         bg-red-600 text-white hover:bg-red-700 
         transition-colors;
}

/* Cards */
.card {
  @apply bg-white rounded-lg shadow border border-gray-200;
}

/* Table */
.table {
  @apply min-w-full divide-y divide-gray-200;
}

.table thead {
  @apply bg-gray-50;
}

.table th {
  @apply px-4 py-3 text-left text-xs font-medium 
         text-gray-500 uppercase tracking-wider;
}

.table td {
  @apply px-4 py-4 whitespace-nowrap text-sm;
}
```

---

## Performance Considerations

### Optimization Strategies

1. **Memoization**
   - Filter results memoized with useMemo
   - Expensive calculations cached

2. **Lazy Loading**
   - Modals loaded on-demand
   - Components split for code splitting

3. **Debouncing**
   - Search input debounced (300ms)
   - API calls throttled

4. **Optimistic Updates**
   - UI updates before API confirmation
   - Rollback on error

5. **Caching**
   - Summary data cached
   - Filter results cached

---

## Accessibility Features

1. **Keyboard Navigation**
   - Tab order logical
   - Enter/Space for actions
   - Escape to close modals

2. **Screen Reader Support**
   - ARIA labels on buttons
   - ARIA descriptions on badges
   - Semantic HTML structure

3. **Visual Indicators**
   - Focus rings on interactive elements
   - Loading states
   - Error messages

4. **Color Contrast**
   - WCAG AA compliant
   - Text readable on backgrounds
   - Icons supplemented with text

---

**Last Updated**: November 18, 2025  
**Version**: 1.0
