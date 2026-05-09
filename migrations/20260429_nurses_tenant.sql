-- ============================================================================
-- Tenant-Aware Migration - nurses
-- Date: 2026-04-29
-- ============================================================================
ALTER TABLE nurses ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id);
CREATE INDEX IF NOT EXISTS idx_nurses_tenant ON nurses(tenant_id);
