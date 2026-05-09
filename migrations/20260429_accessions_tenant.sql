-- ============================================================================
-- Tenant-Aware Migration - accessions
-- Date: 2026-04-29
-- ============================================================================
ALTER TABLE accessions ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id);
CREATE INDEX IF NOT EXISTS idx_accessions_tenant ON accessions(tenant_id);
