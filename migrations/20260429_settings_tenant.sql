-- ============================================================================
-- Tenant-Aware Migration - settings
-- Date: 2026-04-29
-- ============================================================================
ALTER TABLE settings ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id);
CREATE INDEX IF NOT EXISTS idx_settings_tenant ON settings(tenant_id);
