-- ============================================================================
-- Tenant-Aware Migration - feature_flags
-- Date: 2026-04-29
-- ============================================================================
ALTER TABLE feature_flags ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id);
CREATE INDEX IF NOT EXISTS idx_feature_flags_tenant ON feature_flags(tenant_id);