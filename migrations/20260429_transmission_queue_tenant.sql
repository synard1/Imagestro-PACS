-- ============================================================================
-- Tenant-Aware Migration - transmission_queue
-- Date: 2026-04-29
-- ============================================================================
ALTER TABLE transmission_queue ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id);
CREATE INDEX IF NOT EXISTS idx_transmission_queue_tenant ON transmission_queue(tenant_id);