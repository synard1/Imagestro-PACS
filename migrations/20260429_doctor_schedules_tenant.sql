-- ============================================================================
-- Tenant-Aware Migration - doctor_schedules
-- Date: 2026-04-29
-- ============================================================================
ALTER TABLE doctor_schedules ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id);
CREATE INDEX IF NOT EXISTS idx_doctor_schedules_tenant ON doctor_schedules(tenant_id);
