-- ============================================================================
-- Tenant-Aware Migration - external_systems
-- Date: 2026-04-29
-- ============================================================================
ALTER TABLE external_systems ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id);
CREATE INDEX IF NOT EXISTS idx_external_systems_tenant ON external_systems(tenant_id);