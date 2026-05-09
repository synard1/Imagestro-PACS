-- ============================================================================
-- Tenant-Aware Migration - cache_reg_periksa
-- Date: 2026-04-29
-- ============================================================================
ALTER TABLE cache_reg_periksa ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id);
CREATE INDEX IF NOT EXISTS idx_cache_reg_periksa_tenant ON cache_reg_periksa(tenant_id);
