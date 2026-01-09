-- Migration: Add Regions Table and Location Features
-- Created: 2026-01-09

-- Create regions table if not exists (idempotent)
CREATE TABLE IF NOT EXISTS regions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(100) NOT NULL,
    country_code VARCHAR(2),
    parent_region_id UUID REFERENCES regions(id),
    center_lat DECIMAL(10,8),
    center_lon DECIMAL(11,8),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Add region_id to crags if not exists
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'crags' AND column_name = 'region_id'
    ) THEN
        ALTER TABLE crags ADD COLUMN region_id UUID REFERENCES regions(id);
    END IF;
END $$;

-- Create index if not exists
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_indexes
        WHERE tablename = 'crags' AND indexname = 'idx_crags_region'
    ) THEN
        CREATE INDEX idx_crags_region ON crags(region_id);
    END IF;
END $$;

-- Seed Guernsey Channel Islands regions (idempotent)
INSERT INTO regions (name, country_code, center_lat, center_lon) VALUES
('Guernsey', 'GG', 49.4556, -2.5766),
('Alderney', 'GG', 49.7172, -2.2147),
('Sark', 'GG', 49.4333, -2.3667),
('Herm', 'GG', 49.4667, -2.4500),
('Jersey', 'JE', 49.1917, -2.1106)
ON CONFLICT DO NOTHING;

-- Update existing crags without region_id (optional - assign to Guernsey)
UPDATE crags
SET region_id = (
    SELECT id FROM regions WHERE name = 'Guernsey' LIMIT 1
)
WHERE region_id IS NULL;
