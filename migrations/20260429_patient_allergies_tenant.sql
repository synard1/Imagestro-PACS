-- ============================================================================
-- Tenant-Aware Migration - patient_allergies
-- Date: 2026-04-29
-- ============================================================================
ALTER TABLE patient_allergies ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id);
CREATE INDEX IF NOT EXISTS idx_patient_allergies_tenant ON patient_allergies(tenant_id);
