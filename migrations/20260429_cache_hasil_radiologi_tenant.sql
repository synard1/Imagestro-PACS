-- ============================================================================
-- Tenant-Aware Migration - cache_hasil_radiologi
-- Date: 2026-04-29
-- ============================================================================
ALTER TABLE cache_hasil_radiologi ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id);
CREATE INDEX IF NOT EXISTS idx_cache_hasil_radiologi_tenant ON cache_hasil_radiologi(tenant_id);
