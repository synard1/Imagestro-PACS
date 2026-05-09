-- ============================================================================
-- Tenant-Aware Migration - pacs_dicom_operations
-- Date: 2026-04-29
-- ============================================================================
ALTER TABLE pacs_dicom_operations ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id);
CREATE INDEX IF NOT EXISTS idx_pacs_dicom_operations_tenant ON pacs_dicom_operations(tenant_id);
