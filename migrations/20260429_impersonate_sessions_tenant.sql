-- ============================================================================
-- Tenant-Aware Migration - impersonate_sessions
-- Date: 2026-04-29
-- ============================================================================
ALTER TABLE impersonate_sessions ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id);
CREATE INDEX IF NOT EXISTS idx_impersonate_sessions_tenant ON impersonate_sessions(tenant_id);
