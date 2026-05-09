-- ============================================================================
-- Tenant-Aware Migration - notification_config
-- Date: 2026-04-29
-- ============================================================================
ALTER TABLE notification_config ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id);
CREATE INDEX IF NOT EXISTS idx_notification_config_tenant ON notification_config(tenant_id);
