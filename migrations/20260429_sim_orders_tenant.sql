-- ============================================================================
-- Tenant-Aware Migration - sim_orders
-- Date: 2026-04-29
-- ============================================================================
ALTER TABLE sim_orders ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id);
CREATE INDEX IF NOT EXISTS idx_sim_orders_tenant ON sim_orders(tenant_id);
