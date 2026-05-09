-- ============================================================================
-- Tenant-Aware Migration - unified_doctor_mappings
-- Date: 2026-04-29
-- ============================================================================
ALTER TABLE unified_doctor_mappings ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id);
CREATE INDEX IF NOT EXISTS idx_unified_doctor_mappings_tenant ON unified_doctor_mappings(tenant_id);
