-- ============================================================================
-- Tenant-Aware Migration - pacs_instances
-- Date: 2026-04-29
-- ============================================================================
ALTER TABLE pacs_instances ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id);
CREATE INDEX IF NOT EXISTS idx_pacs_instances_tenant ON pacs_instances(tenant_id);
