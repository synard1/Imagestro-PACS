-- ============================================================================
-- Tenant-Aware Migration - procedures
-- Date: 2026-04-29
-- ============================================================================
ALTER TABLE procedures ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id);
CREATE INDEX IF NOT EXISTS idx_procedures_tenant ON procedures(tenant_id);