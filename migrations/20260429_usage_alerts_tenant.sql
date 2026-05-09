-- ============================================================================
-- Tenant-Aware Migration - usage_alerts
-- Date: 2026-04-29
-- ============================================================================
ALTER TABLE usage_alerts ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id);
CREATE INDEX IF NOT EXISTS idx_usage_alerts_tenant ON usage_alerts(tenant_id);