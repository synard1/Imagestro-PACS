# Dokumentasi Lengkap Worklist System - PACS
**Tanggal**: 18 November 2025  
**Versi**: 1.0  
**Status**: Comprehensive Documentation

---

## 📋 Daftar Isi

1. [Pengenalan Worklist System](#pengenalan-worklist-system)
2. [Konsep DICOM Modality Worklist (MWL)](#konsep-dicom-modality-worklist-mwl)
3. [Alur Kerja Worklist](#alur-kerja-worklist)
4. [Database Schema](#database-schema)
5. [Relasi Antar Tabel](#relasi-antar-tabel)
6. [Status Workflow](#status-workflow)
7. [Integrasi dengan Komponen Lain](#integrasi-dengan-komponen-lain)
8. [API Endpoints](#api-endpoints)
9. [Use Cases](#use-cases)
10. [Best Practices](#best-practices)

---

## 1. Pengenalan Worklist System

### Apa itu Worklist?

Worklist adalah sistem manajemen antrian pemeriksaan radiologi yang mengatur:
- **Penjadwalan** pemeriksaan pasien
- **Distribusi** informasi ke modalitas (CT, MRI, X-Ray)
- **Tracking** status pemeriksaan
- **Koordinasi** antara RIS (Radiology Information System) dan PACS

### Fungsi Utama

1. **Order Management**: Mengelola order pemeriksaan dari dokter
2. **Scheduling**: Penjadwalan pemeriksaan pasien
3. **Modality Communication**: Komunikasi dengan peralatan medis via DICOM MWL
4. **Status Tracking**: Melacak progress pemeriksaan
5. **Resource Management**: Mengatur penggunaan modalitas dan ruangan


---

## 2. Konsep DICOM Modality Worklist (MWL)

### DICOM MWL Standard

DICOM Modality Worklist (C-FIND) adalah standar untuk:
- Mengirim daftar pemeriksaan terjadwal ke modalitas
- Modalitas query worklist untuk mendapatkan informasi pasien
- Auto-populate data pasien di modalitas (mengurangi kesalahan input manual)

### Keuntungan MWL

✅ **Akurasi Data**: Mengurangi kesalahan input manual  
✅ **Efisiensi**: Operator tidak perlu input data pasien manual  
✅ **Integrasi**: Seamless integration antara RIS-PACS-Modalitas  
✅ **Compliance**: Memenuhi standar DICOM  

### MWL Query Flow

```
Modalitas (CT/MRI/X-Ray)
    │
    │ C-FIND Request (Query Worklist)
    │ - Patient ID
    │ - Scheduled Date
    │ - Modality Type
    ▼
PACS Worklist Server
    │
    │ Search Database
    │ - Match criteria
    │ - Filter by modality
    │ - Check schedule
    ▼
Return Worklist Items
    │
    │ - Patient Demographics
    │ - Scheduled Procedure
    │ - Accession Number
    │ - Study Instance UID
    ▼
Modalitas displays worklist
    │
    │ Operator selects patient
    ▼
Start examination with pre-filled data
```


---

## 3. Alur Kerja Worklist

### 3.1 Alur Lengkap End-to-End

```
┌─────────────────────────────────────────────────────────────────────┐
│                    WORKLIST WORKFLOW - COMPLETE                      │
└─────────────────────────────────────────────────────────────────────┘

1. ORDER CREATION (Dokter/Registrasi)
   ┌──────────────────────────────────────┐
   │ Dokter membuat order pemeriksaan     │
   │ - Patient demographics               │
   │ - Procedure request                  │
   │ - Clinical indication                │
   │ - Priority (routine/urgent/stat)     │
   └──────────────────────────────────────┘
                    ↓
   ┌──────────────────────────────────────┐
   │ System generates:                    │
   │ - Order Number                       │
   │ - Accession Number (unique)          │
   │ - Study Instance UID                 │
   └──────────────────────────────────────┘
                    ↓
   Status: CREATED / DRAFT

2. SCHEDULING (Radiologi Admin)
   ┌──────────────────────────────────────┐
   │ Admin menjadwalkan pemeriksaan       │
   │ - Pilih tanggal & waktu              │
   │ - Assign modalitas                   │
   │ - Assign ruangan (optional)          │
   │ - Konfirmasi dengan pasien           │
   └──────────────────────────────────────┘
                    ↓
   Status: SCHEDULED / ENQUEUED

3. WORKLIST DISTRIBUTION (Automatic)
   ┌──────────────────────────────────────┐
   │ Worklist tersedia untuk modalitas    │
   │ - Modalitas query via C-FIND         │
   │ - Filter by modality type            │
   │ - Filter by scheduled date           │
   └──────────────────────────────────────┘
                    ↓
   Worklist Item visible di modalitas

4. PATIENT ARRIVAL (Registrasi/Nurse)
   ┌──────────────────────────────────────┐
   │ Pasien datang ke radiologi           │
   │ - Check-in pasien                    │
   │ - Verifikasi identitas               │
   │ - Update status                      │
   └──────────────────────────────────────┘
                    ↓
   Status: ARRIVED / CHECKED_IN

5. EXAMINATION START (Radiographer)
   ┌──────────────────────────────────────┐
   │ Radiographer memulai pemeriksaan     │
   │ - Select dari worklist di modalitas  │
   │ - Data auto-populate                 │
   │ - Start acquisition                  │
   └──────────────────────────────────────┘
                    ↓
   Status: IN_PROGRESS / ACQUIRING

6. IMAGE ACQUISITION (Modalitas)
   ┌──────────────────────────────────────┐
   │ Modalitas mengakuisisi images        │
   │ - Capture images/series              │
   │ - Embed patient/study metadata       │
   │ - Send via DICOM C-STORE             │
   └──────────────────────────────────────┘
                    ↓
   Images stored in PACS

7. EXAMINATION COMPLETE (Radiographer)
   ┌──────────────────────────────────────┐
   │ Pemeriksaan selesai                  │
   │ - Verify all images sent             │
   │ - Mark as complete                   │
   │ - Patient dismissed                  │
   └──────────────────────────────────────┘
                    ↓
   Status: COMPLETED / READY_FOR_READING

8. REPORTING (Radiologist)
   ┌──────────────────────────────────────┐
   │ Radiologist membaca study            │
   │ - View images in DICOM viewer        │
   │ - Create report                      │
   │ - Add findings & impression          │
   └──────────────────────────────────────┘
                    ↓
   Status: REPORTED / PRELIMINARY

9. REPORT APPROVAL (Senior Radiologist)
   ┌──────────────────────────────────────┐
   │ Senior radiologist review & approve  │
   │ - Review report                      │
   │ - Digital signature                  │
   │ - Finalize report                    │
   └──────────────────────────────────────┘
                    ↓
   Status: FINALIZED / SIGNED

10. RESULT DELIVERY (System)
    ┌──────────────────────────────────────┐
    │ Hasil tersedia untuk dokter          │
    │ - Notify referring physician         │
    │ - Available in EMR/HIS               │
    │ - PDF report generated               │
    └──────────────────────────────────────┘
                    ↓
    Status: DELIVERED / CLOSED
```


### 3.2 Alur Alternatif & Exception Handling

#### Reschedule Flow
```
Order: SCHEDULED
    │
    │ Patient request reschedule
    ▼
Admin reschedules
    │
    ├─► Update scheduled_at
    ├─► Add to reschedule_history
    ├─► Notify patient
    └─► Update worklist
        ↓
Status: RESCHEDULED
```

#### Cancellation Flow
```
Order: Any status (except COMPLETED)
    │
    │ Cancellation request
    ▼
Admin/Doctor cancels
    │
    ├─► Set cancelled_at timestamp
    ├─► Record cancelled_by
    ├─► Record cancellation_reason
    └─► Remove from active worklist
        ↓
Status: CANCELLED
```

#### No-Show Flow
```
Order: SCHEDULED
    │
    │ Scheduled time passed
    │ Patient tidak datang
    ▼
System auto-detect OR Manual mark
    │
    ├─► Mark as no-show
    ├─► Notify admin
    └─► Offer reschedule
        ↓
Status: NO_SHOW
```

#### Emergency/STAT Flow
```
Order: CREATED
    │
    │ Priority: STAT
    ▼
Skip normal scheduling
    │
    ├─► Immediate assignment
    ├─► Push to top of worklist
    └─► Notify radiographer
        ↓
Status: URGENT → IN_PROGRESS
```


---

## 4. Database Schema

### 4.1 Tabel Utama: `orders`

Tabel ini adalah core dari worklist system, menyimpan semua order pemeriksaan.

```sql
CREATE TABLE orders (
    -- Primary Key
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- Order Identifiers (UNIQUE & INDEXED)
    order_number VARCHAR(50) UNIQUE NOT NULL,
    accession_number VARCHAR(50) UNIQUE NOT NULL,
    
    -- Organization (Multi-tenant support)
    org_id UUID REFERENCES organizations(id),
    
    -- Patient Information
    patient_id UUID REFERENCES patients(id) ON DELETE SET NULL,
    patient_name VARCHAR(255) NOT NULL,
    patient_national_id VARCHAR(50),
    medical_record_number VARCHAR(50),
    satusehat_ihs_number VARCHAR(50),
    gender VARCHAR(10),
    birth_date DATE,
    address TEXT,
    phone VARCHAR(20),
    email VARCHAR(100),
    patient_phone VARCHAR(20),
    patient_address TEXT,
    registration_number VARCHAR(50),
    
    -- Procedure Information
    procedure_name VARCHAR(255) NOT NULL,
    procedure_code VARCHAR(50),
    procedure_description TEXT,
    loinc_code VARCHAR(20),
    loinc_name VARCHAR(255),
    modality VARCHAR(20) NOT NULL,
    
    -- Clinical Information
    clinical_indication TEXT,
    clinical_notes TEXT,
    referring_doctor VARCHAR(255),
    ordering_physician_name VARCHAR(255),
    performing_physician_name VARCHAR(255),
    requesting_department VARCHAR(100),
    attending_nurse VARCHAR(255),
    
    -- Scheduling
    scheduled_at TIMESTAMP,
    scheduled_start_at TIMESTAMP,
    ordering_station_aet VARCHAR(50),
    
    -- Priority
    priority VARCHAR(20) DEFAULT 'routine',
    -- Values: 'routine', 'urgent', 'stat', 'emergency'
    
    -- Status Management
    status VARCHAR(50) DEFAULT 'created',
    -- Values: 'draft', 'created', 'scheduled', 'enqueued', 'rescheduled',
    --         'arrived', 'in_progress', 'completed', 'reported', 
    --         'finalized', 'cancelled', 'no_show'
    
    order_status VARCHAR(50),
    worklist_status VARCHAR(50),
    imaging_status VARCHAR(50),
    
    -- Cancellation
    cancelled_at TIMESTAMP,
    cancelled_by VARCHAR(100),
    cancelled_reason TEXT,
    
    -- Special Instructions
    special_instructions TEXT,
    
    -- Metadata & Details (JSONB for flexibility)
    details JSONB,
    -- Structure:
    -- {
    --   "reason": "Clinical indication",
    --   "icd10": {"code": "R10.9", "label": "Abdominal pain"},
    --   "tags": ["urgent", "contrast"],
    --   "status_history": [
    --     {"status": "created", "timestamp": "...", "by": "user1"},
    --     {"status": "scheduled", "timestamp": "...", "by": "user2"}
    --   ],
    --   "reschedule_history": [
    --     {
    --       "from": "2025-11-18 10:00",
    --       "to": "2025-11-19 14:00",
    --       "reason": "Patient request",
    --       "rescheduled_by": "admin1",
    --       "rescheduled_at": "2025-11-17 15:30"
    --     }
    --   ]
    -- }
    
    -- SatuSehat Integration
    satusehat_encounter_id VARCHAR(100),
    satusehat_service_request_id VARCHAR(100),
    satusehat_synced BOOLEAN DEFAULT FALSE,
    satusehat_sync_date TIMESTAMP,
    
    -- Timestamps
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    -- Soft Delete
    deleted_at TIMESTAMP,
    
    -- Indexes
    CONSTRAINT chk_priority CHECK (priority IN ('routine', 'urgent', 'stat', 'emergency')),
    CONSTRAINT chk_status CHECK (status IN (
        'draft', 'created', 'scheduled', 'enqueued', 'rescheduled',
        'arrived', 'in_progress', 'completed', 'reported', 
        'finalized', 'cancelled', 'no_show'
    ))
);

-- Indexes for Performance
CREATE INDEX idx_orders_patient_id ON orders(patient_id);
CREATE INDEX idx_orders_order_number ON orders(order_number);
CREATE INDEX idx_orders_accession_number ON orders(accession_number);
CREATE INDEX idx_orders_status ON orders(status);
CREATE INDEX idx_orders_modality ON orders(modality);
CREATE INDEX idx_orders_scheduled_at ON orders(scheduled_at);
CREATE INDEX idx_orders_created_at ON orders(created_at);
CREATE INDEX idx_orders_priority ON orders(priority);
CREATE INDEX idx_orders_deleted_at ON orders(deleted_at) WHERE deleted_at IS NULL;

-- Composite indexes for common queries
CREATE INDEX idx_orders_status_scheduled ON orders(status, scheduled_at);
CREATE INDEX idx_orders_modality_status ON orders(modality, status);
CREATE INDEX idx_orders_patient_status ON orders(patient_id, status);

-- Full-text search index
CREATE INDEX idx_orders_patient_name_trgm ON orders USING gin(patient_name gin_trgm_ops);
CREATE INDEX idx_orders_procedure_name_trgm ON orders USING gin(procedure_name gin_trgm_ops);
```


### 4.2 Tabel Pendukung: `patients`

```sql
CREATE TABLE patients (
    -- Primary Key
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- Organization
    org_id UUID REFERENCES organizations(id),
    
    -- Patient Identifiers
    medical_record_number VARCHAR(50) UNIQUE,
    national_id VARCHAR(50) UNIQUE,
    satusehat_ihs_number VARCHAR(50) UNIQUE,
    
    -- Demographics
    name VARCHAR(255) NOT NULL,
    gender VARCHAR(10),
    birth_date DATE,
    birth_place VARCHAR(100),
    
    -- Contact
    address TEXT,
    city VARCHAR(100),
    province VARCHAR(100),
    postal_code VARCHAR(10),
    phone VARCHAR(20),
    email VARCHAR(100),
    emergency_contact_name VARCHAR(255),
    emergency_contact_phone VARCHAR(20),
    
    -- Insurance
    insurance_provider VARCHAR(100),
    insurance_number VARCHAR(50),
    
    -- Medical History (JSONB)
    medical_history JSONB,
    -- {
    --   "allergies": ["penicillin", "contrast"],
    --   "chronic_conditions": ["diabetes", "hypertension"],
    --   "medications": ["metformin", "lisinopril"],
    --   "previous_surgeries": [...]
    -- }
    
    -- SatuSehat
    satusehat_patient_id VARCHAR(100),
    satusehat_synced BOOLEAN DEFAULT FALSE,
    
    -- Timestamps
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    deleted_at TIMESTAMP
);

CREATE INDEX idx_patients_mrn ON patients(medical_record_number);
CREATE INDEX idx_patients_national_id ON patients(national_id);
CREATE INDEX idx_patients_name ON patients(name);
CREATE INDEX idx_patients_birth_date ON patients(birth_date);
```

### 4.3 Tabel: `procedures`

Master data untuk jenis-jenis pemeriksaan radiologi.

```sql
CREATE TABLE procedures (
    -- Primary Key
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- Procedure Information
    code VARCHAR(50) UNIQUE NOT NULL,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    
    -- Classification
    modality VARCHAR(20) NOT NULL,
    body_part VARCHAR(100),
    category VARCHAR(100),
    
    -- LOINC Coding
    loinc_code VARCHAR(20),
    loinc_display VARCHAR(255),
    
    -- CPT/ICD Coding
    cpt_code VARCHAR(20),
    icd10_pcs_code VARCHAR(20),
    
    -- Procedure Details
    typical_duration_minutes INTEGER,
    requires_contrast BOOLEAN DEFAULT FALSE,
    requires_preparation BOOLEAN DEFAULT FALSE,
    preparation_instructions TEXT,
    
    -- Pricing
    base_price DECIMAL(10,2),
    
    -- Status
    is_active BOOLEAN DEFAULT TRUE,
    
    -- Metadata
    metadata JSONB,
    
    -- Timestamps
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_procedures_code ON procedures(code);
CREATE INDEX idx_procedures_modality ON procedures(modality);
CREATE INDEX idx_procedures_is_active ON procedures(is_active);
```

### 4.4 Tabel: `modalities`

Master data untuk modalitas (peralatan imaging).

```sql
CREATE TABLE modalities (
    -- Primary Key
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- Modality Information
    modality_type VARCHAR(20) NOT NULL,
    -- Values: 'CT', 'MRI', 'CR', 'DX', 'US', 'NM', 'PT', 'MG', etc.
    
    name VARCHAR(100) NOT NULL,
    description TEXT,
    
    -- DICOM Configuration
    ae_title VARCHAR(50) UNIQUE NOT NULL,
    ip_address VARCHAR(50),
    port INTEGER DEFAULT 11112,
    
    -- Location
    location VARCHAR(100),
    room_number VARCHAR(20),
    
    -- Capabilities
    supported_procedures JSONB,
    -- ["CT Brain", "CT Chest", "CT Abdomen"]
    
    -- Status
    is_active BOOLEAN DEFAULT TRUE,
    is_online BOOLEAN DEFAULT FALSE,
    last_heartbeat TIMESTAMP,
    
    -- Configuration
    config JSONB,
    -- {
    --   "max_concurrent_studies": 1,
    --   "average_study_duration": 30,
    --   "working_hours": {"start": "08:00", "end": "17:00"}
    -- }
    
    -- Timestamps
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_modalities_ae_title ON modalities(ae_title);
CREATE INDEX idx_modalities_type ON modalities(modality_type);
CREATE INDEX idx_modalities_is_active ON modalities(is_active);
```


### 4.5 Tabel: `worklist_items`

Tabel khusus untuk DICOM Modality Worklist (MWL) - optimized untuk C-FIND queries.

```sql
CREATE TABLE worklist_items (
    -- Primary Key
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- Link to Order
    order_id UUID REFERENCES orders(id) ON DELETE CASCADE,
    
    -- DICOM Identifiers
    study_instance_uid VARCHAR(64) UNIQUE NOT NULL,
    accession_number VARCHAR(50) NOT NULL,
    
    -- Scheduled Procedure Step (SPS)
    sps_id VARCHAR(50) UNIQUE NOT NULL,
    sps_status VARCHAR(20) DEFAULT 'SCHEDULED',
    -- Values: 'SCHEDULED', 'ARRIVED', 'STARTED', 'COMPLETED', 'DISCONTINUED'
    
    scheduled_procedure_step_start_date DATE NOT NULL,
    scheduled_procedure_step_start_time TIME NOT NULL,
    scheduled_procedure_step_description VARCHAR(255),
    
    -- Modality
    modality VARCHAR(20) NOT NULL,
    scheduled_station_ae_title VARCHAR(50),
    scheduled_station_name VARCHAR(100),
    
    -- Patient Demographics (denormalized for MWL performance)
    patient_id VARCHAR(64) NOT NULL,
    patient_name VARCHAR(255) NOT NULL,
    patient_birth_date DATE,
    patient_sex VARCHAR(1),
    patient_weight DECIMAL(5,2),
    patient_size DECIMAL(5,2),
    
    -- Procedure
    requested_procedure_id VARCHAR(50),
    requested_procedure_description VARCHAR(255),
    requested_procedure_code_sequence JSONB,
    -- {
    --   "code_value": "71020",
    --   "coding_scheme_designator": "CPT",
    --   "code_meaning": "Chest X-Ray"
    -- }
    
    -- Study
    study_id VARCHAR(50),
    study_description VARCHAR(255),
    
    -- Referring Physician
    referring_physician_name VARCHAR(255),
    
    -- Additional DICOM Attributes
    admission_id VARCHAR(50),
    current_patient_location VARCHAR(100),
    patient_state VARCHAR(50),
    pregnancy_status VARCHAR(20),
    medical_alerts TEXT,
    contrast_allergies TEXT,
    special_needs TEXT,
    
    -- Priority
    priority VARCHAR(20) DEFAULT 'ROUTINE',
    -- Values: 'STAT', 'HIGH', 'ROUTINE', 'MEDIUM', 'LOW'
    
    -- Metadata
    dicom_attributes JSONB,
    -- Store additional DICOM tags as needed
    
    -- Status
    is_active BOOLEAN DEFAULT TRUE,
    completed_at TIMESTAMP,
    
    -- Timestamps
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    CONSTRAINT chk_sps_status CHECK (sps_status IN (
        'SCHEDULED', 'ARRIVED', 'STARTED', 'COMPLETED', 'DISCONTINUED'
    ))
);

-- Indexes optimized for DICOM C-FIND queries
CREATE INDEX idx_worklist_order_id ON worklist_items(order_id);
CREATE INDEX idx_worklist_study_uid ON worklist_items(study_instance_uid);
CREATE INDEX idx_worklist_accession ON worklist_items(accession_number);
CREATE INDEX idx_worklist_sps_id ON worklist_items(sps_id);
CREATE INDEX idx_worklist_patient_id ON worklist_items(patient_id);
CREATE INDEX idx_worklist_patient_name ON worklist_items(patient_name);
CREATE INDEX idx_worklist_modality ON worklist_items(modality);
CREATE INDEX idx_worklist_scheduled_date ON worklist_items(scheduled_procedure_step_start_date);
CREATE INDEX idx_worklist_sps_status ON worklist_items(sps_status);
CREATE INDEX idx_worklist_is_active ON worklist_items(is_active) WHERE is_active = TRUE;

-- Composite indexes for common MWL queries
CREATE INDEX idx_worklist_modality_date_status ON worklist_items(
    modality, 
    scheduled_procedure_step_start_date, 
    sps_status
) WHERE is_active = TRUE;

CREATE INDEX idx_worklist_ae_date ON worklist_items(
    scheduled_station_ae_title,
    scheduled_procedure_step_start_date
) WHERE is_active = TRUE;
```


### 4.6 Tabel: `worklist_history`

Audit trail untuk perubahan worklist.

```sql
CREATE TABLE worklist_history (
    -- Primary Key
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- Reference
    worklist_item_id UUID REFERENCES worklist_items(id) ON DELETE CASCADE,
    order_id UUID REFERENCES orders(id) ON DELETE CASCADE,
    
    -- Change Information
    action VARCHAR(50) NOT NULL,
    -- Values: 'CREATED', 'SCHEDULED', 'RESCHEDULED', 'STARTED', 
    --         'COMPLETED', 'CANCELLED', 'MODIFIED'
    
    previous_status VARCHAR(20),
    new_status VARCHAR(20),
    
    previous_scheduled_time TIMESTAMP,
    new_scheduled_time TIMESTAMP,
    
    -- Change Details
    change_reason TEXT,
    change_details JSONB,
    
    -- User Information
    changed_by VARCHAR(100),
    changed_by_role VARCHAR(50),
    
    -- Timestamp
    changed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_worklist_history_item_id ON worklist_history(worklist_item_id);
CREATE INDEX idx_worklist_history_order_id ON worklist_history(order_id);
CREATE INDEX idx_worklist_history_action ON worklist_history(action);
CREATE INDEX idx_worklist_history_changed_at ON worklist_history(changed_at);
```

### 4.7 Tabel: `schedule_slots`

Manajemen slot waktu untuk penjadwalan.

```sql
CREATE TABLE schedule_slots (
    -- Primary Key
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- Modality
    modality_id UUID REFERENCES modalities(id) ON DELETE CASCADE,
    modality_type VARCHAR(20) NOT NULL,
    
    -- Time Slot
    slot_date DATE NOT NULL,
    slot_start_time TIME NOT NULL,
    slot_end_time TIME NOT NULL,
    duration_minutes INTEGER NOT NULL,
    
    -- Capacity
    max_capacity INTEGER DEFAULT 1,
    current_bookings INTEGER DEFAULT 0,
    
    -- Status
    is_available BOOLEAN DEFAULT TRUE,
    is_blocked BOOLEAN DEFAULT FALSE,
    block_reason TEXT,
    
    -- Linked Order
    order_id UUID REFERENCES orders(id) ON DELETE SET NULL,
    
    -- Metadata
    notes TEXT,
    
    -- Timestamps
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    CONSTRAINT chk_capacity CHECK (current_bookings <= max_capacity),
    CONSTRAINT chk_time_order CHECK (slot_start_time < slot_end_time)
);

CREATE INDEX idx_schedule_modality ON schedule_slots(modality_id);
CREATE INDEX idx_schedule_date ON schedule_slots(slot_date);
CREATE INDEX idx_schedule_modality_date ON schedule_slots(modality_id, slot_date);
CREATE INDEX idx_schedule_available ON schedule_slots(is_available) WHERE is_available = TRUE;
CREATE INDEX idx_schedule_order ON schedule_slots(order_id);
```


---

## 5. Relasi Antar Tabel

### 5.1 Entity Relationship Diagram (ERD)

```
┌─────────────────────────────────────────────────────────────────────┐
│                    WORKLIST SYSTEM - ERD                             │
└─────────────────────────────────────────────────────────────────────┘

┌──────────────────┐
│  organizations   │
│  ──────────────  │
│  id (PK)         │
│  name            │
└────────┬─────────┘
         │
         │ 1:N
         │
    ┌────┴────────────────────────────────────┐
    │                                          │
    ▼                                          ▼
┌──────────────────┐                  ┌──────────────────┐
│    patients      │                  │    modalities    │
│  ──────────────  │                  │  ──────────────  │
│  id (PK)         │                  │  id (PK)         │
│  org_id (FK)     │                  │  modality_type   │
│  mrn (UNIQUE)    │                  │  ae_title        │
│  name            │                  │  ip_address      │
│  birth_date      │                  │  is_active       │
│  gender          │                  └────────┬─────────┘
│  phone           │                           │
│  address         │                           │ 1:N
└────────┬─────────┘                           │
         │                                     │
         │ 1:N                                 │
         │                                     │
         ▼                                     ▼
┌──────────────────────────────────────────────────────────────┐
│                        orders                                 │
│  ──────────────────────────────────────────────────────────  │
│  id (PK)                                                      │
│  order_number (UNIQUE)                                        │
│  accession_number (UNIQUE)                                    │
│  patient_id (FK) ──────────────────────────┐                │
│  modality                                   │                │
│  procedure_name                             │                │
│  scheduled_at                               │                │
│  status                                     │                │
│  priority                                   │                │
│  details (JSONB)                            │                │
└────────┬────────────────────────────────────┴────────────────┘
         │
         │ 1:1
         │
         ▼
┌──────────────────────────────────────────────────────────────┐
│                    worklist_items                             │
│  ──────────────────────────────────────────────────────────  │
│  id (PK)                                                      │
│  order_id (FK) ───────────────────────────┐                 │
│  study_instance_uid (UNIQUE)              │                 │
│  sps_id (UNIQUE)                          │                 │
│  sps_status                               │                 │
│  scheduled_procedure_step_start_date      │                 │
│  scheduled_procedure_step_start_time      │                 │
│  modality                                 │                 │
│  scheduled_station_ae_title               │                 │
│  patient_id (denormalized)                │                 │
│  patient_name (denormalized)              │                 │
│  is_active                                │                 │
└────────┬──────────────────────────────────┴─────────────────┘
         │
         │ 1:N
         │
         ▼
┌──────────────────────────────────────────────────────────────┐
│                  worklist_history                             │
│  ──────────────────────────────────────────────────────────  │
│  id (PK)                                                      │
│  worklist_item_id (FK)                                        │
│  order_id (FK)                                                │
│  action                                                       │
│  previous_status                                              │
│  new_status                                                   │
│  changed_by                                                   │
│  changed_at                                                   │
└───────────────────────────────────────────────────────────────┘


┌──────────────────┐
│   procedures     │
│  ──────────────  │
│  id (PK)         │
│  code (UNIQUE)   │
│  name            │
│  modality        │
│  loinc_code      │
│  is_active       │
└──────────────────┘
         │
         │ Referenced by orders.procedure_code
         │


┌──────────────────────────────────────────────────────────────┐
│                    schedule_slots                             │
│  ──────────────────────────────────────────────────────────  │
│  id (PK)                                                      │
│  modality_id (FK) ────────────────────────┐                 │
│  slot_date                                │                 │
│  slot_start_time                          │                 │
│  slot_end_time                            │                 │
│  max_capacity                             │                 │
│  current_bookings                         │                 │
│  is_available                             │                 │
│  order_id (FK) ───────────────────────────┘                 │
└───────────────────────────────────────────────────────────────┘


┌──────────────────────────────────────────────────────────────┐
│                    pacs_studies                               │
│  ──────────────────────────────────────────────────────────  │
│  study_instance_uid (PK)                                      │
│  order_id (FK) ───────────────────────────┐                 │
│  patient_id (FK)                          │                 │
│  accession_number                         │                 │
│  study_date                               │                 │
│  modality                                 │                 │
│  number_of_series                         │                 │
│  number_of_instances                      │                 │
└────────┬──────────────────────────────────┴─────────────────┘
         │
         │ 1:N
         │
         ▼
┌──────────────────────────────────────────────────────────────┐
│                    pacs_series                                │
│  ──────────────────────────────────────────────────────────  │
│  series_instance_uid (PK)                                     │
│  study_instance_uid (FK)                                      │
│  series_number                                                │
│  modality                                                     │
│  series_description                                           │
└────────┬──────────────────────────────────────────────────────┘
         │
         │ 1:N
         │
         ▼
┌──────────────────────────────────────────────────────────────┐
│                   pacs_instances                              │
│  ──────────────────────────────────────────────────────────  │
│  sop_instance_uid (PK)                                        │
│  series_instance_uid (FK)                                     │
│  instance_number                                              │
│  sop_class_uid                                                │
│  file_path                                                    │
└───────────────────────────────────────────────────────────────┘


┌──────────────────────────────────────────────────────────────┐
│                       reports                                 │
│  ──────────────────────────────────────────────────────────  │
│  id (PK)                                                      │
│  report_id (UNIQUE)                                           │
│  study_id (references pacs_studies)                           │
│  patient_id                                                   │
│  findings                                                     │
│  impression                                                   │
│  status                                                       │
│  created_by                                                   │
│  finalized_at                                                 │
└───────────────────────────────────────────────────────────────┘
```


### 5.2 Relasi Detail

#### 1. **orders ↔ patients** (Many-to-One)
```sql
-- Satu patient bisa punya banyak orders
-- Satu order hanya untuk satu patient

orders.patient_id → patients.id

-- Query: Get all orders for a patient
SELECT o.* FROM orders o
WHERE o.patient_id = 'patient-uuid'
ORDER BY o.scheduled_at DESC;
```

#### 2. **orders ↔ worklist_items** (One-to-One)
```sql
-- Satu order menghasilkan satu worklist item
-- Satu worklist item untuk satu order

worklist_items.order_id → orders.id

-- Query: Get worklist item for an order
SELECT w.* FROM worklist_items w
WHERE w.order_id = 'order-uuid'
AND w.is_active = TRUE;
```

#### 3. **worklist_items ↔ worklist_history** (One-to-Many)
```sql
-- Satu worklist item bisa punya banyak history records
-- Satu history record untuk satu worklist item

worklist_history.worklist_item_id → worklist_items.id

-- Query: Get history for a worklist item
SELECT h.* FROM worklist_history h
WHERE h.worklist_item_id = 'worklist-item-uuid'
ORDER BY h.changed_at DESC;
```

#### 4. **orders ↔ pacs_studies** (One-to-One/One-to-Many)
```sql
-- Satu order bisa menghasilkan satu atau lebih studies
-- (biasanya one-to-one, tapi bisa one-to-many untuk re-examination)

pacs_studies.order_id → orders.id
pacs_studies.accession_number = orders.accession_number

-- Query: Get study for an order
SELECT s.* FROM pacs_studies s
WHERE s.order_id = 'order-uuid'
OR s.accession_number = 'ACC001';
```

#### 5. **modalities ↔ schedule_slots** (One-to-Many)
```sql
-- Satu modality punya banyak schedule slots
-- Satu slot untuk satu modality

schedule_slots.modality_id → modalities.id

-- Query: Get available slots for a modality
SELECT s.* FROM schedule_slots s
WHERE s.modality_id = 'modality-uuid'
AND s.slot_date = '2025-11-18'
AND s.is_available = TRUE
ORDER BY s.slot_start_time;
```

#### 6. **orders ↔ schedule_slots** (One-to-One)
```sql
-- Satu order assigned ke satu schedule slot
-- Satu slot bisa di-book oleh satu order

schedule_slots.order_id → orders.id

-- Query: Get slot for an order
SELECT s.* FROM schedule_slots s
WHERE s.order_id = 'order-uuid';
```

#### 7. **pacs_studies ↔ reports** (One-to-One/One-to-Many)
```sql
-- Satu study bisa punya satu atau lebih reports
-- (one-to-one untuk final report, one-to-many jika ada amendments)

reports.study_id → pacs_studies.study_instance_uid

-- Query: Get report for a study
SELECT r.* FROM reports r
WHERE r.study_id = 'study-instance-uid'
AND r.deleted = FALSE
ORDER BY r.version DESC
LIMIT 1;
```


---

## 6. Status Workflow

### 6.1 Order Status State Machine

```
┌─────────────────────────────────────────────────────────────────────┐
│                    ORDER STATUS WORKFLOW                             │
└─────────────────────────────────────────────────────────────────────┘

                    ┌──────────┐
                    │  DRAFT   │ (Optional - for incomplete orders)
                    └────┬─────┘
                         │
                         ▼
                    ┌──────────┐
            ┌───────│ CREATED  │◄──────┐
            │       └────┬─────┘       │
            │            │              │
            │            ▼              │
            │       ┌──────────┐       │
            │       │SCHEDULED │       │
            │       └────┬─────┘       │
            │            │              │
            │            ▼              │
            │       ┌──────────┐       │
            │   ┌───│ ENQUEUED │       │
            │   │   └────┬─────┘       │
            │   │        │              │
            │   │        ▼              │
            │   │   ┌──────────┐       │
            │   └───│RESCHEDULED│───────┘ (Loop back to SCHEDULED)
            │       └──────────┘
            │
            │            │
            │            ▼
            │       ┌──────────┐
            │       │ ARRIVED  │ (Patient checked in)
            │       └────┬─────┘
            │            │
            │            ▼
            │       ┌──────────┐
            │       │IN_PROGRESS│ (Examination started)
            │       └────┬─────┘
            │            │
            │            ▼
            │       ┌──────────┐
            │       │COMPLETED │ (Images acquired)
            │       └────┬─────┘
            │            │
            │            ▼
            │       ┌──────────┐
            │       │ REPORTED │ (Report created)
            │       └────┬─────┘
            │            │
            │            ▼
            │       ┌──────────┐
            │       │FINALIZED │ (Report signed)
            │       └────┬─────┘
            │            │
            │            ▼
            │       ┌──────────┐
            │       │ DELIVERED│ (Result sent to doctor)
            │       └──────────┘
            │
            │       ┌──────────┐
            └──────►│CANCELLED │ (Can cancel from any status)
                    └──────────┘
                    
                    ┌──────────┐
                    │ NO_SHOW  │ (Patient didn't arrive)
                    └──────────┘
```

### 6.2 Status Definitions

| Status | Description | Allowed Transitions | User Actions |
|--------|-------------|---------------------|--------------|
| **DRAFT** | Order sedang dibuat, belum complete | → CREATED, CANCELLED | Edit, Complete, Cancel |
| **CREATED** | Order dibuat, belum dijadwalkan | → SCHEDULED, CANCELLED | Schedule, Cancel |
| **SCHEDULED** | Order sudah dijadwalkan | → ENQUEUED, RESCHEDULED, ARRIVED, CANCELLED, NO_SHOW | Reschedule, Check-in, Cancel |
| **ENQUEUED** | Order dalam antrian hari ini | → RESCHEDULED, ARRIVED, CANCELLED | Reschedule, Check-in, Cancel |
| **RESCHEDULED** | Order dijadwalkan ulang | → SCHEDULED, CANCELLED | (Auto transition) |
| **ARRIVED** | Pasien sudah check-in | → IN_PROGRESS, CANCELLED | Start exam, Cancel |
| **IN_PROGRESS** | Pemeriksaan sedang berlangsung | → COMPLETED, CANCELLED | Complete, Cancel |
| **COMPLETED** | Pemeriksaan selesai, images acquired | → REPORTED | Create report |
| **REPORTED** | Report sudah dibuat | → FINALIZED | Sign report |
| **FINALIZED** | Report sudah ditandatangani | → DELIVERED | Send to doctor |
| **DELIVERED** | Hasil sudah dikirim ke dokter | (Terminal state) | View only |
| **CANCELLED** | Order dibatalkan | (Terminal state) | View only |
| **NO_SHOW** | Pasien tidak datang | → RESCHEDULED | Reschedule |

### 6.3 Worklist Item SPS Status

Scheduled Procedure Step (SPS) Status untuk DICOM MWL:

| SPS Status | Description | DICOM Value | Order Status Mapping |
|------------|-------------|-------------|---------------------|
| **SCHEDULED** | Procedure terjadwal | SCHEDULED | SCHEDULED, ENQUEUED |
| **ARRIVED** | Patient sudah datang | ARRIVED | ARRIVED |
| **STARTED** | Procedure dimulai | IN PROGRESS | IN_PROGRESS |
| **COMPLETED** | Procedure selesai | COMPLETED | COMPLETED |
| **DISCONTINUED** | Procedure dibatalkan | DISCONTINUED | CANCELLED |


---

## 7. Integrasi dengan Komponen Lain

### 7.1 Integrasi dengan PACS Studies

```sql
-- Trigger: Auto-create study record when order completed
CREATE OR REPLACE FUNCTION create_study_from_order()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.status = 'COMPLETED' AND OLD.status != 'COMPLETED' THEN
        -- Create study record if not exists
        INSERT INTO pacs_studies (
            study_instance_uid,
            order_id,
            patient_id,
            accession_number,
            study_date,
            modality,
            patient_name
        )
        SELECT 
            w.study_instance_uid,
            NEW.id,
            NEW.patient_id,
            NEW.accession_number,
            CURRENT_DATE,
            NEW.modality,
            NEW.patient_name
        FROM worklist_items w
        WHERE w.order_id = NEW.id
        ON CONFLICT (study_instance_uid) DO NOTHING;
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_create_study_from_order
AFTER UPDATE ON orders
FOR EACH ROW
EXECUTE FUNCTION create_study_from_order();
```

### 7.2 Integrasi dengan Upload System

Ketika user upload DICOM files melalui worklist:

```javascript
// Frontend: OrderUploadModal.jsx
async function handleUploadForOrder(orderId, files) {
  // 1. Get order context
  const order = await orderService.getOrder(orderId);
  
  // 2. Upload files with order context
  const uploadResults = await uploadService.uploadDicomFiles(files, {
    orderId: order.id,
    patientId: order.patient_id,
    accessionNumber: order.accession_number,
    studyInstanceUid: order.study_instance_uid,
    modality: order.modality
  });
  
  // 3. Update order status
  if (uploadResults.success) {
    await orderService.updateOrderStatus(orderId, 'COMPLETED');
  }
  
  return uploadResults;
}
```

### 7.3 Integrasi dengan Reporting System

```sql
-- View: Orders ready for reporting
CREATE OR REPLACE VIEW v_orders_ready_for_reporting AS
SELECT 
    o.id AS order_id,
    o.order_number,
    o.accession_number,
    o.patient_id,
    o.patient_name,
    o.procedure_name,
    o.modality,
    o.scheduled_at,
    s.study_instance_uid,
    s.number_of_series,
    s.number_of_instances,
    r.id AS report_id,
    r.status AS report_status
FROM orders o
INNER JOIN pacs_studies s ON s.order_id = o.id
LEFT JOIN reports r ON r.study_id = s.study_instance_uid
WHERE o.status = 'COMPLETED'
AND (r.id IS NULL OR r.status IN ('draft', 'preliminary'))
ORDER BY o.scheduled_at DESC;
```

### 7.4 Integrasi dengan DICOM SCP

```python
# DICOM SCP Handler: Update worklist when images received
def handle_c_store(dataset, context):
    """Handle incoming DICOM C-STORE"""
    
    # Extract identifiers
    study_uid = dataset.StudyInstanceUID
    accession_number = dataset.AccessionNumber
    
    # Find worklist item
    worklist_item = db.query(WorklistItem).filter(
        WorklistItem.study_instance_uid == study_uid,
        WorklistItem.accession_number == accession_number
    ).first()
    
    if worklist_item:
        # Update SPS status
        worklist_item.sps_status = 'STARTED'
        
        # Update order status
        order = worklist_item.order
        if order.status in ['ARRIVED', 'SCHEDULED']:
            order.status = 'IN_PROGRESS'
        
        db.commit()
    
    # Store DICOM file
    store_dicom_file(dataset)
    
    return 0x0000  # Success
```


---

## 8. API Endpoints

### 8.1 Order Management APIs

#### Create Order
```http
POST /api/orders
Content-Type: application/json

{
  "patient_id": "uuid",
  "patient_name": "John Doe",
  "procedure_code": "CT001",
  "procedure_name": "CT Brain",
  "modality": "CT",
  "scheduled_at": "2025-11-18T10:00:00",
  "priority": "routine",
  "clinical_indication": "Headache",
  "referring_doctor": "Dr. Smith"
}

Response: 201 Created
{
  "id": "uuid",
  "order_number": "ORD-2025-001",
  "accession_number": "ACC-2025-001",
  "status": "created",
  "created_at": "2025-11-18T08:00:00Z"
}
```

#### Get Worklist
```http
GET /api/worklist?date=2025-11-18&modality=CT&status=scheduled

Response: 200 OK
{
  "items": [
    {
      "id": "uuid",
      "order_number": "ORD-2025-001",
      "patient_name": "John Doe",
      "patient_id": "P001",
      "procedure_name": "CT Brain",
      "modality": "CT",
      "scheduled_at": "2025-11-18T10:00:00",
      "status": "scheduled",
      "priority": "routine",
      "sps_status": "SCHEDULED"
    }
  ],
  "total": 1,
  "page": 1,
  "per_page": 20
}
```

#### Update Order Status
```http
PATCH /api/orders/{order_id}/status
Content-Type: application/json

{
  "status": "arrived",
  "notes": "Patient checked in"
}

Response: 200 OK
{
  "id": "uuid",
  "status": "arrived",
  "updated_at": "2025-11-18T09:45:00Z"
}
```

#### Reschedule Order
```http
POST /api/orders/{order_id}/reschedule
Content-Type: application/json

{
  "new_scheduled_at": "2025-11-19T14:00:00",
  "reason": "Patient request"
}

Response: 200 OK
{
  "id": "uuid",
  "scheduled_at": "2025-11-19T14:00:00",
  "status": "rescheduled",
  "reschedule_history": [
    {
      "from": "2025-11-18T10:00:00",
      "to": "2025-11-19T14:00:00",
      "reason": "Patient request",
      "rescheduled_by": "admin1",
      "rescheduled_at": "2025-11-18T08:30:00"
    }
  ]
}
```

### 8.2 DICOM MWL APIs (C-FIND)

#### Query Worklist (DICOM C-FIND)
```python
# DICOM Query Parameters
query_dataset = Dataset()
query_dataset.PatientID = "P001"  # Optional
query_dataset.ScheduledProcedureStepSequence = [Dataset()]
query_dataset.ScheduledProcedureStepSequence[0].Modality = "CT"
query_dataset.ScheduledProcedureStepSequence[0].ScheduledStationAETitle = "CT_SCANNER_1"
query_dataset.ScheduledProcedureStepSequence[0].ScheduledProcedureStepStartDate = "20251118"

# Response: List of matching worklist items
# Each item contains:
# - Patient demographics
# - Scheduled procedure details
# - Study Instance UID
# - Accession Number
```

### 8.3 Schedule Management APIs

#### Get Available Slots
```http
GET /api/schedule/slots?modality_id=uuid&date=2025-11-18

Response: 200 OK
{
  "slots": [
    {
      "id": "uuid",
      "slot_date": "2025-11-18",
      "slot_start_time": "10:00:00",
      "slot_end_time": "10:30:00",
      "duration_minutes": 30,
      "is_available": true,
      "current_bookings": 0,
      "max_capacity": 1
    }
  ]
}
```

#### Book Slot
```http
POST /api/schedule/slots/{slot_id}/book
Content-Type: application/json

{
  "order_id": "uuid"
}

Response: 200 OK
{
  "slot_id": "uuid",
  "order_id": "uuid",
  "booked_at": "2025-11-18T08:00:00Z"
}
```


---

## 9. Use Cases

### 9.1 Use Case: Penjadwalan Pemeriksaan Rutin

**Actor**: Radiologi Admin  
**Precondition**: Order sudah dibuat oleh dokter  
**Flow**:

1. Admin membuka worklist management
2. Pilih order yang belum dijadwalkan (status: CREATED)
3. Pilih modalitas (CT Scanner 1)
4. Sistem menampilkan available slots untuk hari ini/besok
5. Admin pilih slot yang sesuai (10:00 - 10:30)
6. Konfirmasi penjadwalan
7. Sistem:
   - Update order status → SCHEDULED
   - Create worklist_item dengan SPS_STATUS = SCHEDULED
   - Book schedule_slot
   - Generate Study Instance UID
   - Send notification ke pasien (optional)

**Postcondition**: Order terjadwal dan muncul di worklist modalitas

### 9.2 Use Case: Patient Check-in

**Actor**: Registrasi/Nurse  
**Precondition**: Order status = SCHEDULED, Patient datang  
**Flow**:

1. Nurse scan barcode/input order number
2. Sistem tampilkan detail order dan patient
3. Verifikasi identitas pasien
4. Nurse klik "Check In"
5. Sistem:
   - Update order status → ARRIVED
   - Update worklist_item SPS_STATUS → ARRIVED
   - Record arrival time
   - Notify radiographer

**Postcondition**: Order ready untuk pemeriksaan

### 9.3 Use Case: Modalitas Query Worklist (DICOM MWL)

**Actor**: CT Scanner (Modalitas)  
**Precondition**: Modalitas configured dengan PACS  
**Flow**:

1. Radiographer buka worklist di modalitas
2. Modalitas send C-FIND request ke PACS:
   ```
   Query:
   - Modality = CT
   - AE Title = CT_SCANNER_1
   - Date = TODAY
   - SPS Status = SCHEDULED or ARRIVED
   ```
3. PACS query database:
   ```sql
   SELECT * FROM worklist_items
   WHERE modality = 'CT'
   AND scheduled_station_ae_title = 'CT_SCANNER_1'
   AND scheduled_procedure_step_start_date = CURRENT_DATE
   AND sps_status IN ('SCHEDULED', 'ARRIVED')
   AND is_active = TRUE
   ```
4. PACS return matching worklist items
5. Modalitas display worklist dengan patient info
6. Radiographer select patient dari worklist
7. Patient data auto-populate di modalitas

**Postcondition**: Radiographer siap mulai pemeriksaan dengan data yang benar

### 9.4 Use Case: Image Acquisition & Storage

**Actor**: Radiographer, CT Scanner  
**Precondition**: Patient selected dari worklist  
**Flow**:

1. Radiographer start acquisition
2. Modalitas:
   - Update SPS Status → STARTED (via MPPS optional)
   - Acquire images
   - Embed metadata (Patient ID, Study UID, Accession Number)
3. Setelah selesai, modalitas send images via C-STORE
4. PACS SCP receive images:
   - Validate DICOM
   - Extract metadata
   - Match dengan worklist item (by Study UID)
   - Store files
   - Update database
5. PACS update order status → IN_PROGRESS (first image) → COMPLETED (all images)
6. PACS update worklist_item SPS_STATUS → COMPLETED

**Postcondition**: Images tersimpan, order completed, ready for reporting

### 9.5 Use Case: Upload Manual via Worklist

**Actor**: Radiographer/Admin  
**Precondition**: Order status = SCHEDULED/ARRIVED  
**Flow**:

1. User buka worklist page
2. Pilih order yang akan di-upload images
3. Klik "Upload Images" button
4. Modal terbuka dengan patient context:
   - Patient Name: John Doe
   - MRN: P001
   - Order: ORD-2025-001
   - Procedure: CT Brain
5. User drag & drop DICOM files
6. Sistem validate:
   - File format (DICOM)
   - Patient ID match
   - Modality match
7. Upload files dengan order context
8. Sistem:
   - Store files
   - Link ke order
   - Update order status → COMPLETED
   - Create/update study record

**Postcondition**: Images uploaded dan linked ke order yang benar

### 9.6 Use Case: Reschedule Appointment

**Actor**: Admin  
**Precondition**: Order status = SCHEDULED  
**Flow**:

1. Admin buka order detail
2. Klik "Reschedule" button
3. Input:
   - New date & time
   - Reason for reschedule
4. Sistem check availability
5. Confirm reschedule
6. Sistem:
   - Release old schedule_slot
   - Book new schedule_slot
   - Update order.scheduled_at
   - Update worklist_item schedule
   - Add to reschedule_history
   - Update status → RESCHEDULED
   - Send notification ke pasien

**Postcondition**: Order dijadwalkan ulang

### 9.7 Use Case: Handle No-Show

**Actor**: System/Admin  
**Precondition**: Order status = SCHEDULED, scheduled time passed  
**Flow**:

1. System detect scheduled time + grace period passed
2. Order status still SCHEDULED (patient tidak check-in)
3. System auto-mark as NO_SHOW atau Admin manual mark
4. Sistem:
   - Update order status → NO_SHOW
   - Release schedule_slot
   - Remove from active worklist
   - Send notification ke admin
   - Offer reschedule option

**Postcondition**: Slot available untuk patient lain


---

## 10. Best Practices

### 10.1 Data Integrity

#### 1. Unique Identifiers
```sql
-- Ensure uniqueness
ALTER TABLE orders ADD CONSTRAINT uq_order_number UNIQUE (order_number);
ALTER TABLE orders ADD CONSTRAINT uq_accession_number UNIQUE (accession_number);
ALTER TABLE worklist_items ADD CONSTRAINT uq_study_instance_uid UNIQUE (study_instance_uid);
ALTER TABLE worklist_items ADD CONSTRAINT uq_sps_id UNIQUE (sps_id);
```

#### 2. Referential Integrity
```sql
-- Use foreign keys with appropriate actions
ALTER TABLE orders 
ADD CONSTRAINT fk_orders_patient 
FOREIGN KEY (patient_id) REFERENCES patients(id) 
ON DELETE SET NULL;  -- Keep order even if patient deleted

ALTER TABLE worklist_items 
ADD CONSTRAINT fk_worklist_order 
FOREIGN KEY (order_id) REFERENCES orders(id) 
ON DELETE CASCADE;  -- Delete worklist item if order deleted
```

#### 3. Data Validation
```sql
-- Check constraints
ALTER TABLE orders ADD CONSTRAINT chk_scheduled_future 
CHECK (scheduled_at >= created_at);

ALTER TABLE schedule_slots ADD CONSTRAINT chk_slot_capacity 
CHECK (current_bookings <= max_capacity);
```

### 10.2 Performance Optimization

#### 1. Indexing Strategy
```sql
-- Composite indexes for common queries
CREATE INDEX idx_worklist_active_today ON worklist_items(
    is_active, 
    scheduled_procedure_step_start_date, 
    modality
) WHERE is_active = TRUE;

-- Partial indexes for active records only
CREATE INDEX idx_orders_active_status ON orders(status) 
WHERE deleted_at IS NULL;
```

#### 2. Query Optimization
```sql
-- Use EXPLAIN ANALYZE untuk check query performance
EXPLAIN ANALYZE
SELECT * FROM worklist_items
WHERE modality = 'CT'
AND scheduled_procedure_step_start_date = CURRENT_DATE
AND is_active = TRUE;

-- Optimize dengan materialized view untuk dashboard
CREATE MATERIALIZED VIEW mv_worklist_summary AS
SELECT 
    modality,
    scheduled_procedure_step_start_date,
    sps_status,
    COUNT(*) as count
FROM worklist_items
WHERE is_active = TRUE
GROUP BY modality, scheduled_procedure_step_start_date, sps_status;

-- Refresh periodically
REFRESH MATERIALIZED VIEW CONCURRENTLY mv_worklist_summary;
```

#### 3. Denormalization untuk MWL Performance
```sql
-- Denormalize patient data di worklist_items
-- untuk avoid JOIN saat DICOM C-FIND query
UPDATE worklist_items w
SET 
    patient_name = p.name,
    patient_birth_date = p.birth_date,
    patient_sex = p.gender
FROM patients p
WHERE w.patient_id = p.id;
```

### 10.3 Audit & Logging

#### 1. Status Change Tracking
```sql
-- Trigger untuk auto-log status changes
CREATE OR REPLACE FUNCTION log_order_status_change()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.status != OLD.status THEN
        -- Update details.status_history
        NEW.details = jsonb_set(
            COALESCE(NEW.details, '{}'::jsonb),
            '{status_history}',
            COALESCE(NEW.details->'status_history', '[]'::jsonb) || 
            jsonb_build_object(
                'status', NEW.status,
                'timestamp', CURRENT_TIMESTAMP,
                'by', current_user
            )
        );
        
        -- Log to worklist_history
        INSERT INTO worklist_history (
            order_id,
            action,
            previous_status,
            new_status,
            changed_by,
            changed_at
        ) VALUES (
            NEW.id,
            'STATUS_CHANGE',
            OLD.status,
            NEW.status,
            current_user,
            CURRENT_TIMESTAMP
        );
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_log_order_status_change
BEFORE UPDATE ON orders
FOR EACH ROW
EXECUTE FUNCTION log_order_status_change();
```

#### 2. Audit Log Table
```sql
CREATE TABLE audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    table_name VARCHAR(50) NOT NULL,
    record_id UUID NOT NULL,
    action VARCHAR(20) NOT NULL,
    old_values JSONB,
    new_values JSONB,
    changed_by VARCHAR(100),
    changed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    ip_address VARCHAR(50),
    user_agent TEXT
);

CREATE INDEX idx_audit_table_record ON audit_logs(table_name, record_id);
CREATE INDEX idx_audit_changed_at ON audit_logs(changed_at);
```

### 10.4 Error Handling

#### 1. Graceful Degradation
```javascript
// Frontend: Handle API failures gracefully
async function loadWorklist() {
  try {
    const worklist = await api.getWorklist();
    return worklist;
  } catch (error) {
    // Fallback to cached data
    const cached = localStorage.getItem('worklist_cache');
    if (cached) {
      console.warn('Using cached worklist due to API error');
      return JSON.parse(cached);
    }
    throw error;
  }
}
```

#### 2. Transaction Management
```python
# Backend: Use transactions for multi-step operations
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

def create_order_with_worklist(order_data):
    session = Session()
    try:
        # Create order
        order = Order(**order_data)
        session.add(order)
        session.flush()  # Get order.id
        
        # Create worklist item
        worklist_item = WorklistItem(
            order_id=order.id,
            study_instance_uid=generate_study_uid(),
            sps_id=generate_sps_id(),
            # ... other fields
        )
        session.add(worklist_item)
        
        # Book schedule slot
        slot = session.query(ScheduleSlot).filter_by(
            id=order_data['slot_id']
        ).with_for_update().first()
        
        if slot.current_bookings >= slot.max_capacity:
            raise ValueError("Slot fully booked")
        
        slot.current_bookings += 1
        slot.order_id = order.id
        
        # Commit all changes
        session.commit()
        return order
        
    except Exception as e:
        session.rollback()
        raise e
    finally:
        session.close()
```

### 10.5 Security

#### 1. Access Control
```sql
-- Row-level security untuk multi-tenant
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;

CREATE POLICY orders_org_isolation ON orders
FOR ALL
USING (org_id = current_setting('app.current_org_id')::uuid);
```

#### 2. Data Sanitization
```javascript
// Sanitize user input
function sanitizeOrderInput(input) {
  return {
    patient_name: input.patient_name.trim().substring(0, 255),
    procedure_name: input.procedure_name.trim().substring(0, 255),
    clinical_indication: input.clinical_indication?.trim().substring(0, 1000),
    // Prevent SQL injection, XSS
  };
}
```

#### 3. PHI Protection
```sql
-- Encrypt sensitive fields
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Encrypt patient address
UPDATE patients 
SET address = pgp_sym_encrypt(address, 'encryption_key');

-- Decrypt when needed
SELECT 
    id,
    name,
    pgp_sym_decrypt(address::bytea, 'encryption_key') as address
FROM patients;
```

### 10.6 Monitoring & Alerts

#### 1. Performance Monitoring
```sql
-- View: Slow queries
CREATE VIEW v_worklist_performance AS
SELECT 
    modality,
    COUNT(*) as total_orders,
    AVG(EXTRACT(EPOCH FROM (updated_at - created_at))) as avg_processing_time_seconds,
    MAX(EXTRACT(EPOCH FROM (updated_at - created_at))) as max_processing_time_seconds
FROM orders
WHERE created_at >= CURRENT_DATE - INTERVAL '7 days'
GROUP BY modality;
```

#### 2. Alert Triggers
```sql
-- Function: Check for overdue orders
CREATE OR REPLACE FUNCTION check_overdue_orders()
RETURNS TABLE(order_id UUID, patient_name VARCHAR, scheduled_at TIMESTAMP) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        o.id,
        o.patient_name,
        o.scheduled_at
    FROM orders o
    WHERE o.status IN ('SCHEDULED', 'ARRIVED')
    AND o.scheduled_at < CURRENT_TIMESTAMP - INTERVAL '2 hours'
    AND o.deleted_at IS NULL;
END;
$$ LANGUAGE plpgsql;

-- Run periodically via cron job
SELECT * FROM check_overdue_orders();
```


---

## 11. Migration Scripts

### 11.1 Create Worklist Tables Migration

```sql
-- Migration: 006_create_worklist_tables.sql
-- Description: Create comprehensive worklist system tables
-- Date: 2025-11-18

BEGIN;

-- ============================================================================
-- 1. Create worklist_items table
-- ============================================================================
CREATE TABLE IF NOT EXISTS worklist_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id UUID REFERENCES orders(id) ON DELETE CASCADE,
    study_instance_uid VARCHAR(64) UNIQUE NOT NULL,
    accession_number VARCHAR(50) NOT NULL,
    sps_id VARCHAR(50) UNIQUE NOT NULL,
    sps_status VARCHAR(20) DEFAULT 'SCHEDULED',
    scheduled_procedure_step_start_date DATE NOT NULL,
    scheduled_procedure_step_start_time TIME NOT NULL,
    scheduled_procedure_step_description VARCHAR(255),
    modality VARCHAR(20) NOT NULL,
    scheduled_station_ae_title VARCHAR(50),
    scheduled_station_name VARCHAR(100),
    patient_id VARCHAR(64) NOT NULL,
    patient_name VARCHAR(255) NOT NULL,
    patient_birth_date DATE,
    patient_sex VARCHAR(1),
    patient_weight DECIMAL(5,2),
    patient_size DECIMAL(5,2),
    requested_procedure_id VARCHAR(50),
    requested_procedure_description VARCHAR(255),
    requested_procedure_code_sequence JSONB,
    study_id VARCHAR(50),
    study_description VARCHAR(255),
    referring_physician_name VARCHAR(255),
    admission_id VARCHAR(50),
    current_patient_location VARCHAR(100),
    patient_state VARCHAR(50),
    pregnancy_status VARCHAR(20),
    medical_alerts TEXT,
    contrast_allergies TEXT,
    special_needs TEXT,
    priority VARCHAR(20) DEFAULT 'ROUTINE',
    dicom_attributes JSONB,
    is_active BOOLEAN DEFAULT TRUE,
    completed_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT chk_sps_status CHECK (sps_status IN (
        'SCHEDULED', 'ARRIVED', 'STARTED', 'COMPLETED', 'DISCONTINUED'
    ))
);

-- ============================================================================
-- 2. Create worklist_history table
-- ============================================================================
CREATE TABLE IF NOT EXISTS worklist_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    worklist_item_id UUID REFERENCES worklist_items(id) ON DELETE CASCADE,
    order_id UUID REFERENCES orders(id) ON DELETE CASCADE,
    action VARCHAR(50) NOT NULL,
    previous_status VARCHAR(20),
    new_status VARCHAR(20),
    previous_scheduled_time TIMESTAMP,
    new_scheduled_time TIMESTAMP,
    change_reason TEXT,
    change_details JSONB,
    changed_by VARCHAR(100),
    changed_by_role VARCHAR(50),
    changed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ============================================================================
-- 3. Create schedule_slots table
-- ============================================================================
CREATE TABLE IF NOT EXISTS schedule_slots (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    modality_id UUID REFERENCES modalities(id) ON DELETE CASCADE,
    modality_type VARCHAR(20) NOT NULL,
    slot_date DATE NOT NULL,
    slot_start_time TIME NOT NULL,
    slot_end_time TIME NOT NULL,
    duration_minutes INTEGER NOT NULL,
    max_capacity INTEGER DEFAULT 1,
    current_bookings INTEGER DEFAULT 0,
    is_available BOOLEAN DEFAULT TRUE,
    is_blocked BOOLEAN DEFAULT FALSE,
    block_reason TEXT,
    order_id UUID REFERENCES orders(id) ON DELETE SET NULL,
    notes TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT chk_capacity CHECK (current_bookings <= max_capacity),
    CONSTRAINT chk_time_order CHECK (slot_start_time < slot_end_time)
);

-- ============================================================================
-- 4. Create indexes
-- ============================================================================

-- worklist_items indexes
CREATE INDEX idx_worklist_order_id ON worklist_items(order_id);
CREATE INDEX idx_worklist_study_uid ON worklist_items(study_instance_uid);
CREATE INDEX idx_worklist_accession ON worklist_items(accession_number);
CREATE INDEX idx_worklist_sps_id ON worklist_items(sps_id);
CREATE INDEX idx_worklist_patient_id ON worklist_items(patient_id);
CREATE INDEX idx_worklist_patient_name ON worklist_items(patient_name);
CREATE INDEX idx_worklist_modality ON worklist_items(modality);
CREATE INDEX idx_worklist_scheduled_date ON worklist_items(scheduled_procedure_step_start_date);
CREATE INDEX idx_worklist_sps_status ON worklist_items(sps_status);
CREATE INDEX idx_worklist_is_active ON worklist_items(is_active) WHERE is_active = TRUE;
CREATE INDEX idx_worklist_modality_date_status ON worklist_items(
    modality, scheduled_procedure_step_start_date, sps_status
) WHERE is_active = TRUE;
CREATE INDEX idx_worklist_ae_date ON worklist_items(
    scheduled_station_ae_title, scheduled_procedure_step_start_date
) WHERE is_active = TRUE;

-- worklist_history indexes
CREATE INDEX idx_worklist_history_item_id ON worklist_history(worklist_item_id);
CREATE INDEX idx_worklist_history_order_id ON worklist_history(order_id);
CREATE INDEX idx_worklist_history_action ON worklist_history(action);
CREATE INDEX idx_worklist_history_changed_at ON worklist_history(changed_at);

-- schedule_slots indexes
CREATE INDEX idx_schedule_modality ON schedule_slots(modality_id);
CREATE INDEX idx_schedule_date ON schedule_slots(slot_date);
CREATE INDEX idx_schedule_modality_date ON schedule_slots(modality_id, slot_date);
CREATE INDEX idx_schedule_available ON schedule_slots(is_available) WHERE is_available = TRUE;
CREATE INDEX idx_schedule_order ON schedule_slots(order_id);

-- ============================================================================
-- 5. Create triggers
-- ============================================================================

-- Trigger: Update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_worklist_items_updated_at
BEFORE UPDATE ON worklist_items
FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER trg_schedule_slots_updated_at
BEFORE UPDATE ON schedule_slots
FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column();

-- Trigger: Auto-create worklist item when order scheduled
CREATE OR REPLACE FUNCTION create_worklist_item_from_order()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.status = 'SCHEDULED' AND (OLD.status IS NULL OR OLD.status != 'SCHEDULED') THEN
        INSERT INTO worklist_items (
            order_id,
            study_instance_uid,
            accession_number,
            sps_id,
            sps_status,
            scheduled_procedure_step_start_date,
            scheduled_procedure_step_start_time,
            scheduled_procedure_step_description,
            modality,
            scheduled_station_ae_title,
            patient_id,
            patient_name,
            patient_birth_date,
            patient_sex,
            requested_procedure_description,
            study_description,
            referring_physician_name,
            priority
        ) VALUES (
            NEW.id,
            '1.2.840.113619.' || EXTRACT(EPOCH FROM CURRENT_TIMESTAMP)::TEXT || '.' || NEW.id::TEXT,
            NEW.accession_number,
            'SPS-' || NEW.order_number,
            'SCHEDULED',
            DATE(NEW.scheduled_at),
            TIME(NEW.scheduled_at),
            NEW.procedure_name,
            NEW.modality,
            NEW.ordering_station_aet,
            COALESCE(NEW.patient_id::TEXT, NEW.medical_record_number),
            NEW.patient_name,
            NEW.birth_date,
            SUBSTRING(NEW.gender, 1, 1),
            NEW.procedure_description,
            NEW.procedure_name,
            NEW.referring_doctor,
            NEW.priority
        )
        ON CONFLICT (study_instance_uid) DO NOTHING;
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_create_worklist_item
AFTER INSERT OR UPDATE ON orders
FOR EACH ROW
EXECUTE FUNCTION create_worklist_item_from_order();

-- Trigger: Log worklist changes
CREATE OR REPLACE FUNCTION log_worklist_changes()
RETURNS TRIGGER AS $$
BEGIN
    IF TG_OP = 'UPDATE' AND NEW.sps_status != OLD.sps_status THEN
        INSERT INTO worklist_history (
            worklist_item_id,
            order_id,
            action,
            previous_status,
            new_status,
            changed_by,
            changed_at
        ) VALUES (
            NEW.id,
            NEW.order_id,
            'STATUS_CHANGE',
            OLD.sps_status,
            NEW.sps_status,
            current_user,
            CURRENT_TIMESTAMP
        );
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_log_worklist_changes
AFTER UPDATE ON worklist_items
FOR EACH ROW
EXECUTE FUNCTION log_worklist_changes();

-- ============================================================================
-- 6. Create views
-- ============================================================================

-- View: Today's worklist
CREATE OR REPLACE VIEW v_worklist_today AS
SELECT 
    w.*,
    o.order_number,
    o.status as order_status,
    o.priority as order_priority
FROM worklist_items w
INNER JOIN orders o ON o.id = w.order_id
WHERE w.scheduled_procedure_step_start_date = CURRENT_DATE
AND w.is_active = TRUE
AND o.deleted_at IS NULL
ORDER BY w.scheduled_procedure_step_start_time;

-- View: Worklist summary by modality
CREATE OR REPLACE VIEW v_worklist_summary AS
SELECT 
    modality,
    scheduled_procedure_step_start_date as date,
    sps_status,
    COUNT(*) as count
FROM worklist_items
WHERE is_active = TRUE
GROUP BY modality, scheduled_procedure_step_start_date, sps_status
ORDER BY scheduled_procedure_step_start_date, modality;

-- ============================================================================
-- 7. Create functions
-- ============================================================================

-- Function: Get worklist for modality
CREATE OR REPLACE FUNCTION get_worklist_for_modality(
    p_modality VARCHAR,
    p_ae_title VARCHAR,
    p_date DATE DEFAULT CURRENT_DATE
)
RETURNS TABLE (
    study_instance_uid VARCHAR,
    accession_number VARCHAR,
    patient_id VARCHAR,
    patient_name VARCHAR,
    scheduled_time TIME,
    procedure_description VARCHAR,
    sps_status VARCHAR
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        w.study_instance_uid,
        w.accession_number,
        w.patient_id,
        w.patient_name,
        w.scheduled_procedure_step_start_time,
        w.scheduled_procedure_step_description,
        w.sps_status
    FROM worklist_items w
    WHERE w.modality = p_modality
    AND (p_ae_title IS NULL OR w.scheduled_station_ae_title = p_ae_title)
    AND w.scheduled_procedure_step_start_date = p_date
    AND w.is_active = TRUE
    ORDER BY w.scheduled_procedure_step_start_time;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- 8. Comments
-- ============================================================================
COMMENT ON TABLE worklist_items IS 'DICOM Modality Worklist items for C-FIND queries';
COMMENT ON TABLE worklist_history IS 'Audit trail for worklist changes';
COMMENT ON TABLE schedule_slots IS 'Time slot management for scheduling';

COMMIT;

-- ============================================================================
-- Verification queries
-- ============================================================================
-- SELECT * FROM worklist_items LIMIT 5;
-- SELECT * FROM v_worklist_today;
-- SELECT * FROM v_worklist_summary;
-- SELECT * FROM get_worklist_for_modality('CT', NULL, CURRENT_DATE);
```


---

## 12. Implementation Checklist

### Phase 1: Database Setup ✅
- [ ] Create `worklist_items` table
- [ ] Create `worklist_history` table
- [ ] Create `schedule_slots` table
- [ ] Create indexes for performance
- [ ] Create triggers for automation
- [ ] Create views for common queries
- [ ] Create utility functions
- [ ] Run migration script
- [ ] Verify table creation

### Phase 2: Backend API 🔄
- [ ] Implement Order CRUD APIs
- [ ] Implement Worklist query APIs
- [ ] Implement Schedule management APIs
- [ ] Implement Status update APIs
- [ ] Implement Reschedule APIs
- [ ] Add validation logic
- [ ] Add error handling
- [ ] Add logging
- [ ] Write unit tests
- [ ] Write integration tests

### Phase 3: DICOM MWL Integration 🔄
- [ ] Implement C-FIND SCP handler
- [ ] Map database fields to DICOM tags
- [ ] Implement query matching logic
- [ ] Test with real modalitas
- [ ] Handle edge cases
- [ ] Performance optimization
- [ ] Error handling
- [ ] Logging & monitoring

### Phase 4: Frontend UI ⏳
- [ ] Create Worklist page
- [ ] Implement order list view
- [ ] Implement order detail view
- [ ] Implement scheduling UI
- [ ] Implement status update UI
- [ ] Implement reschedule modal
- [ ] Implement upload integration
- [ ] Add filters & search
- [ ] Add real-time updates (WebSocket)
- [ ] Responsive design
- [ ] Accessibility compliance

### Phase 5: Integration ⏳
- [ ] Integrate with PACS studies
- [ ] Integrate with upload system
- [ ] Integrate with reporting system
- [ ] Integrate with DICOM SCP
- [ ] Integrate with notifications
- [ ] End-to-end testing
- [ ] Performance testing
- [ ] Security audit

### Phase 6: Production Deployment ⏳
- [ ] Database migration in production
- [ ] Deploy backend services
- [ ] Deploy frontend
- [ ] Configure DICOM network
- [ ] Configure modalitas
- [ ] User training
- [ ] Documentation
- [ ] Monitoring setup
- [ ] Backup configuration
- [ ] Go-live checklist

---

## 13. Testing Scenarios

### 13.1 Unit Tests

```python
# Test: Create worklist item from order
def test_create_worklist_item():
    order = create_test_order(
        patient_name="John Doe",
        procedure="CT Brain",
        modality="CT",
        scheduled_at="2025-11-18 10:00:00"
    )
    
    worklist_item = WorklistItem.from_order(order)
    
    assert worklist_item.order_id == order.id
    assert worklist_item.patient_name == "John Doe"
    assert worklist_item.modality == "CT"
    assert worklist_item.sps_status == "SCHEDULED"

# Test: Query worklist by modality
def test_query_worklist_by_modality():
    # Create test data
    create_test_worklist_items()
    
    # Query
    items = query_worklist(
        modality="CT",
        date="2025-11-18"
    )
    
    assert len(items) > 0
    assert all(item.modality == "CT" for item in items)
    assert all(item.scheduled_date == "2025-11-18" for item in items)
```

### 13.2 Integration Tests

```python
# Test: End-to-end order to worklist flow
def test_order_to_worklist_flow():
    # 1. Create order
    order = api.create_order({
        "patient_name": "John Doe",
        "procedure_code": "CT001",
        "modality": "CT"
    })
    assert order.status == "CREATED"
    
    # 2. Schedule order
    scheduled_order = api.schedule_order(order.id, {
        "scheduled_at": "2025-11-18 10:00:00",
        "modality_id": "modality-uuid"
    })
    assert scheduled_order.status == "SCHEDULED"
    
    # 3. Verify worklist item created
    worklist_item = api.get_worklist_item_by_order(order.id)
    assert worklist_item is not None
    assert worklist_item.sps_status == "SCHEDULED"
    
    # 4. Check-in patient
    arrived_order = api.update_order_status(order.id, "ARRIVED")
    assert arrived_order.status == "ARRIVED"
    
    # 5. Verify worklist item updated
    updated_item = api.get_worklist_item_by_order(order.id)
    assert updated_item.sps_status == "ARRIVED"
```

### 13.3 DICOM MWL Tests

```python
# Test: DICOM C-FIND query
def test_dicom_mwl_query():
    from pynetdicom import AE, QueryRetrievePresentationContexts
    from pynetdicom.sop_class import ModalityWorklistInformationFind
    
    # Setup
    ae = AE()
    ae.add_requested_context(ModalityWorklistInformationFind)
    
    # Create query dataset
    ds = Dataset()
    ds.PatientName = ''
    ds.PatientID = ''
    ds.ScheduledProcedureStepSequence = [Dataset()]
    ds.ScheduledProcedureStepSequence[0].Modality = 'CT'
    ds.ScheduledProcedureStepSequence[0].ScheduledStationAETitle = 'CT_SCANNER_1'
    ds.ScheduledProcedureStepSequence[0].ScheduledProcedureStepStartDate = '20251118'
    
    # Query
    assoc = ae.associate('localhost', 11112)
    if assoc.is_established:
        responses = assoc.send_c_find(ds, ModalityWorklistInformationFind)
        
        results = []
        for (status, identifier) in responses:
            if status and status.Status in [0xFF00, 0xFF01]:
                results.append(identifier)
        
        assoc.release()
        
        # Verify
        assert len(results) > 0
        assert all(r.Modality == 'CT' for r in results)
```

---

## 14. Troubleshooting

### Common Issues

#### Issue 1: Worklist item tidak muncul di modalitas
**Symptoms**: Modalitas query worklist tapi tidak ada hasil

**Possible Causes**:
1. Worklist item tidak ter-create
2. Status tidak sesuai (bukan SCHEDULED/ARRIVED)
3. Tanggal tidak match
4. Modality type tidak match
5. AE Title tidak match
6. is_active = FALSE

**Solutions**:
```sql
-- Check worklist items
SELECT * FROM worklist_items
WHERE modality = 'CT'
AND scheduled_procedure_step_start_date = CURRENT_DATE
AND is_active = TRUE;

-- Check if order has worklist item
SELECT o.id, o.order_number, w.id as worklist_id, w.sps_status
FROM orders o
LEFT JOIN worklist_items w ON w.order_id = o.id
WHERE o.id = 'order-uuid';

-- Manually create worklist item if missing
INSERT INTO worklist_items (...)
VALUES (...);
```

#### Issue 2: Order status tidak update setelah image received
**Symptoms**: Images sudah masuk tapi order masih SCHEDULED

**Possible Causes**:
1. Study UID tidak match
2. Accession number tidak match
3. Trigger tidak jalan
4. DICOM SCP handler error

**Solutions**:
```python
# Check DICOM SCP logs
tail -f /var/log/dicom-scp.log

# Manually update order status
UPDATE orders
SET status = 'COMPLETED'
WHERE accession_number = 'ACC-2025-001';

# Check study linkage
SELECT 
    o.order_number,
    o.accession_number,
    s.study_instance_uid,
    s.number_of_instances
FROM orders o
LEFT JOIN pacs_studies s ON s.order_id = o.id
WHERE o.id = 'order-uuid';
```

#### Issue 3: Schedule slot conflict
**Symptoms**: Tidak bisa schedule order, slot penuh

**Possible Causes**:
1. Slot capacity reached
2. Slot sudah di-book
3. Slot blocked

**Solutions**:
```sql
-- Check slot availability
SELECT * FROM schedule_slots
WHERE modality_id = 'modality-uuid'
AND slot_date = '2025-11-18'
AND is_available = TRUE
ORDER BY slot_start_time;

-- Release slot if needed
UPDATE schedule_slots
SET current_bookings = current_bookings - 1,
    order_id = NULL
WHERE id = 'slot-uuid';
```

---

## 15. Referensi

### DICOM Standards
- **DICOM PS3.4**: Service Class Specifications - Modality Worklist
- **DICOM PS3.3**: Information Object Definitions - Modality Worklist IOD
- **DICOM PS3.6**: Data Dictionary - Worklist Tags

### Key DICOM Tags untuk MWL

| Tag | Name | Type | Description |
|-----|------|------|-------------|
| (0010,0010) | Patient's Name | 2 | Patient name |
| (0010,0020) | Patient ID | 1 | Patient identifier |
| (0010,0030) | Patient's Birth Date | 2 | Birth date |
| (0010,0040) | Patient's Sex | 2 | Gender (M/F/O) |
| (0020,000D) | Study Instance UID | 1 | Unique study ID |
| (0008,0050) | Accession Number | 2 | Accession number |
| (0040,0100) | Scheduled Procedure Step Sequence | 1 | SPS sequence |
| (0040,0001) | Scheduled Station AE Title | 1 | Destination AE |
| (0040,0002) | Scheduled Procedure Step Start Date | 1 | Date |
| (0040,0003) | Scheduled Procedure Step Start Time | 1 | Time |
| (0040,0006) | Scheduled Performing Physician's Name | 3 | Physician |
| (0040,0007) | Scheduled Procedure Step Description | 1C | Description |
| (0040,0009) | Scheduled Procedure Step ID | 1 | SPS ID |
| (0008,0060) | Modality | 1 | Modality type |
| (0032,1060) | Requested Procedure Description | 1C | Procedure |
| (0008,0090) | Referring Physician's Name | 2 | Referring MD |

### External Resources
- [DICOM Standard](https://www.dicomstandard.org/)
- [pynetdicom Documentation](https://pydicom.github.io/pynetdicom/)
- [HL7 FHIR ImagingStudy](https://www.hl7.org/fhir/imagingstudy.html)

---

## 16. Kesimpulan

Dokumentasi ini memberikan panduan lengkap untuk implementasi Worklist System dalam PACS, meliputi:

✅ **Konsep & Alur Kerja**: Pemahaman mendalam tentang worklist workflow  
✅ **Database Schema**: Schema lengkap dengan relasi antar tabel  
✅ **DICOM MWL Integration**: Implementasi standar DICOM Modality Worklist  
✅ **API Design**: RESTful APIs untuk worklist management  
✅ **Best Practices**: Performance, security, dan monitoring  
✅ **Testing**: Unit tests, integration tests, dan DICOM tests  
✅ **Troubleshooting**: Common issues dan solutions  

### Next Steps

1. **Review & Approval**: Review dokumentasi dengan tim
2. **Database Migration**: Run migration script di development
3. **Backend Implementation**: Implement APIs sesuai spec
4. **DICOM Integration**: Setup DICOM MWL handler
5. **Frontend Development**: Build worklist UI
6. **Testing**: Comprehensive testing
7. **Deployment**: Production rollout

---

**Dokumentasi dibuat**: 18 November 2025  
**Versi**: 1.0  
**Status**: Complete & Ready for Implementation  
**Maintainer**: Development Team

