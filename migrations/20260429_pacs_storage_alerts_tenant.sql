-- ============================================================================
-- Tenant-Aware Migration - pacs_storage_alerts
-- Date: 2026-04-29
-- ============================================================================
ALTER TABLE pacs_storage_alerts ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id);
CREATE INDEX IF NOT EXISTS idx_pacs_storage_alerts_tenant ON pacs_storage_alerts(tenant_id);
