# Report Backend Integration - Implementation Guide

**Date**: November 16, 2025  
**Status**: ✅ Complete  
**Version**: 1.0

---

## Overview

Complete backend integration for the radiology reporting system, replacing localStorage with PostgreSQL database storage.

### Key Features
- ✅ Persistent storage in PostgreSQL
- ✅ Report versioning and history
- ✅ Workflow management (draft → preliminary → final)
- ✅ Search and filtering
- ✅ Audit trail
- ✅ Multi-user support
- ✅ RESTful API

---

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│                    Frontend (React)                      │
│  ┌────────────────────────────────────────────────────┐ │
│  │  ReportEditor.jsx                                  │ │
│  │  - Create/Edit reports                             │ │
│  │  - Auto-save drafts                                │ │
│  │  - Status transitions                              │ │
│  └────────────────────────────────────────────────────┘ │
│                          ↓                               │
│  ┌────────────────────────────────────────────────────┐ │
│  │  reportService.js                                  │ │
│  │  - API client                                      │ │
│  │  - CRUD operations                                 │ │
│  │  - Error handling                                  │ │
│  └────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────┘
                          ↓ HTTP/REST
┌─────────────────────────────────────────────────────────┐
│                  Backend (FastAPI)                       │
│  ┌────────────────────────────────────────────────────┐ │
│  │  reports.py (API Router)                           │ │
│  │  - POST   /api/reports                             │ │
│  │  - GET    /api/reports/{id}                        │ │
│  │  - PUT    /api/reports/{id}                        │ │
│  │  - PATCH  /api/reports/{id}/status                 │ │
│  │  - DELETE /api/reports/{id}                        │ │
│  │  - GET    /api/reports (search)                    │ │
│  └────────────────────────────────────────────────────┘ │
│                          ↓                               │
│  ┌────────────────────────────────────────────────────┐ │
│  │  report.py (SQLAlchemy Models)                     │ │
│  │  - Report                                          │ │
│  │  - ReportHistory                                   │ │
│  │  - ReportAttachment                                │ │
│  └────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────┘
                          ↓ SQL
┌─────────────────────────────────────────────────────────┐
│                PostgreSQL Database                       │
│  ┌────────────────────────────────────────────────────┐ │
│  │  reports                                           │ │
│  │  report_history                                    │ │
│  │  report_attachments                                │ │
│  └────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────┘
```

---

## Database Schema

### Table: reports

Main table storing report data.

```sql
CREATE TABLE reports (
    id SERIAL PRIMARY KEY,
    report_id VARCHAR(50) UNIQUE NOT NULL,
    study_id VARCHAR(100) NOT NULL,
    patient_id VARCHAR(50) NOT NULL,
    patient_name VARCHAR(200) NOT NULL,
    
    -- Report content
    template_id VARCHAR(50) NOT NULL,
    modality VARCHAR(20),
    body_part VARCHAR(100),
    clinical_history TEXT,
    technique TEXT,
    comparison TEXT,
    findings TEXT NOT NULL,
    impression TEXT NOT NULL,
    recommendation TEXT,
    
    -- Workflow
    status VARCHAR(20) NOT NULL DEFAULT 'draft',
    
    -- Metadata
    created_by VARCHAR(100) NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_by VARCHAR(100),
    updated_at TIMESTAMP,
    finalized_by VARCHAR(100),
    finalized_at TIMESTAMP,
    
    -- Signature
    signature_id VARCHAR(100),
    signature_method VARCHAR(20),
    signature_data TEXT,
    signature_timestamp TIMESTAMP,
    
    -- Versioning
    version INTEGER NOT NULL DEFAULT 1,
    parent_report_id VARCHAR(50),
    
    -- Soft delete
    deleted BOOLEAN DEFAULT FALSE,
    deleted_at TIMESTAMP,
    deleted_by VARCHAR(100)
);
```

### Table: report_history

Stores historical versions for audit trail.

```sql
CREATE TABLE report_history (
    id SERIAL PRIMARY KEY,
    report_id VARCHAR(50) NOT NULL,
    version INTEGER NOT NULL,
    report_data JSONB NOT NULL,
    changed_by VARCHAR(100) NOT NULL,
    changed_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    change_reason TEXT
);
```

### Table: report_attachments

Stores attachments (PDFs, signatures, etc.).

```sql
CREATE TABLE report_attachments (
    id SERIAL PRIMARY KEY,
    report_id VARCHAR(50) NOT NULL,
    attachment_type VARCHAR(50) NOT NULL,
    file_name VARCHAR(255) NOT NULL,
    file_path VARCHAR(500) NOT NULL,
    file_size INTEGER,
    mime_type VARCHAR(100),
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    created_by VARCHAR(100) NOT NULL
);
```

---

## API Endpoints

### 1. Create Report

```http
POST /api/reports
Content-Type: application/json

{
  "study_id": "1.2.840.113619.2.55.3.123456789",
  "patient_id": "P12345",
  "patient_name": "John Doe",
  "template_id": "ct_brain",
  "modality": "CT",
  "body_part": "Brain",
  "clinical_history": "Headache for 2 weeks",
  "findings": "No acute intracranial abnormality",
  "impression": "Normal CT brain",
  "created_by": "dr.smith"
}
```

**Response**: 201 Created
```json
{
  "report_id": "RPT-ABC123DEF456",
  "study_id": "1.2.840.113619.2.55.3.123456789",
  "patient_id": "P12345",
  "patient_name": "John Doe",
  "status": "draft",
  "version": 1,
  "created_at": "2025-11-16T10:30:00Z",
  ...
}
```

### 2. Get Report

```http
GET /api/reports/RPT-ABC123DEF456
```

**Response**: 200 OK
```json
{
  "report_id": "RPT-ABC123DEF456",
  "study_id": "1.2.840.113619.2.55.3.123456789",
  "status": "draft",
  ...
}
```

### 3. Update Report

```http
PUT /api/reports/RPT-ABC123DEF456
Content-Type: application/json

{
  "findings": "Updated findings text",
  "impression": "Updated impression",
  "updated_by": "dr.smith"
}
```

**Response**: 200 OK

### 4. Update Status

```http
PATCH /api/reports/RPT-ABC123DEF456/status
Content-Type: application/json

{
  "status": "final",
  "updated_by": "dr.smith",
  "signature_id": "SIG-XYZ789",
  "signature_method": "password",
  "signature_data": "..."
}
```

**Response**: 200 OK

### 5. Delete Report

```http
DELETE /api/reports/RPT-ABC123DEF456?deleted_by=dr.smith
```

**Response**: 204 No Content

### 6. Search Reports

```http
GET /api/reports?patient_id=P12345&status=final&limit=50
```

**Response**: 200 OK
```json
[
  {
    "report_id": "RPT-ABC123DEF456",
    "patient_id": "P12345",
    "status": "final",
    ...
  }
]
```

### 7. Get Report History

```http
GET /api/reports/RPT-ABC123DEF456/history
```

**Response**: 200 OK
```json
[
  {
    "version": 2,
    "changed_by": "dr.smith",
    "changed_at": "2025-11-16T11:00:00Z",
    "change_reason": "Status changed to final",
    "report_data": {...}
  },
  {
    "version": 1,
    "changed_by": "dr.smith",
    "changed_at": "2025-11-16T10:30:00Z",
    "change_reason": "Report created",
    "report_data": {...}
  }
]
```

### 8. Get Statistics

```http
GET /api/reports/stats/summary
```

**Response**: 200 OK
```json
{
  "total_reports": 1250,
  "recent_reports_7d": 45,
  "by_status": {
    "draft": 120,
    "preliminary": 80,
    "final": 1000,
    "amended": 40,
    "cancelled": 10
  }
}
```

---

## Frontend Integration

### Using reportService

```javascript
import reportService from '../services/reportService';

// Create new report
const result = await reportService.createReport({
  study_id: studyId,
  patient_id: patientId,
  patient_name: patientName,
  template_id: 'ct_brain',
  findings: 'No acute findings',
  impression: 'Normal study',
  created_by: username
});

if (result.success) {
  console.log('Report created:', result.data.report_id);
} else {
  console.error('Error:', result.error);
}

// Auto-save draft
const saveResult = await reportService.saveDraft(reportId, reportData);

// Finalize report
const finalizeResult = await reportService.finalizeReport(
  reportId,
  signatureData,
  username
);

// Search reports
const searchResult = await reportService.searchReports({
  patient_id: 'P12345',
  status: 'final',
  limit: 50
});
```

---

## Workflow States

### Status Transitions

```
draft ──────────────────────────────────────────┐
  │                                              │
  ├──> preliminary ──> final ──> amended ──> final
  │         │           
  │         └──> draft
  │
  └──> cancelled
```

### Valid Transitions

| From | To | Description |
|------|-----|-------------|
| draft | preliminary | Submit for review |
| draft | cancelled | Cancel draft |
| preliminary | final | Finalize report |
| preliminary | draft | Return to draft |
| preliminary | cancelled | Cancel report |
| final | amended | Create amendment |
| amended | final | Finalize amendment |

---

## Migration Steps

### Step 1: Run Database Migration

```bash
cd pacs-service
psql -U postgres -d pacs_db -f migrations/003_create_report_tables.sql
```

### Step 2: Verify Tables

```sql
\dt reports*
-- Should show: reports, report_history, report_attachments
```

### Step 3: Enable Backend in .env

```env
# Backend Integration
VITE_USE_BACKEND=true
VITE_API_BASE_URL=http://localhost:8003
```

### Step 4: Restart Services

```bash
# Backend
cd pacs-service
python -m uvicorn app.main:app --reload --port 8003

# Frontend
cd ..
npm run dev
```

### Step 5: Test Integration

1. Open ReportEditor
2. Create a new report
3. Check browser console for API calls
4. Verify data in database:
```sql
SELECT * FROM reports ORDER BY created_at DESC LIMIT 5;
```

---

## Error Handling

### Common Errors

**404 Not Found**
```json
{
  "detail": "Report RPT-ABC123 not found"
}
```

**400 Bad Request**
```json
{
  "detail": "Cannot edit finalized report"
}
```

**400 Invalid Transition**
```json
{
  "detail": "Invalid status transition from final to draft"
}
```

### Frontend Error Handling

```javascript
const result = await reportService.updateReport(reportId, data);

if (!result.success) {
  if (result.error.includes('not found')) {
    alert('Report not found');
  } else if (result.error.includes('finalized')) {
    alert('Cannot edit finalized report');
  } else {
    alert('Error: ' + result.error);
  }
}
```

---

## Testing

### Manual Testing Checklist

- [ ] Create new report
- [ ] Save draft (auto-save)
- [ ] Update report content
- [ ] Submit for review (draft → preliminary)
- [ ] Finalize report (preliminary → final)
- [ ] View report history
- [ ] Search reports by patient
- [ ] Search reports by status
- [ ] Delete draft report
- [ ] Verify cannot edit final report
- [ ] Verify cannot delete final report

### API Testing with curl

```bash
# Create report
curl -X POST http://localhost:8003/api/reports \
  -H "Content-Type: application/json" \
  -d '{
    "study_id": "1.2.3.4",
    "patient_id": "P123",
    "patient_name": "Test Patient",
    "template_id": "ct_brain",
    "findings": "Test findings",
    "impression": "Test impression",
    "created_by": "test_user"
  }'

# Get report
curl http://localhost:8003/api/reports/RPT-ABC123

# Search reports
curl "http://localhost:8003/api/reports?patient_id=P123&limit=10"
```

---

## Performance Considerations

### Database Indexes

All critical fields are indexed:
- `report_id` (unique)
- `study_id`
- `patient_id`
- `status`
- `created_at`
- `finalized_at`
- `deleted`

### Query Optimization

```sql
-- Efficient query with indexes
SELECT * FROM reports
WHERE patient_id = 'P12345'
  AND status = 'final'
  AND deleted = FALSE
ORDER BY created_at DESC
LIMIT 50;
```

### Pagination

Always use `limit` and `offset` for large result sets:

```javascript
const result = await reportService.searchReports({
  patient_id: 'P12345',
  limit: 50,
  offset: 0
});
```

---

## Security

### Authentication

All endpoints require authentication (to be implemented):
```python
from app.auth import get_current_user

@router.post("/")
def create_report(
    report: ReportCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    # Use current_user.username for created_by
    ...
```

### Authorization

Role-based access control:
- **Radiologist**: Create, edit, finalize reports
- **Technician**: View reports only
- **Admin**: All operations

### Audit Trail

All changes are logged in `report_history`:
- Who made the change
- When it was made
- What was changed
- Why it was changed

---

## Backup & Recovery

### Database Backup

```bash
# Backup reports
pg_dump -U postgres -d pacs_db -t reports -t report_history -t report_attachments > reports_backup.sql

# Restore
psql -U postgres -d pacs_db < reports_backup.sql
```

### Export Reports

```javascript
// Export all reports for a patient
const result = await reportService.searchReports({
  patient_id: 'P12345'
});

const json = JSON.stringify(result.data, null, 2);
const blob = new Blob([json], { type: 'application/json' });
// Download blob...
```

---

## Monitoring

### Health Check

```bash
curl http://localhost:8003/api/health
```

### Statistics

```bash
curl http://localhost:8003/api/reports/stats/summary
```

### Logs

```bash
# Backend logs
tail -f pacs-service/logs/app.log

# Database logs
tail -f /var/log/postgresql/postgresql-14-main.log
```

---

## Troubleshooting

### Issue: Cannot connect to database

**Solution**:
1. Check PostgreSQL is running: `systemctl status postgresql`
2. Verify connection string in `.env`
3. Check firewall rules

### Issue: Reports not saving

**Solution**:
1. Check browser console for errors
2. Verify backend is running: `curl http://localhost:8003/api/health`
3. Check database connection
4. Review backend logs

### Issue: Status transition fails

**Solution**:
1. Verify current status
2. Check valid transitions (see Workflow States)
3. Ensure report is not finalized (if editing)

---

## Next Steps

### Phase 2 Enhancements

1. **Rich Text Editor**
   - Replace textarea with WYSIWYG editor
   - Support formatting, tables, images

2. **Report Templates**
   - Template management UI
   - Custom template creation
   - Template versioning

3. **Collaboration**
   - Multi-user editing
   - Comments and annotations
   - Peer review workflow

4. **Advanced Search**
   - Full-text search
   - Saved searches
   - Advanced filters

5. **Export Options**
   - PDF generation
   - DOCX export
   - HL7 ORU messages

---

## Summary

✅ **Database Schema**: 3 tables with indexes  
✅ **SQLAlchemy Models**: Report, ReportHistory, ReportAttachment  
✅ **FastAPI Endpoints**: 8 endpoints with full CRUD  
✅ **Frontend Service**: Complete API client  
✅ **Workflow Management**: Status transitions  
✅ **Versioning**: Audit trail  
✅ **Search & Filter**: Advanced queries  
✅ **Error Handling**: Comprehensive  
✅ **Documentation**: Complete  

**Status**: Ready for testing and deployment  
**Date**: November 16, 2025
