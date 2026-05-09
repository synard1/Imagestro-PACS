-- ============================================================================
-- Tenant-Aware Migration - cache_dokter
-- Date: 2026-04-29
-- ============================================================================
ALTER TABLE cache_dokter ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id);
CREATE INDEX IF NOT EXISTS idx_cache_dokter_tenant ON cache_dokter(tenant_id);
