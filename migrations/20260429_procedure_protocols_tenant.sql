-- ============================================================================
-- Tenant-Aware Migration - procedure_protocols
-- Date: 2026-04-29
-- ============================================================================
ALTER TABLE procedure_protocols ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id);
CREATE INDEX IF NOT EXISTS idx_procedure_protocols_tenant ON procedure_protocols(tenant_id);
