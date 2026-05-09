-- ============================================================================
-- Tenant-Aware Migration - pacs_measurements
-- Date: 2026-04-29
-- ============================================================================
ALTER TABLE pacs_measurements ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id);
CREATE INDEX IF NOT EXISTS idx_pacs_measurements_tenant ON pacs_measurements(tenant_id);
