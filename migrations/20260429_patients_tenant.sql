-- ============================================================================
-- Tenant-Aware Migration - patients
-- Date: 2026-04-29
-- ============================================================================
ALTER TABLE patients ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id);
CREATE INDEX IF NOT EXISTS idx_patients_tenant ON patients(tenant_id);