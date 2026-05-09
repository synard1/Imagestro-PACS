-- ============================================================================
-- Tenant-Aware Migration - dicom_files
-- Date: 2026-04-29
-- ============================================================================
ALTER TABLE dicom_files ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id);
CREATE INDEX IF NOT EXISTS idx_dicom_files_tenant ON dicom_files(tenant_id);