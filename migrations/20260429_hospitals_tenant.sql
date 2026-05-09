-- ============================================================================
-- Tenant-Aware Migration - hospitals
-- Date: 2026-04-29
-- ============================================================================
ALTER TABLE hospitals ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id);
CREATE INDEX IF NOT EXISTS idx_hospitals_tenant ON hospitals(tenant_id);