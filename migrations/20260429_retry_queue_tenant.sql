-- ============================================================================
-- Tenant-Aware Migration - retry_queue
-- Date: 2026-04-29
-- ============================================================================
ALTER TABLE retry_queue ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id);
CREATE INDEX IF NOT EXISTS idx_retry_queue_tenant ON retry_queue(tenant_id);
