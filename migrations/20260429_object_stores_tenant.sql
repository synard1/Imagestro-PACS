-- ============================================================================
-- Tenant-Aware Migration - object_stores
-- Date: 2026-04-29
-- ============================================================================
ALTER TABLE object_stores ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id);
CREATE INDEX IF NOT EXISTS idx_object_stores_tenant ON object_stores(tenant_id);
