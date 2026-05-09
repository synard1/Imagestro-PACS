-- ============================================================================
-- Tenant-Aware Migration - billing_events
-- Date: 2026-04-29
-- ============================================================================
ALTER TABLE billing_events ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id);
CREATE INDEX IF NOT EXISTS idx_billing_events_tenant ON billing_events(tenant_id);