-- Initial Schema Migration
-- Generated from production Supabase database
-- Created: 2026-01-09

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Table: regions
CREATE TABLE regions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(100) NOT NULL,
    country_code VARCHAR(2),
    parent_region_id UUID REFERENCES regions(id),
    center_lat DECIMAL(10,8),
    center_lon DECIMAL(11,8),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Table: crags
CREATE TABLE crags (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(200) NOT NULL,
    latitude DECIMAL(10,8) NOT NULL,
    longitude DECIMAL(11,8) NOT NULL,
    region_id UUID REFERENCES regions(id),
    description TEXT,
    access_notes TEXT,
    elevation_meters DECIMAL(8,2),
    rock_type VARCHAR(50),
    type VARCHAR(20),
    tide_level VARCHAR(20),
    map_url TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Table: climbs
CREATE TABLE climbs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(200),
    grade VARCHAR(10) NOT NULL,
    crag_id UUID REFERENCES crags(id) ON DELETE SET NULL,
    description TEXT,
    image_url TEXT,
    image_capture_date TIMESTAMPTZ,
    user_id UUID REFERENCES auth.users(id),
    status VARCHAR(20) DEFAULT 'pending',
    route_type VARCHAR(20),
    number_of_pitches INTEGER DEFAULT 1,
    bolts INTEGER,
    anchors INTEGER,
    coordinates JSONB,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    approved_at TIMESTAMPTZ,
    deleted_at TIMESTAMPTZ
);

-- Table: user_climbs
CREATE TABLE user_climbs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id),
    climb_id UUID REFERENCES climbs(id),
    style VARCHAR(20) NOT NULL,
    notes TEXT,
    date_climbed DATE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Table: admin_actions
CREATE TABLE admin_actions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id),
    action VARCHAR(20) NOT NULL,
    target_id UUID,
    details JSONB,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_crags_region ON crags(region_id);
CREATE INDEX idx_crags_location ON crags(latitude, longitude);
CREATE INDEX idx_climbs_crag ON climbs(crag_id);
CREATE INDEX idx_climbs_user ON climbs(user_id);
CREATE INDEX idx_climbs_status ON climbs(status);
CREATE INDEX idx_climbs_grade ON climbs(grade);
CREATE INDEX idx_user_climbs_user ON user_climbs(user_id);
CREATE INDEX idx_user_climbs_climb ON user_climbs(climb_id);
CREATE INDEX idx_admin_actions_user ON admin_actions(user_id);

-- RLS Policies (managed by Supabase)
-- Note: RLS policies are stored separately and should be configured in Supabase Dashboard
