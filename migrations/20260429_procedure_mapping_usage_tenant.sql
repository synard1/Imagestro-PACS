-- ============================================================================
-- Tenant-Aware Migration - procedure_mapping_usage
-- Date: 2026-04-29
-- ============================================================================
ALTER TABLE procedure_mapping_usage ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id);
CREATE INDEX IF NOT EXISTS idx_procedure_mapping_usage_tenant ON procedure_mapping_usage(tenant_id);
