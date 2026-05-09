# Complete PACS Workflow Simulation

## Overview
Sistem workflow PACS lengkap dari hulu ke hilir dengan penyimpanan state di localStorage, memungkinkan simulasi workflow radiologi yang realistis tanpa backend.

## Workflow States

### 1. **SCHEDULED** (Gray)
- Order dibuat dan dijadwalkan
- Pasien belum datang
- **Actions**: Patient arrival, Start exam, Cancel

### 2. **ARRIVED** (Blue)
- Pasien sudah tiba di fasilitas
- Menunggu untuk pemeriksaan
- **Actions**: Start exam, Cancel

### 3. **IN_PROGRESS** (Yellow)
- Pemeriksaan sedang berlangsung
- Teknisi sedang mengambil gambar
- **Actions**: Complete acquisition, Cancel

### 4. **IMAGE_ACQUIRED** (Indigo)
- Gambar sudah diambil
- Belum dikirim ke PACS
- **Actions**: Upload to PACS

### 5. **IMAGES_RECEIVED** (Purple)
- Gambar sudah diterima di PACS
- Tersimpan di storage
- **Actions**: Mark ready for reading

### 6. **READY_FOR_READING** (Cyan)
- Siap untuk dibaca radiolog
- Menunggu assignment
- **Actions**: Start reading

### 7. **READING** (Orange)
- Radiolog sedang membaca
- Report sedang dibuat
- **Actions**: Complete report

### 8. **REPORTED** (Green)
- Report selesai dibuat
- Menunggu verifikasi (optional)
- **Actions**: Verify, Deliver

### 9. **VERIFIED** (Teal)
- Report sudah diverifikasi senior
- Siap untuk dikirim
- **Actions**: Deliver

### 10. **DELIVERED** (Emerald)
- Report sudah dikirim ke dokter pengirim
- Workflow selesai
- **Final State**

### Special States

**CANCELLED** (Red)
- Order dibatalkan
- Tidak akan dilanjutkan

**ON_HOLD** (Amber)
- Sementara ditahan
- Bisa dilanjutkan nanti

## Complete Workflow Flow

```
SCHEDULED
    ↓ (Patient arrives)
ARRIVED
    ↓ (Exam starts)
IN_PROGRESS
    ↓ (Images captured)
IMAGE_ACQUIRED
    ↓ (Upload to PACS)
IMAGES_RECEIVED
    ↓ (QC passed)
READY_FOR_READING
    ↓ (Radiologist assigned)
READING
    ↓ (Report completed)
REPORTED
    ↓ (Senior verifies - optional)
VERIFIED
    ↓ (Sent to referring physician)
DELIVERED
```

## Implementation

### 1. Mock Data Structure

**worklist.json:**
```json
{
  "id": "o-1001",
  "patient_id": "10000001",
  "patient_name": "Ardianto Putra",
  "accession_no": "251028-0042",
  "modality": "CT",
  "requested_procedure": "CT Head Non-Contrast",
  "station_ae_title": "CT_ROOM1",
  "scheduled_start_at": "2025-10-29 09:00",
  "status": "scheduled",
  "workflow_status": "scheduled"
}
```

### 2. Workflow Service

**workflowService.js** provides:
- State management in localStorage
- State transition validation
- Auto-transition on events
- Workflow statistics

**Key Functions:**
```javascript
// Get current workflow state
const state = getOrderWorkflowState(orderId);

// Update workflow state
updateOrderWorkflowState(orderId, 'in_progress');

// Auto-transition based on event
autoTransitionWorkflow(orderId, 'images_uploaded');

// Get valid next states
const nextStates = getValidNextStates(orderId);
```

### 3. Auto-Transitions

**Automatic workflow transitions on events:**

| Event | From State | To State |
|-------|-----------|----------|
| `patient_arrived` | SCHEDULED | ARRIVED |
| `exam_started` | ARRIVED | IN_PROGRESS |
| `images_uploaded` | IN_PROGRESS | IMAGE_ACQUIRED |
| `images_stored_in_pacs` | IMAGE_ACQUIRED | IMAGES_RECEIVED |
| `ready_for_reading` | IMAGES_RECEIVED | READY_FOR_READING |
| `reading_started` | READY_FOR_READING | READING |
| `report_completed` | READING | REPORTED |
| `report_verified` | REPORTED | VERIFIED |
| `report_delivered` | VERIFIED/REPORTED | DELIVERED |

### 4. Integration Points

**DicomUpload Component:**
```javascript
// After successful upload
autoTransitionWorkflow(orderId, 'images_uploaded', {
  study_instance_uid: result.studyUID
});
```

**ReportEditor Component:**
```javascript
// After report saved
autoTransitionWorkflow(studyId, 'report_completed', {
  radiologist: currentUser.name
});
```

**Worklist Component:**
```javascript
// Display workflow status
<WorkflowBadge status={order.workflow_status} />
```

## User Workflows

### Technologist Workflow

1. **View Worklist**
   - See scheduled exams
   - Filter by modality, date, priority

2. **Patient Arrival**
   - Mark patient as arrived
   - Workflow: SCHEDULED → ARRIVED

3. **Start Exam**
   - Begin image acquisition
   - Workflow: ARRIVED → IN_PROGRESS

4. **Upload Images**
   - Upload DICOM files
   - Workflow: IN_PROGRESS → IMAGE_ACQUIRED → IMAGES_RECEIVED

5. **QC Check**
   - Verify image quality
   - Mark ready for reading
   - Workflow: IMAGES_RECEIVED → READY_FOR_READING

### Radiologist Workflow

1. **View Reading List**
   - See studies ready for reading
   - Filter by priority, modality

2. **Start Reading**
   - Open study in viewer
   - Workflow: READY_FOR_READING → READING

3. **Create Report**
   - Write findings and impression
   - Use templates

4. **Complete Report**
   - Save and finalize report
   - Workflow: READING → REPORTED

5. **Verify Report** (Senior only)
   - Review junior's report
   - Workflow: REPORTED → VERIFIED

### Administrator Workflow

1. **Monitor Workflow**
   - View workflow statistics
   - Identify bottlenecks

2. **Manage Orders**
   - Cancel orders
   - Put on hold
   - Resume held orders

3. **Generate Reports**
   - Turnaround time
   - Workflow efficiency
   - Radiologist productivity

## UI Components

### WorkflowBadge
Displays workflow status with color coding:
```jsx
<WorkflowBadge status="in_progress" />
```

### WorkflowTimeline
Shows workflow history with timestamps:
```jsx
<WorkflowTimeline orderId="o-1001" />
```

### WorkflowActions
Action buttons for state transitions:
```jsx
<WorkflowActions 
  orderId="o-1001" 
  currentState="scheduled"
  onTransition={handleTransition}
/>
```

## Storage Structure

**localStorage key:** `pacs_workflow_orders`

**Data structure:**
```json
{
  "o-1001": {
    "order_id": "o-1001",
    "workflow_status": "in_progress",
    "created_at": "2025-10-28T08:00:00Z",
    "updated_at": "2025-10-28T14:05:00Z",
    "arrived_at": "2025-10-28T13:55:00Z",
    "started_at": "2025-10-28T14:05:00Z"
  }
}
```

## Testing Workflow

### Test Complete Flow

1. **Create Order** (SCHEDULED)
   ```javascript
   // Order created in worklist
   ```

2. **Patient Arrives** (ARRIVED)
   ```javascript
   updateOrderWorkflowState('o-1001', 'arrived');
   ```

3. **Start Exam** (IN_PROGRESS)
   ```javascript
   updateOrderWorkflowState('o-1001', 'in_progress');
   ```

4. **Upload Images** (IMAGE_ACQUIRED → IMAGES_RECEIVED)
   ```javascript
   // Upload via DicomUpload component
   // Auto-transitions to image_acquired
   ```

5. **Mark Ready** (READY_FOR_READING)
   ```javascript
   updateOrderWorkflowState('o-1001', 'ready_for_reading');
   ```

6. **Start Reading** (READING)
   ```javascript
   updateOrderWorkflowState('o-1001', 'reading');
   ```

7. **Complete Report** (REPORTED)
   ```javascript
   // Save report in ReportEditor
   // Auto-transitions to reported
   ```

8. **Deliver Report** (DELIVERED)
   ```javascript
   updateOrderWorkflowState('o-1001', 'delivered');
   ```

### Test Scenarios

**Scenario 1: Normal Flow**
- SCHEDULED → ARRIVED → IN_PROGRESS → IMAGE_ACQUIRED → IMAGES_RECEIVED → READY_FOR_READING → READING → REPORTED → DELIVERED

**Scenario 2: Direct Start**
- SCHEDULED → IN_PROGRESS (patient arrives and exam starts immediately)

**Scenario 3: Skip Verification**
- REPORTED → DELIVERED (no senior verification needed)

**Scenario 4: On Hold**
- IN_PROGRESS → ON_HOLD → IN_PROGRESS (exam paused and resumed)

**Scenario 5: Cancellation**
- SCHEDULED → CANCELLED (order cancelled before exam)

## Workflow Statistics

**Get statistics:**
```javascript
const stats = getWorkflowStatistics();
// Returns: { scheduled: 5, in_progress: 3, reported: 10, ... }
```

**Display dashboard:**
```jsx
<WorkflowDashboard stats={stats} />
```

## Performance Metrics

**Turnaround Time Tracking:**
- Order to Exam: `started_at - created_at`
- Exam to Images: `images_acquired_at - started_at`
- Images to Reading: `reading_started_at - images_received_at`
- Reading to Report: `reported_at - reading_started_at`
- Total TAT: `delivered_at - created_at`

## Best Practices

1. **Always Initialize**: Call `initializeOrderWorkflow()` for new orders
2. **Validate Transitions**: Use `isValidTransition()` before manual updates
3. **Use Auto-Transitions**: Prefer `autoTransitionWorkflow()` for events
4. **Track Timestamps**: Workflow service automatically adds timestamps
5. **Monitor Statistics**: Regularly check `getWorkflowStatistics()`
6. **Handle Errors**: Gracefully handle invalid transitions
7. **Persist State**: Workflow state survives page refresh
8. **Clear Old Data**: Periodically clean up completed workflows

## Migration to Backend

When backend is ready:

1. **Export workflow data**
   ```javascript
   const workflows = JSON.parse(localStorage.getItem('pacs_workflow_orders'));
   ```

2. **Sync to backend**
   ```javascript
   await fetch('/api/workflows/sync', {
     method: 'POST',
     body: JSON.stringify(workflows)
   });
   ```

3. **Switch to backend mode**
   ```javascript
   // Update workflowService to use API calls
   ```

## Troubleshooting

### Workflow not updating
- Check localStorage: `localStorage.getItem('pacs_workflow_orders')`
- Verify transition is valid
- Check console for errors

### Invalid transition error
- Review WORKFLOW_TRANSITIONS in workflowService
- Use `getValidNextStates()` to see allowed transitions

### State not persisting
- Check localStorage quota
- Verify no errors in console
- Try clearing and re-initializing

## Future Enhancements

1. **Workflow Rules Engine**: Custom rules per facility
2. **Notifications**: Alert on state changes
3. **SLA Monitoring**: Track against targets
4. **Workflow Analytics**: Advanced reporting
5. **Multi-user Sync**: Real-time updates
6. **Audit Trail**: Complete history log
7. **Custom States**: Facility-specific states
8. **Parallel Workflows**: Multiple workflows per order
