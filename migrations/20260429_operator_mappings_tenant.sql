-- ============================================================================
-- Tenant-Aware Migration - operator_mappings
-- Date: 2026-04-29
-- ============================================================================
ALTER TABLE operator_mappings ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id);
CREATE INDEX IF NOT EXISTS idx_operator_mappings_tenant ON operator_mappings(tenant_id);
