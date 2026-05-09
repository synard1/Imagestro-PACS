-- ============================================================================
-- Tenant-Aware Migration - accession_counters
-- Date: 2026-04-29
-- ============================================================================
ALTER TABLE accession_counters ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id);
CREATE INDEX IF NOT EXISTS idx_accession_counters_tenant ON accession_counters(tenant_id);
