# Worklist UI Implementation Guide

**Date**: November 18, 2025  
**Version**: 1.0  
**Status**: Complete

---

## Overview

This document describes the frontend implementation of the Worklist Management System based on the comprehensive [WORKLIST_SYSTEM_DOCUMENTATION.md](./WORKLIST_SYSTEM_DOCUMENTATION.md).

## Architecture

### Components Structure

```
src/
├── pages/
│   └── Worklist.jsx                    # Main worklist page
├── components/
│   └── worklist/
│       ├── WorklistStatusBadge.jsx     # Status display component
│       ├── WorklistPriorityBadge.jsx   # Priority display component
│       ├── WorklistActions.jsx         # Action buttons component
│       ├── OrderUploadModal.jsx        # Upload DICOM modal
│       ├── RescheduleModal.jsx         # Reschedule order modal
│       └── CancelOrderModal.jsx        # Cancel order modal
└── services/
    └── worklistService.js              # Worklist API service
```

---

## Features Implemented

### 1. Worklist Management Page

**Location**: `src/pages/Worklist.jsx`

**Features**:
- ✅ Real-time worklist display
- ✅ Summary statistics dashboard
- ✅ Advanced filtering (search, modality, status, priority, date)
- ✅ Status-based workflow actions
- ✅ Responsive table layout
- ✅ Integration with backend/mock data

**Key Components**:
```jsx
// Summary Cards
- Total Orders
- Scheduled Orders
- In Progress Orders
- Completed Orders

// Filters
- Search (patient, accession, order number)
- Modality filter (CT, MR, CR, DX, US, MG, NM, PT)
- Status filter (scheduled, arrived, in_progress, etc.)
- Priority filter (STAT, urgent, routine)
- Date filter (calendar picker)

// Worklist Table
- Order information (order number, accession number)
- Patient demographics
- Procedure details
- Schedule information
- Priority badge
- Status badge
- Action buttons
```

### 2. Status Management

**Location**: `src/services/worklistService.js`

**Status Workflow**:
```
DRAFT → CREATED → SCHEDULED → ARRIVED → IN_PROGRESS → 
COMPLETED → REPORTED → FINALIZED → DELIVERED
```

**Status Definitions**:
- **DRAFT**: Order being created
- **CREATED**: Order created, awaiting scheduling
- **SCHEDULED**: Order scheduled for specific date/time
- **ENQUEUED**: In queue for today
- **RESCHEDULED**: Order rescheduled
- **ARRIVED**: Patient checked in
- **IN_PROGRESS**: Examination in progress
- **COMPLETED**: Examination completed
- **REPORTED**: Report created
- **FINALIZED**: Report signed
- **DELIVERED**: Result delivered to doctor
- **CANCELLED**: Order cancelled
- **NO_SHOW**: Patient did not arrive

**Status Badge Component**:
```jsx
<WorklistStatusBadge 
  status="scheduled" 
  showIcon={true}
  showDescription={false}
/>
```

### 3. Priority Management

**Priority Levels**:
- **STAT**: Emergency (red, highest priority)
- **HIGH/URGENT**: Urgent (orange)
- **ROUTINE**: Normal (blue)
- **MEDIUM**: Medium (gray)
- **LOW**: Low priority (gray)

**Priority Badge Component**:
```jsx
<WorklistPriorityBadge 
  priority="stat" 
  showIcon={true}
/>
```

### 4. Workflow Actions

**Location**: `src/components/worklist/WorklistActions.jsx`

**Dynamic Actions Based on Status**:

| Current Status | Available Actions |
|---------------|-------------------|
| DRAFT | Complete Order |
| CREATED | Schedule |
| SCHEDULED | Check In, Reschedule, Mark No Show, Upload, Cancel |
| ARRIVED | Start Exam, Upload, Cancel |
| IN_PROGRESS | Complete Exam, Upload, Cancel |
| COMPLETED | Create Report |
| REPORTED | Sign Report |
| FINALIZED | Deliver Result |
| NO_SHOW | Reschedule |

**Usage**:
```jsx
<WorklistActions
  order={order}
  onStatusChange={handleStatusChange}
  onUpload={handleUploadClick}
  onReschedule={handleRescheduleClick}
  onCancel={handleCancelClick}
  compact={false}
/>
```

### 5. Upload Integration

**Location**: `src/components/worklist/OrderUploadModal.jsx`

**Features**:
- Order context display
- Patient information validation
- DICOM file upload
- Automatic order status update
- Success/error feedback

**Workflow**:
1. User clicks "Upload" button on worklist item
2. Modal opens with order context
3. User drags & drops DICOM files
4. System validates files against order
5. Files uploaded and linked to order
6. Order status updated to COMPLETED
7. Worklist refreshed

### 6. Reschedule Functionality

**Location**: `src/components/worklist/RescheduleModal.jsx`

**Features**:
- Current schedule display
- Date picker (minimum: today)
- Available time slots display
- Manual time input (fallback)
- Reason for rescheduling
- Reschedule history tracking

**Workflow**:
1. User clicks "Reschedule" button
2. Modal shows current schedule
3. User selects new date
4. System loads available slots for that date
5. User selects time slot or enters manually
6. User provides reason
7. Order rescheduled
8. Worklist refreshed

### 7. Cancel Functionality

**Location**: `src/components/worklist/CancelOrderModal.jsx`

**Features**:
- Warning message
- Order details confirmation
- Required cancellation reason
- Audit trail recording

**Workflow**:
1. User clicks "Cancel" button
2. Modal shows warning and order details
3. User must provide cancellation reason
4. Confirmation required
5. Order cancelled
6. Removed from active worklist
7. Recorded in audit log

---

## API Integration

### Worklist Service

**Location**: `src/services/worklistService.js`

**Key Functions**:

```javascript
// Get worklist with filters
await getWorklist({
  date: '2025-11-18',
  modality: 'CT',
  status: 'scheduled',
  priority: 'urgent',
  search: 'John Doe'
});

// Get worklist item by ID
await getWorklistItem(orderId);

// Update order status
await updateOrderStatus(orderId, 'arrived', 'Patient checked in');

// Reschedule order
await rescheduleOrder(orderId, '2025-11-19 14:00', 'Patient request');

// Cancel order
await cancelOrder(orderId, 'Equipment malfunction');

// Get available slots
await getAvailableSlots(modalityId, '2025-11-18');

// Book slot
await bookSlot(slotId, orderId);

// Get summary statistics
await getWorklistSummary('2025-11-18');
```

### Backend Endpoints

**Expected API Routes**:

```
GET    /api/worklist                    # Get worklist items
GET    /api/worklist/:id                # Get specific item
GET    /api/worklist/summary            # Get statistics
PATCH  /api/orders/:id/status           # Update status
POST   /api/orders/:id/reschedule       # Reschedule order
POST   /api/orders/:id/cancel           # Cancel order
GET    /api/schedule/slots              # Get available slots
POST   /api/schedule/slots/:id/book     # Book slot
```

**Request/Response Examples**:

```javascript
// Update Status
PATCH /api/orders/123/status
{
  "status": "arrived",
  "notes": "Patient checked in"
}

// Response
{
  "id": "123",
  "status": "arrived",
  "updated_at": "2025-11-18T10:00:00Z"
}

// Reschedule
POST /api/orders/123/reschedule
{
  "new_scheduled_at": "2025-11-19 14:00",
  "reason": "Patient request"
}

// Response
{
  "id": "123",
  "scheduled_at": "2025-11-19 14:00",
  "status": "rescheduled",
  "reschedule_history": [...]
}
```

---

## Mock Data Support

The system supports both backend API and mock data modes.

**Mock Data Location**: `src/data/worklist.json`

**Mock Data Structure**:
```json
{
  "id": "o-1001",
  "patient_id": "10000001",
  "patient_name": "John Doe",
  "patient_dob": "1985-03-15",
  "patient_sex": "M",
  "accession_no": "251028-0042",
  "order_number": "ORD-2025-0042",
  "modality": "CT",
  "requested_procedure": "CT Head Non-Contrast",
  "procedure_code": "CT001",
  "station_ae_title": "CT_ROOM1",
  "scheduled_date": "2025-10-29",
  "scheduled_time": "09:00",
  "status": "scheduled",
  "priority": "routine",
  "referring_physician": "Dr. Ahmad Santoso"
}
```

---

## Styling & UI/UX

### Design System

**Colors**:
- Primary: Blue (#2563EB)
- Success: Green (#10B981)
- Warning: Yellow/Orange (#F59E0B)
- Danger: Red (#EF4444)
- Info: Cyan (#06B6D4)

**Status Colors**:
- Draft: Gray
- Created: Blue
- Scheduled: Indigo
- Arrived: Cyan
- In Progress: Blue
- Completed: Green
- Cancelled: Red
- No Show: Orange

**Priority Colors**:
- STAT: Red
- Urgent: Orange
- Routine: Blue
- Low: Gray

### Responsive Design

- **Desktop**: Full table with all columns
- **Tablet**: Condensed columns, compact actions
- **Mobile**: Card-based layout (future enhancement)

### Accessibility

- ✅ Keyboard navigation support
- ✅ ARIA labels on interactive elements
- ✅ Color contrast compliance (WCAG AA)
- ✅ Screen reader friendly
- ✅ Focus indicators

---

## State Management

### Local State (React useState)

```javascript
// Worklist data
const [rows, setRows] = useState([])
const [summary, setSummary] = useState(null)
const [loading, setLoading] = useState(true)

// Filters
const [searchQuery, setSearchQuery] = useState('')
const [selectedModality, setSelectedModality] = useState('')
const [selectedStatus, setSelectedStatus] = useState('')
const [selectedPriority, setSelectedPriority] = useState('')
const [selectedDate, setSelectedDate] = useState('')

// Modals
const [selectedOrder, setSelectedOrder] = useState(null)
const [showUploadModal, setShowUploadModal] = useState(false)
const [showRescheduleModal, setShowRescheduleModal] = useState(false)
const [showCancelModal, setShowCancelModal] = useState(false)
```

### Data Flow

```
User Action → Component Handler → Service Function → API Call → 
Backend/Mock → Response → Update State → Re-render UI
```

---

## Error Handling

### Service Level

```javascript
try {
  const result = await updateOrderStatus(orderId, newStatus);
  notify({ type: 'success', message: 'Status updated successfully' });
  return result;
} catch (error) {
  console.error('Failed to update status:', error);
  notify({ type: 'error', message: `Failed to update: ${error.message}` });
  throw error;
}
```

### Component Level

```javascript
const handleStatusChange = async (newStatus) => {
  if (loading) return;
  
  try {
    setLoading(true);
    await updateOrderStatus(order.id, newStatus);
    
    if (onStatusChange) {
      onStatusChange(newStatus);
    }
  } catch (error) {
    // Error already handled by service
  } finally {
    setLoading(false);
  }
};
```

---

## Performance Optimization

### Implemented Optimizations

1. **Debounced Search**: Search input debounced to reduce API calls
2. **Memoized Filters**: useMemo for expensive filter operations
3. **Lazy Loading**: Components loaded on-demand
4. **Optimistic Updates**: UI updates before API confirmation
5. **Caching**: Summary data cached for quick access

### Future Optimizations

- [ ] Virtual scrolling for large worklists
- [ ] Pagination support
- [ ] WebSocket for real-time updates
- [ ] Service worker for offline support

---

## Testing

### Manual Testing Checklist

**Worklist Display**:
- [ ] Worklist loads correctly
- [ ] Summary cards show accurate counts
- [ ] Filters work as expected
- [ ] Search finds correct items
- [ ] Date filter updates worklist

**Status Workflow**:
- [ ] Status badges display correctly
- [ ] Available actions match current status
- [ ] Status transitions work
- [ ] Status history recorded

**Upload**:
- [ ] Upload modal opens with correct context
- [ ] Files upload successfully
- [ ] Order status updates after upload
- [ ] Worklist refreshes

**Reschedule**:
- [ ] Reschedule modal shows current schedule
- [ ] Available slots load correctly
- [ ] Date/time selection works
- [ ] Reschedule completes successfully
- [ ] History tracked

**Cancel**:
- [ ] Cancel modal shows warning
- [ ] Reason required
- [ ] Cancellation completes
- [ ] Order removed from active worklist

### Unit Tests (Future)

```javascript
// Example test structure
describe('WorklistService', () => {
  test('getWorklist returns filtered results', async () => {
    const result = await getWorklist({ modality: 'CT' });
    expect(result.every(item => item.modality === 'CT')).toBe(true);
  });
  
  test('updateOrderStatus changes status', async () => {
    const result = await updateOrderStatus('123', 'arrived');
    expect(result.status).toBe('arrived');
  });
});
```

---

## Deployment

### Build Process

```bash
# Install dependencies
npm install

# Build for production
npm run build

# Preview build
npm run preview
```

### Environment Configuration

```javascript
// src/services/config.js
export const config = {
  backendEnabled: true,  // Enable backend API
  apiBaseUrl: process.env.VITE_API_URL || 'http://localhost:3000',
  // ... other config
};
```

### Backend Integration

1. Ensure backend implements required API endpoints
2. Configure CORS for frontend domain
3. Set up authentication/authorization
4. Test API connectivity
5. Monitor API performance

---

## Troubleshooting

### Common Issues

**Issue**: Worklist not loading
- **Check**: Backend API is running
- **Check**: API URL configured correctly
- **Check**: CORS enabled
- **Solution**: Check browser console for errors

**Issue**: Status update fails
- **Check**: User has permission
- **Check**: Status transition is valid
- **Check**: Backend endpoint working
- **Solution**: Review API logs

**Issue**: Upload not working
- **Check**: File size limits
- **Check**: DICOM validation
- **Check**: Storage configuration
- **Solution**: Check upload service logs

**Issue**: Filters not working
- **Check**: Filter values are correct
- **Check**: Backend supports filtering
- **Solution**: Test with mock data first

---

## Future Enhancements

### Planned Features

1. **Real-time Updates**
   - WebSocket integration
   - Live status changes
   - Notification system

2. **Advanced Scheduling**
   - Drag-and-drop scheduling
   - Calendar view
   - Resource management

3. **Reporting**
   - Worklist analytics
   - Performance metrics
   - Export functionality

4. **Mobile App**
   - Native mobile interface
   - Offline support
   - Push notifications

5. **Integration**
   - HL7 FHIR support
   - DICOM MWL C-FIND
   - External EMR systems

---

## References

### Documentation
- [WORKLIST_SYSTEM_DOCUMENTATION.md](./WORKLIST_SYSTEM_DOCUMENTATION.md) - Complete system documentation
- [AGENTS.md](../AGENTS.md) - Repository guidelines
- [PACS_ARCHITECTURE_DIAGRAM.md](../PACS_ARCHITECTURE_DIAGRAM.md) - System architecture

### Standards
- DICOM PS3.4 - Modality Worklist Service Class
- HL7 FHIR ImagingStudy Resource
- IHE Radiology Technical Framework

### Libraries
- React 18
- Heroicons
- TailwindCSS

---

## Changelog

### Version 1.0 (2025-11-18)
- ✅ Initial implementation
- ✅ Worklist page with filters
- ✅ Status management
- ✅ Priority badges
- ✅ Upload integration
- ✅ Reschedule functionality
- ✅ Cancel functionality
- ✅ Mock data support
- ✅ Backend API integration

---

## Support

For questions or issues:
1. Check this documentation
2. Review [WORKLIST_SYSTEM_DOCUMENTATION.md](./WORKLIST_SYSTEM_DOCUMENTATION.md)
3. Check browser console for errors
4. Review API logs
5. Contact development team

---

**Last Updated**: November 18, 2025  
**Maintainer**: Development Team  
**Status**: Production Ready
