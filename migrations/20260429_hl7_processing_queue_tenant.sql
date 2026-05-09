-- ============================================================================
-- Tenant-Aware Migration - hl7_processing_queue
-- Date: 2026-04-29
-- ============================================================================
ALTER TABLE hl7_processing_queue ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id);
CREATE INDEX IF NOT EXISTS idx_hl7_processing_queue_tenant ON hl7_processing_queue(tenant_id);
