-- ============================================================================
-- Tenant-Aware Migration - procedure_modalities
-- Date: 2026-04-29
-- ============================================================================
ALTER TABLE procedure_modalities ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id);
CREATE INDEX IF NOT EXISTS idx_procedure_modalities_tenant ON procedure_modalities(tenant_id);
