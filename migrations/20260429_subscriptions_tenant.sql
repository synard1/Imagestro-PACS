-- ============================================================================
-- Tenant-Aware Migration - subscriptions
-- Date: 2026-04-29
-- ============================================================================
ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id);
CREATE INDEX IF NOT EXISTS idx_subscriptions_tenant ON subscriptions(tenant_id);