-- ============================================================================
-- Tenant-Aware Migration - invoices
-- Date: 2026-04-29
-- ============================================================================
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id);
CREATE INDEX IF NOT EXISTS idx_invoices_tenant ON invoices(tenant_id);