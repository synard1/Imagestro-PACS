-- Migration: Add R2 Operations Tracking
-- Date: 2026-04-23

-- Add columns to usage_records table
ALTER TABLE usage_records ADD COLUMN IF NOT EXISTS class_a_ops INTEGER DEFAULT 0;
ALTER TABLE usage_records ADD COLUMN IF NOT EXISTS class_b_ops INTEGER DEFAULT 0;

-- Comment for clarity
COMMENT ON COLUMN usage_records.class_a_ops IS 'Count of R2/S3 Class A operations (Mutations: Put, List, etc.)';
COMMENT ON COLUMN usage_records.class_b_ops IS 'Count of R2/S3 Class B operations (Reads: Get, Head, etc.)';
