-- =====================================================
-- Image-Centric Schema for Climbing App
-- One pin per image, multiple routes per image
-- Created: 2026-01-10
-- =====================================================

-- Drop existing tables if they exist (fresh start)
DROP TABLE IF EXISTS admin_actions CASCADE;
DROP TABLE IF EXISTS user_climbs CASCADE;
DROP TABLE IF EXISTS route_lines CASCADE;
DROP TABLE IF EXISTS climbs CASCADE;
DROP TABLE IF EXISTS images CASCADE;
DROP TABLE IF EXISTS crags CASCADE;
DROP TABLE IF EXISTS regions CASCADE;

-- =====================================================
-- REGIONS: Geographic hierarchy
-- =====================================================
CREATE TABLE regions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(100) NOT NULL,
    country_code VARCHAR(2),
    center_lat DECIMAL(10,8),
    center_lon DECIMAL(11,8),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

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

-- =====================================================
-- CRAGS: Climbing areas (fixed GPS location)
-- =====================================================
CREATE TABLE crags (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(200) NOT NULL,
    latitude DECIMAL(10,8) NOT NULL,
    longitude DECIMAL(11,8) NOT NULL,
    region_id UUID REFERENCES regions(id),
    description TEXT,
    access_notes TEXT,
    rock_type VARCHAR(50),
    type VARCHAR(20) DEFAULT 'sport',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_crags_location ON crags(latitude, longitude);
CREATE INDEX idx_crags_region ON crags(region_id);
CREATE INDEX idx_crags_type ON crags(type);

-- =====================================================
-- IMAGES: Photos with GPS (ONE PIN PER IMAGE)
-- =====================================================
CREATE TABLE images (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    url TEXT NOT NULL,
    latitude DECIMAL(10,8),
    longitude DECIMAL(11,8),
    capture_date TIMESTAMPTZ,
    crag_id UUID REFERENCES crags(id),
    width INTEGER,
    height INTEGER,
    created_by UUID,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_images_location ON images(latitude, longitude);
CREATE INDEX idx_images_crag ON images(crag_id);
CREATE INDEX idx_images_created_by ON images(created_by);

-- =====================================================
-- CLIMBS: Climb metadata (NO IMAGE URL, NO COORDINATES)
-- =====================================================
CREATE TABLE climbs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(200),
    grade VARCHAR(10) NOT NULL,
    status VARCHAR(20) DEFAULT 'pending',
    route_type VARCHAR(20),
    description TEXT,
    user_id UUID,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    deleted_at TIMESTAMPTZ
);

CREATE INDEX idx_climbs_status ON climbs(status);
CREATE INDEX idx_climbs_grade ON climbs(grade);
CREATE INDEX idx_climbs_user ON climbs(user_id);
CREATE INDEX idx_climbs_name ON climbs(name);

-- =====================================================
-- ROUTE_LINES: Routes drawn on images
-- =====================================================
CREATE TABLE route_lines (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    image_id UUID NOT NULL REFERENCES images(id) ON DELETE CASCADE,
    climb_id UUID NOT NULL REFERENCES climbs(id) ON DELETE CASCADE,
    points JSONB NOT NULL,
    color VARCHAR(20) DEFAULT 'red',
    sequence_order INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW(),

    UNIQUE(image_id, climb_id)
);

CREATE INDEX idx_route_lines_image ON route_lines(image_id);
CREATE INDEX idx_route_lines_climb ON route_lines(climb_id);

-- =====================================================
-- USER_CLIMBS: Logged ascents
-- =====================================================
CREATE TABLE user_climbs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id),
    climb_id UUID NOT NULL REFERENCES climbs(id),
    style VARCHAR(20) NOT NULL,
    notes TEXT,
    date_climbed DATE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_user_climbs_user ON user_climbs(user_id);
CREATE INDEX idx_user_climbs_climb ON user_climbs(climb_id);
CREATE INDEX idx_user_climbs_date ON user_climbs(date_climbed);

-- =====================================================
-- ADMIN_ACTIONS: Moderation
-- =====================================================
CREATE TABLE admin_actions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL,
    action VARCHAR(20) NOT NULL,
    target_id UUID NOT NULL,
    target_type VARCHAR(20),
    details JSONB,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_admin_actions_target ON admin_actions(target_id, target_type);
