-- Seed Data: Guernsey Channel Islands Regions
-- Run this after migration 000002
-- Created: 2026-01-09

-- Guernsey Channel Islands Regions
INSERT INTO regions (name, country_code, center_lat, center_lon) VALUES
('Guernsey', 'GG', 49.4556, -2.5766),
('Alderney', 'GG', 49.7172, -2.2147),
('Sark', 'GG', 49.4333, -2.3667),
('Herm', 'GG', 49.4667, -2.4500),
('Jersey', 'JE', 49.1917, -2.1106)
ON CONFLICT DO NOTHING;

-- Common climbing regions worldwide (examples)
INSERT INTO regions (name, country_code, center_lat, center_lon) VALUES
-- United Kingdom
('Cornwall', 'GB', 50.2660, -5.0527),
('Devon', 'GB', 50.7156, -3.5319),
('Peak District', 'GB', 53.2286, -1.5572),
('Lake District', 'GB', 54.4609, -3.0886),
('Yorkshire', 'GB', 53.9915, -1.5410),
('Scotland', 'GB', 56.4907, -4.2026),
('Wales', 'GB', 52.1307, -3.7837),

-- France
('Fontainebleau', 'FR', 48.4049, 2.6920),
('Verdon', 'FR', 43.8105, 5.9422),
('Céüse', 'FR', 44.4944, 5.9728),
('Buoux', 'FR', 43.8222, 5.3914),

-- Spain
('Catalonia', 'ES', 41.3874, 2.1686),
('Andalusia', 'ES', 37.3925, -5.9942),
('Mallorca', 'ES', 39.6953, 3.0176),

-- Italy
('Dolomites', 'IT', 46.5553, 11.8635),
('Sardinia', 'IT', 40.1209, 9.0101),

-- USA
('Joshua Tree', 'US', 34.1345, -115.9000),
('Red River Gorge', 'US', 37.8234, -83.6274),
('Yosemite', 'US', 37.8651, -119.5383),
('Boulder', 'US', 40.0150, -105.2705),

-- Australia
('Grampians', 'AU', -37.1384, 142.3468),
('Blue Mountains', 'AU', -33.7151, 150.3119)
ON CONFLICT DO NOTHING;
