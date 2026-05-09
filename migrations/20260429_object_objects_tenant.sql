-- ============================================================================
-- Tenant-Aware Migration - object_objects
-- Date: 2026-04-29
-- ============================================================================
ALTER TABLE object_objects ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id);
CREATE INDEX IF NOT EXISTS idx_object_objects_tenant ON object_objects(tenant_id);
