-- ============================================================================
-- Tenant-Aware Migration - patient_family_history
-- Date: 2026-04-29
-- ============================================================================
ALTER TABLE patient_family_history ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id);
CREATE INDEX IF NOT EXISTS idx_patient_family_history_tenant ON patient_family_history(tenant_id);
