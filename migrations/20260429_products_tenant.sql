-- ============================================================================
-- Tenant-Aware Migration - products
-- Date: 2026-04-29
-- ============================================================================
ALTER TABLE products ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id);
CREATE INDEX IF NOT EXISTS idx_products_tenant ON products(tenant_id);
