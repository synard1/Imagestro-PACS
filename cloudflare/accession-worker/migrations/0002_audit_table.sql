-- Migration: 0002_audit_table.sql
-- Creates the accession_audit table for tracking UPDATE and DELETE operations
-- Requirements: 7A.4, 8.9

CREATE TABLE IF NOT EXISTS accession_audit (
    id TEXT PRIMARY KEY,                                          -- UUID v7
    accession_id TEXT NOT NULL,
    tenant_id TEXT NOT NULL,
    actor TEXT NOT NULL,                                          -- user_id or service name from JWT
    action TEXT NOT NULL CHECK (action IN ('UPDATE', 'DELETE')),
    changes TEXT NOT NULL,                                        -- JSON diff
    created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_audit_accession
    ON accession_audit(accession_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_audit_tenant_created
    ON accession_audit(tenant_id, created_at DESC);
