-- Migration: Storage Management System
-- Date: 2026-04-23

-- 1. Create storage_backends table
CREATE TABLE IF NOT EXISTS storage_backends (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
    name VARCHAR(100) NOT NULL,
    type VARCHAR(50) NOT NULL, -- 'local', 's3', 'minio', etc.
    config JSONB NOT NULL DEFAULT '{}',
    is_active BOOLEAN DEFAULT false,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Index for tenant-specific storage
CREATE INDEX IF NOT EXISTS idx_storage_tenant ON storage_backends(tenant_id);
CREATE INDEX IF NOT EXISTS idx_storage_active ON storage_backends(is_active) WHERE is_active = true;

-- 2. Add storage_id to pacs_studies
ALTER TABLE pacs_studies ADD COLUMN IF NOT EXISTS storage_id UUID REFERENCES storage_backends(id) ON DELETE SET NULL;

-- 3. Seed default local storage for existing studies (optional but recommended)
-- First, create a system-wide default local storage
INSERT INTO storage_backends (id, name, type, config, is_active)
VALUES (
    '00000000-0000-0000-0000-000000000001', 
    'System Default Local', 
    'local', 
    '{"base_path": "/var/lib/pacs/storage"}'::jsonb, 
    true
) ON CONFLICT (id) DO NOTHING;

-- Update existing studies to use this default
UPDATE pacs_studies SET storage_id = '00000000-0000-0000-0000-000000000001' WHERE storage_id IS NULL;

-- 4. Comment on columns
COMMENT ON COLUMN storage_backends.type IS 'local, s3, minio, contabo, wasabi';
COMMENT ON COLUMN pacs_studies.storage_id IS 'Points to the storage backend where this study is stored';
