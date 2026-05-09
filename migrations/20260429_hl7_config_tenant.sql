-- ============================================================================
-- Tenant-Aware Migration - hl7_config
-- Date: 2026-04-29
-- ============================================================================
ALTER TABLE hl7_config ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id);
CREATE INDEX IF NOT EXISTS idx_hl7_config_tenant ON hl7_config(tenant_id);
