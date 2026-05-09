-- ============================================================================
-- Tenant-Aware Migration - role_permissions
-- Date: 2026-04-29
-- ============================================================================
ALTER TABLE role_permissions ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id);
CREATE INDEX IF NOT EXISTS idx_role_permissions_tenant ON role_permissions(tenant_id);
