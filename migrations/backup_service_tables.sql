-- =============================================================================
-- Backup Service Tables Migration
-- Creates tenant-aware backup configuration and snapshot tables
-- =============================================================================

DO $$ 
BEGIN
    -- =============================================================================
    -- 1. Create ENUM types if not exist
    -- =============================================================================
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'backup_type') THEN
        CREATE TYPE backup_type AS ENUM ('master', 'orders', 'studies', 'full', 'selective');
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'job_state') THEN
        CREATE TYPE job_state AS ENUM ('QUEUED', 'RUNNING', 'SUCCESS', 'FAILED');
    END IF;
    
    -- Also ensure backup_kind exists from previous migration
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'backup_kind') THEN
        CREATE TYPE backup_kind AS ENUM ('pg_dump', 'basebackup', 'wal_archive');
    END IF;
    
    RAISE NOTICE 'Backup ENUM types ready';
END $$;

-- =============================================================================
-- 2. Backup Configuration Table
-- =============================================================================

CREATE TABLE IF NOT EXISTS backup_config (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    backup_type TEXT NOT NULL CHECK (backup_type IN ('master', 'orders', 'studies', 'full', 'selective')),
    schedule_cron TEXT,  -- NULL = manual only, e.g., '0 2 * * *' for daily 2AM
    retention_days INT DEFAULT 30,
    is_active BOOLEAN DEFAULT true,
    created_by UUID,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now(),
    
    CONSTRAINT fk_backup_config_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
);

COMMENT ON TABLE backup_config IS 'Backup configuration per tenant';
COMMENT ON COLUMN backup_config.backup_type IS 'Type of backup: master (patients/doctors/procedures), orders, studies, full, selective';
COMMENT ON COLUMN backup_config.schedule_cron IS 'Cron schedule for automated backup, NULL for manual only';
COMMENT ON COLUMN backup_config.retention_days IS 'Days to retain backup snapshots';

-- =============================================================================
-- 3. Backup Snapshots Table
-- =============================================================================

CREATE TABLE IF NOT EXISTS backup_snapshots (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
    config_id UUID REFERENCES backup_config(id) ON DELETE SET NULL,
    backup_type TEXT NOT NULL,
    object_key TEXT NOT NULL,  -- Path to backup file within tenant storage
    size_bytes BIGINT,
    checksum_sha256 TEXT,    -- SHA256 checksum for verification
    date_from TIMESTAMPTZ,    -- For selective backup: start date
    date_to TIMESTAMPTZ,      -- For selective backup: end date
    patient_id UUID,          -- For per-patient backup
    record_count INT DEFAULT 0,
    started_at TIMESTAMPTZ DEFAULT now(),
    completed_at TIMESTAMPTZ,
    state TEXT DEFAULT 'QUEUED' CHECK (state IN ('QUEUED', 'RUNNING', 'SUCCESS', 'FAILED')),
    error_message TEXT,
    created_at TIMESTAMPTZ DEFAULT now(),
    
    CONSTRAINT fk_backup_snapshots_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
    CONSTRAINT fk_backup_snapshots_config FOREIGN KEY (config_id) REFERENCES backup_config(id) ON DELETE SET NULL
);

COMMENT ON TABLE backup_snapshots IS 'Backup snapshots - completed backup jobs';
COMMENT ON COLUMN backup_snapshots.backup_type IS 'Type of backup (from backup_type enum)';
COMMENT ON COLUMN backup_snapshots.object_key IS 'Relative path to backup file in storage';
COMMENT ON COLUMN backup_snapshots.date_from IS 'Start date filter for selective backup';
COMMENT ON COLUMN backup_snapshots.date_to IS 'End date filter for selective backup';
COMMENT ON COLUMN backup_snapshots.patient_id IS 'Patient ID filter for per-patient backup';
COMMENT ON COLUMN backup_snapshots.state IS 'Current state of backup job';
COMMENT ON COLUMN backup_snapshots.checksum_sha256 IS 'SHA256 checksum of backup file for verification';

-- =============================================================================
-- 4. Indexes for Performance
-- =============================================================================

CREATE INDEX IF NOT EXISTS idx_backup_config_tenant 
    ON backup_config(tenant_id, is_active);

CREATE INDEX IF NOT EXISTS idx_backup_config_schedule 
    ON backup_config(schedule_cron) 
    WHERE schedule_cron IS NOT NULL AND is_active = true;

CREATE INDEX IF NOT EXISTS idx_backup_snapshots_tenant 
    ON backup_snapshots(tenant_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_backup_snapshots_state 
    ON backup_snapshots(state, tenant_id);

CREATE INDEX IF NOT EXISTS idx_backup_snapshots_config 
    ON backup_snapshots(config_id);

CREATE INDEX IF NOT EXISTS idx_backup_snapshots_date_range 
    ON backup_snapshots(date_from, date_to) 
    WHERE date_from IS NOT NULL OR date_to IS NOT NULL;

-- =============================================================================
-- 5. Update existing backup_jobs if exists (for compatibility)
-- =============================================================================

DO $$ 
BEGIN
    -- Add missing columns to existing backup_jobs table
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'backup_jobs') THEN
        ALTER TABLE backup_jobs ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id) ON DELETE SET NULL;
        ALTER TABLE backup_jobs ADD COLUMN IF NOT EXISTS config_id UUID REFERENCES backup_config(id) ON DELETE SET NULL;
        ALTER TABLE backup_jobs ADD COLUMN IF NOT EXISTS date_from TIMESTAMPTZ;
        ALTER TABLE backup_jobs ADD COLUMN IF NOT EXISTS date_to TIMESTAMPTZ;
        ALTER TABLE backup_jobs ADD COLUMN IF NOT EXISTS patient_id UUID;
        
        RAISE NOTICE 'Updated existing backup_jobs table with tenant columns';
    END IF;
END $$;

-- =============================================================================
-- 6. Views for Monitoring
-- =============================================================================

-- View: Recent backup snapshots
CREATE OR REPLACE VIEW v_backup_recent AS
SELECT 
    s.id AS snapshot_id,
    s.tenant_id,
    s.backup_type,
    s.state,
    s.record_count,
    s.size_bytes,
    s.started_at,
    s.completed_at,
    s.error_message,
    c.name AS config_name
FROM backup_snapshots s
LEFT JOIN backup_config c ON s.config_id = c.id
ORDER BY s.created_at DESC;

COMMENT ON VIEW v_backup_recent IS 'Recent backup snapshots for monitoring';

-- View: Backup jobs summary (combines with legacy backup_jobs)
CREATE OR REPLACE VIEW v_backup_jobs_summary AS
SELECT 
    'snapshot' AS job_type,
    id AS job_id,
    tenant_id,
    backup_type AS kind,
    state,
    started_at,
    completed_at,
    size_bytes,
    error_message
FROM backup_snapshots
UNION ALL
SELECT 
    'job' AS job_type,
    id AS job_id,
    tenant_id,
    kind,
    state,
    started_at,
    finished_at,
    size_bytes,
    error_message
FROM backup_jobs;

COMMENT ON VIEW v_backup_jobs_summary IS 'Combined backup jobs and snapshots summary';

-- =============================================================================
-- 7. Default Backup Config for Existing Tenants
-- =============================================================================

DO $$
DECLARE
    tenant_record RECORD;
BEGIN
    -- Insert default backup config for each tenant that doesn't have one
    FOR tenant_record IN 
        SELECT id FROM tenants 
        WHERE id NOT IN (SELECT DISTINCT tenant_id FROM backup_config WHERE tenant_id IS NOT NULL)
    LOOP
        INSERT INTO backup_config (id, tenant_id, name, backup_type, retention_days, is_active)
        VALUES (
            gen_random_uuid(),
            tenant_record.id,
            'Default Backup',
            'full',
            30,
            true
        )
        ON CONFLICT DO NOTHING;
    END LOOP;
    
    RAISE NOTICE 'Created default backup configs for existing tenants';
END $$;

-- =============================================================================
-- 8. Storage Directory (for documentation)
-- =============================================================================

DO $$
BEGIN
    -- Create storage directory if it doesn't exist
    PERFORM pg_catalog.pg_file_write(
        '/backups/.gitkeep',
        'This directory stores tenant backup files',
        true
    );
EXCEPTION WHEN others THEN
    -- Ignore if not possible (permissions, etc)
    RAISE NOTICE 'Could not create backup storage directory marker';
END $$;

RAISE NOTICE 'Backup service migration completed successfully';