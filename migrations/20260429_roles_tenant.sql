-- ============================================================================
-- Tenant-Aware Migration - roles
-- Date: 2026-04-29
-- ============================================================================
ALTER TABLE roles ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id);
CREATE INDEX IF NOT EXISTS idx_roles_tenant ON roles(tenant_id);
