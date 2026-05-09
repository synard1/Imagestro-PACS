# Worklist Quick Start Guide

**For Developers** | **5-Minute Setup**

---

## 🚀 Quick Start

### 1. Files Overview

```
✅ Created Files:
├── src/services/worklistService.js          # API service
├── src/components/worklist/
│   ├── WorklistStatusBadge.jsx              # Status badge
│   ├── WorklistPriorityBadge.jsx            # Priority badge
│   ├── WorklistActions.jsx                  # Action buttons
│   ├── RescheduleModal.jsx                  # Reschedule modal
│   └── CancelOrderModal.jsx                 # Cancel modal
├── src/pages/Worklist.jsx                   # Main page (updated)
└── docs/
    ├── WORKLIST_SYSTEM_DOCUMENTATION.md     # Full system docs
    ├── WORKLIST_UI_IMPLEMENTATION.md        # UI implementation
    └── WORKLIST_COMPONENT_DIAGRAM.md        # Component architecture
```

### 2. Test the UI (Mock Mode)

```bash
# Start the dev server
npm run dev

# Navigate to
http://localhost:5173/worklist
```

**What you'll see**:
- ✅ Summary dashboard with statistics
- ✅ Advanced filters (search, modality, status, priority, date)
- ✅ Enhanced worklist table
- ✅ Status and priority badges
- ✅ Action buttons (check in, upload, reschedule, cancel)

### 3. Test Features

#### Test Status Changes
1. Find an order with status "scheduled"
2. Click "Check In" button
3. Status changes to "arrived"
4. Click "Start Exam" button
5. Status changes to "in_progress"

#### Test Upload
1. Click "Upload" button on any order
2. Modal opens with order context
3. Drag & drop DICOM files
4. Files upload successfully

#### Test Reschedule
1. Click "Reschedule" button on scheduled order
2. Select new date
3. View available time slots
4. Select time and provide reason
5. Order rescheduled

#### Test Cancel
1. Click "Cancel" button on any order
2. Warning message displayed
3. Enter cancellation reason
4. Order cancelled

### 4. Backend Integration

#### Required API Endpoints

```javascript
// Worklist
GET    /api/worklist                    // Get worklist items
GET    /api/worklist/:id                // Get specific item
GET    /api/worklist/summary            // Get statistics

// Status Management
PATCH  /api/orders/:id/status           // Update status
POST   /api/orders/:id/reschedule       // Reschedule order
POST   /api/orders/:id/cancel           // Cancel order

// Scheduling
GET    /api/schedule/slots              // Get available slots
POST   /api/schedule/slots/:id/book     // Book slot
```

#### Enable Backend Mode

```javascript
// src/services/config.js
export const config = {
  backendEnabled: true,  // Set to true
  apiBaseUrl: 'http://localhost:3000',
  // ...
};
```

### 5. Database Setup

```bash
# Run the migration
psql -U postgres -d pacs_db -f pacs-service/migrations/006_create_worklist_tables.sql

# Verify tables created
psql -U postgres -d pacs_db -c "\dt worklist*"
```

**Expected tables**:
- ✅ `worklist_items`
- ✅ `worklist_history`
- ✅ `schedule_slots`

---

## 📋 Status Workflow

```
DRAFT → CREATED → SCHEDULED → ARRIVED → IN_PROGRESS → 
COMPLETED → REPORTED → FINALIZED → DELIVERED
```

**Alternative Paths**:
- SCHEDULED → RESCHEDULED → SCHEDULED
- SCHEDULED → NO_SHOW → RESCHEDULED
- Any → CANCELLED (terminal)

---

## 🎨 UI Components

### Status Badge
```jsx
import WorklistStatusBadge from '../components/worklist/WorklistStatusBadge';

<WorklistStatusBadge status="scheduled" showIcon={true} />
```

### Priority Badge
```jsx
import WorklistPriorityBadge from '../components/worklist/WorklistPriorityBadge';

<WorklistPriorityBadge priority="urgent" showIcon={true} />
```

### Actions
```jsx
import WorklistActions from '../components/worklist/WorklistActions';

<WorklistActions
  order={order}
  onStatusChange={handleStatusChange}
  onUpload={handleUploadClick}
  onReschedule={handleRescheduleClick}
  onCancel={handleCancelClick}
/>
```

---

## 🔧 Service Usage

```javascript
import {
  getWorklist,
  updateOrderStatus,
  rescheduleOrder,
  cancelOrder,
  getAvailableSlots
} from '../services/worklistService';

// Get worklist with filters
const worklist = await getWorklist({
  date: '2025-11-18',
  modality: 'CT',
  status: 'scheduled',
  search: 'John Doe'
});

// Update status
await updateOrderStatus(orderId, 'arrived', 'Patient checked in');

// Reschedule
await rescheduleOrder(orderId, '2025-11-19 14:00', 'Patient request');

// Cancel
await cancelOrder(orderId, 'Equipment malfunction');

// Get slots
const slots = await getAvailableSlots(modalityId, '2025-11-18');
```

---

## 🧪 Testing Checklist

### Manual Testing

**Worklist Display**:
- [ ] Page loads without errors
- [ ] Summary cards show correct counts
- [ ] Filters work (search, modality, status, priority, date)
- [ ] Table displays all columns
- [ ] Status badges show correct colors
- [ ] Priority badges show correct colors

**Status Workflow**:
- [ ] "Check In" changes status to arrived
- [ ] "Start Exam" changes status to in_progress
- [ ] "Complete Exam" changes status to completed
- [ ] Status transitions validated

**Upload**:
- [ ] Upload modal opens
- [ ] Order context displayed correctly
- [ ] Files upload successfully
- [ ] Status updates after upload

**Reschedule**:
- [ ] Reschedule modal opens
- [ ] Current schedule displayed
- [ ] Date picker works
- [ ] Available slots load
- [ ] Time selection works
- [ ] Reschedule completes

**Cancel**:
- [ ] Cancel modal opens
- [ ] Warning displayed
- [ ] Reason required
- [ ] Cancellation completes

---

## 🐛 Troubleshooting

### Issue: Worklist not loading
```javascript
// Check browser console
// Verify API endpoint
// Check network tab
// Test with mock data first
```

### Issue: Status update fails
```javascript
// Check status transition is valid
// Verify API endpoint
// Check user permissions
// Review backend logs
```

### Issue: Upload not working
```javascript
// Check file size limits
// Verify DICOM validation
// Check storage configuration
// Review upload service logs
```

### Issue: Filters not working
```javascript
// Check filter values
// Verify backend supports filtering
// Test with mock data
// Check query parameters
```

---

## 📚 Documentation

- **Full System Docs**: `docs/WORKLIST_SYSTEM_DOCUMENTATION.md`
- **UI Implementation**: `docs/WORKLIST_UI_IMPLEMENTATION.md`
- **Component Diagram**: `docs/WORKLIST_COMPONENT_DIAGRAM.md`
- **This Guide**: `docs/WORKLIST_QUICK_START.md`

---

## 🎯 Next Steps

1. **Test in Mock Mode**: Verify all features work with mock data
2. **Backend Integration**: Implement required API endpoints
3. **Database Setup**: Run migration and create tables
4. **Integration Testing**: Test with real backend
5. **Production Deployment**: Deploy to staging then production

---

## 💡 Tips

- **Start with Mock Mode**: Test UI before backend integration
- **Use Browser DevTools**: Monitor network requests and console
- **Check Documentation**: Refer to full docs for details
- **Test Status Workflow**: Verify all transitions work
- **Test Edge Cases**: Try invalid inputs, network errors, etc.

---

## 🆘 Need Help?

1. Check browser console for errors
2. Review documentation
3. Test with mock data
4. Check API logs
5. Contact development team

---

**Ready to Go!** 🚀

The worklist UI is fully implemented and ready for testing. Start with mock mode, then integrate with your backend.

---

**Last Updated**: November 18, 2025  
**Version**: 1.0
