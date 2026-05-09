-- ============================================================================
-- Tenant-Aware Migration - tenant_invitations
-- Date: 2026-04-29
-- ============================================================================
ALTER TABLE tenant_invitations ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id);
CREATE INDEX IF NOT EXISTS idx_tenant_invitations_tenant ON tenant_invitations(tenant_id);