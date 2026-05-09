-- ============================================================================
-- Tenant-Aware Migration - storage_backend_health
-- Date: 2026-04-29
-- ============================================================================
ALTER TABLE storage_backend_health ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id);
CREATE INDEX IF NOT EXISTS idx_storage_backend_health_tenant ON storage_backend_health(tenant_id);
