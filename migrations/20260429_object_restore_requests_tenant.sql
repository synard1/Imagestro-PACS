-- ============================================================================
-- Tenant-Aware Migration - object_restore_requests
-- Date: 2026-04-29
-- ============================================================================
ALTER TABLE object_restore_requests ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id);
CREATE INDEX IF NOT EXISTS idx_object_restore_requests_tenant ON object_restore_requests(tenant_id);
