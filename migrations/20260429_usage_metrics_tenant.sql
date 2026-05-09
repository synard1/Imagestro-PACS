-- ============================================================================
-- Tenant-Aware Migration - usage_metrics
-- Date: 2026-04-29
-- ============================================================================
ALTER TABLE usage_metrics ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id);
CREATE INDEX IF NOT EXISTS idx_usage_metrics_tenant ON usage_metrics(tenant_id);