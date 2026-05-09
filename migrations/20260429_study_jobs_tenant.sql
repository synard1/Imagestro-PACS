-- ============================================================================
-- Tenant-Aware Migration - study_jobs
-- Date: 2026-04-29
-- ============================================================================
ALTER TABLE study_jobs ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id);
CREATE INDEX IF NOT EXISTS idx_study_jobs_tenant ON study_jobs(tenant_id);