-- ============================================================================
-- Tenant-Aware Migration - procedure_mappings
-- Date: 2026-04-29
-- ============================================================================
ALTER TABLE procedure_mappings ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id);
CREATE INDEX IF NOT EXISTS idx_procedure_mappings_tenant ON procedure_mappings(tenant_id);
