-- Migration 0003: Soft Delete Safety Net
-- Ensures the deleted_at column and partial active index exist.
-- The deleted_at column is already defined in 0001_initial_schema.sql's CREATE TABLE.
-- This migration acts as a safety net for environments where the schema may have been
-- created before soft-delete support was added.

-- Partial index for active (non-deleted) accessions per tenant.
-- Uses SQLite partial index syntax (WHERE clause on CREATE INDEX).
-- IF NOT EXISTS ensures this is safe to re-run even if 0001 already created it.
CREATE INDEX IF NOT EXISTS idx_accessions_tenant_active
    ON accessions(tenant_id, created_at DESC) WHERE deleted_at IS NULL;
