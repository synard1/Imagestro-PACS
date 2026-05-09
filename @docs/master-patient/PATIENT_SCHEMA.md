# Comprehensive Patient Database Schema

## Project Analysis

This healthcare system manages patient data across multiple services:
- **Accession API**: Manages patient and study metadata
- **Order Management**: Handles clinical orders with patient information
- **SIMRS Order UI**: Frontend for order management with patient data
- **MWL Writer**: Creates DICOM worklists with patient information
- **SatuSehat Integrator**: Connects to Indonesia's national health platform

## Core Patient Data Fields

Based on the codebase analysis, here are the essential patient data fields used throughout the system:

### 1. Identification Fields
- `patient_national_id` (NIK) - 16-digit national ID number
- `ihs_number` - SATUSEHAT Patient ID (FHIR ID)
- `medical_record_number` (MRN) - Hospital medical record number

### 2. Demographics
- `patient_name` - Full patient name
- `gender` - Gender (male, female)  // Changed from sex to gender with only male/female options
- `birth_date` - Date of birth

### 3. Clinical/Order Information
- `modality` - Imaging modality
- `procedure_code` - Procedure/LOINC code
- `procedure_name` - Procedure description
- `scheduled_at` - Scheduled datetime
- `clinical_notes` - Clinical notes

### 4. Practitioner Information
- `practitioner_nik` - Practitioner NIK
- `practitioner_name` - Practitioner name
- `satusehat_practitioner_id` - SATUSEHAT Practitioner ID

### 5. Location Information
- `satusehat_location_id` - SATUSEHAT Location ID

### 6. Status Tracking
- `served_status` - Service status
- `dicom_status` - DICOM integration status
- `satusehat_status` - SATUSEHAT integration status

### 7. Encounter/Service Request IDs
- `satusehat_encounter_id` - SATUSEHAT Encounter ID
- `satusehat_service_request_id` - SATUSEHAT Service Request ID
- `satusehat_imaging_study_id` - SATUSEHAT Imaging Study ID

## Proposed Comprehensive Patient Schema

```
-- Main patient table with comprehensive demographics
CREATE TABLE patients (
    -- Primary identification
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    patient_national_id VARCHAR(16) UNIQUE NOT NULL, -- NIK - 16 digits
    ihs_number VARCHAR(64) UNIQUE, -- SATUSEHAT Patient ID
    medical_record_number VARCHAR(50) NOT NULL, -- MRN
    
    -- Demographics
    patient_name VARCHAR(200) NOT NULL,
    sex VARCHAR(10) CHECK (sex IN ('male', 'female', 'other', 'unknown')),
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
CREATE INDEX idx_patients_nik ON patients(patient_national_id);
CREATE INDEX idx_patients_ihs ON patients(ihs_number);
CREATE INDEX idx_patients_mrn ON patients(medical_record_number);
CREATE INDEX idx_patients_name ON patients(patient_name);
CREATE INDEX idx_patients_birth_date ON patients(birth_date);
CREATE INDEX idx_patients_active ON patients(active) WHERE active = true;

-- Patient allergies table
CREATE TABLE patient_allergies (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    patient_id UUID REFERENCES patients(id) ON DELETE CASCADE,
    allergen VARCHAR(200) NOT NULL, -- What the patient is allergic to
    reaction VARCHAR(200), -- Reaction description
    severity VARCHAR(20) CHECK (severity IN ('mild', 'moderate', 'severe')),
    notes TEXT, -- Additional notes
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- Patient medical history table
CREATE TABLE patient_medical_history (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    patient_id UUID REFERENCES patients(id) ON DELETE CASCADE,
    condition VARCHAR(200) NOT NULL, -- Medical condition
    diagnosis_date DATE, -- When diagnosed
    status VARCHAR(20) CHECK (status IN ('active', 'inactive', 'resolved')),
    notes TEXT, -- Additional notes
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- Patient family history table
CREATE TABLE patient_family_history (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    patient_id UUID REFERENCES patients(id) ON DELETE CASCADE,
    relative_relationship VARCHAR(50), -- Relationship to patient
    condition VARCHAR(200), -- Medical condition
    notes TEXT, -- Additional notes
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- Patient medications table
CREATE TABLE patient_medications (
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

-- Audit log for patient data changes
CREATE TABLE patient_audit_log (
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
```

## Validation Rules

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

## Integration Points

1. **Accession API**: Uses patient_national_id, patient_name, sex, birth_date
2. **Order Management**: Mirrors patient fields in orders table
3. **SIMRS Order UI**: Collects and validates all patient information
4. **MWL Writer**: Uses patient demographics for DICOM worklists
5. **SatuSehat Integrator**: Requires ihs_number for national system integration

## Benefits of This Schema

1. **Comprehensive**: Covers all patient data needs identified in the system
2. **Normalized**: Reduces data duplication with related tables for allergies, medications, etc.
3. **Extensible**: Additional fields can be added without major schema changes
4. **Secure**: Audit logging for compliance and data tracking
5. **Performant**: Proper indexing for common query patterns
6. **Standards-compliant**: Follows healthcare data standards and regulations