-- ============================================================================
-- Tenant-Aware Migration - procedure_equipment
-- Date: 2026-04-29
-- ============================================================================
ALTER TABLE procedure_equipment ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id);
CREATE INDEX IF NOT EXISTS idx_procedure_equipment_tenant ON procedure_equipment(tenant_id);
