-- Comprehensive Patient Database Schema for Healthcare System
-- Based on analysis of fullstack-orthanc-dicom project

-- Enable UUID extension for primary keys
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Main patient table with comprehensive demographics
CREATE TABLE patients (
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

-- Indexes for performance
CREATE INDEX idx_patients_national_id ON patients(patient_national_id);
CREATE INDEX idx_patients_ihs_number ON patients(ihs_number);
CREATE INDEX idx_patients_mrn ON patients(medical_record_number);
CREATE INDEX idx_patients_name ON patients(patient_name);
CREATE INDEX idx_patients_birth_date ON patients(birth_date);

-- Main orders table (from order-management service)
CREATE TABLE orders (
    -- Primary key
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    
    -- Order identification
    order_number VARCHAR(50) UNIQUE NOT NULL,  -- Unique order number
    accession_number VARCHAR(50) UNIQUE,  -- Accession number reference
    
    -- Modality information
    modality VARCHAR(10),  -- Imaging modality
    
    -- Procedure information
    procedure_code VARCHAR(50),  -- Procedure/LOINC code
    procedure_name VARCHAR(200),  -- Procedure description
    scheduled_at TIMESTAMPTZ,  -- Scheduled datetime
    
    -- Patient references (duplicated from patients table for performance)
    patient_national_id VARCHAR(16),  -- NIK - 16 digit national ID
    patient_name VARCHAR(200),  -- Full patient name
    gender VARCHAR(10),  -- Gender
    birth_date DATE,  -- Date of birth
    medical_record_number VARCHAR(50),  -- Hospital MRN
    ihs_number VARCHAR(50),  -- SATUSEHAT Patient ID
    registration_number VARCHAR(50),  -- Hospital registration number
    
    -- Status
    status VARCHAR(20) DEFAULT 'CREATED',  -- Order status
    
    -- Timestamps
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- Indexes for orders table
CREATE INDEX idx_orders_patient_national_id ON orders(patient_national_id);
CREATE INDEX idx_orders_registration_number ON orders(registration_number);
CREATE INDEX idx_orders_accession_number ON orders(accession_number);
CREATE INDEX idx_orders_status ON orders(status);
CREATE INDEX idx_orders_scheduled_at ON orders(scheduled_at);

-- Accessions table (from accession-api service)
CREATE TABLE accessions (
    -- Primary key
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    
    -- Facility information
    facility_code TEXT NOT NULL,  -- Facility code
    accession_number TEXT NOT NULL UNIQUE,  -- Unique accession number
    issuer TEXT NOT NULL,  -- Issuer information
    
    -- Modality information
    modality TEXT NOT NULL,  -- Imaging modality
    
    -- Procedure information
    procedure_code TEXT,  -- Procedure/LOINC code
    procedure_name TEXT,  -- Procedure description
    scheduled_at TIMESTAMPTZ,  -- Scheduled datetime
    
    -- Patient information (duplicated for performance)
    patient_national_id TEXT NOT NULL,  -- NIK - 16 digit national ID
    patient_name TEXT NOT NULL,  -- Full patient name
    gender TEXT,  -- Gender
    birth_date DATE,  -- Date of birth
    medical_record_number TEXT,  -- Hospital MRN
    ihs_number TEXT,  -- SATUSEHAT Patient ID
    registration_number TEXT,  -- Hospital registration number
    
    -- Status
    status TEXT NOT NULL DEFAULT 'issued',  -- Accession status
    
    -- Timestamps
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes for accessions table
CREATE INDEX idx_accessions_patient_national_id ON accessions(patient_national_id);
CREATE INDEX idx_accessions_registration_number ON accessions(registration_number);
CREATE INDEX idx_accessions_modality ON accessions(modality);
CREATE INDEX idx_accessions_accession_number ON accessions(accession_number);

-- Facilities table (from accession-api service)
CREATE TABLE facilities (
    id SERIAL PRIMARY KEY,  -- Auto-incrementing ID
    code TEXT UNIQUE NOT NULL,  -- Facility code
    name TEXT,  -- Facility name
    issuer TEXT NOT NULL DEFAULT 'https://sys-ids.kemkes.go.id/acsn'  -- Issuer URL
);

-- Accession counters table (from accession-api service)
CREATE TABLE accession_counters (
    date DATE NOT NULL,  -- Date
    modality TEXT NOT NULL,  -- Modality
    facility_code TEXT NOT NULL,  -- Facility code
    seq INTEGER NOT NULL,  -- Sequence number
    PRIMARY KEY (date, modality, facility_code)
);

-- Worklists table (from mwl-writer service)
CREATE TABLE worklists (
    -- Primary key
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    
    -- Worklist identification
    accession_number VARCHAR(50) UNIQUE NOT NULL,  -- Accession number
    
    -- Patient information
    patient_id VARCHAR(50) NOT NULL,  -- Patient ID
    patient_name VARCHAR(200) NOT NULL,  -- Patient name
    patient_birth_date VARCHAR(8),  -- Patient birth date (YYYYMMDD)
    patient_sex VARCHAR(1),  -- Patient sex (M/F/O)
    
    -- Procedure information
    modality VARCHAR(10),  -- Modality
    procedure_description TEXT,  -- Procedure description
    scheduled_date VARCHAR(8),  -- Scheduled date (YYYYMMDD)
    scheduled_time VARCHAR(6),  -- Scheduled time (HHMMSS)
    
    -- Practitioner information
    physician_name VARCHAR(200),  -- Physician name
    station_aet VARCHAR(50),  -- Station AET
    
    -- DICOM information
    study_instance_uid VARCHAR(200),  -- Study instance UID
    
    -- Status
    status VARCHAR(20) DEFAULT 'SCHEDULED',  -- Worklist status
    
    -- File information
    filename VARCHAR(200),  -- Filename
    
    -- Audit information
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,  -- Created timestamp
    created_by VARCHAR(200),  -- Created by
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,  -- Updated timestamp
    modified_by VARCHAR(200),  -- Modified by
    deleted_at TIMESTAMP,  -- Deleted timestamp
    deleted_by VARCHAR(200),  -- Deleted by
);

-- Indexes for worklists table
CREATE INDEX idx_worklists_accession ON worklists(accession_number);
CREATE INDEX idx_worklists_patient_id ON worklists(patient_id);
CREATE INDEX idx_worklists_status ON worklists(status);
CREATE INDEX idx_worklists_scheduled_date ON worklists(scheduled_date);

-- Worklist audit log table (from mwl-writer service)
CREATE TABLE worklist_audit_log (
    -- Primary key
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    
    -- References
    worklist_id UUID REFERENCES worklists(id) ON DELETE CASCADE,  -- Worklist reference
    
    -- Worklist identification
    accession_number VARCHAR(50),  -- Accession number
    
    -- Action information
    action VARCHAR(50) NOT NULL,  -- Action performed
    
    -- Data changes
    before_data JSONB,  -- Data before change
    after_data JSONB,  -- Data after change
    
    -- User information
    user_info VARCHAR(200),  -- User information
    ip_address VARCHAR(45),  -- IP address
    
    -- Timestamp
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP  -- Created timestamp
);

-- Indexes for worklist audit log
CREATE INDEX idx_audit_worklist_id ON worklist_audit_log(worklist_id);

-- Service requests table (from satusehat-integrator service)
CREATE TABLE service_requests (
    -- Primary key
    id BIGSERIAL PRIMARY KEY,  -- Auto-incrementing ID
    
    -- Timestamps
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),  -- Created timestamp
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),  -- Updated timestamp
    
    -- SATUSEHAT identifiers
    satusehat_id TEXT,  -- SATUSEHAT ID
    
    -- Reference IDs
    patient_id TEXT NOT NULL,  -- Patient ID
    encounter_id TEXT NOT NULL,  -- Encounter ID
    practitioner_id TEXT NOT NULL,  -- Practitioner ID
    location_id TEXT NOT NULL,  -- Location ID
    
    -- Procedure information
    code TEXT NOT NULL,  -- Procedure code
    code_display TEXT NOT NULL,  -- Procedure display name
    
    -- Categorization
    category TEXT,  -- Category
    priority TEXT,  -- Priority
    intent TEXT,  -- Intent
    status TEXT,  -- Status
    
    -- Timing
    authored_on TIMESTAMPTZ,  -- Authored timestamp
    
    -- Reason information
    reason_code TEXT,  -- Reason code
    reason_display TEXT,  -- Reason display
    
    -- Notes
    note TEXT,  -- Additional notes
    
    -- Data storage
    request_data JSONB,  -- Request data
    response_data JSONB,  -- Response data
    error_message TEXT,  -- Error message
    
    -- Constraint
    UNIQUE(satusehat_id)
);

-- Indexes for service requests table
CREATE INDEX idx_service_requests_patient_id ON service_requests(patient_id);
CREATE INDEX idx_service_requests_encounter_id ON service_requests(encounter_id);
CREATE INDEX idx_service_requests_satusehat_id ON service_requests(satusehat_id);
CREATE INDEX idx_service_requests_status ON service_requests(status);

-- Order counters table (from order-management service)
CREATE TABLE order_counters (
    scope VARCHAR(20) NOT NULL,  -- Scope
    period_key VARCHAR(8) NOT NULL,  -- Period key
    counter INTEGER NOT NULL DEFAULT 0,  -- Counter value
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),  -- Updated timestamp
    PRIMARY KEY (scope, period_key)
);

-- Relationships and constraints

-- Foreign key constraints for orders table
ALTER TABLE orders 
    ADD CONSTRAINT fk_orders_patient_national_id 
    FOREIGN KEY (patient_national_id) 
    REFERENCES patients(patient_national_id);

-- Foreign key constraints for accessions table
ALTER TABLE accessions 
    ADD CONSTRAINT fk_accessions_patient_national_id 
    FOREIGN KEY (patient_national_id) 
    REFERENCES patients(patient_national_id);

-- Foreign key constraints for worklists table
ALTER TABLE worklists 
    ADD CONSTRAINT fk_worklists_patient_id 
    FOREIGN KEY (patient_id) 
    REFERENCES patients(patient_national_id);

-- Insert default facility if not exists
INSERT INTO facilities(code, name) 
VALUES ('RSABC', 'Default Facility') 
ON CONFLICT (code) DO NOTHING;

-- Triggers for automatic timestamp updates
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Create triggers for automatic timestamp updates
CREATE TRIGGER update_patients_updated_at 
    BEFORE UPDATE ON patients 
    FOR EACH ROW 
    EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_orders_updated_at 
    BEFORE UPDATE ON orders 
    FOR EACH ROW 
    EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_accessions_updated_at 
    BEFORE UPDATE ON accessions 
    FOR EACH ROW 
    EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_service_requests_updated_at 
    BEFORE UPDATE ON service_requests 
    FOR EACH ROW 
    EXECUTE FUNCTION update_updated_at_column();