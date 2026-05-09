-- ============================================================================
-- Tenant-Aware Migration - pacs_dicom_associations
-- Date: 2026-04-29
-- ============================================================================
ALTER TABLE pacs_dicom_associations ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id);
CREATE INDEX IF NOT EXISTS idx_pacs_dicom_associations_tenant ON pacs_dicom_associations(tenant_id);
