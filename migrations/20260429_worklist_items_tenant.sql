-- ============================================================================
-- Tenant-Aware Migration - worklist_items
-- Date: 2026-04-29
-- ============================================================================
ALTER TABLE worklist_items ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id);
CREATE INDEX IF NOT EXISTS idx_worklist_items_tenant ON worklist_items(tenant_id);