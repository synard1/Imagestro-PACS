-- ============================================================================
-- Tenant-Aware Migration - storage_migrations
-- Date: 2026-04-29
-- ============================================================================
ALTER TABLE storage_migrations ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id);
CREATE INDEX IF NOT EXISTS idx_storage_migrations_tenant ON storage_migrations(tenant_id);