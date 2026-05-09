-- ============================================================================
-- Tenant-Aware Migration - pacs_migrations
-- Date: 2026-04-29
-- ============================================================================
ALTER TABLE pacs_migrations ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id);
CREATE INDEX IF NOT EXISTS idx_pacs_migrations_tenant ON pacs_migrations(tenant_id);
