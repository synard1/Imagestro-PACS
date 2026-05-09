-- ============================================================================
-- Tenant-Aware Migration - unified_studies
-- Date: 2026-04-29
-- ============================================================================
ALTER TABLE unified_studies ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id);
CREATE INDEX IF NOT EXISTS idx_unified_studies_tenant ON unified_studies(tenant_id);