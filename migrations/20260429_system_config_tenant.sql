-- ============================================================================
-- Tenant-Aware Migration - system_config
-- Date: 2026-04-29
-- ============================================================================
ALTER TABLE system_config ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id);
CREATE INDEX IF NOT EXISTS idx_system_config_tenant ON system_config(tenant_id);