-- ============================================================================
-- Tenant-Aware Migration - integration_modules
-- Date: 2026-04-29
-- ============================================================================
ALTER TABLE integration_modules ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id);
CREATE INDEX IF NOT EXISTS idx_integration_modules_tenant ON integration_modules(tenant_id);
