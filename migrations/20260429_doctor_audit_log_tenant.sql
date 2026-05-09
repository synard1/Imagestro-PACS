-- ============================================================================
-- Tenant-Aware Migration - doctor_audit_log
-- Date: 2026-04-29
-- ============================================================================
ALTER TABLE doctor_audit_log ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id);
CREATE INDEX IF NOT EXISTS idx_doctor_audit_log_tenant ON doctor_audit_log(tenant_id);
