-- ============================================================================
-- Tenant-Aware Migration - pacs_storage_stats
-- Date: 2026-04-29
-- ============================================================================
ALTER TABLE pacs_storage_stats ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id);
CREATE INDEX IF NOT EXISTS idx_pacs_storage_stats_tenant ON pacs_storage_stats(tenant_id);
