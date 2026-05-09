# Patient Database Schema Documentation

## Overview

This document describes the comprehensive patient database schema designed for the fullstack-orthanc-dicom healthcare system. The schema is designed to support all patient-related functionality across the system's microservices while maintaining data consistency and integrity.

## System Components Using Patient Data

The patient schema serves multiple components in the system:

1. **Accession API** (`accession-api`) - Manages patient and study metadata
2. **Order Management** (`order-management`) - Handles clinical orders with patient information
3. **SIMRS Order UI** (`simrs-order-ui`) - Frontend for order management with patient data
4. **MWL Writer** (`mwl-writer`) - Creates DICOM worklists with patient information
5. **SatuSehat Integrator** (`satusehat-integrator`) - Connects to Indonesia's national health platform

## Core Patient Table

The central [patients](file://e:/Project/docker/fullstack-orthanc-dicom/PATIENT_DATABASE_SCHEMA.sql#L7-L34) table contains all essential patient information:

| Column | Type | Description |
|--------|------|-------------|
| id | UUID | Primary key |
| patient_national_id | VARCHAR(16) | National ID (NIK) - 16 digits, unique |
| ihs_number | VARCHAR(64) | SATUSEHAT Patient ID (FHIR ID) |
| medical_record_number | VARCHAR(50) | Hospital medical record number |
| patient_name | VARCHAR(200) | Full patient name |
| gender | VARCHAR(10) | Gender (male, female) |
| birth_date | DATE | Date of birth |
| status | VARCHAR(20) | Patient status (default: 'active') |
| created_at | TIMESTAMPTZ | Record creation timestamp |
| updated_at | TIMESTAMPTZ | Record last update timestamp |

## Related Tables

### Orders Table

The [orders](file://e:/Project/docker/fullstack-orthanc-dicom/PATIENT_DATABASE_SCHEMA.sql#L43-L82) table stores clinical orders associated with patients:

| Column | Type | Description |
|--------|------|-------------|
| id | UUID | Primary key |
| order_number | VARCHAR(50) | Unique order number |
| accession_number | VARCHAR(50) | Accession number reference |
| modality | VARCHAR(10) | Imaging modality |
| procedure_code | VARCHAR(50) | Procedure/LOINC code |
| procedure_name | VARCHAR(200) | Procedure description |
| scheduled_at | TIMESTAMPTZ | Scheduled datetime |
| patient_national_id | VARCHAR(16) | Patient NIK (foreign key) |
| patient_name | VARCHAR(200) | Patient name (denormalized) |
| gender | VARCHAR(10) | Patient gender (denormalized) |
| birth_date | DATE | Patient birth date (denormalized) |
| medical_record_number | VARCHAR(50) | Patient MRN (denormalized) |
| ihs_number | VARCHAR(50) | Patient IHS number (denormalized) |
| registration_number | VARCHAR(50) | Patient registration number (denormalized) |
| status | VARCHAR(20) | Order status (default: 'CREATED') |
| created_at | TIMESTAMPTZ | Record creation timestamp |
| updated_at | TIMESTAMPTZ | Record last update timestamp |

### Accessions Table

The [accessions](file://e:/Project/docker/fullstack-orthanc-dicom/PATIENT_DATABASE_SCHEMA.sql#L43-L82) table manages accession numbers for imaging studies:

| Column | Type | Description |
|--------|------|-------------|
| id | UUID | Primary key |
| facility_code | TEXT | Facility code |
| accession_number | TEXT | Unique accession number |
| issuer | TEXT | Issuer information |
| modality | TEXT | Imaging modality |
| procedure_code | TEXT | Procedure/LOINC code |
| procedure_name | TEXT | Procedure description |
| scheduled_at | TIMESTAMPTZ | Scheduled datetime |
| patient_national_id | TEXT | Patient NIK (foreign key) |
| patient_name | TEXT | Patient name (denormalized) |
| gender | TEXT | Patient gender (denormalized) |
| birth_date | DATE | Patient birth date (denormalized) |
| medical_record_number | TEXT | Patient MRN (denormalized) |
| ihs_number | TEXT | Patient IHS number (denormalized) |
| registration_number | TEXT | Patient registration number (denormalized) |
| status | TEXT | Accession status (default: 'issued') |
| created_at | TIMESTAMPTZ | Record creation timestamp |
| updated_at | TIMESTAMPTZ | Record last update timestamp |

### Worklists Table

The [worklists](file://e:/Project/docker/fullstack-orthanc-dicom/PATIENT_DATABASE_SCHEMA.sql#L127-L172) table manages DICOM modality worklist entries:

| Column | Type | Description |
|--------|------|-------------|
| id | UUID | Primary key |
| accession_number | VARCHAR(50) | Accession number |
| patient_id | VARCHAR(50) | Patient ID |
| patient_name | VARCHAR(200) | Patient name |
| patient_birth_date | VARCHAR(8) | Patient birth date (YYYYMMDD) |
| patient_sex | VARCHAR(1) | Patient sex (M/F/O) |
| modality | VARCHAR(10) | Modality |
| procedure_description | TEXT | Procedure description |
| scheduled_date | VARCHAR(8) | Scheduled date (YYYYMMDD) |
| scheduled_time | VARCHAR(6) | Scheduled time (HHMMSS) |
| physician_name | VARCHAR(200) | Physician name |
| station_aet | VARCHAR(50) | Station AET |
| study_instance_uid | VARCHAR(200) | Study instance UID |
| status | VARCHAR(20) | Worklist status (default: 'SCHEDULED') |
| filename | VARCHAR(200) | Filename |
| created_at | TIMESTAMP | Created timestamp |
| created_by | VARCHAR(200) | Created by |
| updated_at | TIMESTAMP | Updated timestamp |
| modified_by | VARCHAR(200) | Modified by |
| deleted_at | TIMESTAMP | Deleted timestamp |
| deleted_by | VARCHAR(200) | Deleted by |

### Service Requests Table

The [service_requests](file://e:/Project/docker/fullstack-orthanc-dicom/PATIENT_DATABASE_SCHEMA.sql#L205-L247) table manages SATUSEHAT service requests:

| Column | Type | Description |
|--------|------|-------------|
| id | BIGSERIAL | Primary key |
| created_at | TIMESTAMPTZ | Created timestamp |
| updated_at | TIMESTAMPTZ | Updated timestamp |
| satusehat_id | TEXT | SATUSEHAT ID |
| patient_id | TEXT | Patient ID |
| encounter_id | TEXT | Encounter ID |
| practitioner_id | TEXT | Practitioner ID |
| location_id | TEXT | Location ID |
| code | TEXT | Procedure code |
| code_display | TEXT | Procedure display name |
| category | TEXT | Category |
| priority | TEXT | Priority |
| intent | TEXT | Intent |
| status | TEXT | Status |
| authored_on | TIMESTAMPTZ | Authored timestamp |
| reason_code | TEXT | Reason code |
| reason_display | TEXT | Reason display |
| note | TEXT | Additional notes |
| request_data | JSONB | Request data |
| response_data | JSONB | Response data |
| error_message | TEXT | Error message |

## Field Validation Rules

### Patient Identification
- `patient_national_id`: Must be exactly 16 digits
- `ihs_number`: Must follow SATUSEHAT format (alphanumeric with special characters -_.)
- `medical_record_number`: Alphanumeric with -_/ characters, 2-32 characters long

### Demographics
- `patient_name`: Minimum 2 characters
- `birth_date`: Cannot be in the future
- `sex`: Must be one of: male, female, other, unknown

### Status Fields
- All status fields should use controlled vocabularies
- Date fields should be properly formatted (ISO 8601)

## Indexing Strategy

Proper indexing is crucial for performance in a healthcare system with potentially millions of records:

1. **Patient Table Indexes**:
   - Primary index on `id`
   - Unique index on `patient_national_id`
   - Index on `ihs_number`
   - Index on `medical_record_number`
   - Index on `patient_name`
   - Index on `birth_date`

2. **Orders Table Indexes**:
   - Primary index on `id`
   - Index on `patient_national_id`
   - Index on `registration_number`
   - Index on `accession_number`
   - Index on `status`
   - Index on `scheduled_at`

3. **Accessions Table Indexes**:
   - Primary index on `id`
   - Index on `patient_national_id`
   - Index on `registration_number`
   - Index on `modality`
   - Index on `accession_number`

## Relationships

The schema implements the following relationships:

1. **One-to-Many**: One patient can have many orders
2. **One-to-Many**: One patient can have many accessions
3. **One-to-Many**: One patient can be referenced in many worklists
4. **One-to-Many**: One patient can have many service requests

Foreign key constraints ensure referential integrity between tables.

## Data Denormalization

Some patient data is denormalized in the orders and accessions tables for performance reasons:
- Patient name
- Gender
- Birth date
- Medical record number
- IHS number
- Registration number

This approach reduces the need for joins when querying order or accession information, which is critical for system performance.