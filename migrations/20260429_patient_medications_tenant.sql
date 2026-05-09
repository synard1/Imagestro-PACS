-- ============================================================================
-- Tenant-Aware Migration - patient_medications
-- Date: 2026-04-29
-- ============================================================================
ALTER TABLE patient_medications ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id);
CREATE INDEX IF NOT EXISTS idx_patient_medications_tenant ON patient_medications(tenant_id);
