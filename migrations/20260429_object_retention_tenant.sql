-- ============================================================================
-- Tenant-Aware Migration - object_retention
-- Date: 2026-04-29
-- ============================================================================
ALTER TABLE object_retention ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id);
CREATE INDEX IF NOT EXISTS idx_object_retention_tenant ON object_retention(tenant_id);
