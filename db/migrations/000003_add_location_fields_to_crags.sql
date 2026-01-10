-- Migration: Add Location Fields to Crags
-- Purpose: Store country_code and region_name directly on crags for filtering
-- Created: 2026-01-10

-- Add country code if not exists
ALTER TABLE crags ADD COLUMN IF NOT EXISTS country_code VARCHAR(2);

-- Add region name if not exists
ALTER TABLE crags ADD COLUMN IF NOT EXISTS region_name VARCHAR(100);

-- Add indexes for filtering
CREATE INDEX IF NOT EXISTS idx_crags_country ON crags(country_code);
CREATE INDEX IF NOT EXISTS idx_crags_region_name ON crags(region_name);

-- Update existing crags with values from Nominatim detection
UPDATE crags
SET country_code = 'GB'
WHERE country IS NOT NULL AND country_code IS NULL;

UPDATE crags
SET region_name = region
WHERE region IS NOT NULL AND region_name IS NULL;
