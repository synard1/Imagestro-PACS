-- ============================================================================
-- Tenant-Aware Migration - series
-- Date: 2026-04-29
-- ============================================================================
ALTER TABLE series ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id);
CREATE INDEX IF NOT EXISTS idx_series_tenant ON series(tenant_id);