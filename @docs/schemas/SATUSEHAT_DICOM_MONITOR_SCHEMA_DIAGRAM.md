# SatuSehat DICOM Upload Monitoring Database Schema Diagram

## Entity Relationship Diagram

```mermaid
erDiagram
    ORDERS ||--o{ FILES : contains
    ORDERS ||--|| SATUSEHAT_SERVICE_REQUESTS : has
    FILES ||--|| DICOM_METADATA : has
    FILES ||--o{ SATUSEHAT_TRANSMISSION_LOG : tracks
    FILES ||--|| SATUSEHAT_IMAGING_STUDIES : creates
    FILES ||--|| TRANSMISSION_QUEUE : queued_in
    ORDERS ||--o{ SATUSEHAT_IMAGING_STUDIES : associated_with

    ORDERS {
        string id PK
        string patient_id
        string patient_name
        string accession_no UK
        string modality
        string requested_procedure
        string station_ae_title
        datetime scheduled_start_at
        string status
        datetime created_at
        datetime updated_at
    }

    FILES {
        string file_id PK
        string order_id FK
        string filename
        string file_type
        bigint file_size
        string category
        string description
        datetime uploaded_at
        string uploaded_by
        string storage_path
    }

    SATUSEHAT_TRANSMISSION_LOG {
        string id PK
        string file_id FK
        string order_id FK
        string status
        string patient_ihs
        string accession_number
        string modality
        string station_ae
        string service_request
        int attempt_number
        json response_details
        string error_message
        datetime created_at
        datetime updated_at
    }

    DICOM_METADATA {
        string id PK
        string file_id FK
        string sop_class_uid
        string sop_instance_uid
        string study_instance_uid
        string series_instance_uid
        string patient_id
        string patient_name
        date study_date
        time study_time
        string modality
        string study_description
        string series_description
        string accession_number
        datetime extracted_at
    }

    SATUSEHAT_SERVICE_REQUESTS {
        string id PK
        string order_id FK
        string service_request_id
        string status
        json request_payload
        json response
        datetime created_at
        datetime updated_at
    }

    SATUSEHAT_IMAGING_STUDIES {
        string id PK
        string order_id FK
        string file_id FK
        string imaging_study_id
        string status
        json request_payload
        json response
        string wado_url
        datetime created_at
        datetime updated_at
    }

    TRANSMISSION_QUEUE {
        string id PK
        string file_id FK
        string order_id FK
        string priority
        string status
        datetime scheduled_at
        int attempts
        datetime last_attempt_at
        datetime next_retry_at
        string error_message
        datetime created_at
        datetime updated_at
    }

    SYSTEM_HEALTH_LOG {
        string id PK
        string status
        string component
        string message
        json details
        datetime checked_at
    }
```

## Key Relationships Explained

### Orders and Files
- Each medical order can have multiple associated files (DICOM images, reports, etc.)
- The order contains critical information required for SatuSehat transmission:
  - Accession Number (unique identifier)
  - Patient information
  - Modality
  - Requested procedure
  - Station AE Title

### Files and Metadata
- Each DICOM file has associated metadata extracted from the DICOM headers
- This metadata is essential for creating proper SatuSehat resources

### Transmission Tracking
- Every transmission attempt is logged in the SatuSehat_Transmission_Log
- This enables monitoring of success/failure rates and error analysis
- Retry mechanisms are supported through the attempt tracking

### Queue Management
- Files are placed in a transmission queue for processing
- Priority levels allow for expedited processing of critical files
- Automatic retry scheduling is managed through the queue

### SatuSehat Resources
- Service requests are tracked separately as they are a prerequisite for ImagingStudies
- Each file results in an ImagingStudy resource in SatuSehat
- WADO URLs are stored for accessing transmitted DICOM files

## Data Flow Visualization

```mermaid
graph TD
    A[File Upload] --> B[Files Table]
    B --> C[DICOM Metadata Extraction]
    C --> D[DICOM_Metadata Table]
    B --> E[Transmission Queue]
    E --> F[SatuSehat API Transmission]
    F --> G[SatuSehat_Transmission_Log]
    F --> H[SatuSehat_Service_Requests]
    F --> I[SatuSehat_Imaging_Studies]
    J[System Health Monitoring] --> K[System_Health_Log]
```

This schema provides a comprehensive foundation for monitoring DICOM uploads to SatuSehat, with full traceability and error handling capabilities.