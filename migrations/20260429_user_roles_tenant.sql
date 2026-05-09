-- ============================================================================
-- Tenant-Aware Migration - user_roles
-- Date: 2026-04-29
-- ============================================================================
ALTER TABLE user_roles ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id);
CREATE INDEX IF NOT EXISTS idx_user_roles_tenant ON user_roles(tenant_id);
