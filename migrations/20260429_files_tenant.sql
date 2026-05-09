-- ============================================================================
-- Tenant-Aware Migration - files
-- Date: 2026-04-29
-- ============================================================================
ALTER TABLE files ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id);
CREATE INDEX IF NOT EXISTS idx_files_tenant ON files(tenant_id);
