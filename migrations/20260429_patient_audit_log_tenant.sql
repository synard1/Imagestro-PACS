-- ============================================================================
-- Tenant-Aware Migration - patient_audit_log
-- Date: 2026-04-29
-- ============================================================================
ALTER TABLE patient_audit_log ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id);
CREATE INDEX IF NOT EXISTS idx_patient_audit_log_tenant ON patient_audit_log(tenant_id);
