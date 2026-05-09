-- ============================================================================
-- Tenant-Aware Migration - user_permissions
-- Date: 2026-04-29
-- ============================================================================
ALTER TABLE user_permissions ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id);
CREATE INDEX IF NOT EXISTS idx_user_permissions_tenant ON user_permissions(tenant_id);
