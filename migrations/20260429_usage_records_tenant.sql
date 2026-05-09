-- ============================================================================
-- Tenant-Aware Migration - usage_records
-- Date: 2026-04-29
-- ============================================================================
ALTER TABLE usage_records ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id);
CREATE INDEX IF NOT EXISTS idx_usage_records_tenant ON usage_records(tenant_id);