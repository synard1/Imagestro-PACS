-- ============================================================================
-- Tenant-Aware Migration - doctor_qualifications
-- Date: 2026-04-29
-- ============================================================================
ALTER TABLE doctor_qualifications ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id);
CREATE INDEX IF NOT EXISTS idx_doctor_qualifications_tenant ON doctor_qualifications(tenant_id);
