# PACS/RIS Order Workflow Documentation

## Overview

This document describes the order status workflow implemented in the MWL-PACS system, based on DICOM standards (MPPS/SPS) and IHE Radiology Technical Framework.

## Workflow Phases

The order lifecycle is divided into 5 main phases:

### 1. Pre-Examination Phase (Order Preparation)
- **DRAFT** → **ENQUEUED** → **PUBLISHED** → **SCHEDULED**

Orders are created, validated, published to DICOM Modality Worklist (MWL), and scheduled for examination.

### 2. Examination Phase (Image Acquisition)
- **ARRIVED** → **IN_PROGRESS** → **COMPLETED** / **DISCONTINUED**

Patient arrives, examination is performed, and images are acquired. Based on DICOM MPPS (Modality Performed Procedure Step).

### 3. Post-Examination Phase (Archiving)
- **COMPLETED** → **ARCHIVED**

Images are processed and archived to PACS.

### 4. Reporting Phase (Report Creation)
- **COMPLETED** → **REPORTED** → **VERIFIED**

Radiologist creates and verifies the diagnostic report.

### 5. Exception Handling
- **NO_SHOW**, **RESCHEDULED**, **CANCELLED**

Handles appointment no-shows, rescheduling, and cancellations.

---

## Detailed Status Definitions

### Pre-Examination Statuses

#### DRAFT 📝
- **Description**: Order is being prepared, not yet finalized
- **Phase**: Pre-Examination
- **Transitions**: → ENQUEUED, CANCELLED
- **Use Case**: Initial order creation, data entry in progress

#### ENQUEUED 📋
- **Description**: Order added to MWL queue, pending publish
- **Phase**: Pre-Examination
- **Transitions**: → PUBLISHED, CANCELLED
- **Use Case**: Order validated and queued for publication

#### PUBLISHED 📤
- **Description**: Order published to DICOM Modality Worklist (MWL)
- **Phase**: Pre-Examination
- **Transitions**: → SCHEDULED, CANCELLED
- **Use Case**: Order visible to modality equipment via DICOM MWL query
- **DICOM**: Implements DICOM Modality Worklist service

#### SCHEDULED 📅
- **Description**: Scheduled Procedure Step (SPS) created, waiting for patient
- **Phase**: Pre-Examination
- **Transitions**: → ARRIVED, NO_SHOW, RESCHEDULED, CANCELLED
- **Use Case**: Appointment scheduled with specific date/time
- **DICOM**: DICOM SPS Status - Patient Demographics and procedure information available

### Examination Statuses

#### ARRIVED ✅
- **Description**: Patient checked-in and ready for examination
- **Phase**: Examination
- **Transitions**: → IN_PROGRESS, NO_SHOW, CANCELLED
- **Use Case**: Patient registration/check-in complete
- **DICOM**: DICOM SPS Status (refinement)

#### IN_PROGRESS ⚡
- **Description**: Examination is being performed
- **Phase**: Examination
- **Transitions**: → COMPLETED, DISCONTINUED
- **Use Case**: Modality actively acquiring images
- **DICOM**: DICOM MPPS Status - N-CREATE message sent to RIS/PACS
- **Technical**: MPPS N-CREATE sets status to "IN PROGRESS"

#### COMPLETED ✔️
- **Description**: Examination completed, images acquired
- **Phase**: Post-Examination
- **Transitions**: → REPORTED, ARCHIVED
- **Use Case**: All images successfully acquired and sent to PACS
- **DICOM**: DICOM MPPS Status - N-SET message with "COMPLETED" status
- **Technical**: Includes list of all image instances created

#### DISCONTINUED ⚠️
- **Description**: Examination started but could not be completed
- **Phase**: Post-Examination
- **Transitions**: → RESCHEDULED, CANCELLED
- **Use Case**: Examination interrupted due to patient condition, equipment failure, etc.
- **DICOM**: DICOM MPPS Status - N-SET message with "DISCONTINUED" status
- **Technical**: May include reason for discontinuation

### Reporting Statuses

#### REPORTED 📄
- **Description**: Radiologist report created, pending verification
- **Phase**: Reporting
- **Transitions**: → VERIFIED, COMPLETED (if report rejected)
- **Use Case**: Initial report draft created by radiologist

#### VERIFIED ✓
- **Description**: Report verified and finalized
- **Phase**: Reporting
- **Transitions**: → ARCHIVED
- **Use Case**: Final approved report, ready for distribution

#### ARCHIVED 📦
- **Description**: Images and report archived to PACS
- **Phase**: Post-Examination
- **Transitions**: None (terminal state)
- **Use Case**: Complete study archived for long-term storage

### Exception Statuses

#### NO_SHOW ❌
- **Description**: Patient did not show up for scheduled appointment
- **Phase**: Exception
- **Transitions**: → RESCHEDULED, CANCELLED
- **Use Case**: Patient absence recorded after waiting period

#### RESCHEDULED 🔄
- **Description**: Order rescheduled for a new date/time
- **Phase**: Exception
- **Transitions**: → SCHEDULED, CANCELLED
- **Use Case**: Appointment moved to different time slot

#### CANCELLED 🚫
- **Description**: Order cancelled, will not be performed
- **Phase**: Exception
- **Transitions**: None (terminal state)
- **Use Case**: Order withdrawn by physician or patient

---

## Status Transition Rules

### Valid Transitions Matrix

```
FROM          → TO (allowed transitions)
─────────────────────────────────────────────────────
DRAFT         → ENQUEUED, CANCELLED
ENQUEUED      → PUBLISHED, CANCELLED
PUBLISHED     → SCHEDULED, CANCELLED
SCHEDULED     → ARRIVED, NO_SHOW, RESCHEDULED, CANCELLED
ARRIVED       → IN_PROGRESS, NO_SHOW, CANCELLED
IN_PROGRESS   → COMPLETED, DISCONTINUED
COMPLETED     → REPORTED, ARCHIVED
DISCONTINUED  → RESCHEDULED, CANCELLED
REPORTED      → VERIFIED, COMPLETED
VERIFIED      → ARCHIVED
ARCHIVED      → (none - terminal)
NO_SHOW       → RESCHEDULED, CANCELLED
RESCHEDULED   → SCHEDULED, CANCELLED
CANCELLED     → (none - terminal)
```

### Transition Validation

All status changes are validated using the `isValidTransition(current, new)` function:

```javascript
import { isValidTransition } from '../config/orderStatus'

// Example usage
if (isValidTransition('scheduled', 'arrived')) {
  // Allow transition
} else {
  // Reject transition
}
```

---

## DICOM Standards Compliance

### DICOM Modality Worklist (MWL)

Statuses: **PUBLISHED**, **SCHEDULED**, **ARRIVED**

The MWL service provides patient and procedure information to modalities. When an order reaches **PUBLISHED** status, it becomes queryable via DICOM C-FIND MWL.

**DICOM Tags Used:**
- (0010,0010) Patient Name
- (0010,0020) Patient ID
- (0008,0050) Accession Number
- (0040,0100) Scheduled Procedure Step Sequence
- (0040,0001) Scheduled Station AE Title
- (0040,0002) Scheduled Procedure Step Start Date/Time

### DICOM Modality Performed Procedure Step (MPPS)

Statuses: **IN_PROGRESS**, **COMPLETED**, **DISCONTINUED**

MPPS communicates exam status from modality to RIS/PACS:

1. **N-CREATE** (Status: IN PROGRESS)
   - Sent when examination starts
   - Informs RIS/PACS that acquisition has begun

2. **N-SET** (Status: COMPLETED)
   - Sent when examination finishes successfully
   - Includes list of all created image instances

3. **N-SET** (Status: DISCONTINUED)
   - Sent if examination cannot be completed
   - May include discontinuation reason code

**Benefits:**
- RIS knows exam status in real-time
- PACS can verify all images received
- Enables workflow automation
- Improves departmental efficiency

---

## Integration Points

### RIS (Radiology Information System)
- Creates orders (DRAFT → ENQUEUED)
- Manages scheduling (SCHEDULED)
- Receives MPPS status updates (IN_PROGRESS, COMPLETED, DISCONTINUED)
- Stores reports (REPORTED, VERIFIED)

### PACS (Picture Archiving and Communication System)
- Subscribes to MWL (PUBLISHED)
- Receives images during acquisition (IN_PROGRESS)
- Validates image completeness via MPPS (COMPLETED)
- Archives studies (ARCHIVED)

### Modality Equipment (CT, MR, CR, etc.)
- Queries MWL for worklist (SCHEDULED)
- Sends MPPS updates during exam (IN_PROGRESS → COMPLETED/DISCONTINUED)
- Transmits images to PACS

---

## UI Components

### StatusBadge
Displays current status with color coding and DICOM indicator.

```jsx
import StatusBadge from '../components/StatusBadge'

<StatusBadge status="in_progress" showIcon={true} />
```

### StatusFlowDiagram
Visual workflow diagram showing all statuses and transitions.

```jsx
import StatusFlowDiagram from '../components/StatusFlowDiagram'

<StatusFlowDiagram currentStatus="scheduled" />
```

### StatusTimeline
Shows chronological history of status changes.

```jsx
import StatusTimeline from '../components/StatusTimeline'

<StatusTimeline history={[
  { status: 'scheduled', timestamp: '2025-01-01T09:00:00Z', user: 'admin' },
  { status: 'draft', timestamp: '2025-01-01T08:00:00Z', user: 'tech' }
]} />
```

### StatusChanger
Interactive UI for changing status with validation.

```jsx
import StatusChanger from '../components/StatusChanger'

<StatusChanger
  currentStatus="scheduled"
  onStatusChange={async (data) => {
    await updateOrderStatus(orderId, data)
  }}
/>
```

---

## API Integration

### Update Order Status

```javascript
import { api } from './services/api'

// Update order status
await api.updateOrder(orderId, {
  status: 'in_progress',
  status_history: [
    ...existingHistory,
    {
      status: 'in_progress',
      timestamp: new Date().toISOString(),
      user: currentUser.username,
      notes: 'Examination started'
    }
  ]
})
```

### Status History Tracking

All status changes should be tracked in `status_history` array:

```javascript
{
  id: 'order-123',
  status: 'in_progress',
  status_history: [
    {
      status: 'in_progress',
      timestamp: '2025-01-01T10:00:00Z',
      user: 'tech_john',
      notes: 'Patient ready, starting CT scan'
    },
    {
      status: 'arrived',
      timestamp: '2025-01-01T09:45:00Z',
      user: 'receptionist_mary',
      notes: 'Patient checked in'
    },
    {
      status: 'scheduled',
      timestamp: '2024-12-28T14:00:00Z',
      user: 'scheduler_bob',
      notes: 'Scheduled for Jan 1'
    }
  ]
}
```

---

## Best Practices

### 1. Always Validate Transitions
```javascript
import { isValidTransition } from '../config/orderStatus'

if (!isValidTransition(currentStatus, newStatus)) {
  throw new Error(`Invalid transition from ${currentStatus} to ${newStatus}`)
}
```

### 2. Track Status History
Always append to status_history, never replace it.

### 3. Include User and Timestamp
Record who made the change and when.

### 4. Add Meaningful Notes
Especially for exceptions (NO_SHOW, DISCONTINUED, CANCELLED).

### 5. Handle MPPS Status Updates
When receiving MPPS from modality, update order status accordingly.

### 6. Notify Relevant Systems
Status changes should trigger notifications to RIS, HIS, and users.

---

## References

- **DICOM Standard Part 3**: Information Object Definitions
- **DICOM Standard Part 4**: Service Class Specifications (MWL, MPPS)
- **IHE Radiology Technical Framework**: Scheduled Workflow Profile
- **DICOM Supplement 17**: Modality Performed Procedure Step
- **IHE Patient Information Reconciliation**: PIR Profile

---

## Change Log

| Date | Version | Changes |
|------|---------|---------|
| 2025-01-02 | 1.0 | Initial workflow documentation |
