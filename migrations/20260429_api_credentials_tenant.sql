-- ============================================================================
-- Tenant-Aware Migration - api_credentials
-- Date: 2026-04-29
-- ============================================================================
ALTER TABLE api_credentials ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id);
CREATE INDEX IF NOT EXISTS idx_api_credentials_tenant ON api_credentials(tenant_id);
