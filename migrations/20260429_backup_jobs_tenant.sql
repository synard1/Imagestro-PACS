-- ============================================================================
-- Tenant-Aware Migration - backup_jobs
-- Date: 2026-04-29
-- ============================================================================
ALTER TABLE backup_jobs ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id);
CREATE INDEX IF NOT EXISTS idx_backup_jobs_tenant ON backup_jobs(tenant_id);