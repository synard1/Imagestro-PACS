-- Patient Database Schema Integration Script
-- This script adds the comprehensive patient schema to the existing database
-- without disrupting existing services

-- Enable UUID extension if not already enabled
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Create the main patients table
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

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_patients_nik ON patients(patient_national_id);
CREATE INDEX IF NOT EXISTS idx_patients_ihs ON patients(ihs_number);
CREATE INDEX IF NOT EXISTS idx_patients_mrn ON patients(medical_record_number);
CREATE INDEX IF NOT EXISTS idx_patients_name ON patients(patient_name);
CREATE INDEX IF NOT EXISTS idx_patients_birth_date ON patients(birth_date);
CREATE INDEX IF NOT EXISTS idx_patients_active ON patients(active) WHERE active = true;

-- Create patient allergies table
CREATE TABLE IF NOT EXISTS patient_allergies (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    patient_id UUID REFERENCES patients(id) ON DELETE CASCADE,
    allergen VARCHAR(200) NOT NULL, -- What the patient is allergic to
    reaction VARCHAR(200), -- Reaction description
    severity VARCHAR(20) CHECK (severity IN ('mild', 'moderate', 'severe')),
    notes TEXT, -- Additional notes
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- Create patient medical history table
CREATE TABLE IF NOT EXISTS patient_medical_history (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    patient_id UUID REFERENCES patients(id) ON DELETE CASCADE,
    condition VARCHAR(200) NOT NULL, -- Medical condition
    diagnosis_date DATE, -- When diagnosed
    status VARCHAR(20) CHECK (status IN ('active', 'inactive', 'resolved')),
    notes TEXT, -- Additional notes
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- Create patient family history table
CREATE TABLE IF NOT EXISTS patient_family_history (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    patient_id UUID REFERENCES patients(id) ON DELETE CASCADE,
    relative_relationship VARCHAR(50), -- Relationship to patient
    condition VARCHAR(200), -- Medical condition
    notes TEXT, -- Additional notes
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- Create patient medications table
CREATE TABLE IF NOT EXISTS patient_medications (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    patient_id UUID REFERENCES patients(id) ON DELETE CASCADE,
    medication_name VARCHAR(200) NOT NULL,
    dosage VARCHAR(100), -- Dosage information
    frequency VARCHAR(100), -- How often taken
    start_date DATE, -- When started
    end_date DATE, -- When stopped (if applicable)
    status VARCHAR(20) CHECK (status IN ('active', 'inactive', 'discontinued')),
    notes TEXT, -- Additional notes
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- Create audit log for patient data changes
CREATE TABLE IF NOT EXISTS patient_audit_log (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    patient_id UUID REFERENCES patients(id) ON DELETE CASCADE,
    action VARCHAR(50) NOT NULL, -- CREATE, UPDATE, DELETE, ACCESS
    field_name VARCHAR(100), -- Which field was changed
    old_value TEXT, -- Previous value
    new_value TEXT, -- New value
    user_id VARCHAR(100), -- Who made the change
    ip_address VARCHAR(45), -- IP address of user
    user_agent TEXT, -- Browser/client information
    created_at TIMESTAMPTZ DEFAULT now()
);

-- Create indexes for related tables
CREATE INDEX IF NOT EXISTS idx_patient_allergies_patient_id ON patient_allergies(patient_id);
CREATE INDEX IF NOT EXISTS idx_patient_medical_history_patient_id ON patient_medical_history(patient_id);
CREATE INDEX IF NOT EXISTS idx_patient_family_history_patient_id ON patient_family_history(patient_id);
CREATE INDEX IF NOT EXISTS idx_patient_medications_patient_id ON patient_medications(patient_id);
CREATE INDEX IF NOT EXISTS idx_patient_audit_log_patient_id ON patient_audit_log(patient_id);
CREATE INDEX IF NOT EXISTS idx_patient_audit_log_action ON patient_audit_log(action);
CREATE INDEX IF NOT EXISTS idx_patient_audit_log_created_at ON patient_audit_log(created_at);

-- Create a function to update the updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Create triggers for automatic timestamp updates
DROP TRIGGER IF EXISTS update_patients_updated_at ON patients;
CREATE TRIGGER update_patients_updated_at 
    BEFORE UPDATE ON patients 
    FOR EACH ROW 
    EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_patient_allergies_updated_at ON patient_allergies;
CREATE TRIGGER update_patient_allergies_updated_at 
    BEFORE UPDATE ON patient_allergies 
    FOR EACH ROW 
    EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_patient_medical_history_updated_at ON patient_medical_history;
CREATE TRIGGER update_patient_medical_history_updated_at 
    BEFORE UPDATE ON patient_medical_history 
    FOR EACH ROW 
    EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_patient_family_history_updated_at ON patient_family_history;
CREATE TRIGGER update_patient_family_history_updated_at 
    BEFORE UPDATE ON patient_family_history 
    FOR EACH ROW 
    EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_patient_medications_updated_at ON patient_medications;
CREATE TRIGGER update_patient_medications_updated_at 
    BEFORE UPDATE ON patient_medications 
    FOR EACH ROW 
    EXECUTE FUNCTION update_updated_at_column();