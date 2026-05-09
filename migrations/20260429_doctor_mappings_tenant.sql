-- ============================================================================
-- Tenant-Aware Migration - doctor_mappings
-- Date: 2026-04-29
-- ============================================================================
ALTER TABLE doctor_mappings ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id);
CREATE INDEX IF NOT EXISTS idx_doctor_mappings_tenant ON doctor_mappings(tenant_id);
