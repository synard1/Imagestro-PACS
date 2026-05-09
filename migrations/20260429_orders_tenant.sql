-- ============================================================================
-- Tenant-Aware Migration - orders
-- Date: 2026-04-29
-- ============================================================================
ALTER TABLE orders ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id);
CREATE INDEX IF NOT EXISTS idx_orders_tenant ON orders(tenant_id);