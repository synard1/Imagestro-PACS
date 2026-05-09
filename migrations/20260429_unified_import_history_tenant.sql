-- ============================================================================
-- Tenant-Aware Migration - unified_import_history
-- Date: 2026-04-29
-- ============================================================================
ALTER TABLE unified_import_history ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id);
CREATE INDEX IF NOT EXISTS idx_unified_import_history_tenant ON unified_import_history(tenant_id);
