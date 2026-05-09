-- ============================================================================
-- Tenant-Aware Migration - backup_config
-- Date: 2026-04-29
-- ============================================================================
ALTER TABLE backup_config ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id);
CREATE INDEX IF NOT EXISTS idx_backup_config_tenant ON backup_config(tenant_id);