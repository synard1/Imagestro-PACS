-- ============================================================================
-- Tenant-Aware Migration - audit_logs
-- Date: 2026-04-29
-- ============================================================================
ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_tenant ON audit_logs(tenant_id);
