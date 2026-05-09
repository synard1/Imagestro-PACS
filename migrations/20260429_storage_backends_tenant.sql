-- ============================================================================
-- Tenant-Aware Migration - storage_backends
-- Date: 2026-04-29
-- ============================================================================
ALTER TABLE storage_backends ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id);
CREATE INDEX IF NOT EXISTS idx_storage_backends_tenant ON storage_backends(tenant_id);