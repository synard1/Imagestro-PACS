-- ============================================================================
-- Tenant-Aware Migration - unified_procedure_mappings
-- Date: 2026-04-29
-- ============================================================================
ALTER TABLE unified_procedure_mappings ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id);
CREATE INDEX IF NOT EXISTS idx_unified_procedure_mappings_tenant ON unified_procedure_mappings(tenant_id);
