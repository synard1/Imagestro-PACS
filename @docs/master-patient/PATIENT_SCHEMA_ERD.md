# Patient Database Schema ERD

```mermaid
erDiagram
    %% Entities
    patients ||--o{ orders : places
    patients ||--o{ accessions : has
    patients ||--o{ worklists : appears_in
    patients ||--o{ service_requests : requests
    facilities ||--|{ accessions : issues
    accession_counters }|--|| facilities : tracks
    worklists ||--o{ worklist_audit_log : audited

    %% Patients Entity
    patients {
        uuid id PK
        varchar(16) patient_national_id UK
        varchar(64) ihs_number
        varchar(50) medical_record_number
        varchar(200) patient_name
        varchar(10) gender  // Changed from sex to gender with only male/female options
        date birth_date
        varchar(20) status
        timestamptz created_at
        timestamptz updated_at
    }

    %% Orders Entity
    orders {
        uuid id PK
        varchar(50) order_number UK
        varchar(50) accession_number UK
        varchar(10) modality
        varchar(50) procedure_code
        varchar(200) procedure_name
        timestamptz scheduled_at
        varchar(16) patient_national_id FK
        varchar(200) patient_name
        varchar(10) gender
        date birth_date
        varchar(50) medical_record_number
        varchar(50) ihs_number
        varchar(50) registration_number
        varchar(20) status
        timestamptz created_at
        timestamptz updated_at
    }

    %% Accessions Entity
    accessions {
        uuid id PK
        text facility_code FK
        text accession_number UK
        text issuer
        text modality
        text procedure_code
        text procedure_name
        timestamptz scheduled_at
        text patient_national_id FK
        text patient_name
        text gender
        date birth_date
        text medical_record_number
        text ihs_number
        text registration_number
        text status
        timestamptz created_at
        timestamptz updated_at
    }

    %% Facilities Entity
    facilities {
        serial id PK
        text code UK
        text name
        text issuer
    }

    %% Accession Counters Entity
    accession_counters {
        date date PK
        text modality PK
        text facility_code PK
        integer seq
    }

    %% Worklists Entity
    worklists {
        uuid id PK
        varchar(50) accession_number UK
        varchar(50) patient_id FK
        varchar(200) patient_name
        varchar(8) patient_birth_date
        varchar(1) patient_sex
        varchar(10) modality
        text procedure_description
        varchar(8) scheduled_date
        varchar(6) scheduled_time
        varchar(200) physician_name
        varchar(50) station_aet
        varchar(200) study_instance_uid
        varchar(20) status
        varchar(200) filename
        timestamp created_at
        varchar(200) created_by
        timestamp updated_at
        varchar(200) modified_by
        timestamp deleted_at
        varchar(200) deleted_by
    }

    %% Worklist Audit Log Entity
    worklist_audit_log {
        uuid id PK
        uuid worklist_id FK
        varchar(50) accession_number
        varchar(50) action
        jsonb before_data
        jsonb after_data
        varchar(200) user_info
        varchar(45) ip_address
        timestamp created_at
    }

    %% Service Requests Entity
    service_requests {
        bigserial id PK
        timestamptz created_at
        timestamptz updated_at
        text satusehat_id UK
        text patient_id
        text encounter_id
        text practitioner_id
        text location_id
        text code
        text code_display
        text category
        text priority
        text intent
        text status
        timestamptz authored_on
        text reason_code
        text reason_display
        text note
        jsonb request_data
        jsonb response_data
        text error_message
    }