-- ============================================================================
-- Tenant-Aware Migration - nurse_audit_log
-- Date: 2026-04-29
-- ============================================================================
ALTER TABLE nurse_audit_log ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id);
CREATE INDEX IF NOT EXISTS idx_nurse_audit_log_tenant ON nurse_audit_log(tenant_id);
