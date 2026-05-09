-- ============================================================================
-- Tenant-Aware Migration - schedule_slots
-- Date: 2026-04-29
-- ============================================================================
ALTER TABLE schedule_slots ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id);
CREATE INDEX IF NOT EXISTS idx_schedule_slots_tenant ON schedule_slots(tenant_id);
