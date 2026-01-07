-- Add country and region columns to crags table for global location support
ALTER TABLE crags ADD COLUMN IF NOT EXISTS country TEXT;
ALTER TABLE crags ADD COLUMN IF NOT EXISTS region TEXT;

-- Update existing Guernsey crags with default values if needed
UPDATE crags SET country = 'Guernsey' WHERE country IS NULL;
UPDATE crags SET region = 'Guernsey' WHERE region IS NULL AND country = 'Guernsey';

-- Index for faster country/region queries
CREATE INDEX IF NOT EXISTS idx_crags_country ON crags(country);
CREATE INDEX IF NOT EXISTS idx_crags_region ON crags(region);
