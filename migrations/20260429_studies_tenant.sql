-- ============================================================================
-- Tenant-Aware Migration - studies
-- Date: 2026-04-29
-- ============================================================================
ALTER TABLE studies ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id);
CREATE INDEX IF NOT EXISTS idx_studies_tenant ON studies(tenant_id);