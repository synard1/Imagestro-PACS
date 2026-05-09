-- ============================================================================
-- Tenant-Aware Migration - refresh_tokens
-- Date: 2026-04-29
-- ============================================================================
ALTER TABLE refresh_tokens ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id);
CREATE INDEX IF NOT EXISTS idx_refresh_tokens_tenant ON refresh_tokens(tenant_id);
