-- ============================================================================
-- Tenant-Aware Migration - system_health_log
-- Date: 2026-04-29
-- ============================================================================
ALTER TABLE system_health_log ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id);
CREATE INDEX IF NOT EXISTS idx_system_health_log_tenant ON system_health_log(tenant_id);