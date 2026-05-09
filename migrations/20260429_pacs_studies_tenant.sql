-- ============================================================================
-- Tenant-Aware Migration - pacs_studies
-- Date: 2026-04-29
-- ============================================================================
ALTER TABLE pacs_studies ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id);
CREATE INDEX IF NOT EXISTS idx_pacs_studies_tenant ON pacs_studies(tenant_id);