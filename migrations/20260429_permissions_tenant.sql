-- ============================================================================
-- Tenant-Aware Migration - permissions
-- Date: 2026-04-29
-- ============================================================================
ALTER TABLE permissions ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id);
CREATE INDEX IF NOT EXISTS idx_permissions_tenant ON permissions(tenant_id);
