-- ============================================================================
-- Tenant-Aware Migration - cache_pasien
-- Date: 2026-04-29
-- ============================================================================
ALTER TABLE cache_pasien ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id);
CREATE INDEX IF NOT EXISTS idx_cache_pasien_tenant ON cache_pasien(tenant_id);
