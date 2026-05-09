-- ============================================================================
-- Tenant-Aware Migration - pacs_series
-- Date: 2026-04-29
-- ============================================================================
ALTER TABLE pacs_series ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id);
CREATE INDEX IF NOT EXISTS idx_pacs_series_tenant ON pacs_series(tenant_id);
