-- ============================================================================
-- Tenant-Aware Migration - storage_locations
-- Date: 2026-04-29
-- ============================================================================
ALTER TABLE storage_locations ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id);
CREATE INDEX IF NOT EXISTS idx_storage_locations_tenant ON storage_locations(tenant_id);
