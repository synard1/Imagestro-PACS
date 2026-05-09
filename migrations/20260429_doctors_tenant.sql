-- ============================================================================
-- Tenant-Aware Migration - doctors
-- Date: 2026-04-29
-- ============================================================================
ALTER TABLE doctors ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id);
CREATE INDEX IF NOT EXISTS idx_doctors_tenant ON doctors(tenant_id);