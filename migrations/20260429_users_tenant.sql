-- ============================================================================
-- Tenant-Aware Migration - users
-- Date: 2026-04-29
-- ============================================================================
ALTER TABLE users ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id);
CREATE INDEX IF NOT EXISTS idx_users_tenant ON users(tenant_id);