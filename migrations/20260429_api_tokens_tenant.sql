-- ============================================================================
-- Tenant-Aware Migration - api_tokens
-- Date: 2026-04-29
-- ============================================================================
ALTER TABLE api_tokens ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id);
CREATE INDEX IF NOT EXISTS idx_api_tokens_tenant ON api_tokens(tenant_id);
