-- ============================================================================
-- Tenant-Aware Migration - backup_snapshots
-- Date: 2026-04-29
-- ============================================================================
ALTER TABLE backup_snapshots ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id);
CREATE INDEX IF NOT EXISTS idx_backup_snapshots_tenant ON backup_snapshots(tenant_id);