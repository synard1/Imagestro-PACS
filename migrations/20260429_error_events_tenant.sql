-- ============================================================================
-- Tenant-Aware Migration - error_events
-- Date: 2026-04-29
-- ============================================================================
ALTER TABLE error_events ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id);
CREATE INDEX IF NOT EXISTS idx_error_events_tenant ON error_events(tenant_id);
