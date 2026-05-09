# SatuSehat DICOM Schema Mappings

## Mapping Existing JSON Structures to Database Schema

This document explains how the existing JSON data structures in the application map to the proposed database schema for SatuSehat DICOM monitoring.

## 1. Orders Mapping

### Existing JSON Structure (orders.json):
```json
{
  "id": "o-1001",
  "patient_id": "MRN001",
  "patient_name": "Budi Santoso",
  "accession_no": "251028-0042",
  "modality": "CT",
  "requested_procedure": "CT Head Non-Contrast",
  "station_ae_title": "CT_ROOM1",
  "scheduled_start_at": "2025-10-29 09:00",
  "status": "completed",
  "attachments": [...]
}
```

### Database Mapping:
- `id` → orders.id (Primary Key)
- `patient_id` → orders.patient_id
- `patient_name` → orders.patient_name
- `accession_no` → orders.accession_no (Unique)
- `modality` → orders.modality
- `requested_procedure` → orders.requested_procedure
- `station_ae_title` → orders.station_ae_title
- `scheduled_start_at` → orders.scheduled_start_at
- `status` → orders.status

## 2. Files Mapping

### Existing JSON Structure (file-metadata.json):
```json
{
  "file_id": "file-001",
  "order_id": "o-1001",
  "filename": "ct-head-scan.dcm",
  "file_type": "application/dicom",
  "file_size": 5242880,
  "category": "exam_result",
  "description": "CT Head DICOM files",
  "uploaded_at": "2025-10-28T10:30:00Z",
  "uploaded_by": "admin",
  "path": "uploads/ct-head-scan.dcm",
  "satusehat": {
    "status": "pending",
    "updated_at": "2025-10-28T10:30:00Z"
  }
}
```

### Database Mapping:
- `file_id` → files.file_id (Primary Key)
- `order_id` → files.order_id (Foreign Key to orders.id)
- `filename` → files.filename
- `file_type` → files.file_type
- `file_size` → files.file_size
- `category` → files.category
- `description` → files.description
- `uploaded_at` → files.uploaded_at
- `uploaded_by` → files.uploaded_by
- `path` → files.storage_path

### SatuSehat Status Mapping:
The nested `satusehat` object maps to the `satusehat_transmission_log` table:
- `satusehat.status` → satusehat_transmission_log.status
- `satusehat.updated_at` → satusehat_transmission_log.updated_at
- Additional entries would be created for each transmission attempt

## 3. SatuSehat Transmission Log Mapping

### Existing JSON Structure (from file metadata):
```json
"satusehat": {
  "status": "sent",
  "updated_at": "2025-10-27T14:30:00Z",
  "details": {
    "message": "Successfully sent to SatuSehat"
  }
}
```

### Database Mapping:
This maps to a new entry in the `satusehat_transmission_log` table:
- File reference → satusehat_transmission_log.file_id
- Order reference → satusehat_transmission_log.order_id
- `status` → satusehat_transmission_log.status
- `updated_at` → satusehat_transmission_log.updated_at
- `details` → satusehat_transmission_log.response_details (JSON)

## 4. Implementation Considerations

### Migration Strategy
1. **Orders Table**: Populate from existing [orders.json](file:///e:/Project/docker/mwl-pacs-ui/server-data/orders.json) data
2. **Files Table**: Populate from existing [file-metadata.json](file:///e:/Project/docker/mwl-pacs-ui/server-data/file-metadata.json) data
3. **SatuSehat Transmission Log**: Create entries from existing `satusehat` fields in file metadata
4. **DICOM Metadata**: Extract from actual DICOM files when available
5. **Other Tables**: Populate as the system begins to use the new monitoring features

### API Endpoints for Monitoring
The following API endpoints would be implemented to support the monitoring UI:

1. **GET /api/monitor/satusehat/orders**
   - Returns orders with their associated files and transmission status
   - Used by the SatuSehatMonitor.jsx page

2. **GET /api/monitor/satusehat/files/{fileId}/status**
   - Returns detailed transmission history for a specific file

3. **POST /api/monitor/satusehat/files/{fileId}/send**
   - Triggers transmission of a file to SatuSehat

4. **POST /api/monitor/satusehat/files/{fileId}/cancel**
   - Cancels a pending transmission

5. **GET /api/monitor/health**
   - Returns system health status

### Integration with Existing Services

The schema integrates with existing services in the application:

1. **uploadService.js**: 
   - Will update the files table when files are uploaded
   - Will update the satusehat_transmission_log when status changes

2. **satusehatService.js**:
   - Will read from orders and files tables
   - Will write to satusehat_transmission_log, satusehat_service_requests, and satusehat_imaging_studies tables

3. **satusehatMonitorService.js**:
   - Will query the database for monitoring data instead of aggregating from JSON files

4. **SatusehatMonitor.jsx**:
   - Will display data from the database instead of JSON files

## 5. Enhanced Monitoring Capabilities

With the new schema, the application can provide enhanced monitoring capabilities:

1. **Detailed Transmission History**: Track every attempt to send a file to SatuSehat
2. **Performance Metrics**: Measure transmission times and success rates
3. **Error Analysis**: Categorize and analyze transmission errors
4. **Retry Management**: Implement intelligent retry mechanisms with exponential backoff
5. **Audit Trail**: Maintain a complete audit trail of all SatuSehat interactions
6. **Real-time Status**: Provide real-time status updates in the monitoring UI

## 6. Data Consistency and Integrity

The relational schema ensures:
1. **Referential Integrity**: Foreign key constraints prevent orphaned records
2. **Data Consistency**: Updates to orders are cascaded to related files
3. **Atomic Operations**: Database transactions ensure consistency during complex operations
4. **Audit Trail**: Timestamps on all records track when changes occur

This mapping provides a clear path for evolving the current JSON-based system to a more robust database-backed monitoring solution for SatuSehat DICOM uploads.