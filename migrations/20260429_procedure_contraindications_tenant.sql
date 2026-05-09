-- ============================================================================
-- Tenant-Aware Migration - procedure_contraindications
-- Date: 2026-04-29
-- ============================================================================
ALTER TABLE procedure_contraindications ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id);
CREATE INDEX IF NOT EXISTS idx_procedure_contraindications_tenant ON procedure_contraindications(tenant_id);
