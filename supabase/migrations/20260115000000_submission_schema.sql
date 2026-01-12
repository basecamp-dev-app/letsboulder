-- =====================================================
-- Submission Feature Schema
-- Database setup for new image-centric submission flow
-- Created: 2026-01-15
-- =====================================================

-- =====================================================
-- REGIONS: Geographic hierarchy (NO GPS required for creation)
-- =====================================================
CREATE TABLE IF NOT EXISTS regions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(100) NOT NULL,
    country_code VARCHAR(2),
    center_lat DECIMAL(10,8),
    center_lon DECIMAL(11,8),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- =====================================================
-- CRAGS: Climbing areas (requires GPS)
-- =====================================================
CREATE TABLE IF NOT EXISTS crags (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(200) NOT NULL,
    latitude DECIMAL(10,8) NOT NULL,
    longitude DECIMAL(11,8) NOT NULL,
    region_id UUID REFERENCES regions(id) ON DELETE SET NULL,
    description TEXT,
    access_notes TEXT,
    rock_type VARCHAR(50),
    type VARCHAR(20) DEFAULT 'sport',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_crags_region ON crags(region_id);
CREATE INDEX IF NOT EXISTS idx_crags_type ON crags(type);
CREATE INDEX IF NOT EXISTS idx_crags_name ON crags(name);

-- =====================================================
-- IMAGES: Photos with GPS (ONE PIN PER IMAGE)
-- =====================================================
CREATE TABLE IF NOT EXISTS images (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    url TEXT NOT NULL,
    latitude DECIMAL(10,8),
    longitude DECIMAL(11,8),
    capture_date TIMESTAMPTZ,
    crag_id UUID REFERENCES crags(id) ON DELETE SET NULL,
    width INTEGER,
    height INTEGER,
    created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_images_crag ON images(crag_id);
CREATE INDEX IF NOT EXISTS idx_images_created_by ON images(created_by);
CREATE INDEX IF NOT EXISTS idx_images_created_at ON images(created_at);

-- =====================================================
-- CLIMBS: Climb metadata (NO IMAGE URL, NO COORDINATES)
-- =====================================================
CREATE TABLE IF NOT EXISTS climbs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(200),
    grade VARCHAR(10) NOT NULL,
    status VARCHAR(20) DEFAULT 'pending',
    route_type VARCHAR(20),
    description TEXT,
    user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    deleted_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_climbs_status ON climbs(status);
CREATE INDEX IF NOT EXISTS idx_climbs_user ON climbs(user_id);
CREATE INDEX IF NOT EXISTS idx_climbs_name ON climbs(name);
CREATE INDEX IF NOT EXISTS idx_climbs_created_at ON climbs(created_at);

-- =====================================================
-- ROUTE_LINES: Routes drawn on images
-- =====================================================
CREATE TABLE IF NOT EXISTS route_lines (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    image_id UUID NOT NULL REFERENCES images(id) ON DELETE CASCADE,
    climb_id UUID NOT NULL REFERENCES climbs(id) ON DELETE CASCADE,
    points JSONB NOT NULL,
    color VARCHAR(20) DEFAULT 'red',
    sequence_order INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW(),

    UNIQUE(image_id, climb_id)
);

CREATE INDEX IF NOT EXISTS idx_route_lines_image ON route_lines(image_id);
CREATE INDEX IF NOT EXISTS idx_route_lines_climb ON route_lines(climb_id);

-- =====================================================
-- ROW LEVEL SECURITY POLICIES
-- =====================================================

-- Regions: Public read, authenticated create
DO $$ BEGIN
  ALTER TABLE regions ENABLE ROW LEVEL SECURITY;
EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY "Public read regions" ON regions FOR SELECT USING (true);
EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY "Authenticated create regions" ON regions FOR INSERT WITH CHECK (auth.role() = 'authenticated');
EXCEPTION WHEN OTHERS THEN NULL; END $$;

-- Crags: Public read, authenticated create
DO $$ BEGIN
  ALTER TABLE crags ENABLE ROW LEVEL SECURITY;
EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY "Public read crags" ON crags FOR SELECT USING (true);
EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY "Authenticated create crags" ON crags FOR INSERT WITH CHECK (auth.role() = 'authenticated');
EXCEPTION WHEN OTHERS THEN NULL; END $$;

-- Images: Public read, owner create
DO $$ BEGIN
  ALTER TABLE images ENABLE ROW LEVEL SECURITY;
EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY "Public read images" ON images FOR SELECT USING (true);
EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY "Owner create images" ON images FOR INSERT WITH CHECK (auth.uid() = created_by);
EXCEPTION WHEN OTHERS THEN NULL; END $$;

-- Climbs: Public read, owner create, owner update (pending only)
DO $$ BEGIN
  ALTER TABLE climbs ENABLE ROW LEVEL SECURITY;
EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY "Public read climbs" ON climbs FOR SELECT USING (true);
EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY "Owner create climbs" ON climbs FOR INSERT WITH CHECK (auth.uid() = user_id);
EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY "Owner update own pending climbs" ON climbs FOR UPDATE 
    USING (auth.uid() = user_id AND status = 'pending')
    WITH CHECK (auth.uid() = user_id AND status = 'pending');
EXCEPTION WHEN OTHERS THEN NULL; END $$;

-- Route Lines: Public read, owner create (via climbs ownership)
DO $$ BEGIN
  ALTER TABLE route_lines ENABLE ROW LEVEL SECURITY;
EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY "Public read route_lines" ON route_lines FOR SELECT USING (true);
EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY "Owner create route_lines" ON route_lines FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM climbs WHERE id = route_lines.climb_id AND user_id = auth.uid())
  );
EXCEPTION WHEN OTHERS THEN NULL; END $$;

-- =====================================================
-- SEED INITIAL REGIONS
-- =====================================================
INSERT INTO regions (name, country_code, center_lat, center_lon) VALUES
    ('Guernsey', 'GG', 49.4556, -2.5766),
    ('Alderney', 'GG', 49.7172, -2.2147),
    ('Sark', 'GG', 49.4333, -2.3667),
    ('Herm', 'GG', 49.4667, -2.4500),
    ('Jersey', 'JE', 49.1917, -2.1106),
    ('Cornwall', 'GB', 50.266, -5.0527),
    ('Devon', 'GB', 50.7156, -3.5319),
    ('Peak District', 'GB', 53.2286, -1.5572),
    ('Lake District', 'GB', 54.4609, -3.0886),
    ('Yorkshire', 'GB', 53.9915, -1.541),
    ('Scotland', 'GB', 56.4907, -4.2026),
    ('Wales', 'GB', 52.1307, -3.7837),
    ('Fontainebleau', 'FR', 48.4049, 2.692),
    ('Verdon', 'FR', 43.8105, 5.9422),
    ('Céüse', 'FR', 44.4944, 5.9728),
    ('Buoux', 'FR', 43.8222, 5.3914),
    ('Catalonia', 'ES', 41.3874, 2.1686),
    ('Andalusia', 'ES', 37.3925, -5.9942),
    ('Mallorca', 'ES', 39.6953, 3.0176),
    ('Dolomites', 'IT', 46.5553, 11.8635),
    ('Sardinia', 'IT', 40.1209, 9.0101),
    ('Joshua Tree', 'US', 34.1345, -115.9),
    ('Red River Gorge', 'US', 37.8234, -83.6274),
    ('Yosemite', 'US', 37.8651, -119.5383),
    ('Boulder', 'US', 40.015, -105.2705),
    ('Grampians', 'AU', -37.1384, 142.3468),
    ('Blue Mountains', 'AU', -33.7151, 150.3119)
ON CONFLICT DO NOTHING;
