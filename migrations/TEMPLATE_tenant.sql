-- ============================================================================
-- Tenant-Aware Migration - {table_name}
-- Date: 2026-04-29
-- ============================================================================
ALTER TABLE {table_name} ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id);
CREATE INDEX IF NOT EXISTS idx_{table_name}_tenant ON {table_name}(tenant_id);