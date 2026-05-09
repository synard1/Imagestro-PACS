-- ============================================================================
-- Tenant-Aware Migration - service_requests
-- Date: 2026-04-29
-- ============================================================================
ALTER TABLE service_requests ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id);
CREATE INDEX IF NOT EXISTS idx_service_requests_tenant ON service_requests(tenant_id);
