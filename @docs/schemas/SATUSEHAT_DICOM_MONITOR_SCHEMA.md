# SatuSehat DICOM Upload Monitoring Database Schema

## Overview

This document describes the complete database schema for monitoring DICOM file uploads to the SatuSehat platform. The schema is designed to track the entire lifecycle of DICOM files from upload through to successful transmission to SatuSehat, including error handling and retry mechanisms.

## Database Schema

### 1. Orders Table

Stores information about medical orders that require DICOM uploads.

```sql
CREATE TABLE orders (
    id VARCHAR(36) PRIMARY KEY,                    -- UUID v4 order identifier
    patient_id VARCHAR(50) NOT NULL,              -- Patient medical record number
    patient_name VARCHAR(255) NOT NULL,           -- Patient full name
    accession_no VARCHAR(50) UNIQUE NOT NULL,     -- Unique accession number (required by SatuSehat)
    modality VARCHAR(10) NOT NULL,                -- Imaging modality (CT, MR, US, etc.)
    requested_procedure TEXT NOT NULL,            -- Requested procedure/service request
    station_ae_title VARCHAR(50) NOT NULL,        -- Station AE Title (required for DICOM routing)
    scheduled_start_at TIMESTAMP,                 -- Scheduled start time
    status VARCHAR(20) DEFAULT 'scheduled',       -- Order status
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);
```

### 2. Files Table

Stores information about uploaded files associated with orders.

```sql
CREATE TABLE files (
    file_id VARCHAR(36) PRIMARY KEY,              -- UUID v4 file identifier
    order_id VARCHAR(36) NOT NULL,                -- Reference to orders.id
    filename VARCHAR(255) NOT NULL,               -- Original filename
    file_type VARCHAR(100) NOT NULL,              -- MIME type
    file_size BIGINT NOT NULL,                    -- File size in bytes
    category VARCHAR(20) DEFAULT 'exam_result',   -- File category
    description TEXT,                             -- File description
    uploaded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    uploaded_by VARCHAR(50),                      -- User who uploaded the file
    storage_path VARCHAR(500),                    -- Path to file in storage
    FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE
);
```

### 3. SatuSehat_Transmission_Log Table

Tracks the transmission status of files to SatuSehat.

```sql
CREATE TABLE satusehat_transmission_log (
    id VARCHAR(36) PRIMARY KEY,                   -- UUID v4 log entry identifier
    file_id VARCHAR(36) NOT NULL,                 -- Reference to files.file_id
    order_id VARCHAR(36) NOT NULL,                -- Reference to orders.id
    status ENUM('pending', 'sending', 'sent', 'failed', 'cancelled', 'retrying') NOT NULL,
    patient_ihs VARCHAR(50),                      -- Patient IHS number
    accession_number VARCHAR(50),                 -- Accession number (from order)
    modality VARCHAR(10),                         -- Modality (from order)
    station_ae VARCHAR(50),                       -- Station AE Title (from order)
    service_request TEXT,                         -- Service request (from order)
    attempt_number INT DEFAULT 1,                 -- Transmission attempt count
    response_details JSON,                        -- Detailed response from SatuSehat API
    error_message TEXT,                           -- Error message if failed
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (file_id) REFERENCES files(file_id) ON DELETE CASCADE,
    FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE
);
```

### 4. DICOM_Metadata Table

Stores extracted DICOM metadata required for SatuSehat integration.

```sql
CREATE TABLE dicom_metadata (
    id VARCHAR(36) PRIMARY KEY,                   -- UUID v4 metadata identifier
    file_id VARCHAR(36) NOT NULL,                 -- Reference to files.file_id
    sop_class_uid VARCHAR(100),                   -- SOP Class UID
    sop_instance_uid VARCHAR(100),                -- SOP Instance UID
    study_instance_uid VARCHAR(100),              -- Study Instance UID
    series_instance_uid VARCHAR(100),             -- Series Instance UID
    patient_id VARCHAR(50),                       -- Patient ID from DICOM
    patient_name VARCHAR(255),                    -- Patient name from DICOM
    study_date DATE,                              -- Study date
    study_time TIME,                              -- Study time
    modality VARCHAR(10),                         -- Modality from DICOM
    study_description TEXT,                       -- Study description
    series_description TEXT,                      -- Series description
    accession_number VARCHAR(50),                 -- Accession number from DICOM
    extracted_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (file_id) REFERENCES files(file_id) ON DELETE CASCADE
);
```

### 5. SatuSehat_Service_Request Table

Stores information about service requests sent to SatuSehat.

```sql
CREATE TABLE satusehat_service_requests (
    id VARCHAR(36) PRIMARY KEY,                   -- UUID v4 service request identifier
    order_id VARCHAR(36) NOT NULL,                -- Reference to orders.id
    service_request_id VARCHAR(100),              -- Service Request ID returned by SatuSehat
    status ENUM('created', 'sent', 'failed') NOT NULL,
    request_payload JSON,                         -- The payload sent to SatuSehat
    response JSON,                                -- Response from SatuSehat
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE
);
```

### 6. SatuSehat_Imaging_Study Table

Stores information about ImagingStudy resources created in SatuSehat.

```sql
CREATE TABLE satusehat_imaging_studies (
    id VARCHAR(36) PRIMARY KEY,                   -- UUID v4 imaging study identifier
    order_id VARCHAR(36) NOT NULL,                -- Reference to orders.id
    file_id VARCHAR(36) NOT NULL,                 -- Reference to files.file_id
    imaging_study_id VARCHAR(100),                -- ImagingStudy ID returned by SatuSehat
    status ENUM('created', 'sent', 'failed') NOT NULL,
    request_payload JSON,                         -- The payload sent to SatuSehat
    response JSON,                                -- Response from SatuSehat
    wado_url VARCHAR(500),                        -- WADO URL for accessing DICOM files
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE,
    FOREIGN KEY (file_id) REFERENCES files(file_id) ON DELETE CASCADE
);
```

### 7. Transmission_Queue Table

Manages the queue of files waiting to be transmitted to SatuSehat.

```sql
CREATE TABLE transmission_queue (
    id VARCHAR(36) PRIMARY KEY,                   -- UUID v4 queue entry identifier
    file_id VARCHAR(36) NOT NULL,                 -- Reference to files.file_id
    order_id VARCHAR(36) NOT NULL,                -- Reference to orders.id
    priority ENUM('low', 'normal', 'high') DEFAULT 'normal',
    status ENUM('queued', 'processing', 'completed', 'failed') NOT NULL,
    scheduled_at TIMESTAMP,                       -- When the transmission is scheduled
    attempts INT DEFAULT 0,                       -- Number of transmission attempts
    last_attempt_at TIMESTAMP,                    -- Timestamp of last transmission attempt
    next_retry_at TIMESTAMP,                      -- Timestamp for next retry
    error_message TEXT,                           -- Error message if failed
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (file_id) REFERENCES files(file_id) ON DELETE CASCADE,
    FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE
);
```

### 8. System_Health_Log Table

Tracks the health status of the SatuSehat integration system.

```sql
CREATE TABLE system_health_log (
    id VARCHAR(36) PRIMARY KEY,                   -- UUID v4 log entry identifier
    status ENUM('ok', 'warning', 'error') NOT NULL,
    component VARCHAR(50) NOT NULL,               -- Component name (e.g., 'satusehat_api', 'dicom_router')
    message TEXT,                                 -- Health status message
    details JSON,                                 -- Additional details
    checked_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

## Relationships

The schema establishes the following relationships:

1. **One-to-Many**: Orders → Files (one order can have multiple files)
2. **One-to-One**: Files → DICOM_Metadata (each DICOM file has one metadata record)
3. **One-to-Many**: Files → SatuSehat_Transmission_Log (each file can have multiple transmission attempts)
4. **One-to-One**: Orders → SatuSehat_Service_Requests (each order has one service request)
5. **One-to-Many**: Files → SatuSehat_Imaging_Studies (each file can have one imaging study)
6. **One-to-One**: Files → Transmission_Queue (each file can be in the transmission queue)

## Key Fields Required by SatuSehat DICOM Router

Based on the SatuSehat DICOM Router documentation, the following fields are critical for successful transmission:

1. **Accession Number**: Unique identifier for the order
2. **Patient IHS Number**: Patient identifier in SatuSehat
3. **Modality**: Imaging modality
4. **Station AE Title**: DICOM node identifier
5. **Service Request**: Requested procedure information

## Monitoring Capabilities

This schema enables comprehensive monitoring of:

1. **Transmission Status**: Track whether files have been successfully sent to SatuSehat
2. **Retry Mechanisms**: Automatically retry failed transmissions
3. **Error Tracking**: Record and analyze transmission errors
4. **Performance Metrics**: Monitor transmission times and success rates
5. **Audit Trail**: Maintain a complete history of all transmission attempts
6. **System Health**: Monitor the overall health of the integration system

## Data Flow

1. Files are uploaded and stored in the [files](file:///e:/Project/docker/mwl-pacs-ui/src/services/uploadService.js#L245-L245) table
2. DICOM metadata is extracted and stored in [dicom_metadata](file:///e:/Project/docker/mwl-pacs-ui/src/utils/dicomDictionary.js#L158-L158) table
3. Transmission requests are queued in [transmission_queue](file:///e:/Project/docker/mwl-pacs-ui/src/pages/SatusehatMonitor.jsx#L24-L24) table
4. Transmission attempts are logged in [satusehat_transmission_log](file:///e:/Project/docker/mwl-pacs-ui/src/services/satusehatService.js#L24-L24) table
5. Service requests and imaging studies are tracked in their respective tables
6. System health is monitored and logged in [system_health_log](file:///e:/Project/docker/mwl-pacs-ui/src/services/satusehatHealthCheck.js#L1-L1) table