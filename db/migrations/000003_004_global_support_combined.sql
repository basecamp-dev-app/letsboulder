-- ============================================================
-- MIGRATION: Global Support (Phases 1-2 Combined)
-- Run this in Supabase SQL Editor
-- Created: 2026-01-10
-- ============================================================

-- Step 1: Create regions table if not exists
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

-- Step 2: Add location fields to crags
ALTER TABLE crags ADD COLUMN IF NOT EXISTS country_code VARCHAR(2);
ALTER TABLE crags ADD COLUMN IF NOT EXISTS region_name VARCHAR(100);

-- Step 3: Add indexes
CREATE INDEX IF NOT EXISTS idx_crags_country ON crags(country_code);
CREATE INDEX IF NOT EXISTS idx_crags_region_name ON crags(region_name);

-- Step 4: Seed worldwide regions
-- Guernsey Channel Islands
INSERT INTO regions (name, country_code, center_lat, center_lon) VALUES
('Guernsey', 'GG', 49.4556, -2.5766),
('Alderney', 'GG', 49.7172, -2.2147),
('Sark', 'GG', 49.4333, -2.3667),
('Herm', 'GG', 49.4667, -2.4500),
('Jersey', 'JE', 49.1917, -2.1106)
ON CONFLICT DO NOTHING;

-- United Kingdom
INSERT INTO regions (name, country_code, center_lat, center_lon) VALUES
('Cornwall', 'GB', 50.2660, -5.0527),
('Devon', 'GB', 50.7156, -3.5319),
('Peak District', 'GB', 53.2286, -1.5572),
('Lake District', 'GB', 54.4609, -3.0886),
('Yorkshire', 'GB', 53.9915, -1.5410),
('Scotland', 'GB', 56.4907, -4.2026),
('Wales', 'GB', 52.1307, -3.7837)
ON CONFLICT DO NOTHING;

-- France
INSERT INTO regions (name, country_code, center_lat, center_lon) VALUES
('Fontainebleau', 'FR', 48.4049, 2.6920),
('Verdon', 'FR', 43.8105, 5.9422),
('Céüse', 'FR', 44.4944, 5.9728),
('Buoux', 'FR', 43.8222, 5.3914)
ON CONFLICT DO NOTHING;

-- Spain
INSERT INTO regions (name, country_code, center_lat, center_lon) VALUES
('Catalonia', 'ES', 41.3874, 2.1686),
('Andalusia', 'ES', 37.3925, -5.9942),
('Mallorca', 'ES', 39.6953, 3.0176)
ON CONFLICT DO NOTHING;

-- Italy
INSERT INTO regions (name, country_code, center_lat, center_lon) VALUES
('Dolomites', 'IT', 46.5553, 11.8635),
('Sardinia', 'IT', 40.1209, 9.0101)
ON CONFLICT DO NOTHING;

-- USA
INSERT INTO regions (name, country_code, center_lat, center_lon) VALUES
('Joshua Tree', 'US', 34.1345, -115.9000),
('Red River Gorge', 'US', 37.8234, -83.6274),
('Yosemite', 'US', 37.8651, -119.5383),
('Boulder', 'US', 40.0150, -105.2705)
ON CONFLICT DO NOTHING;

-- Australia
INSERT INTO regions (name, country_code, center_lat, center_lon) VALUES
('Grampians', 'AU', -37.1384, 142.3468),
('Blue Mountains', 'AU', -33.7151, 150.3119)
ON CONFLICT DO NOTHING;

-- Step 5: Verify
SELECT 'Regions created: ' || COUNT(*) as result FROM regions;
SELECT 'Crags with country_code: ' || COUNT(*) as result FROM crags WHERE country_code IS NOT NULL;
