-- ============================================================================
-- Tenant-Aware Migration - cache_permintaan_radiologi
-- Date: 2026-04-29
-- ============================================================================
ALTER TABLE cache_permintaan_radiologi ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id);
CREATE INDEX IF NOT EXISTS idx_cache_permintaan_radiologi_tenant ON cache_permintaan_radiologi(tenant_id);
