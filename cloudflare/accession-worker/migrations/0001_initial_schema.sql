-- Migration: 0001_initial_schema.sql
-- Creates base tables: accessions, accession_counters, idempotency_keys, tenant_settings
-- Requirements: 8.1, 8.2, 8.3, 8.4, 8.5, 8.6, 8.8, 8.10

-- Accession records
CREATE TABLE IF NOT EXISTS accessions (
    id TEXT PRIMARY KEY,                          -- UUID v7 (time-ordered for index locality)
    tenant_id TEXT NOT NULL,
    accession_number TEXT NOT NULL,
    issuer TEXT,
    facility_code TEXT,
    modality TEXT NOT NULL,
    patient_national_id TEXT NOT NULL,
    patient_name TEXT NOT NULL,
    patient_ihs_number TEXT,
    patient_birth_date TEXT,
    patient_sex TEXT,
    medical_record_number TEXT,
    procedure_code TEXT,
    procedure_name TEXT,
    scheduled_at TEXT,
    note TEXT,
    source TEXT NOT NULL DEFAULT 'internal',      -- 'internal' | 'external'
    created_at TEXT NOT NULL,                     -- ISO 8601
    deleted_at TEXT NULL                          -- Soft delete timestamp (NULL = active)
);

-- Unique constraint: no duplicate accession numbers per tenant
CREATE UNIQUE INDEX IF NOT EXISTS idx_accessions_tenant_number
    ON accessions(tenant_id, accession_number);

-- Keyset pagination index (DESC ordering for newest-first lookup)
CREATE INDEX IF NOT EXISTS idx_accessions_tenant_created
    ON accessions(tenant_id, created_at DESC, id DESC);

-- Patient lookup index
CREATE INDEX IF NOT EXISTS idx_accessions_tenant_patient
    ON accessions(tenant_id, patient_national_id);

-- Source filtering index
CREATE INDEX IF NOT EXISTS idx_accessions_tenant_source
    ON accessions(tenant_id, source, created_at DESC);

-- Soft-delete partial filter (supported by SQLite 3.8.0+)
CREATE INDEX IF NOT EXISTS idx_accessions_tenant_active
    ON accessions(tenant_id, created_at DESC) WHERE deleted_at IS NULL;

-- Sequence counters (composite PK eliminates surrogate id overhead)
CREATE TABLE IF NOT EXISTS accession_counters (
    tenant_id TEXT NOT NULL,
    facility_code TEXT NOT NULL,
    modality TEXT NOT NULL DEFAULT '',
    date_bucket TEXT NOT NULL,                   -- 'YYYYMMDD' | 'YYYYMM' | 'ALL'
    current_value INTEGER NOT NULL DEFAULT 0,
    updated_at TEXT NOT NULL,
    PRIMARY KEY (tenant_id, facility_code, modality, date_bucket)
);

-- Idempotency keys with TTL
CREATE TABLE IF NOT EXISTS idempotency_keys (
    tenant_id TEXT NOT NULL,
    key TEXT NOT NULL,
    accession_id TEXT NOT NULL,                  -- or batch_id for batch ops
    request_hash TEXT NOT NULL,                  -- SHA-256(modality + patient_national_id)
    payload_type TEXT NOT NULL DEFAULT 'single', -- 'single' | 'batch'
    payload TEXT NOT NULL,                       -- JSON of result to return on replay
    created_at TEXT NOT NULL,
    expires_at TEXT NOT NULL,                    -- ISO 8601, 24h after creation
    PRIMARY KEY (tenant_id, key)
);

-- Index for TTL cleanup (used by cron job)
CREATE INDEX IF NOT EXISTS idx_idempotency_expires
    ON idempotency_keys(expires_at);

-- Tenant settings (accession config, counter_backend, etc.)
CREATE TABLE IF NOT EXISTS tenant_settings (
    tenant_id TEXT NOT NULL,
    key TEXT NOT NULL,
    value TEXT NOT NULL,                         -- JSON-encoded
    updated_at TEXT NOT NULL,
    PRIMARY KEY (tenant_id, key)
);
