-- ============================================================================
-- Tenant-Aware Migration - satusehat_orgs
-- Date: 2026-04-29
-- ============================================================================
ALTER TABLE satusehat_orgs ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id);
CREATE INDEX IF NOT EXISTS idx_satusehat_orgs_tenant ON satusehat_orgs(tenant_id);