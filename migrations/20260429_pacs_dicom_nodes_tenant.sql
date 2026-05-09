-- ============================================================================
-- Tenant-Aware Migration - pacs_dicom_nodes
-- Date: 2026-04-29
-- ============================================================================
ALTER TABLE pacs_dicom_nodes ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id);
CREATE INDEX IF NOT EXISTS idx_pacs_dicom_nodes_tenant ON pacs_dicom_nodes(tenant_id);
