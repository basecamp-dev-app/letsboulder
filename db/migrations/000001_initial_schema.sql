-- Initial Schema Migration (Idempotent)
-- Generated from production Supabase database
-- Created: 2026-01-09
-- Run this on a fresh database

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Table: regions (already created by 000002, skip if exists)
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'regions' AND table_schema = 'public') THEN
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
    END IF;
END $$;

-- Table: crags
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'crags' AND table_schema = 'public') THEN
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
    END IF;
END $$;

-- Add region_id to crags if not exists
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'crags' AND column_name = 'region_id') THEN
        ALTER TABLE crags ADD COLUMN region_id UUID REFERENCES regions(id);
    END IF;
END $$;

-- Table: climbs
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'climbs' AND table_schema = 'public') THEN
        CREATE TABLE climbs (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            name VARCHAR(200),
            grade VARCHAR(10) NOT NULL,
            crag_id UUID REFERENCES crags(id) ON DELETE SET NULL,
            description TEXT,
            image_url TEXT,
            image_capture_date TIMESTAMPTZ,
            user_id UUID, -- References auth.users (Supabase managed)
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
    END IF;
END $$;

-- Table: user_climbs
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'user_climbs' AND table_schema = 'public') THEN
        CREATE TABLE user_climbs (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            user_id UUID, -- References auth.users (Supabase managed)
            climb_id UUID REFERENCES climbs(id),
            style VARCHAR(20) NOT NULL,
            notes TEXT,
            date_climbed DATE,
            created_at TIMESTAMPTZ DEFAULT NOW()
        );
    END IF;
END $$;

-- Table: admin_actions
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'admin_actions' AND table_schema = 'public') THEN
        CREATE TABLE admin_actions (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            user_id UUID, -- References auth.users (Supabase managed)
            action VARCHAR(20) NOT NULL,
            target_id UUID,
            details JSONB,
            created_at TIMESTAMPTZ DEFAULT NOW()
        );
    END IF;
END $$;

-- Indexes (create if not exist)
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE tablename = 'crags' AND indexname = 'idx_crags_region') THEN
        CREATE INDEX idx_crags_region ON crags(region_id);
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE tablename = 'crags' AND indexname = 'idx_crags_location') THEN
        CREATE INDEX idx_crags_location ON crags(latitude, longitude);
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE tablename = 'climbs' AND indexname = 'idx_climbs_crag') THEN
        CREATE INDEX idx_climbs_crag ON climbs(crag_id);
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE tablename = 'climbs' AND indexname = 'idx_climbs_user') THEN
        CREATE INDEX idx_climbs_user ON climbs(user_id);
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE tablename = 'climbs' AND indexname = 'idx_climbs_status') THEN
        CREATE INDEX idx_climbs_status ON climbs(status);
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE tablename = 'climbs' AND indexname = 'idx_climbs_grade') THEN
        CREATE INDEX idx_climbs_grade ON climbs(grade);
    END IF;
END $$;

-- Seed Guernsey regions
INSERT INTO regions (name, country_code, center_lat, center_lon) VALUES
('Guernsey', 'GG', 49.4556, -2.5766),
('Alderney', 'GG', 49.7172, -2.2147),
('Sark', 'GG', 49.4333, -2.3667),
('Herm', 'GG', 49.4667, -2.4500),
('Jersey', 'JE', 49.1917, -2.1106)
ON CONFLICT DO NOTHING;

-- Note: RLS policies are managed in Supabase Dashboard
-- Run: ALTER TABLE climbs ENABLE ROW LEVEL SECURITY;
-- Then create policies in Supabase Dashboard
