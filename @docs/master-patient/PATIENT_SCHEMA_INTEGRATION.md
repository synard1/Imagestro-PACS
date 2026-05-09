# Patient Database Schema Integration Plan

## Overview

This document outlines the integration plan for the comprehensive patient database schema with the existing system components. The system currently uses PostgreSQL for all services, with the exception of a legacy SQLite database file that may exist but is not actively used in the current implementation.

## Current Database Architecture

All services in the system use PostgreSQL with the following configuration:
- Database: `worklist_db`
- User: `dicom`
- Host: `postgres` (Docker service)
- Port: `5432`

Services that use PostgreSQL:
1. **SIMRS Order UI** - Uses PostgreSQL for storing order information
2. **Order Management** - Uses PostgreSQL for order and accession data
3. **Accession API** - Uses PostgreSQL for accession data
4. **MWL Writer** - Uses PostgreSQL for worklist data
5. **SatuSehat Integrator** - Uses PostgreSQL for service requests and logs

## Existing Tables and Their Patient-Related Fields

### 1. Orders Table (order-management service)
```sql
CREATE TABLE IF NOT EXISTS orders (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    order_number VARCHAR(50) UNIQUE NOT NULL,
    accession_number VARCHAR(50) UNIQUE,
    modality VARCHAR(10),
    procedure_code VARCHAR(50),
    procedure_name VARCHAR(200),
    scheduled_at TIMESTAMPTZ,
    patient_national_id VARCHAR(16),
    patient_name VARCHAR(200),
    gender VARCHAR(10),
    birth_date DATE,
    medical_record_number VARCHAR(50),
    ihs_number VARCHAR(50),
    registration_number VARCHAR(50),
    status VARCHAR(20) DEFAULT 'CREATED',
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);
```

### 2. Accessions Table (accession-api service)
```sql
CREATE TABLE IF NOT EXISTS accessions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    facility_code TEXT NOT NULL,
    accession_number TEXT NOT NULL UNIQUE,
    issuer TEXT NOT NULL,
    modality TEXT NOT NULL,
    procedure_code TEXT,
    procedure_name TEXT,
    scheduled_at TIMESTAMPTZ,
    patient_national_id TEXT NOT NULL,
    patient_name TEXT NOT NULL,
    gender TEXT,
    birth_date DATE,
    medical_record_number TEXT,
    ihs_number TEXT,
    registration_number TEXT,
    status TEXT NOT NULL DEFAULT 'issued',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

### 3. Worklists Table (mwl-writer service)
```sql
CREATE TABLE IF NOT EXISTS worklists (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    accession_number VARCHAR(50) UNIQUE NOT NULL,
    patient_id VARCHAR(50) NOT NULL,
    patient_name VARCHAR(200) NOT NULL,
    patient_birth_date VARCHAR(8),
    patient_sex VARCHAR(1),
    modality VARCHAR(10),
    procedure_description TEXT,
    scheduled_date VARCHAR(8),
    scheduled_time VARCHAR(6),
    physician_name VARCHAR(200),
    station_aet VARCHAR(50),
    study_instance_uid VARCHAR(200),
    status VARCHAR(20) DEFAULT 'SCHEDULED',
    filename VARCHAR(200),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    created_by VARCHAR(200),
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    modified_by VARCHAR(200),
    deleted_at TIMESTAMP,
    deleted_by VARCHAR(200)
);
```

### 4. SIM Orders Table (simrs-order-ui service)
```sql
CREATE TABLE IF NOT EXISTS sim_orders (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    created_at TIMESTAMPTZ DEFAULT now(),
    patient_national_id VARCHAR(16),
    ihs_number VARCHAR(64),
    mrn VARCHAR(50),
    patient_name VARCHAR(200),
    gender VARCHAR(10),
    birth_date DATE,
    modality VARCHAR(10),
    procedure_code VARCHAR(50),
    procedure_name VARCHAR(200),
    scheduled_at TIMESTAMPTZ,
    registration_number VARCHAR(50),
    clinical_notes TEXT,
    service_type VARCHAR(20),
    served_status VARCHAR(20) DEFAULT 'pending',
    dicom_status VARCHAR(20) DEFAULT 'pending',
    satusehat_status VARCHAR(20) DEFAULT 'pending',
    satusehat_imaging_study_id VARCHAR(100),
    practitioner_nik VARCHAR(16),
    practitioner_name VARCHAR(200),
    satusehat_practitioner_id VARCHAR(100),
    satusehat_location_id VARCHAR(100),
    encounter_status VARCHAR(20) DEFAULT 'none',
    service_request_status VARCHAR(20) DEFAULT 'none',
    satusehat_encounter_id VARCHAR(100),
    satusehat_service_request_id VARCHAR(100)
);
```

### 5. Service Requests Table (satusehat-integrator service)
```sql
CREATE TABLE IF NOT EXISTS service_requests (
    id BIGSERIAL PRIMARY KEY,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    satusehat_id TEXT,
    patient_id TEXT NOT NULL,
    encounter_id TEXT NOT NULL,
    practitioner_id TEXT NOT NULL,
    location_id TEXT NOT NULL,
    code TEXT NOT NULL,
    code_display TEXT NOT NULL,
    category TEXT,
    priority TEXT,
    intent TEXT,
    status TEXT,
    authored_on TIMESTAMPTZ,
    reason_code TEXT,
    reason_display TEXT,
    note TEXT,
    request_data JSONB,
    response_data JSONB,
    error_message TEXT,
    UNIQUE(satusehat_id)
);
```

## Proposed Comprehensive Patient Schema Integration

The proposed comprehensive patient schema will be integrated as follows:

### 1. Core Patients Table
```sql
CREATE TABLE IF NOT EXISTS patients (
    -- Primary identification
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    patient_national_id VARCHAR(16) UNIQUE NOT NULL, -- NIK - 16 digits
    ihs_number VARCHAR(64) UNIQUE, -- SATUSEHAT Patient ID
    medical_record_number VARCHAR(50) NOT NULL, -- MRN
    
    -- Demographics
    patient_name VARCHAR(200) NOT NULL,
    gender VARCHAR(10) CHECK (gender IN ('male', 'female')), -- Changed from sex to gender with only male/female options
    birth_date DATE NOT NULL,
    
    -- Additional demographics (extending current schema)
    address TEXT, -- Full address
    phone VARCHAR(20), -- Contact number
    email VARCHAR(100), -- Email address
    nationality VARCHAR(50), -- Nationality
    ethnicity VARCHAR(50), -- Ethnicity
    religion VARCHAR(50), -- Religion
    marital_status VARCHAR(20) CHECK (marital_status IN ('single', 'married', 'divorced', 'widowed')),
    occupation VARCHAR(100), -- Occupation
    education_level VARCHAR(50), -- Education level
    
    -- Emergency contact
    emergency_contact_name VARCHAR(200),
    emergency_contact_phone VARCHAR(20),
    emergency_contact_relationship VARCHAR(50),
    
    -- Insurance information
    insurance_provider VARCHAR(100),
    insurance_policy_number VARCHAR(100),
    insurance_member_id VARCHAR(100),
    
    -- Timestamps
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now(),
    deleted_at TIMESTAMPTZ, -- For soft deletes
    
    -- Status
    active BOOLEAN DEFAULT true
);
```

### 2. Related Tables
Additional tables for patient allergies, medical history, family history, medications, and audit logs as defined in the comprehensive schema.

## Integration Strategy

### 1. No Conflicts with Existing Services
The proposed patient schema does not conflict with existing services because:
- All existing tables will remain unchanged
- The new `patients` table will be used as a central reference
- Existing tables already contain the necessary patient fields
- No column name conflicts exist between the proposed schema and existing tables

### 2. Data Migration (If Needed)
If data migration is required in the future, the following approach can be used:
- Extract patient data from existing tables
- Insert unique patient records into the new `patients` table
- Update foreign key references where applicable

### 3. Foreign Key Relationships
To establish proper relationships, the following foreign key constraints can be added:
- `orders.patient_national_id` → `patients.patient_national_id`
- `accessions.patient_national_id` → `patients.patient_national_id`
- `worklists.patient_id` → `patients.patient_national_id`
- `sim_orders.patient_national_id` → `patients.patient_national_id`
- `service_requests.patient_id` → `patients.ihs_number`

## Required Alter Table Scripts

No ALTER TABLE scripts are required for integration because:
1. All existing tables already contain the necessary patient fields
2. The proposed schema adds new tables without modifying existing ones
3. No column conflicts exist between existing tables and the proposed schema

## Implementation Steps

1. **Create the new patient tables**:
   - Execute the CREATE TABLE statements for the `patients` table and related tables
   - Create indexes for performance optimization

2. **Update application code** (optional):
   - Modify services to use the new `patients` table for patient data management
   - Implement data synchronization between existing tables and the new `patients` table

3. **Data migration** (if needed):
   - Extract unique patient records from existing tables
   - Insert into the new `patients` table
   - Establish foreign key relationships

## Benefits of This Integration

1. **No Service Disruption**: Existing services continue to work without modification
2. **Data Consistency**: Centralized patient data management
3. **Extensibility**: Easy addition of new patient-related fields and tables
4. **Performance**: Proper indexing strategy for large datasets
5. **Compliance**: Audit logging for regulatory requirements

## Testing Recommendations

1. **Verify Existing Functionality**:
   - Test all existing services to ensure they continue to work
   - Verify database connections and queries

2. **Test New Schema**:
   - Test creation of patient records in the new tables
   - Verify foreign key relationships
   - Test data integrity constraints

3. **Integration Testing**:
   - Test data synchronization between existing tables and new patient tables
   - Verify that all services can access patient data correctly

## Rollback Plan

If issues are encountered:
1. Remove the newly created patient tables
2. Revert any application code changes
3. Continue using existing database schema

This integration plan ensures that the comprehensive patient schema can be added to the system without disrupting existing functionality.