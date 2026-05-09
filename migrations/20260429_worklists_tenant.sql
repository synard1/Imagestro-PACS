-- ============================================================================
-- Tenant-Aware Migration - worklists
-- Date: 2026-04-29
-- ============================================================================
ALTER TABLE worklists ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id);
CREATE INDEX IF NOT EXISTS idx_worklists_tenant ON worklists(tenant_id);