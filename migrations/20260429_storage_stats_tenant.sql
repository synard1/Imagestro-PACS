-- ============================================================================
-- Tenant-Aware Migration - storage_stats
-- Date: 2026-04-29
-- ============================================================================
ALTER TABLE storage_stats ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id);
CREATE INDEX IF NOT EXISTS idx_storage_stats_tenant ON storage_stats(tenant_id);
