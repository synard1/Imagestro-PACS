-- ============================================================================
-- Tenant-Aware Migration - pacs_reports
-- Date: 2026-04-29
-- ============================================================================
ALTER TABLE pacs_reports ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id);
CREATE INDEX IF NOT EXISTS idx_pacs_reports_tenant ON pacs_reports(tenant_id);
