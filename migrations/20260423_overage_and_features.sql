-- Migration: Add overage pricing and subscription feature overrides
-- Date: 2026-04-23

-- Add columns to products
ALTER TABLE products ADD COLUMN IF NOT EXISTS overage_storage_price DOUBLE PRECISION DEFAULT 0.0;
ALTER TABLE products ADD COLUMN IF NOT EXISTS overage_api_price DOUBLE PRECISION DEFAULT 0.0;

-- Add columns to subscriptions
ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS features JSONB;

-- Comments for documentation
COMMENT ON COLUMN products.overage_storage_price IS 'Price per GB for storage overage';
COMMENT ON COLUMN products.overage_api_price IS 'Price per API call for usage overage';
COMMENT ON COLUMN subscriptions.features IS 'JSON field to store feature overrides for specific tenant subscription';
