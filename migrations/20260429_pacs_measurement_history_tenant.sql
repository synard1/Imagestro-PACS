-- ============================================================================
-- Tenant-Aware Migration - pacs_measurement_history
-- Date: 2026-04-29
-- ============================================================================
ALTER TABLE pacs_measurement_history ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id);
CREATE INDEX IF NOT EXISTS idx_pacs_measurement_history_tenant ON pacs_measurement_history(tenant_id);
