-- ============================================================================
-- Tenant-Aware Migration - instances
-- Date: 2026-04-29
-- ============================================================================
ALTER TABLE instances ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id);
CREATE INDEX IF NOT EXISTS idx_instances_tenant ON instances(tenant_id);