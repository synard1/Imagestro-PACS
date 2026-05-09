-- ============================================================================
-- Tenant-Aware Migration - object_replicas
-- Date: 2026-04-29
-- ============================================================================
ALTER TABLE object_replicas ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id);
CREATE INDEX IF NOT EXISTS idx_object_replicas_tenant ON object_replicas(tenant_id);
