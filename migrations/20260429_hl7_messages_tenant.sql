-- ============================================================================
-- Tenant-Aware Migration - hl7_messages
-- Date: 2026-04-29
-- ============================================================================
ALTER TABLE hl7_messages ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id);
CREATE INDEX IF NOT EXISTS idx_hl7_messages_tenant ON hl7_messages(tenant_id);
