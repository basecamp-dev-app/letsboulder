
-- Migration: 20260110180000_image_centric_schema.sql

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

-- Migration: 20260111000000_find_region_by_location.sql

-- Migration: Find Region by Location
-- Purpose: Find nearest region within 50km of GPS point using PostGIS
-- Created: 2026-01-11

-- Enable PostGIS if not already enabled
CREATE EXTENSION IF NOT EXISTS postgis;

-- Create function to find nearest region by location
CREATE OR REPLACE FUNCTION find_region_by_location(
  search_lat double precision,
  search_lng double precision
)
RETURNS TABLE (
  id uuid,
  name varchar(100),
  country_code varchar(2),
  center_lat decimal(10,8),
  center_lon decimal(11,8),
  distance_meters double precision
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT
    r.id,
    r.name,
    r.country_code,
    r.center_lat,
    r.center_lon,
    ST_Distance(
      ST_SetSRID(ST_MakePoint(r.center_lon, r.center_lat), 4326)::geography,
      ST_SetSRID(ST_MakePoint(search_lng, search_lat), 4326)::geography
    ) AS distance_meters
  FROM regions r
  WHERE r.center_lat IS NOT NULL AND r.center_lon IS NOT NULL
  ORDER BY distance_meters ASC
  LIMIT 1;
END;
$$;

-- Add indexes for region location queries
CREATE INDEX IF NOT EXISTS idx_regions_center ON regions(center_lat, center_lon);

-- Migration: 20260113120000_user_climbs_unique_constraint.sql

-- Add unique constraint to user_climbs for upsert to work correctly

ALTER TABLE user_climbs ADD CONSTRAINT idx_user_climbs_unique UNIQUE (user_id, climb_id);

-- Migration: 20260114000001_fix_linter_errors_minimal.sql

-- =====================================================
-- Fix Supabase Linter Errors - Minimal Fix
-- Only enables RLS on public tables
-- Created: 2026-01-14
-- =====================================================

-- =====================================================
-- ADMIN_ACTIONS: Enable RLS with admin-only access
-- =====================================================

-- Enable RLS on admin_actions
DO $$ BEGIN
    ALTER TABLE admin_actions ENABLE ROW LEVEL SECURITY;
EXCEPTION WHEN OTHERS THEN NULL; END $$;

-- Admin-only policy (using JWT role claim)
DO $$ BEGIN
    CREATE POLICY "Admins can manage admin actions" ON admin_actions
        FOR ALL USING (auth.jwt() ->> 'role' = 'admin');
EXCEPTION WHEN OTHERS THEN NULL; END $$;

-- =====================================================
-- CRAG_REPORTS: Add admin policy for resolving
-- =====================================================

-- Admin policy for resolving reports
DO $$ BEGIN
    CREATE POLICY "Admins can resolve crag reports" ON public.crag_reports
        FOR UPDATE USING (auth.jwt() ->> 'role' = 'admin');
EXCEPTION WHEN OTHERS THEN NULL; END $$;

-- =====================================================
-- GRADES: Already has RLS from production_sync.sql
-- No action needed - linter error should be resolved
-- =====================================================

-- Migration: 20260115000000_submission_schema.sql

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

-- Migration: 20260115000002_public_profile_rls.sql

-- =====================================================
-- MIGRATION: Public Profile Access RLS Policies
-- Enables viewing of public logbooks and profiles
-- Created: 2026-01-15
-- Updated: 2026-01-16 - Fixed to only use existing tables
-- =====================================================

-- =====================================================
-- PROFILES: Add is_public column if table exists
-- Note: profiles table is created by Supabase auth trigger
-- =====================================================
DO $$ BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'profiles') THEN
        ALTER TABLE profiles ADD COLUMN IF NOT EXISTS is_public BOOLEAN DEFAULT true;
        CREATE INDEX IF NOT EXISTS idx_profiles_is_public ON profiles(is_public);
    END IF;
EXCEPTION WHEN OTHERS THEN NULL; END $$;

-- =====================================================
-- RLS POLICIES FOR PUBLIC PROFILE ACCESS
-- =====================================================

-- Enable RLS on profiles if table exists and RLS not enabled
DO $$ BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'profiles') THEN
        ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
    END IF;
EXCEPTION WHEN OTHERS THEN NULL; END $$;

-- Public read access to profiles (username, avatar, basic info)
DO $$ BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'profiles' 
               AND NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'profiles' AND policyname = 'Public read profiles')) THEN
        CREATE POLICY "Public read profiles" ON profiles FOR SELECT USING (true);
    END IF;
EXCEPTION WHEN OTHERS THEN NULL; END $$;

-- Owner can update their own profile
DO $$ BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'profiles'
               AND NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'profiles' AND policyname = 'Owner update profile')) THEN
        CREATE POLICY "Owner update profile" ON profiles FOR UPDATE USING (auth.uid() = id);
    END IF;
EXCEPTION WHEN OTHERS THEN NULL; END $$;

-- Authenticated users can create profiles
DO $$ BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'profiles'
               AND NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'profiles' AND policyname = 'Authenticated create profile')) THEN
        CREATE POLICY "Authenticated create profile" ON profiles FOR INSERT WITH CHECK (auth.uid() = id);
    END IF;
EXCEPTION WHEN OTHERS THEN NULL; END $$;

-- =====================================================
-- SKIP: logs table does not exist in current schema
-- =====================================================
-- The logs table referenced in this migration does not exist.
-- Skipping all logs-related RLS policies.
-- =====================================================

-- =====================================================
-- USER_CLIMBS: RLS for public logbook access
-- =====================================================

-- Enable RLS on user_climbs if not already enabled
DO $$ BEGIN
    ALTER TABLE user_climbs ENABLE ROW LEVEL SECURITY;
EXCEPTION WHEN OTHERS THEN NULL; END $$;

-- Public read access to user_climbs for users with public profiles
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'user_climbs' AND policyname = 'Public read user_climbs for public profiles') THEN
        CREATE POLICY "Public read user_climbs for public profiles" ON user_climbs FOR SELECT USING (
            NOT EXISTS (
                SELECT 1 FROM profiles
                WHERE profiles.id = user_climbs.user_id
            ) OR EXISTS (
                SELECT 1 FROM profiles
                WHERE profiles.id = user_climbs.user_id
                AND COALESCE(profiles.is_public, true) = true
            )
        );
    END IF;
EXCEPTION WHEN OTHERS THEN NULL; END $$;

-- Owner can always read their own user_climbs
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'user_climbs' AND policyname = 'Owner read own user_climbs') THEN
        CREATE POLICY "Owner read own user_climbs" ON user_climbs FOR SELECT USING (auth.uid() = user_id);
    END IF;
EXCEPTION WHEN OTHERS THEN NULL; END $$;

-- Owner can create user_climbs
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'user_climbs' AND policyname = 'Owner create user_climbs') THEN
        CREATE POLICY "Owner create user_climbs" ON user_climbs FOR INSERT WITH CHECK (auth.uid() = user_id);
    END IF;
EXCEPTION WHEN OTHERS THEN NULL; END $$;

-- Owner can update their own user_climbs
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'user_climbs' AND policyname = 'Owner update user_climbs') THEN
        CREATE POLICY "Owner update user_climbs" ON user_climbs FOR UPDATE USING (auth.uid() = user_id);
    END IF;
EXCEPTION WHEN OTHERS THEN NULL; END $$;

-- Owner can delete their own user_climbs
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'user_climbs' AND policyname = 'Owner delete user_climbs') THEN
        CREATE POLICY "Owner delete user_climbs" ON user_climbs FOR DELETE USING (auth.uid() = user_id);
    END IF;
EXCEPTION WHEN OTHERS THEN NULL; END $$;

-- =====================================================
-- CLIMBS: RLS for viewing climbs in public logbooks
-- =====================================================

-- Enable RLS on climbs if not already enabled
DO $$ BEGIN
    ALTER TABLE climbs ENABLE ROW LEVEL SECURITY;
EXCEPTION WHEN OTHERS THEN NULL; END $$;

-- Public read access to climbs (basic climb info)
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'climbs' AND policyname = 'Public read climbs') THEN
        CREATE POLICY "Public read climbs" ON climbs FOR SELECT USING (true);
    END IF;
EXCEPTION WHEN OTHERS THEN NULL; END $$;

-- =====================================================
-- INDEXES FOR PERFORMANCE
-- =====================================================

-- Index on route_lines for crag name lookups in logbooks
CREATE INDEX IF NOT EXISTS idx_route_lines_climb ON route_lines(climb_id);

-- =====================================================
-- HELPER FUNCTION: Check if user profile is public
-- =====================================================

CREATE OR REPLACE FUNCTION is_profile_public(user_id UUID)
RETURNS BOOLEAN AS $$
BEGIN
    RETURN (
        SELECT COALESCE(is_public, true)
        FROM profiles
        WHERE id = user_id
    );
EXCEPTION WHEN OTHERS THEN
    RETURN true;
END;
$$ LANGUAGE plpgsql STABLE;

-- =====================================================
-- VERIFICATION
-- =====================================================

DO $$ BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'profiles') THEN
        SELECT 'Profiles RLS enabled: ' || (SELECT COUNT(*) FROM pg_policies WHERE tablename = 'profiles') as status;
    ELSE
        SELECT 'profiles table not yet created (will be created on first auth)' as status;
    END IF;
EXCEPTION WHEN OTHERS THEN NULL; END $$;

SELECT 'User_climbs RLS enabled: ' || (SELECT COUNT(*) FROM pg_policies WHERE tablename = 'user_climbs') as status;
SELECT 'Climbs RLS enabled: ' || (SELECT COUNT(*) FROM pg_policies WHERE tablename = 'climbs') as status;

-- Migration: 20260119000000_prod_sync.sql

-- Removed: drop statements for logs table (doesn't exist locally)
-- Removed: drop extension pg_net

  create table if not exists "public"."deletion_requests" (
    "id" uuid not null default gen_random_uuid(),
    "user_id" uuid not null,
    "created_at" timestamp with time zone not null default now(),
    "scheduled_at" timestamp with time zone not null,
    "cancelled_at" timestamp with time zone,
    "delete_route_uploads" boolean not null default false,
    "primary_reason" text,
    "deleted_at" timestamp with time zone
      );



  create table if not exists "public"."product_clicks" (
    "product_id" text not null,
    "click_count" bigint default 0,
    "updated_at" timestamp with time zone default now()
      );


create table if not exists "public"."profiles" (
  "id" uuid not null references auth.users on delete cascade,
  "updated_at" timestamp with time zone,
  "username" text unique,
  "avatar_url" text,
  "website" text
    );

  alter table "public"."profiles" add column if not exists "default_location" text;

  alter table "public"."profiles" add column if not exists "default_location_lat" numeric(10,8);

  alter table "public"."profiles" add column if not exists "default_location_lng" numeric(11,8);

  alter table "public"."profiles" add column if not exists "default_location_name" text;

  alter table "public"."profiles" add column if not exists "default_location_zoom" integer;

  alter table "public"."profiles" add column if not exists "grade_system" character varying(10) default 'font'::character varying;

  alter table "public"."profiles" add column if not exists "is_public" boolean default true;

  alter table "public"."profiles" add column if not exists "name" text;

  alter table "public"."profiles" add column if not exists "theme_preference" character varying(20) default 'system'::character varying;

  alter table "public"."profiles" add column if not exists "units" character varying(10) default 'metric'::character varying;

CREATE UNIQUE INDEX if not exists deletion_requests_pkey ON public.deletion_requests USING btree (id);

CREATE INDEX if not exists idx_deletion_requests_scheduled ON public.deletion_requests USING btree (scheduled_at) WHERE ((cancelled_at IS NULL) AND (deleted_at IS NULL));

CREATE INDEX if not exists idx_product_clicks_count ON public.product_clicks USING btree (click_count DESC);

CREATE INDEX if not exists idx_profiles_is_public ON public.profiles USING btree (is_public);

CREATE UNIQUE INDEX if not exists product_clicks_pkey ON public.product_clicks USING btree (product_id);

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE tablename = 'deletion_requests') THEN
    IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE table_name = 'deletion_requests' AND constraint_name = 'deletion_requests_pkey') THEN
      alter table "public"."deletion_requests" add constraint "deletion_requests_pkey" PRIMARY KEY using index "deletion_requests_pkey";
    END IF;
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE tablename = 'product_clicks') THEN
    IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE table_name = 'product_clicks' AND constraint_name = 'product_clicks_pkey') THEN
      alter table "public"."product_clicks" add constraint "product_clicks_pkey" PRIMARY KEY using index "product_clicks_pkey";
    END IF;
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE tablename = 'deletion_requests') THEN
    IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE table_name = 'deletion_requests' AND constraint_name = 'deletion_requests_user_id_fkey') THEN
      alter table "public"."deletion_requests" add constraint "deletion_requests_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE not valid;
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE table_name = 'deletion_requests' AND constraint_name = 'deletion_requests_user_id_fkey') THEN
      alter table "public"."deletion_requests" validate constraint "deletion_requests_user_id_fkey";
    END IF;
  END IF;
END $$;

set check_function_bodies = off;

CREATE OR REPLACE FUNCTION public.get_user_count()
 RETURNS bigint
 LANGUAGE sql
 SECURITY DEFINER
AS $function$
  SELECT COUNT(*) FROM auth.users;
$function$
;

CREATE OR REPLACE FUNCTION public.increment_crag_report_count(target_crag_id uuid)
 RETURNS void
 LANGUAGE plpgsql
AS $function$
BEGIN
  UPDATE crags SET report_count = report_count + 1 WHERE id = target_crag_id;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.increment_gear_click(product_id_input text)
 RETURNS void
 LANGUAGE plpgsql
AS $function$
BEGIN
  INSERT INTO product_clicks (product_id, click_count, updated_at)
  VALUES (product_id_input, 1, NOW())
  ON CONFLICT (product_id)
  DO UPDATE SET
    click_count = product_clicks.click_count + 1,
    updated_at = NOW();
END;
$function$
;

CREATE OR REPLACE FUNCTION public.is_profile_public(user_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE
AS $function$
BEGIN
    RETURN (
        SELECT COALESCE(is_public, true)
        FROM profiles
        WHERE id = user_id
    );
END;
$function$
;

grant delete on table "public"."deletion_requests" to "anon";

grant insert on table "public"."deletion_requests" to "anon";

grant references on table "public"."deletion_requests" to "anon";

grant select on table "public"."deletion_requests" to "anon";

grant trigger on table "public"."deletion_requests" to "anon";

grant truncate on table "public"."deletion_requests" to "anon";

grant update on table "public"."deletion_requests" to "anon";

grant delete on table "public"."deletion_requests" to "authenticated";

grant insert on table "public"."deletion_requests" to "authenticated";

grant references on table "public"."deletion_requests" to "authenticated";

grant select on table "public"."deletion_requests" to "authenticated";

grant trigger on table "public"."deletion_requests" to "authenticated";

grant truncate on table "public"."deletion_requests" to "authenticated";

grant update on table "public"."deletion_requests" to "authenticated";

grant delete on table "public"."deletion_requests" to "service_role";

grant insert on table "public"."deletion_requests" to "service_role";

grant references on table "public"."deletion_requests" to "service_role";

grant select on table "public"."deletion_requests" to "service_role";

grant trigger on table "public"."deletion_requests" to "service_role";

grant truncate on table "public"."deletion_requests" to "service_role";

grant update on table "public"."deletion_requests" to "service_role";

grant delete on table "public"."product_clicks" to "anon";

grant insert on table "public"."product_clicks" to "anon";

grant references on table "public"."product_clicks" to "anon";

grant select on table "public"."product_clicks" to "anon";

grant trigger on table "public"."product_clicks" to "anon";

grant truncate on table "public"."product_clicks" to "anon";

grant update on table "public"."product_clicks" to "anon";

grant delete on table "public"."product_clicks" to "authenticated";

grant insert on table "public"."product_clicks" to "authenticated";

grant references on table "public"."product_clicks" to "authenticated";

grant select on table "public"."product_clicks" to "authenticated";

grant trigger on table "public"."product_clicks" to "authenticated";

grant truncate on table "public"."product_clicks" to "authenticated";

grant update on table "public"."product_clicks" to "authenticated";

grant delete on table "public"."product_clicks" to "service_role";

grant insert on table "public"."product_clicks" to "service_role";

grant references on table "public"."product_clicks" to "service_role";

grant select on table "public"."product_clicks" to "service_role";

grant trigger on table "public"."product_clicks" to "service_role";

grant truncate on table "public"."product_clicks" to "service_role";

grant update on table "public"."product_clicks" to "service_role";


DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Public read user_climbs for public profiles' AND tablename = 'user_climbs') THEN
    create policy "Public read user_climbs for public profiles"
    on "public"."user_climbs"
    as permissive
    for select
    to public
    using ((EXISTS ( SELECT 1
       FROM public.profiles
      WHERE ((profiles.id = user_climbs.user_id) AND (profiles.is_public = true)))));
  END IF;
END $$;



DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Authenticated users can upload' AND tablename = 'objects') THEN
    create policy "Authenticated users can upload"
    on "storage"."objects"
    as permissive
    for insert
    to public
    with check (((bucket_id = 'route-uploads'::text) AND (auth.role() = 'authenticated'::text)));
  END IF;
END $$;




-- Migration: 20260120000000_verification_system.sql

-- =====================================================
-- Community Verification & Corrections System
-- Enables community-driven route quality control
-- Created: 2026-01-20
-- =====================================================

-- Enable PostGIS for location-based queries
CREATE EXTENSION IF NOT EXISTS postgis;

-- =====================================================
-- CLIMB_VERIFICATIONS: Track who verified each route
-- =====================================================
CREATE TABLE IF NOT EXISTS climb_verifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  climb_id UUID NOT NULL REFERENCES climbs(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(climb_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_climb_verifications_climb ON climb_verifications(climb_id);
CREATE INDEX IF NOT EXISTS idx_climb_verifications_user ON climb_verifications(user_id);

-- =====================================================
-- GRADE_VOTES: Community grade consensus
-- =====================================================
CREATE TABLE IF NOT EXISTS grade_votes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  climb_id UUID NOT NULL REFERENCES climbs(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  grade VARCHAR(10) NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(climb_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_grade_votes_climb ON grade_votes(climb_id);
CREATE INDEX IF NOT EXISTS idx_grade_votes_user ON grade_votes(user_id);

-- =====================================================
-- CLIMB_CORRECTIONS: Proposed corrections to route data
-- =====================================================
CREATE TABLE IF NOT EXISTS climb_corrections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  climb_id UUID NOT NULL REFERENCES climbs(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  correction_type VARCHAR(20) NOT NULL CHECK (correction_type IN ('location', 'name', 'line', 'grade')),
  original_value JSONB,
  suggested_value JSONB NOT NULL,
  reason TEXT,

  status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  approval_count INTEGER DEFAULT 0,
  rejection_count INTEGER DEFAULT 0,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  resolved_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_climb_corrections_climb ON climb_corrections(climb_id);
CREATE INDEX IF NOT EXISTS idx_climb_corrections_status ON climb_corrections(status);
CREATE INDEX IF NOT EXISTS idx_climb_corrections_user ON climb_corrections(user_id);

-- =====================================================
-- CORRECTION_VOTES: Approve/reject corrections
-- =====================================================
CREATE TABLE IF NOT EXISTS correction_votes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  correction_id UUID NOT NULL REFERENCES climb_corrections(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  vote_type VARCHAR(10) NOT NULL CHECK (vote_type IN ('approve', 'reject')),
  created_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(correction_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_correction_votes_correction ON correction_votes(correction_id);
CREATE INDEX IF NOT EXISTS idx_correction_votes_user ON correction_votes(user_id);

-- =====================================================
-- RLS POLICIES
-- =====================================================

-- climb_verifications: Public read, authenticated create/delete (own vote only)
ALTER TABLE climb_verifications ENABLE ROW LEVEL SECURITY;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Public read verifications' AND tablename = 'climb_verifications') THEN
    CREATE POLICY "Public read verifications" ON climb_verifications FOR SELECT USING (true);
  END IF;
END $$;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Authenticated create verification' AND tablename = 'climb_verifications') THEN
    CREATE POLICY "Authenticated create verification" ON climb_verifications FOR INSERT WITH CHECK (auth.role() = 'authenticated');
  END IF;
END $$;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Authenticated delete own verification' AND tablename = 'climb_verifications') THEN
    CREATE POLICY "Authenticated delete own verification" ON climb_verifications FOR DELETE USING (auth.uid() = user_id);
  END IF;
END $$;

-- grade_votes: Public read, authenticated create/update/delete (own vote only)
ALTER TABLE grade_votes ENABLE ROW LEVEL SECURITY;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Public read grade votes' AND tablename = 'grade_votes') THEN
    CREATE POLICY "Public read grade votes" ON grade_votes FOR SELECT USING (true);
  END IF;
END $$;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Authenticated create grade vote' AND tablename = 'grade_votes') THEN
    CREATE POLICY "Authenticated create grade vote" ON grade_votes FOR INSERT WITH CHECK (auth.role() = 'authenticated');
  END IF;
END $$;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Authenticated update own grade vote' AND tablename = 'grade_votes') THEN
    CREATE POLICY "Authenticated update own grade vote" ON grade_votes FOR UPDATE USING (auth.uid() = user_id);
  END IF;
END $$;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Authenticated delete own grade vote' AND tablename = 'grade_votes') THEN
    CREATE POLICY "Authenticated delete own grade vote" ON grade_votes FOR DELETE USING (auth.uid() = user_id);
  END IF;
END $$;

-- climb_corrections: Public read, authenticated create (own corrections only)
ALTER TABLE climb_corrections ENABLE ROW LEVEL SECURITY;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Public read corrections' AND tablename = 'climb_corrections') THEN
    CREATE POLICY "Public read corrections" ON climb_corrections FOR SELECT USING (true);
  END IF;
END $$;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Authenticated create correction' AND tablename = 'climb_corrections') THEN
    CREATE POLICY "Authenticated create correction" ON climb_corrections FOR INSERT WITH CHECK (auth.role() = 'authenticated');
  END IF;
END $$;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Authenticated update own correction' AND tablename = 'climb_corrections') THEN
    CREATE POLICY "Authenticated update own correction" ON climb_corrections FOR UPDATE USING (auth.uid() = user_id);
  END IF;
END $$;

-- correction_votes: Public read, authenticated create (own votes only)
ALTER TABLE correction_votes ENABLE ROW LEVEL SECURITY;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Public read correction votes' AND tablename = 'correction_votes') THEN
    CREATE POLICY "Public read correction votes" ON correction_votes FOR SELECT USING (true);
  END IF;
END $$;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Authenticated create correction vote' AND tablename = 'correction_votes') THEN
    CREATE POLICY "Authenticated create correction vote" ON correction_votes FOR INSERT WITH CHECK (auth.role() = 'authenticated');
  END IF;
END $$;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Authenticated delete own correction vote' AND tablename = 'correction_votes') THEN
    CREATE POLICY "Authenticated delete own correction vote" ON correction_votes FOR DELETE USING (auth.uid() = user_id);
  END IF;
END $$;

-- =====================================================
-- HELPER FUNCTION: Check if climb is verified
-- =====================================================
CREATE OR REPLACE FUNCTION is_climb_verified(climb_id UUID)
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM climb_verifications
    WHERE climb_id = is_climb_verified.climb_id
    GROUP BY climb_id
    HAVING COUNT(*) >= 3
  );
END;
$$ LANGUAGE plpgsql STABLE;

-- =====================================================
-- HELPER FUNCTION: Get verification count
-- =====================================================
CREATE OR REPLACE FUNCTION get_verification_count(climb_id UUID)
RETURNS INTEGER AS $$
BEGIN
  RETURN (
    SELECT COUNT(*) FROM climb_verifications
    WHERE climb_id = get_verification_count.climb_id
  );
END;
$$ LANGUAGE plpgsql STABLE;

-- =====================================================
-- HELPER FUNCTION: Get grade vote distribution
-- =====================================================
CREATE OR REPLACE FUNCTION get_grade_vote_distribution(climb_id UUID)
RETURNS TABLE (grade VARCHAR(10), vote_count INTEGER) AS $$
BEGIN
  RETURN QUERY
  SELECT grade, COUNT(*) as vote_count
  FROM grade_votes
  WHERE climb_id = get_grade_vote_distribution.climb_id
  GROUP BY grade
  ORDER BY COUNT(*) DESC;
END;
$$ LANGUAGE plpgsql STABLE;

-- =====================================================
-- HELPER FUNCTION: Get consensus grade
-- =====================================================
CREATE OR REPLACE FUNCTION get_consensus_grade(climb_id UUID)
RETURNS VARCHAR(10) AS $$
BEGIN
  RETURN (
    SELECT grade
    FROM grade_votes
    WHERE climb_id = get_consensus_grade.climb_id
    GROUP BY grade
    ORDER BY COUNT(*) DESC
    LIMIT 1
  );
END;
$$ LANGUAGE plpgsql STABLE;

-- Migration: 20260120000002_seed_and_fix.sql

-- Migration: Seed global regions and crags
-- Purpose: Add popular climbing regions and crags worldwide for launch
-- Created: 2026-01-20

ALTER TABLE regions ADD COLUMN IF NOT EXISTS description TEXT;
ALTER TABLE crags ADD COLUMN IF NOT EXISTS description TEXT;
ALTER TABLE crags ADD COLUMN IF NOT EXISTS access_notes TEXT;

INSERT INTO supabase_migrations.schema_migrations (version) VALUES ('20260120000000_verification_system')
ON CONFLICT (version) DO NOTHING;

DROP POLICY IF EXISTS "Public read verifications" ON climb_verifications;
DROP POLICY IF EXISTS "Authenticated create verification" ON climb_verifications;
DROP POLICY IF EXISTS "Authenticated delete own verification" ON climb_verifications;
DROP POLICY IF EXISTS "Public read grade votes" ON grade_votes;
DROP POLICY IF EXISTS "Authenticated create grade vote" ON grade_votes;
DROP POLICY IF EXISTS "Authenticated update own grade vote" ON grade_votes;
DROP POLICY IF EXISTS "Authenticated delete own grade vote" ON grade_votes;
DROP POLICY IF EXISTS "Public read corrections" ON climb_corrections;
DROP POLICY IF EXISTS "Authenticated create correction" ON climb_corrections;
DROP POLICY IF EXISTS "Authenticated update own correction" ON climb_corrections;
DROP POLICY IF EXISTS "Public read correction votes" ON correction_votes;
DROP POLICY IF EXISTS "Authenticated create correction vote" ON correction_votes;
DROP POLICY IF EXISTS "Authenticated delete own correction vote" ON correction_votes;

CREATE POLICY "Public read verifications" ON climb_verifications FOR SELECT USING (true);
CREATE POLICY "Authenticated create verification" ON climb_verifications FOR INSERT WITH CHECK (auth.role() = 'authenticated');
CREATE POLICY "Authenticated delete own verification" ON climb_verifications FOR DELETE USING (auth.uid() = user_id);
CREATE POLICY "Public read grade votes" ON grade_votes FOR SELECT USING (true);
CREATE POLICY "Authenticated create grade vote" ON grade_votes FOR INSERT WITH CHECK (auth.role() = 'authenticated');
CREATE POLICY "Authenticated update own grade vote" ON grade_votes FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Authenticated delete own grade vote" ON grade_votes FOR DELETE USING (auth.uid() = user_id);
CREATE POLICY "Public read corrections" ON climb_corrections FOR SELECT USING (true);
CREATE POLICY "Authenticated create correction" ON climb_corrections FOR INSERT WITH CHECK (auth.role() = 'authenticated');
CREATE POLICY "Authenticated update own correction" ON climb_corrections FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Public read correction votes" ON correction_votes FOR SELECT USING (true);
CREATE POLICY "Authenticated create correction vote" ON correction_votes FOR INSERT WITH CHECK (auth.role() = 'authenticated');
CREATE POLICY "Authenticated delete own correction vote" ON correction_votes FOR DELETE USING (auth.uid() = user_id);

INSERT INTO regions (id, name, country_code, center_lat, center_lon, description) VALUES
('d00d1601-1f48-4fd8-9441-9ad3b60be4b1', 'Fontainebleau', 'FR', 48.4165, 2.702, 'World-famous sandstone bouldering forest near Paris.'),
('8ef71105-64ee-417c-98cf-0a790d84d73c', 'Grasse', 'FR', 43.7102, 6.934, 'Sandstone bouldering near Nice.'),
('c22b8193-088d-48be-8b8f-0568e32a71ad', 'Verdon', 'FR', 43.7568, 5.764, 'Limestone sport climbing in the stunning Verdon Gorge.'),
('ffe0e34c-93f4-4feb-9196-20523704ee61', 'Calanques', 'FR', 43.2167, 5.45, 'Limestone sport climbing and bouldering near Marseille.'),
('0b060f77-3a6f-4de4-a745-f21890e656e9', 'Albert', 'FR', 50.2865, 2.774, 'Sandstone bouldering in northern France.'),
('506ca344-b714-4af6-a730-4da55a92628c', 'Buoux', 'FR', 43.8233, 5.3933, 'Historic limestone sport climbing area in Provence.'),
('3f43b7b6-db85-4b4e-a9c2-304a218596ed', 'Céüse', 'FR', 44.2833, 5.8333, 'Limestone sport climbing with classic long routes.'),
('96f6d71d-9fef-4806-a3bb-aa54e4b66fd1', 'Chamonix', 'FR', 45.9237, 6.8694, 'Alpine climbing capital.'),
('582fd7dc-17d6-46c9-aeb7-13b696984847', 'Annecy', 'FR', 45.8992, 6.1293, 'Limestone and granite climbing near Lake Annecy.'),
('93ef1c65-93a0-4385-9993-875cfc5e3933', 'Magic Wood', 'CH', 46.8667, 9.0333, 'World-class sandstone bouldering in the Swiss Alps.'),
('84a0095e-71e5-4276-8b7f-e2efb7528a7e', 'Chironico', 'CH', 46.45, 8.8, 'Sandstone bouldering in Ticino.'),
('ba15cedd-3eeb-46e8-aa5c-2a0847fc5c35', 'Cresciano', 'CH', 46.3167, 8.8333, 'Sandstone bouldering in Ticino.'),
('971e53e4-535b-4b95-be84-0de3b942eacb', 'Finale Ligure', 'IT', 44.17, 8.34, 'Limestone sport climbing paradise on the Italian Riviera.'),
('7322e708-7cbf-4037-bd19-c2fb1ccd1b49', 'Arco', 'IT', 45.9167, 10.8833, 'Limestone sport climbing in the Italian Alps.'),
('da2901eb-0149-4ed0-a89a-71f5aa2373d2', 'Sardinia', 'IT', 40.5, 9.0, 'Limestone sport climbing and deep water soloing on the island.'),
('eb408c34-a6e9-48b1-a41f-869d72667829', 'Siurana', 'ES', 41.2667, 0.9667, 'Limestone sport climbing in Catalonia.'),
('9bcc9fd3-25a4-4ee1-9270-94f5ff478100', 'Margalef', 'ES', 41.4833, 0.75, 'Limestone sport climbing in Montserrat area.'),
('780414a2-1b4b-4eeb-b69f-d5ae8cc94190', 'Rodellar', 'ES', 42.3333, -0.0667, 'Limestone sport climbing in the Sierra de Guara.'),
('13a1a858-8aaa-44d4-b1fd-17bca4795a9e', 'Albarracín', 'ES', 40.4, -1.45, 'Sandstone sport climbing in central Spain.'),
('83cb124f-ce37-4b66-b9f1-176239a934fb', 'Cádiz', 'ES', 36.5, -6.25, 'Coastal limestone and sandstone.'),
('db6b8558-a1d8-43af-9d4e-a238f8019bd6', 'Mallorca', 'ES', 39.6167, 3.0, 'Limestone sport climbing on the Balearic Islands.'),
('fd77c1f0-d316-450d-b425-80ca06c4c292', 'Arrábida', 'PT', 38.4667, -9.0, 'Limestone sport climbing near Lisbon.'),
('10ba4de6-f6af-4110-978d-96387234df6b', 'Bertrix', 'BE', 49.85, 5.25, 'Sandstone bouldering in the Ardennes.'),
('81e0ffce-5bf5-4cb9-9f00-a1864d566de1', 'Rochehaut', 'BE', 49.8333, 5.2833, 'Sandstone bouldering near the Ourthe River.'),
('c512a71e-0b43-4f12-8d88-be76cf04107e', 'Portland', 'GB', 50.5667, -2.45, 'Portland limestone in Dorset.'),
('9ce14517-cfaa-4bde-9cb5-4569885e0127', 'Peak District', 'GB', 53.25, -1.5, 'Sandstone trad climbing.'),
('8b73700f-7d47-4b6e-87d8-60bace4cbc98', 'Yorkshire', 'GB', 54.0, -1.5, 'Gritstone and limestone.'),
('c4241ea6-bdaa-4765-bff5-2ed6cb8ffea8', 'Lake District', 'GB', 54.5, -3.0, 'Mountain rock and slate.'),
('900ad305-e6df-47fa-bc89-1d7fa5f53cf1', 'Cornwall', 'GB', 50.2667, -5.05, 'Coastal granite and serpentinite.'),
('350100db-930b-440a-b70e-5a334d3813b0', 'Scotland', 'GB', 56.0, -4.0, 'Highland granite and schist.'),
('7c731ece-cb43-4753-b833-1c803e72799c', 'Devon', 'GB', 50.75, -3.75, 'Limestone and sandstone.'),
('7e8da1db-5405-404a-8e94-90bced5544e1', 'Bishop', 'CA', 37.3861, -118.3868, 'Limestone bouldering at Happythought and The Buttermilks.'),
('d7eb80ce-9089-42a7-86dd-b981084cbc9b', 'Hueco Tanks', 'TX', 31.9, -105.9667, 'Desert boulders with holds like "the Moon".'),
('cfafe4c1-2d8a-4254-a6cf-31cda83eedda', 'Red River Gorge', 'KY', 37.8, -83.0, 'Limestone sport climbing paradise.'),
('5363e58a-1d56-4a3a-95a6-c63511d2af0f', 'Joe''s Valley', 'UT', 39.5, -111.0, 'Sandstone bouldering in Utah canyon.'),
('beef2777-d4a6-4791-b46d-954b99b5e5e5', 'Indian Creek', 'UT', 38.0333, -109.5, 'Sandstone splitter cracks.'),
('9f3f4dda-f736-4e42-bdf5-2aa0aa9ec724', 'Yosemite', 'CA', 37.745, -119.5936, 'Granite big walls and sport.'),
('3d0e91f0-66c3-4b89-b4df-295eb33e2b57', 'Red Rocks', 'NV', 36.1333, -115.4333, 'Desert sandstone sport and trad.'),
('9b6c84c9-0628-417a-ae90-24b8ad480310', 'Boulder Canyon', 'CO', 40.0, -105.5, 'Granite and gneiss sport.'),
('82c91e57-d519-4aab-a5df-7c1d070e8ca0', 'Fort Collins', 'CO', 40.55, -105.07, 'Horsetooth and Greyrock areas.'),
('761f4cfb-607c-4d7c-8689-97e889aaf87b', 'Lake Tahoe', 'CA', 38.95, -119.95, 'Granite bouldering and sport.'),
('51d6f36d-0c25-435d-aef3-568d526b2eaa', 'Little Cottonwood', 'UT', 40.5667, -111.8, 'Granite sport at Gate Buttress.'),
('c52116ff-1e4c-4f9c-88ed-d845ee84afae', 'Flagstaff', 'AZ', 35.2, -111.65, 'Volcanic rock.'),
('d16f3ec8-4227-44c3-b59d-54e16ce5516f', 'Joshua Tree', 'CA', 33.9, -115.9, 'Desert granite.'),
('ebb13272-5d82-4aee-8de6-ab22deb4aa72', 'Owens River Gorge', 'CA', 37.8, -118.9, 'Limestone sport climbing.'),
('f211367b-bb5f-469f-bf31-c0428558a885', 'Maple Canyon', 'UT', 39.85, -111.75, 'Conglomerate sport climbing.'),
('abe2b690-393b-4ac2-963e-9807b3233921', 'Smith Rocks', 'OR', 44.3667, -121.15, 'Limestone sport climbing.'),
('3b3da8c8-5263-4938-b26a-422717122f62', 'Linville Gorge', 'NC', 35.95, -81.95, 'Limestone and gneiss.'),
('73884dad-8e60-49ea-84f6-63b5d209d465', 'New River Gorge', 'WV', 38.0, -81.0, 'Limestone sport climbing.'),
('18ecd6c2-a40f-4323-a56e-b2e6fd02cdcd', 'Rumney', 'NH', 43.8, -71.8, 'Limestone sport climbing.'),
('2437e2b5-7e61-40aa-9690-aa9bbf4cc53b', 'Shawangunks', 'NY', 41.7, -74.3, 'Historic American climbing.'),
('3faa8c8d-1b74-4677-9256-f741248bbe78', 'Squamish', 'BC', 49.7, -123.15, 'Granite. The Chief, Smoke Bluffs.'),
('67aa15e6-a042-497f-a9d6-018fd6e0164e', 'Canmore', 'AB', 51.0833, -115.35, 'Limestone and granite.'),
('ca2806c7-86e0-4a7b-abaf-5e119e3a303e', 'Montreal', 'QC', 45.5, -73.6, 'Urban climbing.'),
('46dd6679-1e73-40fe-9ea9-fdb6ba0a7545', 'Ottawa', 'ON', 45.4167, -75.7, 'Gneiss boulders.'),
('1d4f87c4-de54-4bfa-be90-b74c8f63582a', 'Jasper', 'AB', 52.8833, -118.05, 'Alpine granite.'),
('f313715b-898e-49cc-93c4-7b85106ff210', 'Rocklands', 'ZA', -32.4833, 19.0333, 'World-famous sandstone bouldering.'),
('39827b3a-5568-4b7b-9902-141932145ffa', 'Cederberg', 'ZA', -32.5, 19.0, 'Sandstone boulders.'),
('67a73691-f7de-4219-9179-4a124b94efbf', 'Montagne d''Or', 'RE', -21.1, 55.6, 'Bouldering on Réunion Island.'),
('09fa8192-5aa6-4009-9eba-044d9dc23f55', 'Sydney', 'AU', -33.87, 151.21, 'Sandstone at Nowra, Mount York.'),
('9cf7649d-1117-4405-a67e-961c7351ebd7', 'Wanaka', 'NZ', -44.7, 169.15, 'Granite bouldering at Matrix.'),
('91427529-14ba-4b3f-af2a-ad7389975818', 'Queenstown', 'NZ', -45.03, 168.66, 'Alpine setting.'),
('7a325beb-9538-421b-9e11-48208fb58c55', 'Brisbane', 'AU', -27.5, 153.0, 'Sandstone.'),
('4a6eb3af-e4db-49f9-ac11-c31bc1dfcea0', 'Yangshuo', 'CN', 24.7833, 110.5, 'Limestone karst.'),
('b84cfeea-01c1-4aed-9653-348b4c3c3b30', 'Narita', 'JP', 35.7833, 140.3, 'Bouldering near Tokyo.'),
('25012d4e-417e-4765-8d74-d43d28ce7bd5', 'Longdong', 'TW', 24.15, 121.65, 'Coastal climbing.'),
('73cc93b1-b2e4-4095-b8aa-868ce69e080a', 'Kalymnos', 'GR', 36.95, 26.9833, 'World-famous limestone island.'),
('98cd4f88-5e20-46cd-8559-f425161005fe', 'Meteora', 'GR', 39.7167, 21.6333, 'Limestone pillars with monasteries.'),
('c3861c06-23dc-4f3f-a418-49bb1fec062e', 'Mendoza', 'AR', -32.8833, -68.8333, 'Granite and limestone.'),
('7c9b4ecd-9ec9-4e86-bf35-752012bb5a5f', 'Sierra de la Ventana', 'AR', -38.0, -62.0, 'Sandstone climbing.'),
('b93249a9-04af-4697-8251-30a838fd2e9a', 'El Potrero Chico', 'MX', 25.95, -100.5, 'Limestone sport climbing.'),
('e511b0a7-9e86-4639-89ad-4d9476cde3c0', 'Yucatán', 'MX', 20.98, -89.5, 'Cenotes and limestone.'),
('ce168e68-061e-4126-9800-785a5f53f15a', 'Costa Rica', 'CR', 9.75, -83.75, 'Limestone near Caribbean.'),
('9d5a077b-bcc9-456e-b314-eefb4d130d46', 'Guernsey', 'GG', 49.45, -2.58, 'Granite boulders and cliffs.'),
('e15c7b80-67f5-4245-b04d-5888f0a16304', 'Jersey', 'JE', 49.2, -2.1, 'Granite bouldering and sea cliffs.'),
('d0f80657-a7f9-430f-a5f7-1a1d6ebb95df', 'Frankenjura', 'DE', 49.65, 11.35, 'Limestone sport climbing.'),
('6731e891-1182-4d40-8817-06767eda5b70', 'Saxon Switzerland', 'DE', 50.9167, 14.2, 'Sandstone pillars.'),
('728f5a49-1c42-450b-8ad3-82f3f808d2aa', 'Norway', 'NO', 61.0, 8.0, 'Granite and gneiss.')
ON CONFLICT (id) DO NOTHING;

INSERT INTO crags (id, name, region_id, latitude, longitude, type, description, access_notes, rock_type) VALUES
('84186445-0106-473a-9650-010eede151ee', '95', 'd00d1601-1f48-4fd8-9441-9ad3b60be4b1', 48.4165, 2.702, 'boulder', 'Iconic sector with classic problems from 5+ to 8C+.', 'Park at 95 parking, 15 min walk into forest.', 'sandstone'),
('201d5892-50b2-4d0d-b56a-df0717e6eec6', '96', 'd00d1601-1f48-4fd8-9441-9ad3b60be4b1', 48.42, 2.705, 'boulder', 'Adjacent to 95, similar grade range.', 'Shared parking with 95.', 'sandstone'),
('0147c66f-3a17-4b91-850f-c0a0ab6127f4', '97', 'd00d1601-1f48-4fd8-9441-9ad3b60be4b1', 48.425, 2.71, 'boulder', 'Higher grade sector.', '20 min walk from 95 parking.', 'sandstone'),
('95ebd728-e06a-45ea-bbba-2d0788e566ec', 'Cuvier', 'd00d1601-1f48-4fd8-9441-9ad3b60be4b1', 48.4, 2.68, 'boulder', 'Large forest area.', 'Main parking for Cuvier.', 'sandstone'),
('df6bb8c1-f32c-4af1-bb93-0b0f3785974c', 'Roche aux Sabots', 'd00d1601-1f48-4fd8-9441-9ad3b60be4b1', 48.39, 2.67, 'boulder', 'Popular sector.', 'Parking at Franchard.', 'sandstone'),
('98a5d940-8ca3-4f10-943b-08b974d009f0', 'Apremont', 'd00d1601-1f48-4fd8-9441-9ad3b60be4b1', 48.43, 2.73, 'boulder', 'Remote sector.', 'Longer walk required.', 'sandstone'),
('cd9afe35-9acb-44bb-920e-b0db7932b5da', 'Magic Wood', '93ef1c65-93a0-4385-9993-875cfc5e3933', 46.8667, 9.0333, 'boulder', 'World-class sandstone.', 'Parking near Valzeina.', 'sandstone'),
('e2844d2b-1b37-4acc-865c-10a382f0dc9d', 'Chironico', '84a0095e-71e5-4276-8b7f-e2efb7528a7e', 46.45, 8.8, 'boulder', 'Powerful problems.', 'Parking in village.', 'sandstone'),
('5b88f2a8-567b-4521-a025-fa284c56e290', 'Cresciano', 'ba15cedd-3eeb-46e8-aa5c-2a0847fc5c35', 46.3167, 8.8333, 'boulder', 'Powerful boulders.', 'Parking at lot.', 'sandstone'),
('f980409d-ad57-45aa-93b2-1b7151ea765a', 'Finale Ligure', '971e53e4-535b-4b95-be84-0de3b942eacb', 44.17, 8.34, 'sport', 'Sport climbing paradise.', 'Many campgrounds.', 'limestone'),
('b1f3d7f0-9d88-4f0e-ab30-a8b8f3b82345', 'Arco', '7322e708-7cbf-4037-bd19-c2fb1ccd1b49', 45.9167, 10.8833, 'sport', 'World Cup venue.', 'Camping at Lake Garda.', 'limestone'),
('06eb53f9-1de6-48ab-a76e-55d1f25f287d', 'Siurana', 'eb408c34-a6e9-48b1-a41f-869d72667829', 41.2667, 0.9667, 'sport', 'Steep terrain.', 'Parking at crag.', 'limestone'),
('044f203e-1f0c-4f7e-9cfc-b8c8ddd0a586', 'Margalef', '9bcc9fd3-25a4-4ee1-9270-94f5ff478100', 41.4833, 0.75, 'sport', 'Technical climbing.', 'Parking at village.', 'limestone'),
('b595d3cd-2a87-4ae4-8621-2bf3773e3044', 'Rodellar', '780414a2-1b4b-4eeb-b69f-d5ae8cc94190', 42.3333, -0.0667, 'sport', 'Steep and pumpy.', 'Campground.', 'limestone'),
('3894a820-ab30-415d-b48c-c0f8236f6627', 'Portland', 'c512a71e-0b43-4f12-8d88-be76cf04107e', 50.5667, -2.45, 'sport', 'Sea cliffs.', 'Portland quarries.', 'limestone'),
('62b6e6b7-dca0-405c-a025-5fbe474a2d55', 'Stanage', '8b73700f-7d47-4b6e-87d8-60bace4cbc98', 53.35, -1.6, 'trad', 'Gritstone edge.', 'Robin Hood pub.', 'gritstone'),
('edf818e8-8ecc-4867-ae77-65f24debd61c', 'Gordale Scar', '8b73700f-7d47-4b6e-87d8-60bace4cbc98', 54.0667, -2.15, 'trad', 'Classic gritstone.', 'National Trust.', 'gritstone'),
('8c27b043-f63e-42ed-b3e4-1ba650ece6bb', 'Happythought', '7e8da1db-5405-404a-8e94-90bced5544e1', 37.3861, -118.3868, 'boulder', 'Limestone bouldering.', 'Pine Creek Lodge.', 'limestone'),
('377dc643-d86c-48d9-b829-daa92d23cb35', 'The Buttermilks', '7e8da1db-5405-404a-8e94-90bced5544e1', 37.37, -118.4, 'boulder', 'Granite boulders.', 'Buttermilk Rd.', 'granite'),
('3ce32906-189c-44fb-b032-8eaf1610d747', 'Hueco Tanks', 'd7eb80ce-9089-42a7-86dd-b981084cbc9b', 31.9, -105.9667, 'boulder', 'Desert boulders.', 'Park entry fee.', 'sandstone'),
('27b33107-c383-4aad-a6a4-131e419bf9ea', 'PMRP', 'cfafe4c1-2d8a-4254-a6cf-31cda83eedda', 37.8, -83.0, 'sport', '500+ routes.', 'Miguel''s Pizza.', 'limestone'),
('0ff2a2b5-0f19-4f8c-ae74-388781f872fb', 'Left Fork', '5363e58a-1d56-4a3a-95a6-c63511d2af0f', 39.5, -111.0, 'boulder', 'Circuit problems.', 'Forest camping.', 'sandstone'),
('d2247a2f-6086-40f5-9fda-cd6dac3b5d27', 'Right Fork', '5363e58a-1d56-4a3a-95a6-c63511d2af0f', 39.48, -110.98, 'boulder', 'Classic circuits.', 'Shared parking.', 'sandstone'),
('03201fce-5582-48ac-965d-788a8aad0ca3', 'Indian Creek', 'beef2777-d4a6-4791-b46d-954b99b5e5e5', 38.0333, -109.5, 'trad', 'Splitter cracks.', 'BLM camping.', 'sandstone'),
('8b3220c9-bb23-47e9-b747-5a1afa785af0', 'Camp 4', '9f3f4dda-f736-4e42-bdf5-2aa0aa9ec724', 37.745, -119.5936, 'sport', 'Yosemite granite.', 'National Park.', 'granite'),
('e73a07dc-fc36-4572-812e-405d7f532062', 'Red Rocks', '3d0e91f0-66c3-4b89-b4df-295eb33e2b57', 36.1333, -115.4333, 'sport', 'Desert sandstone.', 'Red Rock Canyon.', 'sandstone'),
('4fd733cf-4e00-4609-86aa-681d791c3299', 'Rumney', '18ecd6c2-a40f-4323-a56e-b2e6fd02cdcd', 43.8, -71.8, 'sport', '200+ routes.', 'Parking fee.', 'limestone'),
('2bd21adb-3e72-412f-bded-9d32be4b10a1', 'The Chief', '3faa8c8d-1b74-4677-9256-f741248bbe78', 49.7, -123.15, 'trad', 'Grand Wall.', 'Sea to Sky.', 'granite'),
('a90ac6ca-4c6f-42bb-b075-c54f12a50464', 'Smoke Bluffs', '3faa8c8d-1b74-4677-9256-f741248bbe78', 49.72, -123.1, 'sport', 'Urban Squamish.', 'Mamquam Road.', 'granite'),
('d3a44fd8-5228-4dbb-bb5e-d598b65bbc87', 'Northern', 'f313715b-898e-49cc-93c4-7b85106ff210', -32.4833, 19.0333, 'boulder', 'Main area.', 'Conservancy entry.', 'sandstone'),
('aa47b098-8ef3-4e9c-b8a6-862787144cc2', 'Playground', '39827b3a-5568-4b7b-9902-141932145ffa', -32.5, 19.0, 'boulder', 'Classic circuit.', 'Cederberg.', 'sandstone'),
('be49c3b4-28e2-42c0-a988-2a8464f982f3', 'Torque Boulder', '9d5a077b-bcc9-456e-b314-eefb4d130d46', 49.5091, -2.518, 'boulder', 'Headland boulder.', 'Coastal path.', 'granite'),
('8b4a6cc0-b3cd-423a-b536-f477e99bcb51', 'Jerbourg', '9d5a077b-bcc9-456e-b314-eefb4d130d46', 49.45, -2.53, 'boulder', 'Sea cliffs.', 'Coastguard.', 'granite'),
('495e115e-fc48-40c8-b24a-56aaa804b331', 'Nowra', '09fa8192-5aa6-4009-9eba-044d9dc23f55', -34.85, 150.6, 'boulder', 'Classic circuit.', 'Nowra Park.', 'sandstone'),
('2441fe89-0fa8-46c9-a549-ef8d6b64dda7', 'Mount York', '09fa8192-5aa6-4009-9eba-044d9dc23f55', -33.75, 150.25, 'boulder', 'Historic boulders.', 'Mount York Rd.', 'sandstone'),
('64023ebf-b7c4-48e2-9a51-31d10194226c', 'Matrix', '9cf7649d-1117-4405-a67e-961c7351ebd7', -44.7, 169.15, 'boulder', 'Granite boulders.', 'Matrix area.', 'granite'),
('ac3e07e6-01b9-42ef-ad80-9a1d3833e269', 'Yangshuo', '4a6eb3af-e4db-49f9-ac11-c31bc1dfcea0', 24.7833, 110.5, 'sport', 'Limestone karst.', 'Guesthouses.', 'limestone'),
('481552b3-7808-46d5-b9ac-f3ade0adedb2', 'Kalymnos', '73cc93b1-b2e4-4095-b8aa-868ce69e080a', 36.95, 26.9833, 'sport', 'Island paradise.', 'Ferry.', 'limestone'),
('a690321c-3c46-4e29-b0c3-68ad7a8a05ec', 'El Potrero Chico', 'b93249a9-04af-4697-8251-30a838fd2e9a', 25.95, -100.5, 'sport', '600m+ walls.', 'Campground.', 'limestone'),
('81d549a9-9d3b-4819-9aa4-49c9fc7b224c', 'Frankenjura', 'd0f80657-a7f9-430f-a5f7-1a1d6ebb95df', 49.65, 11.35, 'sport', '5000+ routes.', 'Beer culture.', 'limestone'),
('a5e0042b-6a26-46f8-a1dc-b824a3cd32e9', 'Saxon Switzerland', '6731e891-1182-4d40-8817-06767eda5b70', 50.9167, 14.2, 'trad', 'Sandstone pillars.', 'Bastei.', 'sandstone')
ON CONFLICT (id) DO NOTHING;

-- Migration: 20260120000003_create_profile_trigger.sql

-- =====================================================
-- MIGRATION: Auto-create profiles for new users
-- Created: 2026-01-20
-- =====================================================

-- Function to handle new user profile creation
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, theme_preference)
  VALUES (NEW.id, 'system');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger to call function on new user signup
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Migration: 20260121074609_fix_otp_trigger_null_check.sql

-- =====================================================
-- Fix Email OTP Login - Null-Safe app_metadata Check
-- Created: 2026-01-21
-- =====================================================

-- Fix the handle_user_metadata_update function to handle null app_metadata
-- The original function fails during email OTP because app_metadata is null
-- This fix uses COALESCE to safely handle null values

CREATE OR REPLACE FUNCTION public.handle_user_metadata_update()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.raw_user_meta_data IS DISTINCT FROM OLD.raw_user_meta_data
     AND COALESCE(NEW.app_metadata->>'provider', '') = 'google' THEN
    UPDATE public.profiles
    SET
      first_name = COALESCE(
        NEW.raw_user_meta_data->>'given_name',
        split_part(NEW.raw_user_meta_data->>'full_name', ' ', 1)
      ),
      last_name = COALESCE(
        NEW.raw_user_meta_data->>'family_name',
        split_part(NEW.raw_user_meta_data->>'full_name', ' ', 2)
      ),
      avatar_url = COALESCE(
        NEW.raw_user_meta_data->>'avatar_url',
        NEW.raw_user_meta_data->>'picture'
      ),
      email = COALESCE(NEW.email, email),
      updated_at = NOW()
    WHERE id = NEW.id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Migration: 20260121080000_fix_app_metadata_field.sql

-- =====================================================
-- Fix app_metadata field access in trigger
-- Created: 2026-01-21
-- =====================================================

-- The previous trigger fails during OTP login because NEW.app_metadata
-- may not be accessible. This fix safely handles missing/null metadata.

CREATE OR REPLACE FUNCTION public.handle_user_metadata_update()
RETURNS TRIGGER AS $$
DECLARE
  provider_text text;
BEGIN
  BEGIN
    provider_text := NEW.app_metadata->>'provider';
  EXCEPTION
    WHEN undefined_column THEN
      provider_text := NULL;
  END;

  IF NEW.raw_user_meta_data IS DISTINCT FROM OLD.raw_user_meta_data
     AND COALESCE(provider_text, '') = 'google' THEN
    UPDATE public.profiles SET
      first_name = COALESCE(NEW.raw_user_meta_data->>'given_name', split_part(NEW.raw_user_meta_data->>'full_name', ' ', 1)),
      last_name = COALESCE(NEW.raw_user_meta_data->>'family_name', split_part(NEW.raw_user_meta_data->>'full_name', ' ', 2)),
      avatar_url = COALESCE(NEW.raw_user_meta_data->>'avatar_url', NEW.raw_user_meta_data->>'picture'),
      email = COALESCE(NEW.email, email),
      updated_at = NOW()
    WHERE id = NEW.id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Migration: 20260122000000_simplified_flagging_system.sql

-- =====================================================
-- Simplified Flagging System
-- Any authenticated user can flag, only admins can resolve
-- Created: 2026-01-22
-- =====================================================

-- =====================================================
-- Add is_admin to profiles
-- =====================================================
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS is_admin BOOLEAN DEFAULT false;

-- =====================================================
-- CLIMB_FLAGS: Report issues with climbs
-- =====================================================
CREATE TABLE IF NOT EXISTS climb_flags (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    climb_id UUID NOT NULL REFERENCES climbs(id) ON DELETE CASCADE,
    crag_id UUID REFERENCES crags(id) ON DELETE SET NULL,
    flagger_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    flag_type VARCHAR(50) NOT NULL CHECK (flag_type IN ('location', 'route_line', 'route_name', 'image_quality', 'wrong_crag', 'other')),
    comment TEXT NOT NULL,
    status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'resolved')),
    action_taken VARCHAR(20) CHECK (action_taken IN ('keep', 'edit', 'remove')),
    resolved_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    resolved_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_climb_flags_climb ON climb_flags(climb_id);
CREATE INDEX IF NOT EXISTS idx_climb_flags_status ON climb_flags(status);
CREATE INDEX IF NOT EXISTS idx_climb_flags_flagged_by ON climb_flags(flagger_id);
CREATE INDEX IF NOT EXISTS idx_climb_flags_resolved_by ON climb_flags(resolved_by);

-- =====================================================
-- NOTIFICATIONS: Alert users
-- =====================================================
CREATE TABLE IF NOT EXISTS notifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    type VARCHAR(50) NOT NULL,
    title TEXT NOT NULL,
    message TEXT,
    link TEXT,
    is_read BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_notifications_unread ON notifications(user_id, is_read) WHERE is_read = false;
CREATE INDEX IF NOT EXISTS idx_notifications_created ON notifications(created_at);

-- =====================================================
-- RLS POLICIES
-- =====================================================
-- Profiles: Add update policy for is_admin (admin only)
-- =====================================================
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Admin update profiles' AND tablename = 'profiles') THEN
        CREATE POLICY "Admin update profiles" ON profiles FOR UPDATE
            USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_admin = true))
            WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_admin = true));
    END IF;
END $$;

-- =====================================================
-- Drop crag_members table (no longer needed)
-- =====================================================
DROP TABLE IF EXISTS crag_members CASCADE;

DO $$
BEGIN
    ALTER TABLE climb_flags ENABLE ROW LEVEL SECURITY;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Public read climb_flags' AND tablename = 'climb_flags') THEN
        CREATE POLICY "Public read climb_flags" ON climb_flags FOR SELECT USING (true);
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Authenticated create climb_flags' AND tablename = 'climb_flags') THEN
        CREATE POLICY "Authenticated create climb_flags" ON climb_flags FOR INSERT WITH CHECK (auth.role() = 'authenticated');
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Admin manage climb_flags' AND tablename = 'climb_flags') THEN
        CREATE POLICY "Admin manage climb_flags" ON climb_flags FOR ALL
            USING (
                EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_admin = true)
            )
            WITH CHECK (
                EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_admin = true)
            );
    END IF;
END $$;

-- notifications: User read/write own, public read (admin can read all)
DO $$
BEGIN
    ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'User read own notifications' AND tablename = 'notifications') THEN
        CREATE POLICY "User read own notifications" ON notifications FOR SELECT USING (auth.uid() = user_id OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_admin = true));
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Authenticated create notifications' AND tablename = 'notifications') THEN
        CREATE POLICY "Authenticated create notifications" ON notifications FOR INSERT WITH CHECK (auth.role() = 'authenticated');
    END IF;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'User update own notifications' AND tablename = 'notifications') THEN
        CREATE POLICY "User update own notifications" ON notifications FOR UPDATE USING (auth.uid() = user_id);
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Admin read all notifications' AND tablename = 'notifications') THEN
        CREATE POLICY "Admin read all notifications" ON notifications FOR SELECT USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_admin = true));
    END IF;
END $$;

-- profiles: Add update policy for is_admin (admin only)
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Admin update profiles' AND tablename = 'profiles') THEN
        CREATE POLICY "Admin update profiles" ON profiles FOR UPDATE
            USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_admin = true))
            WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_admin = true));
    END IF;
END $$;

-- Migration: 20260122163838_add_prod_columns_for_data_import.sql

-- =====================================================
-- Add columns needed for production data import
-- Created: 2026-01-22
-- =====================================================

-- Add crag_id to climbs
ALTER TABLE public.climbs ADD COLUMN IF NOT EXISTS crag_id uuid;

-- Add missing columns to profiles
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS display_name text;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS bio text;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS gender text;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS country varchar(100);
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS country_code varchar(2);
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS preferred_grade_system varchar(10) DEFAULT 'french';
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS preferred_style varchar(20) DEFAULT 'sport';
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS total_climbs integer DEFAULT 0;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS total_points integer DEFAULT 0;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS highest_grade text;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS name text;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS default_location text;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS default_location_name text;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS default_location_lat numeric(10,8);
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS default_location_lng numeric(11,8);
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS default_location_zoom integer;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS grade_system varchar(10) DEFAULT 'font';
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS units varchar(10) DEFAULT 'metric';
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS is_public boolean DEFAULT true;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS theme_preference varchar(20) DEFAULT 'system';
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS email text;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS name_updated_at timestamptz;

-- Add gender constraint
DO $$ BEGIN
    ALTER TABLE public.profiles ADD CONSTRAINT profiles_gender_check CHECK (gender = ANY (ARRAY['male', 'female', 'other', 'prefer_not_to_say']));
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- Add missing columns to crags
ALTER TABLE public.crags ADD COLUMN IF NOT EXISTS tide_dependency varchar(20);

-- Add missing columns to images
ALTER TABLE public.images ADD COLUMN IF NOT EXISTS is_verified boolean DEFAULT false;
ALTER TABLE public.images ADD COLUMN IF NOT EXISTS verification_count integer DEFAULT 0;

-- Migration: 20260123000000_add_image_id_to_climb_flags.sql

-- =====================================================
-- Add image_id to climb_flags
-- Allows flagging images directly (not just climbs)
-- Created: 2026-01-22
-- =====================================================

ALTER TABLE climb_flags ADD COLUMN IF NOT EXISTS image_id UUID REFERENCES images(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_climb_flags_image ON climb_flags(image_id);

-- Migration: 20260123000002_make_climb_id_nullable.sql

-- Make climb_id nullable for image flags
-- Image flags don't require a climb_id, so we need to allow NULL values

ALTER TABLE climb_flags ALTER COLUMN climb_id DROP NOT NULL;

-- Migration: 20260123174919_add_tos_acceptance.sql

ALTER TABLE profiles ADD COLUMN IF NOT EXISTS tos_accepted_at TIMESTAMPTZ;

-- Migration: 20260125000000_add_welcome_email_column.sql

-- Migration: Add welcome_email_sent_at column to profiles
-- Purpose: Track when welcome emails are sent to prevent duplicate sends

ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS welcome_email_sent_at TIMESTAMPTZ;

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_profiles_welcome_email_sent_at 
ON public.profiles(welcome_email_sent_at) WHERE welcome_email_sent_at IS NULL;

-- Migration: 20260125000001_add_deleted_accounts_log.sql

-- Create table to log deleted accounts for audit trail
-- This table persists even after user deletion from auth.users

CREATE TABLE IF NOT EXISTS public.deleted_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  email TEXT NOT NULL,
  deleted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  delete_route_uploads BOOLEAN NOT NULL DEFAULT false,
  metadata JSONB DEFAULT '{}'::jsonb
);

-- Index for querying deleted accounts by user_id
CREATE INDEX IF NOT EXISTS idx_deleted_accounts_user_id ON public.deleted_accounts(user_id);

-- Index for querying deleted accounts by email (for searching)
CREATE INDEX IF NOT EXISTS idx_deleted_accounts_email ON public.deleted_accounts(email);

-- Index for querying recent deletions
CREATE INDEX IF NOT EXISTS idx_deleted_accounts_deleted_at ON public.deleted_accounts(deleted_at DESC);

-- Grant read access to authenticated users (for viewing their own deletion record)
GRANT SELECT ON TABLE public.deleted_accounts TO authenticated;
GRANT SELECT ON TABLE public.deleted_accounts TO anon;

-- Grant insert access to service_role (for logging deletions)
GRANT INSERT, DELETE ON TABLE public.deleted_accounts TO service_role;

-- Migration: 20260125000002_allow_null_crag_coordinates.sql

-- Allow crag coordinates to be NULL (will be calculated from climbs later)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_attribute a
    JOIN pg_class c ON c.oid = a.attrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relname = 'crags'
      AND a.attname = 'latitude'
      AND a.attnotnull
  ) THEN
    ALTER TABLE public.crags ALTER COLUMN latitude DROP NOT NULL;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM pg_attribute a
    JOIN pg_class c ON c.oid = a.attrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relname = 'crags'
      AND a.attname = 'longitude'
      AND a.attnotnull
  ) THEN
    ALTER TABLE public.crags ALTER COLUMN longitude DROP NOT NULL;
  END IF;
END $$;

-- Migration: 20260126000000_impact_metrics_functions.sql

-- Migration: Add impact metrics RPC functions
-- Purpose: Create reusable functions for counting community impact metrics

set check_function_bodies = off;

CREATE OR REPLACE FUNCTION public.get_verified_routes_count()
 RETURNS bigint
 LANGUAGE sql
 SECURITY DEFINER
AS $function$
  SELECT COUNT(*) FROM climbs
  WHERE (verification_count >= 3 OR is_verified = true)
  AND deleted_at IS NULL;
$function$
;

CREATE OR REPLACE FUNCTION public.get_total_sends_count()
 RETURNS bigint
 LANGUAGE sql
 SECURITY DEFINER
AS $function$
  SELECT COUNT(*) FROM logs
  WHERE status IN ('completed', 'flash', 'onsight');
$function$
;

CREATE OR REPLACE FUNCTION public.get_boulders_with_gps_count()
 RETURNS bigint
 LANGUAGE sql
 SECURITY DEFINER
AS $function$
  SELECT COUNT(DISTINCT c.crag_id)
  FROM climbs c
  INNER JOIN crags cr ON c.crag_id = cr.id
  WHERE c.deleted_at IS NULL
  AND cr.latitude IS NOT NULL
  AND cr.longitude IS NOT NULL;
$function$
;

CREATE OR REPLACE FUNCTION public.get_community_photos_count()
 RETURNS bigint
 LANGUAGE sql
 SECURITY DEFINER
AS $function$
  SELECT COUNT(*) FROM images;
$function$
;

CREATE OR REPLACE FUNCTION public.get_active_climbers_count()
 RETURNS bigint
 LANGUAGE sql
 SECURITY DEFINER
AS $function$
  SELECT COUNT(DISTINCT user_id) FROM logs
  WHERE date_climbed >= NOW() - INTERVAL '60 days';
$function$
;

CREATE OR REPLACE FUNCTION public.get_total_climbs_count()
 RETURNS bigint
 LANGUAGE sql
 SECURITY DEFINER
AS $function$
  SELECT COUNT(*) FROM climbs WHERE deleted_at IS NULL;
$function$
;

CREATE OR REPLACE FUNCTION public.get_total_logs_count()
 RETURNS bigint
 LANGUAGE sql
 SECURITY DEFINER
AS $function$
  SELECT COUNT(*) FROM user_climbs;
$function$
;

-- Migration: 20260127000000_fix_logs_count.sql

-- Migration: Fix get_total_logs_count to query user_climbs table
-- Previous version was querying empty 'logs' table instead of 'user_climbs'

set check_function_bodies = off;

CREATE OR REPLACE FUNCTION public.get_total_logs_count()
 RETURNS bigint
 LANGUAGE sql
 SECURITY DEFINER
AS $function$
  SELECT COUNT(*) FROM user_climbs;
$function$
;

-- Migration: 20260130000000_production_sync.sql

-- =====================================================
-- Production Sync Migration
-- Adds missing tables and columns from production schema
-- Created: 2026-01-30
-- =====================================================

-- Enable PostGIS for geometry types
CREATE EXTENSION IF NOT EXISTS postgis;

-- =====================================================
-- GRADES: Grade definitions for leaderboard
-- =====================================================
CREATE TABLE IF NOT EXISTS grades (
    grade TEXT PRIMARY KEY,
    points INTEGER NOT NULL
);

-- Add primary key if not exists (using DO block to avoid errors)
DO $$ BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'grades_pkey'
    ) THEN
        ALTER TABLE grades ADD CONSTRAINT grades_pkey PRIMARY KEY (grade);
    END IF;
END $$;

INSERT INTO grades (grade, points) VALUES
    ('1A', 100), ('1A+', 116), ('1B', 132), ('1B+', 148), ('1C', 164), ('1C+', 180),
    ('2A', 196), ('2A+', 212), ('2B', 228), ('2B+', 244), ('2C', 260), ('2C+', 276),
    ('3A', 292), ('3A+', 308), ('3B', 324), ('3B+', 340), ('3C', 356), ('3C+', 372),
    ('4A', 388), ('4A+', 404), ('4B', 420), ('4B+', 436), ('4C', 452), ('4C+', 468),
    ('5A', 484), ('5A+', 500), ('5B', 516), ('5B+', 532), ('5C', 548), ('5C+', 564),
    ('6A', 580), ('6A+', 596), ('6B', 612), ('6B+', 628), ('6C', 644), ('6C+', 660),
    ('7A', 676), ('7A+', 692), ('7B', 708), ('7B+', 724), ('7C', 740), ('7C+', 756),
    ('8A', 772), ('8A+', 788), ('8B', 804), ('8B+', 820), ('8C', 836), ('8C+', 852),
    ('9A', 868), ('9A+', 884), ('9B', 900), ('9B+', 916), ('9C', 932), ('9C+', 948)
ON CONFLICT (grade) DO NOTHING;

CREATE INDEX IF NOT EXISTS idx_grades_points ON grades(points);

-- =====================================================
-- LOGS: User climb logging
-- =====================================================
CREATE TABLE IF NOT EXISTS logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    climb_id UUID NOT NULL REFERENCES climbs(id) ON DELETE CASCADE,
    status TEXT NOT NULL DEFAULT 'completed',
    notes TEXT,
    date_climbed DATE,
    style VARCHAR(20) NOT NULL DEFAULT 'onsight',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_logs_user ON logs(user_id);
CREATE INDEX IF NOT EXISTS idx_logs_climb ON logs(climb_id);
CREATE INDEX IF NOT EXISTS idx_logs_date ON logs(date_climbed);

-- =====================================================
-- PROFILES: Extended user profiles
-- =====================================================
CREATE TABLE IF NOT EXISTS profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    username TEXT UNIQUE,
    display_name TEXT,
    avatar_url TEXT,
    bio TEXT,
    gender TEXT CHECK (gender IN ('male', 'female', 'other', 'prefer_not_to_say')),
    country VARCHAR(100),
    country_code VARCHAR(2),
    preferred_grade_system VARCHAR(10) DEFAULT 'french',
    preferred_style VARCHAR(20) DEFAULT 'sport',
    total_climbs INTEGER DEFAULT 0,
    total_points INTEGER DEFAULT 0,
    highest_grade TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_profiles_username ON profiles(username);

-- =====================================================
-- CRAG_REPORTS: Crag moderation system
-- =====================================================
CREATE TABLE IF NOT EXISTS crag_reports (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    crag_id UUID NOT NULL REFERENCES crags(id) ON DELETE CASCADE,
    reporter_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    reason TEXT NOT NULL,
    details TEXT,
    status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'investigating', 'resolved', 'dismissed')),
    moderator_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    moderator_note TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    resolved_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_crag_reports_crag ON crag_reports(crag_id);
CREATE INDEX IF NOT EXISTS idx_crag_reports_status ON crag_reports(status);
CREATE INDEX IF NOT EXISTS idx_crag_reports_reporter ON crag_reports(reporter_id);

-- =====================================================
-- ROUTE_GRADES: User-submitted grade votes
-- =====================================================
CREATE TABLE IF NOT EXISTS route_grades (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    climb_id UUID NOT NULL REFERENCES climbs(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    grade VARCHAR(10) NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(climb_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_route_grades_climb ON route_grades(climb_id);
CREATE INDEX IF NOT EXISTS idx_route_grades_user ON route_grades(user_id);

-- =====================================================
-- CLIMBS: Add missing verification columns
-- =====================================================
ALTER TABLE climbs ADD COLUMN IF NOT EXISTS verification_count INTEGER DEFAULT 0;
ALTER TABLE climbs ADD COLUMN IF NOT EXISTS is_verified BOOLEAN DEFAULT false;

-- =====================================================
-- CRAGS: Add missing columns
-- =====================================================
ALTER TABLE crags ADD COLUMN IF NOT EXISTS report_count INTEGER DEFAULT 0;
ALTER TABLE crags ADD COLUMN IF NOT EXISTS is_flagged BOOLEAN DEFAULT false;
ALTER TABLE crags ADD COLUMN IF NOT EXISTS boundary GEOMETRY(POLYGON, 4326);
ALTER TABLE crags ADD COLUMN IF NOT EXISTS region_name VARCHAR(100);
ALTER TABLE crags ADD COLUMN IF NOT EXISTS country VARCHAR(100);
ALTER TABLE crags ADD COLUMN IF NOT EXISTS tide_dependency VARCHAR(20);

CREATE INDEX IF NOT EXISTS idx_crags_report_count ON crags(report_count);
CREATE INDEX IF NOT EXISTS idx_crags_is_flagged ON crags(is_flagged);
CREATE INDEX IF NOT EXISTS idx_crags_boundary ON crags USING GIST(boundary);

-- =====================================================
-- IMAGES: Add missing verification columns
-- =====================================================
ALTER TABLE images ADD COLUMN IF NOT EXISTS verification_count INTEGER DEFAULT 0;
ALTER TABLE images ADD COLUMN IF NOT EXISTS is_verified BOOLEAN DEFAULT false;

-- =====================================================
-- RLS POLICIES
-- =====================================================

-- grades: Public read
DO $$ BEGIN
    ALTER TABLE grades ENABLE ROW LEVEL SECURITY;
EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN
    CREATE POLICY "Public read grades" ON grades FOR SELECT USING (true);
EXCEPTION WHEN OTHERS THEN NULL; END $$;

-- logs: Owner read/create, public read
DO $$ BEGIN
    ALTER TABLE logs ENABLE ROW LEVEL SECURITY;
EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN
    CREATE POLICY "Public read logs" ON logs FOR SELECT USING (true);
EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN
    CREATE POLICY "Owner create logs" ON logs FOR INSERT WITH CHECK (auth.uid() = user_id);
EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN
    CREATE POLICY "Owner update logs" ON logs FOR UPDATE USING (auth.uid() = user_id);
EXCEPTION WHEN OTHERS THEN NULL; END $$;

-- profiles: Public read, owner update
DO $$ BEGIN
    ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN
    CREATE POLICY "Public read profiles" ON profiles FOR SELECT USING (true);
EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN
    CREATE POLICY "Owner update profile" ON profiles FOR UPDATE USING (auth.uid() = id);
EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN
    CREATE POLICY "Authenticated create profile" ON profiles FOR INSERT WITH CHECK (auth.uid() = id);
EXCEPTION WHEN OTHERS THEN NULL; END $$;

-- crag_reports: Public read, authenticated create
DO $$ BEGIN
    ALTER TABLE crag_reports ENABLE ROW LEVEL SECURITY;
EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN
    CREATE POLICY "Public read crag reports" ON crag_reports FOR SELECT USING (true);
EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN
    CREATE POLICY "Authenticated create crag report" ON crag_reports FOR INSERT WITH CHECK (auth.role() = 'authenticated');
EXCEPTION WHEN OTHERS THEN NULL; END $$;

-- route_grades: Public read, authenticated create (own vote only)
DO $$ BEGIN
    ALTER TABLE route_grades ENABLE ROW LEVEL SECURITY;
EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN
    CREATE POLICY "Public read route grades" ON route_grades FOR SELECT USING (true);
EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN
    CREATE POLICY "Authenticated create route grade" ON route_grades FOR INSERT WITH CHECK (auth.role() = 'authenticated');
EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN
    CREATE POLICY "Authenticated update own route grade" ON route_grades FOR UPDATE USING (auth.uid() = user_id);
EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN
    CREATE POLICY "Authenticated delete own route grade" ON route_grades FOR DELETE USING (auth.uid() = user_id);
EXCEPTION WHEN OTHERS THEN NULL; END $$;

-- =====================================================
-- HELPER FUNCTIONS
-- =====================================================

CREATE OR REPLACE FUNCTION get_consensus_grade(climb_id UUID)
RETURNS VARCHAR(10) AS $$
BEGIN
    RETURN (
        SELECT grade
        FROM route_grades
        WHERE climb_id = get_consensus_grade.climb_id
        GROUP BY grade
        ORDER BY COUNT(*) DESC
        LIMIT 1
    );
END;
$$ LANGUAGE plpgsql STABLE;

CREATE OR REPLACE FUNCTION get_verification_count(climb_id UUID)
RETURNS INTEGER AS $$
BEGIN
    RETURN (
        SELECT COUNT(*) FROM climb_verifications
        WHERE climb_id = get_verification_count.climb_id
    );
END;
$$ LANGUAGE plpgsql STABLE;

-- Migration: 20260130000001_add_name_columns.sql

-- =====================================================
-- Add name columns to profiles table
-- Created: 2026-01-30
-- =====================================================

ALTER TABLE profiles ADD COLUMN IF NOT EXISTS first_name TEXT;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS last_name TEXT;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS email TEXT;

CREATE INDEX IF NOT EXISTS idx_profiles_first_name ON profiles(first_name);
CREATE INDEX IF NOT EXISTS idx_profiles_last_name ON profiles(last_name);
CREATE INDEX IF NOT EXISTS idx_profiles_email ON profiles(email);

-- Migration: 20260201000000_sync_google_profile.sql

-- =====================================================
-- Sync Google profile data to profiles table
-- Created: 2026-02-01
-- =====================================================

-- Update handle_new_user to sync Google metadata
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (
    id,
    first_name,
    last_name,
    avatar_url,
    email
  )
  VALUES (
    NEW.id,
    COALESCE(
      NEW.raw_user_meta_data->>'given_name',
      split_part(NEW.raw_user_meta_data->>'full_name', ' ', 1)
    ),
    COALESCE(
      NEW.raw_user_meta_data->>'family_name',
      split_part(NEW.raw_user_meta_data->>'full_name', ' ', 2)
    ),
    COALESCE(
      NEW.raw_user_meta_data->>'avatar_url',
      NEW.raw_user_meta_data->>'picture'
    ),
    NEW.email
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create function to sync Google metadata on updates
CREATE OR REPLACE FUNCTION public.handle_user_metadata_update()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.raw_user_meta_data IS DISTINCT FROM OLD.raw_user_meta_data
     AND COALESCE(NEW.app_metadata->>'provider', '') = 'google' THEN
    UPDATE public.profiles
    SET
      first_name = COALESCE(
        NEW.raw_user_meta_data->>'given_name',
        split_part(NEW.raw_user_meta_data->>'full_name', ' ', 1)
      ),
      last_name = COALESCE(
        NEW.raw_user_meta_data->>'family_name',
        split_part(NEW.raw_user_meta_data->>'full_name', ' ', 2)
      ),
      avatar_url = COALESCE(
        NEW.raw_user_meta_data->>'avatar_url',
        NEW.raw_user_meta_data->>'picture'
      ),
      email = COALESCE(NEW.email, email),
      updated_at = NOW()
    WHERE id = NEW.id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Drop existing trigger if it exists, then create new one
DROP TRIGGER IF EXISTS on_auth_user_updated ON auth.users;
CREATE TRIGGER on_auth_user_updated
  AFTER UPDATE ON auth.users
  FOR EACH ROW
  WHEN (OLD.raw_user_meta_data IS DISTINCT FROM NEW.raw_user_meta_data)
  EXECUTE FUNCTION public.handle_user_metadata_update();

-- Ensure indexes exist for name fields
CREATE INDEX IF NOT EXISTS idx_profiles_first_name ON profiles(first_name);
CREATE INDEX IF NOT EXISTS idx_profiles_last_name ON profiles(last_name);

-- Migration: 20260201000001_fix_history.sql

-- =====================================================
-- Fix migration history sync issue
-- Created: 2026-02-01
-- =====================================================

-- This migration manually registers missing migrations
-- as applied in the remote database to fix sync issues

CREATE SCHEMA IF NOT EXISTS supabase_schema;

CREATE TABLE IF NOT EXISTS supabase_schema.migrations (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    executed_at TIMESTAMPTZ DEFAULT NOW()
);

INSERT INTO supabase_schema.migrations (id, name)
VALUES ('20260120000000_verification_system', '20260120000000_verification_system')
ON CONFLICT (id) DO NOTHING;

INSERT INTO supabase_schema.migrations (id, name)
VALUES ('20260201000000_sync_google_profile', '20260201000000_sync_google_profile')
ON CONFLICT (id) DO NOTHING;

-- Migration: 20260202000000_add_cascade_user_climbs.sql

-- Add CASCADE to user_climbs.climb_id foreign key for hard delete support
-- This ensures user_climbs records are automatically deleted when a climb is removed

ALTER TABLE user_climbs
DROP CONSTRAINT IF EXISTS user_climbs_climb_id_fkey,
ADD CONSTRAINT user_climbs_climb_id_fkey
  FOREIGN KEY (climb_id) REFERENCES climbs(id) ON DELETE CASCADE;

-- Migration: 20260202090000_add_image_moderation_fields.sql

-- =====================================================
-- Image moderation fields (AWS Rekognition)
-- Created: 2026-02-02
-- =====================================================

DO $$ BEGIN
  ALTER TABLE images ADD COLUMN IF NOT EXISTS moderation_status TEXT DEFAULT 'pending';
  ALTER TABLE images ADD COLUMN IF NOT EXISTS has_humans BOOLEAN;
  ALTER TABLE images ADD COLUMN IF NOT EXISTS moderation_labels JSONB;
  ALTER TABLE images ADD COLUMN IF NOT EXISTS moderated_at TIMESTAMPTZ;
EXCEPTION WHEN undefined_table THEN
  NULL;
END $$;

CREATE INDEX IF NOT EXISTS idx_images_moderation_status ON images(moderation_status);

-- Migration: 20260203000000_add_admin_delete_policies.sql

-- Add DELETE policies for admins on climbs and images tables
-- This allows admin flag resolution to hard delete content

-- Add DELETE policy for admins on climbs table
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'climbs' AND policyname = 'Admins can delete climbs'
  ) THEN
    CREATE POLICY "Admins can delete climbs" ON climbs
    FOR DELETE
    USING (
      EXISTS (
        SELECT 1 FROM profiles
        WHERE profiles.id = auth.uid() AND profiles.is_admin = true
      )
    );
  END IF;
END $$;

-- Add DELETE policy for admins on images table
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'images' AND policyname = 'Admins can delete images'
  ) THEN
    CREATE POLICY "Admins can delete images" ON images
    FOR DELETE
    USING (
      EXISTS (
        SELECT 1 FROM profiles
        WHERE profiles.id = auth.uid() AND profiles.is_admin = true
      )
    );
  END IF;
END $$;

-- Migration: 20260205000000_add_natural_image_dimensions.sql

-- Add natural dimensions columns for correct route coordinate mapping
-- These columns store the actual image dimensions (from the image file itself)
-- which are used for route coordinate normalization and rendering

ALTER TABLE images ADD COLUMN IF NOT EXISTS natural_width INTEGER;
ALTER TABLE images ADD COLUMN IF NOT EXISTS natural_height INTEGER;

-- Update existing images that have width/height but no natural dimensions
-- This is a safe update that populates natural dimensions from existing width/height
UPDATE images
SET natural_width = width,
    natural_height = height
WHERE natural_width IS NULL
  AND natural_height IS NULL
  AND width IS NOT NULL
  AND width > 0;

-- Migration: 20260205000001_match_remote.sql

-- Migration to match remote database state
-- This file makes the migration history consistent between local and remote
SELECT 1 AS noop;

-- Migration: 20260205000002_add_image_dimensions_to_route_lines.sql

-- Add displayed dimensions columns to route_lines for correct route rendering
-- These store the image dimensions at the time the route was drawn
ALTER TABLE route_lines ADD COLUMN IF NOT EXISTS image_width INTEGER;
ALTER TABLE route_lines ADD COLUMN IF NOT EXISTS image_height INTEGER;

-- Update existing routes to use natural dimensions as fallback
UPDATE route_lines
SET image_width = (SELECT natural_width FROM images WHERE images.id = route_lines.image_id),
    image_height = (SELECT natural_height FROM images WHERE images.id = route_lines.image_id)
WHERE image_width IS NULL AND image_height IS NULL
  AND EXISTS (SELECT 1 FROM images WHERE images.id = route_lines.image_id AND natural_width IS NOT NULL);

-- Migration: 20260205000003_enforce_image_moderation_visibility.sql

-- =====================================================
-- Enforce image moderation visibility via RLS
-- Public can only read approved images
-- Rejected images are not readable by anyone (including owner/admin)
-- Created: 2026-02-05
-- =====================================================

DO $$
BEGIN
  -- Replace permissive public read policy
  IF EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'images'
      AND policyname = 'Public read images'
  ) THEN
    EXECUTE 'DROP POLICY "Public read images" ON public.images';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'images'
      AND policyname = 'Public read approved images'
  ) THEN
    EXECUTE $policy$
      CREATE POLICY "Public read approved images" ON public.images
      FOR SELECT
      USING (coalesce(moderation_status, 'pending') = 'approved')
    $policy$;
  END IF;

  -- Do not create owner/admin read policies: rejected images must not be visible
  -- even to owners or admins.
END $$;

-- Migration: 20260205000004_reconcile_images_rls_policies.sql

-- =====================================================
-- Reconcile images RLS SELECT policies (idempotent)
-- Ensures public can only read approved images.
-- Rejected images are not readable by anyone (including owner/admin).
-- Created: 2026-02-05
-- =====================================================

DO $$
BEGIN
  -- Remove legacy overly-permissive policy if it exists
  IF EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'images'
      AND policyname = 'Public read images'
  ) THEN
    EXECUTE 'DROP POLICY "Public read images" ON public.images';
  END IF;

  -- Public: approved only
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'images'
      AND policyname = 'Public read approved images'
  ) THEN
    EXECUTE $policy$
      CREATE POLICY "Public read approved images" ON public.images
      FOR SELECT
      USING (coalesce(moderation_status, 'pending') = 'approved')
    $policy$;
  END IF;

  -- Remove privileged SELECT policies (owner/admin). Even admins must not be
  -- able to read rejected images via normal SELECT.
  IF EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'images'
      AND policyname = 'Owner read own images'
  ) THEN
    EXECUTE 'DROP POLICY "Owner read own images" ON public.images';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'images'
      AND policyname = 'Admin read images'
  ) THEN
    EXECUTE 'DROP POLICY "Admin read images" ON public.images';
  END IF;
END $$;

-- Migration: 20260205000005_lock_down_rejected_images_visibility.sql

-- =====================================================
-- Lock down rejected image visibility
-- Rejected images must not be readable by anyone (including owner/admin)
-- Public read is restricted to approved images only.
-- Created: 2026-02-05
-- =====================================================

DO $$
BEGIN
  -- Remove any permissive/legacy policy
  IF EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'images'
      AND policyname = 'Public read images'
  ) THEN
    EXECUTE 'DROP POLICY "Public read images" ON public.images';
  END IF;

  -- Remove privileged read policies
  IF EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'images'
      AND policyname = 'Owner read own images'
  ) THEN
    EXECUTE 'DROP POLICY "Owner read own images" ON public.images';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'images'
      AND policyname = 'Admin read images'
  ) THEN
    EXECUTE 'DROP POLICY "Admin read images" ON public.images';
  END IF;

  -- Ensure public approved-only policy exists
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'images'
      AND policyname = 'Public read approved images'
  ) THEN
    EXECUTE $policy$
      CREATE POLICY "Public read approved images" ON public.images
      FOR SELECT
      USING (coalesce(moderation_status, 'pending') = 'approved')
    $policy$;
  END IF;
END $$;

-- Migration: 20260206000000_add_admin_crag_delete_policy.sql

-- Add DELETE policy for admins on crags table
-- This allows admin flag resolution to hard delete crags

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'crags' AND policyname = 'Admins can delete crags'
  ) THEN
    CREATE POLICY "Admins can delete crags" ON crags
    FOR DELETE
    USING (
      EXISTS (
        SELECT 1 FROM profiles
        WHERE profiles.id = auth.uid() AND profiles.is_admin = true
      )
    );
  END IF;
END $$;

-- Migration: 20260206000001_cascade_delete_crags.sql

-- Change foreign keys to ON DELETE CASCADE for proper cascading deletes
-- When a crag is deleted, all associated climbs and images will be auto-deleted

-- First, get the current constraint names by attempting to drop and recreate

-- Drop existing foreign key constraint on climbs.crag_id
ALTER TABLE climbs DROP CONSTRAINT IF EXISTS climbs_crag_id_fkey;

-- Add new constraint with CASCADE
ALTER TABLE climbs ADD CONSTRAINT climbs_crag_id_fkey
  FOREIGN KEY (crag_id) REFERENCES crags(id) ON DELETE CASCADE;

-- Drop existing foreign key constraint on images.crag_id  
ALTER TABLE images DROP CONSTRAINT IF EXISTS images_crag_id_fkey;

-- Add new constraint with CASCADE
ALTER TABLE images ADD CONSTRAINT images_crag_id_fkey
  FOREIGN KEY (crag_id) REFERENCES crags(id) ON DELETE CASCADE;

-- Migration: 20260207000000_add_crag_flag_types.sql

-- Add crag-specific flag types to climb_flags table
-- This allows users to flag crags with relevant issue types

-- First, get the current constraint definition
-- We need to drop and recreate with additional crag-specific types

DO $$
BEGIN
  -- Drop existing constraint if it exists
  ALTER TABLE climb_flags DROP CONSTRAINT IF EXISTS climb_flags_flag_type_check;
EXCEPTION
  WHEN undefined_object THEN null;
END $$;

-- Add new constraint with crag-specific flag types
ALTER TABLE climb_flags ADD CONSTRAINT climb_flags_flag_type_check 
  CHECK (flag_type IN (
    'location', 
    'route_line', 
    'route_name', 
    'image_quality', 
    'wrong_crag',
    'boundary',
    'access',
    'description',
    'rock_type',
    'name',
    'other'
  ));

-- Migration: 20260207000001_add_images_status_column.sql

-- =====================================================
-- Add status column to images table for moderation workflow
-- Backfill: column exists in prod/dev but was never migrated
-- Created: 2026-02-07
-- =====================================================

DO $$ BEGIN
  ALTER TABLE public.images ADD COLUMN IF NOT EXISTS status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected'));
EXCEPTION WHEN undefined_table THEN
  NULL;
END $$;

-- Create index for efficient filtering
CREATE INDEX IF NOT EXISTS idx_images_status ON public.images(status);

-- Migration: 20260208000000_fix_profile_creation.sql

-- =====================================================
-- Fix profile creation - PRODUCTION SAFE VERSION
-- Created: 2026-01-24
-- =====================================================

-- Update handle_new_user to:
-- 1. Skip profile creation if email is NULL
-- 2. Prevent duplicate profiles for same email
-- 3. Preserve existing admin status (don't auto-set)

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  -- Skip if no email (Mailpit sometimes creates users without email)
  IF NEW.email IS NULL THEN
    RETURN NEW;
  END IF;
  
  -- Check if profile exists for this email
  IF EXISTS (SELECT 1 FROM public.profiles WHERE email = NEW.email) THEN
    -- Update existing profile with new auth user ID (preserve is_admin)
    UPDATE public.profiles 
    SET id = NEW.id, updated_at = NOW()
    WHERE email = NEW.email;
  ELSE
    -- Create new profile (is_admin defaults to false)
    INSERT INTO public.profiles (id, email, is_admin)
    VALUES (NEW.id, NEW.email, false);
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create function to sync profile on login
CREATE OR REPLACE FUNCTION public.sync_profile_on_login()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.email IS NOT NULL THEN
    -- Update existing profile's auth user ID without changing is_admin
    UPDATE public.profiles 
    SET id = NEW.id, updated_at = NOW()
    WHERE email = NEW.email;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Ensure insert trigger is created
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();

-- Create update trigger for profile sync on login
DROP TRIGGER IF EXISTS on_auth_user_login ON auth.users;
CREATE TRIGGER on_auth_user_login
  AFTER UPDATE ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_profile_on_login();

-- Clean up any existing NULL email profiles
DELETE FROM public.profiles WHERE email IS NULL;

-- FOR LOCAL DEVELOPMENT ONLY: Set all existing profiles to admin
-- Remove this line before pushing to production!
-- UPDATE public.profiles SET is_admin = true;

-- FOR PRODUCTION: Manually set admin for specific users
-- Example: UPDATE public.profiles SET is_admin = true WHERE email = 'admin@example.com';

-- Migration: 20260208143000_enable_notifications_realtime.sql

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'notifications'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;
  END IF;
END
$$;

-- Migration: 20260209000000_logbook_performance.sql

-- Logbook Performance Optimizations
-- Indexes for faster logbook queries

-- Composite index for user_climbs user_id + created_at ordering (most common query pattern)
CREATE INDEX IF NOT EXISTS idx_user_climbs_user_created ON user_climbs(user_id, created_at DESC);

-- Index for style filtering combined with user
CREATE INDEX IF NOT EXISTS idx_user_climbs_user_style ON user_climbs(user_id, style);

-- Index for climbing activity lookups
CREATE INDEX IF NOT EXISTS idx_user_climbs_user_climb ON user_climbs(user_id, climb_id);

-- Migration: 20260210000000_add_natural_dimensions_to_images.sql

-- =====================================================
-- Add natural dimensions columns to images
-- =====================================================

ALTER TABLE public.images ADD COLUMN IF NOT EXISTS natural_width INTEGER;
ALTER TABLE public.images ADD COLUMN IF NOT EXISTS natural_height INTEGER;

-- Migration: 20260215000000_add_missing_schema_columns.sql

-- =====================================================
-- Add all missing schema columns for fresh setups
-- =====================================================

-- profiles table
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS first_name TEXT;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS last_name TEXT;

-- images table
ALTER TABLE public.images ADD COLUMN IF NOT EXISTS natural_width INTEGER;
ALTER TABLE public.images ADD COLUMN IF NOT EXISTS natural_height INTEGER;

-- route_lines table
ALTER TABLE public.route_lines ADD COLUMN IF NOT EXISTS image_width INTEGER;
ALTER TABLE public.route_lines ADD COLUMN IF NOT EXISTS image_height INTEGER;

-- Migration: 20260216000000_fix_auth_user_metadata_trigger.sql

-- =====================================================
-- Fix auth.users metadata trigger for all environments
--
-- Problem:
-- Some Supabase auth schemas do not expose NEW.app_metadata on auth.users.
-- Triggers referencing NEW.app_metadata break OTP/magic-link sign-in.
--
-- Fix:
-- Prefer NEW.raw_app_meta_data (canonical), but safely fall back if needed.
-- =====================================================

CREATE OR REPLACE FUNCTION public.handle_user_metadata_update()
RETURNS TRIGGER AS $$
DECLARE
  provider_text text;
BEGIN
  provider_text := NULL;

  -- Prefer auth.users.raw_app_meta_data; tolerate schemas that also expose app_metadata.
  BEGIN
    provider_text := NEW.app_metadata->>'provider';
  EXCEPTION
    WHEN undefined_column THEN
      BEGIN
        provider_text := NEW.raw_app_meta_data->>'provider';
      EXCEPTION
        WHEN undefined_column THEN
          provider_text := NULL;
      END;
  END;

  IF NEW.raw_user_meta_data IS DISTINCT FROM OLD.raw_user_meta_data
     AND COALESCE(provider_text, '') = 'google' THEN
    UPDATE public.profiles
    SET
      first_name = COALESCE(
        NEW.raw_user_meta_data->>'given_name',
        split_part(NEW.raw_user_meta_data->>'full_name', ' ', 1)
      ),
      last_name = COALESCE(
        NEW.raw_user_meta_data->>'family_name',
        split_part(NEW.raw_user_meta_data->>'full_name', ' ', 2)
      ),
      avatar_url = COALESCE(
        NEW.raw_user_meta_data->>'avatar_url',
        NEW.raw_user_meta_data->>'picture'
      ),
      email = COALESCE(NEW.email, email),
      updated_at = NOW()
    WHERE id = NEW.id;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_updated ON auth.users;
CREATE TRIGGER on_auth_user_updated
  AFTER UPDATE ON auth.users
  FOR EACH ROW
  WHEN (OLD.raw_user_meta_data IS DISTINCT FROM NEW.raw_user_meta_data)
  EXECUTE FUNCTION public.handle_user_metadata_update();

-- Migration: 20260217000000_add_route_and_crag_slugs.sql

-- Add stable, SEO-friendly slugs for crags and routes
-- =====================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- =====================================================
-- Columns
-- =====================================================

ALTER TABLE public.crags ADD COLUMN IF NOT EXISTS country_code VARCHAR(2);
ALTER TABLE public.crags ADD COLUMN IF NOT EXISTS slug TEXT;

ALTER TABLE public.climbs ADD COLUMN IF NOT EXISTS slug TEXT;

-- =====================================================
-- Slug helper
-- =====================================================

CREATE OR REPLACE FUNCTION public.slugify(input TEXT)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT trim(both '-' FROM regexp_replace(lower(coalesce(input, '')), '[^a-z0-9]+', '-', 'g'))
$$;

-- =====================================================
-- Backfill crag_id on climbs (best-effort)
-- =====================================================

UPDATE public.climbs c
SET crag_id = x.crag_id
FROM (
  SELECT rl.climb_id, min(i.crag_id::text)::uuid AS crag_id
  FROM public.route_lines rl
  JOIN public.images i ON i.id = rl.image_id
  WHERE i.crag_id IS NOT NULL
  GROUP BY rl.climb_id
) x
WHERE c.crag_id IS NULL
  AND c.id = x.climb_id
  AND x.crag_id IS NOT NULL;

-- =====================================================
-- Backfill country_code on crags from region
-- =====================================================

UPDATE public.crags c
SET country_code = upper(r.country_code)
FROM public.regions r
WHERE c.country_code IS NULL
  AND c.region_id = r.id
  AND r.country_code IS NOT NULL;

-- =====================================================
-- Backfill crag slugs (unique per country_code)
-- =====================================================

WITH base AS (
  SELECT
    id,
    country_code,
    NULLIF(public.slugify(name), '') AS base_slug
  FROM public.crags
  WHERE slug IS NULL OR slug = ''
),
ranked AS (
  SELECT
    id,
    country_code,
    coalesce(base_slug, 'crag') AS base_slug,
    row_number() OVER (PARTITION BY country_code, coalesce(base_slug, 'crag') ORDER BY id) AS rn
  FROM base
)
UPDATE public.crags c
SET slug = CASE WHEN r.rn = 1 THEN r.base_slug ELSE r.base_slug || '-' || r.rn::text END
FROM ranked r
WHERE c.id = r.id;

-- =====================================================
-- Backfill climb slugs (unique per crag_id)
-- =====================================================

WITH base AS (
  SELECT
    id,
    crag_id,
    NULLIF(public.slugify(name), '') AS base_slug
  FROM public.climbs
  WHERE (slug IS NULL OR slug = '')
    AND crag_id IS NOT NULL
),
ranked AS (
  SELECT
    id,
    crag_id,
    coalesce(base_slug, 'route') AS base_slug,
    row_number() OVER (PARTITION BY crag_id, coalesce(base_slug, 'route') ORDER BY id) AS rn
  FROM base
)
UPDATE public.climbs c
SET slug = CASE WHEN r.rn = 1 THEN r.base_slug ELSE r.base_slug || '-' || r.rn::text END
FROM ranked r
WHERE c.id = r.id;

-- =====================================================
-- Indexes / constraints
-- =====================================================

CREATE INDEX IF NOT EXISTS idx_crags_country_code ON public.crags(country_code);
CREATE INDEX IF NOT EXISTS idx_crags_slug ON public.crags(slug);
CREATE INDEX IF NOT EXISTS idx_climbs_slug ON public.climbs(slug);

CREATE UNIQUE INDEX IF NOT EXISTS uq_crags_country_code_slug
  ON public.crags(country_code, slug)
  WHERE country_code IS NOT NULL AND slug IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_climbs_crag_id_slug
  ON public.climbs(crag_id, slug)
  WHERE crag_id IS NOT NULL AND slug IS NOT NULL;

-- Migration: 20260218000000_map_crag_points.sql

-- Map helper: return either bucket clusters (low zoom) or individual crags (high zoom)

CREATE OR REPLACE FUNCTION public.get_map_crag_points(
  min_lat double precision,
  min_lng double precision,
  max_lat double precision,
  max_lng double precision,
  zoom integer
)
RETURNS TABLE (
  kind text,
  id uuid,
  name character varying,
  latitude double precision,
  longitude double precision,
  count integer
)
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  cell double precision;
  use_buckets boolean;
BEGIN
  IF zoom IS NULL THEN
    zoom := 0;
  END IF;

  use_buckets := zoom < 10;

  IF use_buckets THEN
    cell := CASE
      WHEN zoom <= 2 THEN 10.0
      WHEN zoom <= 4 THEN 5.0
      WHEN zoom <= 6 THEN 1.0
      WHEN zoom <= 8 THEN 0.25
      ELSE 0.1
    END;
  END IF;

  IF NOT use_buckets THEN
    RETURN QUERY
    SELECT
      'crag'::text AS kind,
      c.id,
      c.name,
      c.latitude::double precision AS latitude,
      c.longitude::double precision AS longitude,
      1 AS count
    FROM public.crags c
    WHERE c.latitude IS NOT NULL
      AND c.longitude IS NOT NULL
      AND c.latitude::double precision BETWEEN min_lat AND max_lat
      AND (
        (min_lng <= max_lng AND c.longitude::double precision BETWEEN min_lng AND max_lng)
        OR
        (min_lng > max_lng AND (c.longitude::double precision >= min_lng OR c.longitude::double precision <= max_lng))
      )
    ORDER BY c.name
    LIMIT 2000;
    RETURN;
  END IF;

  RETURN QUERY
  WITH filtered AS (
    SELECT
      c.latitude::double precision AS lat,
      c.longitude::double precision AS lng
    FROM public.crags c
    WHERE c.latitude IS NOT NULL
      AND c.longitude IS NOT NULL
      AND c.latitude::double precision BETWEEN min_lat AND max_lat
      AND (
        (min_lng <= max_lng AND c.longitude::double precision BETWEEN min_lng AND max_lng)
        OR
        (min_lng > max_lng AND (c.longitude::double precision >= min_lng OR c.longitude::double precision <= max_lng))
      )
  ),
  bucketed AS (
    SELECT
      (floor(lat / cell) * cell + cell / 2.0) AS bucket_lat,
      (floor(lng / cell) * cell + cell / 2.0) AS bucket_lng,
      count(*)::integer AS ct
    FROM filtered
    GROUP BY 1, 2
  )
  SELECT
    'cluster'::text AS kind,
    NULL::uuid AS id,
    NULL::character varying AS name,
    b.bucket_lat AS latitude,
    b.bucket_lng AS longitude,
    b.ct AS count
  FROM bucketed b
  ORDER BY b.ct DESC
  LIMIT 1500;
END;
$$;

-- Migration: 20260219000000_map_crag_points_require_images.sql

-- Map helper: only include crags with at least one image

CREATE OR REPLACE FUNCTION public.get_map_crag_points(
  min_lat double precision,
  min_lng double precision,
  max_lat double precision,
  max_lng double precision,
  zoom integer
)
RETURNS TABLE (
  kind text,
  id uuid,
  name character varying,
  latitude double precision,
  longitude double precision,
  count integer
)
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  cell double precision;
  use_buckets boolean;
BEGIN
  IF zoom IS NULL THEN
    zoom := 0;
  END IF;

  use_buckets := zoom < 10;

  IF use_buckets THEN
    cell := CASE
      WHEN zoom <= 2 THEN 10.0
      WHEN zoom <= 4 THEN 5.0
      WHEN zoom <= 6 THEN 1.0
      WHEN zoom <= 8 THEN 0.25
      ELSE 0.1
    END;
  END IF;

  IF NOT use_buckets THEN
    RETURN QUERY
    SELECT
      'crag'::text AS kind,
      c.id,
      c.name,
      c.latitude::double precision AS latitude,
      c.longitude::double precision AS longitude,
      1 AS count
    FROM public.crags c
    WHERE c.latitude IS NOT NULL
      AND c.longitude IS NOT NULL
      AND c.latitude::double precision BETWEEN min_lat AND max_lat
      AND (
        (min_lng <= max_lng AND c.longitude::double precision BETWEEN min_lng AND max_lng)
        OR
        (min_lng > max_lng AND (c.longitude::double precision >= min_lng OR c.longitude::double precision <= max_lng))
      )
      AND EXISTS (
        SELECT 1
        FROM public.images i
        WHERE i.crag_id = c.id
      )
    ORDER BY c.name
    LIMIT 2000;
    RETURN;
  END IF;

  RETURN QUERY
  WITH filtered AS (
    SELECT
      c.latitude::double precision AS lat,
      c.longitude::double precision AS lng
    FROM public.crags c
    WHERE c.latitude IS NOT NULL
      AND c.longitude IS NOT NULL
      AND c.latitude::double precision BETWEEN min_lat AND max_lat
      AND (
        (min_lng <= max_lng AND c.longitude::double precision BETWEEN min_lng AND max_lng)
        OR
        (min_lng > max_lng AND (c.longitude::double precision >= min_lng OR c.longitude::double precision <= max_lng))
      )
      AND EXISTS (
        SELECT 1
        FROM public.images i
        WHERE i.crag_id = c.id
      )
  ),
  bucketed AS (
    SELECT
      (floor(lat / cell) * cell + cell / 2.0) AS bucket_lat,
      (floor(lng / cell) * cell + cell / 2.0) AS bucket_lng,
      count(*)::integer AS ct
    FROM filtered
    GROUP BY 1, 2
  )
  SELECT
    'cluster'::text AS kind,
    NULL::uuid AS id,
    NULL::character varying AS name,
    b.bucket_lat AS latitude,
    b.bucket_lng AS longitude,
    b.ct AS count
  FROM bucketed b
  ORDER BY b.ct DESC
  LIMIT 1500;
END;
$$;

-- Migration: 20260220000000_map_crag_points_zoom_threshold.sql

-- Map helper: show crags at zoom >= 9

CREATE OR REPLACE FUNCTION public.get_map_crag_points(
  min_lat double precision,
  min_lng double precision,
  max_lat double precision,
  max_lng double precision,
  zoom integer
)
RETURNS TABLE (
  kind text,
  id uuid,
  name character varying,
  latitude double precision,
  longitude double precision,
  count integer
)
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  cell double precision;
  use_buckets boolean;
BEGIN
  IF zoom IS NULL THEN
    zoom := 0;
  END IF;

  use_buckets := zoom < 9;

  IF use_buckets THEN
    cell := CASE
      WHEN zoom <= 2 THEN 10.0
      WHEN zoom <= 4 THEN 5.0
      WHEN zoom <= 6 THEN 1.0
      WHEN zoom <= 8 THEN 0.25
      ELSE 0.1
    END;
  END IF;

  IF NOT use_buckets THEN
    RETURN QUERY
    SELECT
      'crag'::text AS kind,
      c.id,
      c.name,
      c.latitude::double precision AS latitude,
      c.longitude::double precision AS longitude,
      1 AS count
    FROM public.crags c
    WHERE c.latitude IS NOT NULL
      AND c.longitude IS NOT NULL
      AND c.latitude::double precision BETWEEN min_lat AND max_lat
      AND (
        (min_lng <= max_lng AND c.longitude::double precision BETWEEN min_lng AND max_lng)
        OR
        (min_lng > max_lng AND (c.longitude::double precision >= min_lng OR c.longitude::double precision <= max_lng))
      )
      AND EXISTS (
        SELECT 1
        FROM public.images i
        WHERE i.crag_id = c.id
      )
    ORDER BY c.name
    LIMIT 2000;
    RETURN;
  END IF;

  RETURN QUERY
  WITH filtered AS (
    SELECT
      c.latitude::double precision AS lat,
      c.longitude::double precision AS lng
    FROM public.crags c
    WHERE c.latitude IS NOT NULL
      AND c.longitude IS NOT NULL
      AND c.latitude::double precision BETWEEN min_lat AND max_lat
      AND (
        (min_lng <= max_lng AND c.longitude::double precision BETWEEN min_lng AND max_lng)
        OR
        (min_lng > max_lng AND (c.longitude::double precision >= min_lng OR c.longitude::double precision <= max_lng))
      )
      AND EXISTS (
        SELECT 1
        FROM public.images i
        WHERE i.crag_id = c.id
      )
  ),
  bucketed AS (
    SELECT
      (floor(lat / cell) * cell + cell / 2.0) AS bucket_lat,
      (floor(lng / cell) * cell + cell / 2.0) AS bucket_lng,
      count(*)::integer AS ct
    FROM filtered
    GROUP BY 1, 2
  )
  SELECT
    'cluster'::text AS kind,
    NULL::uuid AS id,
    NULL::character varying AS name,
    b.bucket_lat AS latitude,
    b.bucket_lng AS longitude,
    b.ct AS count
  FROM bucketed b
  ORDER BY b.ct DESC
  LIMIT 1500;
END;
$$;

-- Migration: 20260221000000_map_crag_points_from_images.sql

-- Map helper: use image GPS to derive crag points

CREATE OR REPLACE FUNCTION public.get_map_crag_points(
  min_lat double precision,
  min_lng double precision,
  max_lat double precision,
  max_lng double precision,
  zoom integer
)
RETURNS TABLE (
  kind text,
  id uuid,
  name character varying,
  latitude double precision,
  longitude double precision,
  count integer
)
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  cell double precision;
  use_buckets boolean;
BEGIN
  IF zoom IS NULL THEN
    zoom := 0;
  END IF;

  use_buckets := zoom < 9;

  IF use_buckets THEN
    cell := CASE
      WHEN zoom <= 2 THEN 10.0
      WHEN zoom <= 4 THEN 5.0
      WHEN zoom <= 6 THEN 1.0
      WHEN zoom <= 8 THEN 0.25
      ELSE 0.1
    END;
  END IF;

  IF NOT use_buckets THEN
    RETURN QUERY
    WITH image_points AS (
      SELECT
        i.crag_id,
        avg(i.latitude)::double precision AS lat,
        avg(i.longitude)::double precision AS lng
      FROM public.images i
      WHERE i.crag_id IS NOT NULL
        AND i.latitude IS NOT NULL
        AND i.longitude IS NOT NULL
        AND i.latitude::double precision BETWEEN min_lat AND max_lat
        AND (
          (min_lng <= max_lng AND i.longitude::double precision BETWEEN min_lng AND max_lng)
          OR
          (min_lng > max_lng AND (i.longitude::double precision >= min_lng OR i.longitude::double precision <= max_lng))
        )
      GROUP BY i.crag_id
    )
    SELECT
      'crag'::text AS kind,
      c.id,
      c.name,
      ip.lat AS latitude,
      ip.lng AS longitude,
      1 AS count
    FROM image_points ip
    JOIN public.crags c ON c.id = ip.crag_id
    ORDER BY c.name
    LIMIT 2000;
    RETURN;
  END IF;

  RETURN QUERY
  WITH image_points AS (
    SELECT
      i.crag_id,
      avg(i.latitude)::double precision AS lat,
      avg(i.longitude)::double precision AS lng
    FROM public.images i
    WHERE i.crag_id IS NOT NULL
      AND i.latitude IS NOT NULL
      AND i.longitude IS NOT NULL
      AND i.latitude::double precision BETWEEN min_lat AND max_lat
      AND (
        (min_lng <= max_lng AND i.longitude::double precision BETWEEN min_lng AND max_lng)
        OR
        (min_lng > max_lng AND (i.longitude::double precision >= min_lng OR i.longitude::double precision <= max_lng))
      )
    GROUP BY i.crag_id
  ),
  bucketed AS (
    SELECT
      (floor(lat / cell) * cell + cell / 2.0) AS bucket_lat,
      (floor(lng / cell) * cell + cell / 2.0) AS bucket_lng,
      count(*)::integer AS ct
    FROM image_points
    GROUP BY 1, 2
  )
  SELECT
    'cluster'::text AS kind,
    NULL::uuid AS id,
    NULL::character varying AS name,
    b.bucket_lat AS latitude,
    b.bucket_lng AS longitude,
    b.ct AS count
  FROM bucketed b
  ORDER BY b.ct DESC
  LIMIT 1500;
END;
$$;

-- Migration: 20260222000000_map_crag_points_join_crags.sql

-- Map helper: only cluster images that belong to existing crags

CREATE OR REPLACE FUNCTION public.get_map_crag_points(
  min_lat double precision,
  min_lng double precision,
  max_lat double precision,
  max_lng double precision,
  zoom integer
)
RETURNS TABLE (
  kind text,
  id uuid,
  name character varying,
  latitude double precision,
  longitude double precision,
  count integer
)
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  cell double precision;
  use_buckets boolean;
BEGIN
  IF zoom IS NULL THEN
    zoom := 0;
  END IF;

  use_buckets := zoom < 9;

  IF use_buckets THEN
    cell := CASE
      WHEN zoom <= 2 THEN 10.0
      WHEN zoom <= 4 THEN 5.0
      WHEN zoom <= 6 THEN 1.0
      WHEN zoom <= 8 THEN 0.25
      ELSE 0.1
    END;
  END IF;

  IF NOT use_buckets THEN
    RETURN QUERY
    WITH image_points AS (
      SELECT
        c.id AS crag_id,
        avg(i.latitude)::double precision AS lat,
        avg(i.longitude)::double precision AS lng
      FROM public.images i
      JOIN public.crags c ON c.id = i.crag_id
      WHERE i.latitude IS NOT NULL
        AND i.longitude IS NOT NULL
        AND i.latitude::double precision BETWEEN min_lat AND max_lat
        AND (
          (min_lng <= max_lng AND i.longitude::double precision BETWEEN min_lng AND max_lng)
          OR
          (min_lng > max_lng AND (i.longitude::double precision >= min_lng OR i.longitude::double precision <= max_lng))
        )
      GROUP BY c.id
    )
    SELECT
      'crag'::text AS kind,
      c.id,
      c.name,
      ip.lat AS latitude,
      ip.lng AS longitude,
      1 AS count
    FROM image_points ip
    JOIN public.crags c ON c.id = ip.crag_id
    ORDER BY c.name
    LIMIT 2000;
    RETURN;
  END IF;

  RETURN QUERY
  WITH image_points AS (
    SELECT
      c.id AS crag_id,
      avg(i.latitude)::double precision AS lat,
      avg(i.longitude)::double precision AS lng
    FROM public.images i
    JOIN public.crags c ON c.id = i.crag_id
    WHERE i.latitude IS NOT NULL
      AND i.longitude IS NOT NULL
      AND i.latitude::double precision BETWEEN min_lat AND max_lat
      AND (
        (min_lng <= max_lng AND i.longitude::double precision BETWEEN min_lng AND max_lng)
        OR
        (min_lng > max_lng AND (i.longitude::double precision >= min_lng OR i.longitude::double precision <= max_lng))
      )
    GROUP BY c.id
  ),
  bucketed AS (
    SELECT
      (floor(lat / cell) * cell + cell / 2.0) AS bucket_lat,
      (floor(lng / cell) * cell + cell / 2.0) AS bucket_lng,
      count(*)::integer AS ct
    FROM image_points
    GROUP BY 1, 2
  )
  SELECT
    'cluster'::text AS kind,
    NULL::uuid AS id,
    NULL::character varying AS name,
    b.bucket_lat AS latitude,
    b.bucket_lng AS longitude,
    b.ct AS count
  FROM bucketed b
  ORDER BY b.ct DESC
  LIMIT 1500;
END;
$$;

-- Migration: 20260223000000_map_crag_points_bucket_metadata.sql

-- Map helper: include bucket bounds and single-crag metadata

DROP FUNCTION IF EXISTS public.get_map_crag_points(
  double precision,
  double precision,
  double precision,
  double precision,
  integer
);

CREATE OR REPLACE FUNCTION public.get_map_crag_points(
  min_lat double precision,
  min_lng double precision,
  max_lat double precision,
  max_lng double precision,
  zoom integer
)
RETURNS TABLE (
  kind text,
  id uuid,
  name character varying,
  latitude double precision,
  longitude double precision,
  count integer,
  bucket_south double precision,
  bucket_west double precision,
  bucket_north double precision,
  bucket_east double precision,
  single_crag_id uuid,
  single_crag_name character varying
)
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  cell double precision;
  use_buckets boolean;
BEGIN
  IF zoom IS NULL THEN
    zoom := 0;
  END IF;

  use_buckets := zoom < 8;

  IF use_buckets THEN
    cell := CASE
      WHEN zoom <= 2 THEN 10.0
      WHEN zoom <= 4 THEN 5.0
      WHEN zoom <= 6 THEN 1.0
      WHEN zoom <= 7 THEN 0.25
      ELSE 0.1
    END;
  END IF;

  IF NOT use_buckets THEN
    RETURN QUERY
    WITH image_points AS (
      SELECT
        c.id AS crag_id,
        avg(i.latitude)::double precision AS lat,
        avg(i.longitude)::double precision AS lng
      FROM public.images i
      JOIN public.crags c ON c.id = i.crag_id
      WHERE i.latitude IS NOT NULL
        AND i.longitude IS NOT NULL
        AND i.latitude::double precision BETWEEN min_lat AND max_lat
        AND (
          (min_lng <= max_lng AND i.longitude::double precision BETWEEN min_lng AND max_lng)
          OR
          (min_lng > max_lng AND (i.longitude::double precision >= min_lng OR i.longitude::double precision <= max_lng))
        )
      GROUP BY c.id
    )
    SELECT
      'crag'::text AS kind,
      c.id,
      c.name,
      ip.lat AS latitude,
      ip.lng AS longitude,
      1 AS count,
      NULL::double precision AS bucket_south,
      NULL::double precision AS bucket_west,
      NULL::double precision AS bucket_north,
      NULL::double precision AS bucket_east,
      NULL::uuid AS single_crag_id,
      NULL::character varying AS single_crag_name
    FROM image_points ip
    JOIN public.crags c ON c.id = ip.crag_id
    ORDER BY c.name
    LIMIT 2000;
    RETURN;
  END IF;

  RETURN QUERY
  WITH image_points AS (
    SELECT
      c.id AS crag_id,
      avg(i.latitude)::double precision AS lat,
      avg(i.longitude)::double precision AS lng
    FROM public.images i
    JOIN public.crags c ON c.id = i.crag_id
    WHERE i.latitude IS NOT NULL
      AND i.longitude IS NOT NULL
      AND i.latitude::double precision BETWEEN min_lat AND max_lat
      AND (
        (min_lng <= max_lng AND i.longitude::double precision BETWEEN min_lng AND max_lng)
        OR
        (min_lng > max_lng AND (i.longitude::double precision >= min_lng OR i.longitude::double precision <= max_lng))
      )
    GROUP BY c.id
  ),
  bucketed AS (
    SELECT
      (floor(lat / cell) * cell + cell / 2.0) AS bucket_lat,
      (floor(lng / cell) * cell + cell / 2.0) AS bucket_lng,
      count(*)::integer AS ct,
      min(crag_id) AS min_crag_id
    FROM image_points
    GROUP BY 1, 2
  )
  SELECT
    'cluster'::text AS kind,
    NULL::uuid AS id,
    NULL::character varying AS name,
    b.bucket_lat AS latitude,
    b.bucket_lng AS longitude,
    b.ct AS count,
    (b.bucket_lat - cell / 2.0) AS bucket_south,
    (b.bucket_lng - cell / 2.0) AS bucket_west,
    (b.bucket_lat + cell / 2.0) AS bucket_north,
    (b.bucket_lng + cell / 2.0) AS bucket_east,
    CASE WHEN b.ct = 1 THEN b.min_crag_id ELSE NULL END AS single_crag_id,
    CASE WHEN b.ct = 1 THEN c.name ELSE NULL END AS single_crag_name
  FROM bucketed b
  LEFT JOIN public.crags c ON c.id = b.min_crag_id
  ORDER BY b.ct DESC
  LIMIT 1500;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_map_crag_points(
  double precision,
  double precision,
  double precision,
  double precision,
  integer
) TO anon, authenticated, service_role;

-- Migration: 20260224000000_map_crag_points_security_definer.sql

-- Map helper: allow public RPC access (bypass table grants/RLS)

DROP FUNCTION IF EXISTS public.get_map_crag_points(
  double precision,
  double precision,
  double precision,
  double precision,
  integer
);

CREATE OR REPLACE FUNCTION public.get_map_crag_points(
  min_lat double precision,
  min_lng double precision,
  max_lat double precision,
  max_lng double precision,
  zoom integer
)
RETURNS TABLE (
  kind text,
  id uuid,
  name character varying,
  latitude double precision,
  longitude double precision,
  count integer,
  bucket_south double precision,
  bucket_west double precision,
  bucket_north double precision,
  bucket_east double precision,
  single_crag_id uuid,
  single_crag_name character varying
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  cell double precision;
  use_buckets boolean;
BEGIN
  IF zoom IS NULL THEN
    zoom := 0;
  END IF;

  use_buckets := zoom < 8;

  IF use_buckets THEN
    cell := CASE
      WHEN zoom <= 2 THEN 10.0
      WHEN zoom <= 4 THEN 5.0
      WHEN zoom <= 6 THEN 1.0
      WHEN zoom <= 7 THEN 0.25
      ELSE 0.1
    END;
  END IF;

  IF NOT use_buckets THEN
    RETURN QUERY
    WITH image_points AS (
      SELECT
        c.id AS crag_id,
        avg(i.latitude)::double precision AS lat,
        avg(i.longitude)::double precision AS lng
      FROM public.images i
      JOIN public.crags c ON c.id = i.crag_id
      WHERE i.latitude IS NOT NULL
        AND i.longitude IS NOT NULL
        AND i.latitude::double precision BETWEEN min_lat AND max_lat
        AND (
          (min_lng <= max_lng AND i.longitude::double precision BETWEEN min_lng AND max_lng)
          OR
          (min_lng > max_lng AND (i.longitude::double precision >= min_lng OR i.longitude::double precision <= max_lng))
        )
      GROUP BY c.id
    )
    SELECT
      'crag'::text AS kind,
      c.id,
      c.name,
      ip.lat AS latitude,
      ip.lng AS longitude,
      1 AS count,
      NULL::double precision AS bucket_south,
      NULL::double precision AS bucket_west,
      NULL::double precision AS bucket_north,
      NULL::double precision AS bucket_east,
      NULL::uuid AS single_crag_id,
      NULL::character varying AS single_crag_name
    FROM image_points ip
    JOIN public.crags c ON c.id = ip.crag_id
    ORDER BY c.name
    LIMIT 2000;
    RETURN;
  END IF;

  RETURN QUERY
  WITH image_points AS (
    SELECT
      c.id AS crag_id,
      avg(i.latitude)::double precision AS lat,
      avg(i.longitude)::double precision AS lng
    FROM public.images i
    JOIN public.crags c ON c.id = i.crag_id
    WHERE i.latitude IS NOT NULL
      AND i.longitude IS NOT NULL
      AND i.latitude::double precision BETWEEN min_lat AND max_lat
      AND (
        (min_lng <= max_lng AND i.longitude::double precision BETWEEN min_lng AND max_lng)
        OR
        (min_lng > max_lng AND (i.longitude::double precision >= min_lng OR i.longitude::double precision <= max_lng))
      )
    GROUP BY c.id
  ),
  bucketed AS (
    SELECT
      (floor(lat / cell) * cell + cell / 2.0) AS bucket_lat,
      (floor(lng / cell) * cell + cell / 2.0) AS bucket_lng,
      count(*)::integer AS ct,
      min(crag_id) AS min_crag_id
    FROM image_points
    GROUP BY 1, 2
  )
  SELECT
    'cluster'::text AS kind,
    NULL::uuid AS id,
    NULL::character varying AS name,
    b.bucket_lat AS latitude,
    b.bucket_lng AS longitude,
    b.ct AS count,
    (b.bucket_lat - cell / 2.0) AS bucket_south,
    (b.bucket_lng - cell / 2.0) AS bucket_west,
    (b.bucket_lat + cell / 2.0) AS bucket_north,
    (b.bucket_lng + cell / 2.0) AS bucket_east,
    CASE WHEN b.ct = 1 THEN b.min_crag_id ELSE NULL END AS single_crag_id,
    CASE WHEN b.ct = 1 THEN c.name ELSE NULL END AS single_crag_name
  FROM bucketed b
  LEFT JOIN public.crags c ON c.id = b.min_crag_id
  ORDER BY b.ct DESC
  LIMIT 1500;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_map_crag_points(
  double precision,
  double precision,
  double precision,
  double precision,
  integer
) TO anon, authenticated, service_role;

-- Migration: 20260225000000_map_crag_points_uuid_min_fix.sql

-- Fix: Postgres does not support min(uuid) on some setups.
-- Use min(crag_id::text) and join by text instead.

DROP FUNCTION IF EXISTS public.get_map_crag_points(
  double precision,
  double precision,
  double precision,
  double precision,
  integer
);

CREATE OR REPLACE FUNCTION public.get_map_crag_points(
  min_lat double precision,
  min_lng double precision,
  max_lat double precision,
  max_lng double precision,
  zoom integer
)
RETURNS TABLE (
  kind text,
  id uuid,
  name character varying,
  latitude double precision,
  longitude double precision,
  count integer,
  bucket_south double precision,
  bucket_west double precision,
  bucket_north double precision,
  bucket_east double precision,
  single_crag_id uuid,
  single_crag_name character varying
)
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  cell double precision;
  use_buckets boolean;
BEGIN
  IF zoom IS NULL THEN
    zoom := 0;
  END IF;

  use_buckets := zoom < 8;

  IF use_buckets THEN
    cell := CASE
      WHEN zoom <= 2 THEN 10.0
      WHEN zoom <= 4 THEN 5.0
      WHEN zoom <= 6 THEN 1.0
      WHEN zoom <= 7 THEN 0.25
      ELSE 0.1
    END;
  END IF;

  IF NOT use_buckets THEN
    RETURN QUERY
    WITH image_points AS (
      SELECT
        c.id AS crag_id,
        avg(i.latitude)::double precision AS lat,
        avg(i.longitude)::double precision AS lng
      FROM public.images i
      JOIN public.crags c ON c.id = i.crag_id
      WHERE i.latitude IS NOT NULL
        AND i.longitude IS NOT NULL
        AND i.latitude::double precision BETWEEN min_lat AND max_lat
        AND (
          (min_lng <= max_lng AND i.longitude::double precision BETWEEN min_lng AND max_lng)
          OR
          (min_lng > max_lng AND (i.longitude::double precision >= min_lng OR i.longitude::double precision <= max_lng))
        )
      GROUP BY c.id
    )
    SELECT
      'crag'::text AS kind,
      c.id,
      c.name,
      ip.lat AS latitude,
      ip.lng AS longitude,
      1 AS count,
      NULL::double precision AS bucket_south,
      NULL::double precision AS bucket_west,
      NULL::double precision AS bucket_north,
      NULL::double precision AS bucket_east,
      NULL::uuid AS single_crag_id,
      NULL::character varying AS single_crag_name
    FROM image_points ip
    JOIN public.crags c ON c.id = ip.crag_id
    ORDER BY c.name
    LIMIT 2000;
    RETURN;
  END IF;

  RETURN QUERY
  WITH image_points AS (
    SELECT
      c.id AS crag_id,
      avg(i.latitude)::double precision AS lat,
      avg(i.longitude)::double precision AS lng
    FROM public.images i
    JOIN public.crags c ON c.id = i.crag_id
    WHERE i.latitude IS NOT NULL
      AND i.longitude IS NOT NULL
      AND i.latitude::double precision BETWEEN min_lat AND max_lat
      AND (
        (min_lng <= max_lng AND i.longitude::double precision BETWEEN min_lng AND max_lng)
        OR
        (min_lng > max_lng AND (i.longitude::double precision >= min_lng OR i.longitude::double precision <= max_lng))
      )
    GROUP BY c.id
  ),
  bucketed AS (
    SELECT
      (floor(lat / cell) * cell + cell / 2.0) AS bucket_lat,
      (floor(lng / cell) * cell + cell / 2.0) AS bucket_lng,
      count(*)::integer AS ct,
      min(crag_id::text) AS min_crag_id_text
    FROM image_points
    GROUP BY 1, 2
  )
  SELECT
    'cluster'::text AS kind,
    NULL::uuid AS id,
    NULL::character varying AS name,
    b.bucket_lat AS latitude,
    b.bucket_lng AS longitude,
    b.ct AS count,
    (b.bucket_lat - cell / 2.0) AS bucket_south,
    (b.bucket_lng - cell / 2.0) AS bucket_west,
    (b.bucket_lat + cell / 2.0) AS bucket_north,
    (b.bucket_lng + cell / 2.0) AS bucket_east,
    CASE WHEN b.ct = 1 THEN b.min_crag_id_text::uuid ELSE NULL END AS single_crag_id,
    CASE WHEN b.ct = 1 THEN c.name ELSE NULL END AS single_crag_name
  FROM bucketed b
  LEFT JOIN public.crags c ON c.id::text = b.min_crag_id_text
  ORDER BY b.ct DESC
  LIMIT 1500;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_map_crag_points(
  double precision,
  double precision,
  double precision,
  double precision,
  integer
) TO anon, authenticated, service_role;

-- Migration: 20260226000000_map_crag_points_cluster_centroid.sql

-- Improve map clustering UX:
-- - Place cluster markers at centroid of points (not grid center)
-- - Keep bucket bounds for deterministic drill-in
-- - Avoid min(uuid) by using min(crag_id::text)

CREATE OR REPLACE FUNCTION public.get_map_crag_points(
  min_lat double precision,
  min_lng double precision,
  max_lat double precision,
  max_lng double precision,
  zoom integer
)
RETURNS TABLE (
  kind text,
  id uuid,
  name character varying,
  latitude double precision,
  longitude double precision,
  count integer,
  bucket_south double precision,
  bucket_west double precision,
  bucket_north double precision,
  bucket_east double precision,
  single_crag_id uuid,
  single_crag_name character varying
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  cell double precision;
  use_buckets boolean;
BEGIN
  IF zoom IS NULL THEN
    zoom := 0;
  END IF;

  use_buckets := zoom < 8;

  IF use_buckets THEN
    cell := CASE
      WHEN zoom <= 2 THEN 10.0
      WHEN zoom <= 4 THEN 5.0
      WHEN zoom <= 6 THEN 1.0
      WHEN zoom <= 7 THEN 0.25
      ELSE 0.1
    END;
  END IF;

  IF NOT use_buckets THEN
    RETURN QUERY
    WITH image_points AS (
      SELECT
        c.id AS crag_id,
        avg(i.latitude)::double precision AS lat,
        avg(i.longitude)::double precision AS lng
      FROM public.images i
      JOIN public.crags c ON c.id = i.crag_id
      WHERE i.latitude IS NOT NULL
        AND i.longitude IS NOT NULL
        AND i.latitude::double precision BETWEEN min_lat AND max_lat
        AND (
          (min_lng <= max_lng AND i.longitude::double precision BETWEEN min_lng AND max_lng)
          OR
          (min_lng > max_lng AND (i.longitude::double precision >= min_lng OR i.longitude::double precision <= max_lng))
        )
      GROUP BY c.id
    )
    SELECT
      'crag'::text AS kind,
      c.id,
      c.name,
      ip.lat AS latitude,
      ip.lng AS longitude,
      1 AS count,
      NULL::double precision AS bucket_south,
      NULL::double precision AS bucket_west,
      NULL::double precision AS bucket_north,
      NULL::double precision AS bucket_east,
      NULL::uuid AS single_crag_id,
      NULL::character varying AS single_crag_name
    FROM image_points ip
    JOIN public.crags c ON c.id = ip.crag_id
    ORDER BY c.name
    LIMIT 2000;
    RETURN;
  END IF;

  RETURN QUERY
  WITH image_points AS (
    SELECT
      c.id AS crag_id,
      avg(i.latitude)::double precision AS lat,
      avg(i.longitude)::double precision AS lng
    FROM public.images i
    JOIN public.crags c ON c.id = i.crag_id
    WHERE i.latitude IS NOT NULL
      AND i.longitude IS NOT NULL
      AND i.latitude::double precision BETWEEN min_lat AND max_lat
      AND (
        (min_lng <= max_lng AND i.longitude::double precision BETWEEN min_lng AND max_lng)
        OR
        (min_lng > max_lng AND (i.longitude::double precision >= min_lng OR i.longitude::double precision <= max_lng))
      )
    GROUP BY c.id
  ),
  bucketed AS (
    SELECT
      (floor(lat / cell) * cell + cell / 2.0) AS bucket_lat,
      (floor(lng / cell) * cell + cell / 2.0) AS bucket_lng,
      avg(lat)::double precision AS centroid_lat,
      avg(lng)::double precision AS centroid_lng,
      count(*)::integer AS ct,
      min(crag_id::text) AS min_crag_id_text
    FROM image_points
    GROUP BY 1, 2
  )
  SELECT
    'cluster'::text AS kind,
    NULL::uuid AS id,
    NULL::character varying AS name,
    b.centroid_lat AS latitude,
    b.centroid_lng AS longitude,
    b.ct AS count,
    (b.bucket_lat - cell / 2.0) AS bucket_south,
    (b.bucket_lng - cell / 2.0) AS bucket_west,
    (b.bucket_lat + cell / 2.0) AS bucket_north,
    (b.bucket_lng + cell / 2.0) AS bucket_east,
    CASE WHEN b.ct = 1 THEN b.min_crag_id_text::uuid ELSE NULL END AS single_crag_id,
    CASE WHEN b.ct = 1 THEN c.name ELSE NULL END AS single_crag_name
  FROM bucketed b
  LEFT JOIN public.crags c ON c.id::text = b.min_crag_id_text
  ORDER BY b.ct DESC
  LIMIT 1500;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_map_crag_points(
  double precision,
  double precision,
  double precision,
  double precision,
  integer
) TO anon, authenticated, service_role;

-- Migration: 20260228000000_crag_location_from_images.sql

-- Keep crag latitude/longitude derived from image GPS.
-- Requirement: crags with coordinates must have at least one image with GPS.

CREATE OR REPLACE FUNCTION public.recompute_crag_location(target_crag_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  avg_lat numeric;
  avg_lng numeric;
BEGIN
  IF target_crag_id IS NULL THEN
    RETURN;
  END IF;

  SELECT
    avg(i.latitude),
    avg(i.longitude)
  INTO avg_lat, avg_lng
  FROM public.images i
  WHERE i.crag_id = target_crag_id
    AND i.latitude IS NOT NULL
    AND i.longitude IS NOT NULL;

  UPDATE public.crags c
  SET
    latitude = CASE WHEN avg_lat IS NULL THEN NULL ELSE avg_lat::numeric(10,8) END,
    longitude = CASE WHEN avg_lng IS NULL THEN NULL ELSE avg_lng::numeric(11,8) END
  WHERE c.id = target_crag_id;
END;
$$;


CREATE OR REPLACE FUNCTION public.images_recompute_crag_location_trigger()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    PERFORM public.recompute_crag_location(NEW.crag_id);
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    IF NEW.crag_id IS DISTINCT FROM OLD.crag_id THEN
      PERFORM public.recompute_crag_location(OLD.crag_id);
      PERFORM public.recompute_crag_location(NEW.crag_id);
      RETURN NEW;
    END IF;

    IF NEW.latitude IS DISTINCT FROM OLD.latitude OR NEW.longitude IS DISTINCT FROM OLD.longitude THEN
      PERFORM public.recompute_crag_location(NEW.crag_id);
      RETURN NEW;
    END IF;

    RETURN NEW;
  END IF;

  IF TG_OP = 'DELETE' THEN
    PERFORM public.recompute_crag_location(OLD.crag_id);
    RETURN OLD;
  END IF;

  RETURN NULL;
END;
$$;


DROP TRIGGER IF EXISTS images_recompute_crag_location_insert ON public.images;
DROP TRIGGER IF EXISTS images_recompute_crag_location_update ON public.images;
DROP TRIGGER IF EXISTS images_recompute_crag_location_delete ON public.images;

CREATE TRIGGER images_recompute_crag_location_insert
AFTER INSERT ON public.images
FOR EACH ROW
EXECUTE FUNCTION public.images_recompute_crag_location_trigger();

CREATE TRIGGER images_recompute_crag_location_update
AFTER UPDATE OF crag_id, latitude, longitude ON public.images
FOR EACH ROW
EXECUTE FUNCTION public.images_recompute_crag_location_trigger();

CREATE TRIGGER images_recompute_crag_location_delete
AFTER DELETE ON public.images
FOR EACH ROW
EXECUTE FUNCTION public.images_recompute_crag_location_trigger();


-- Backfill: set all crag coordinates from images.
WITH agg AS (
  SELECT
    i.crag_id,
    avg(i.latitude)::numeric(10,8) AS avg_lat,
    avg(i.longitude)::numeric(11,8) AS avg_lng
  FROM public.images i
  WHERE i.crag_id IS NOT NULL
    AND i.latitude IS NOT NULL
    AND i.longitude IS NOT NULL
  GROUP BY i.crag_id
)
UPDATE public.crags c
SET latitude = a.avg_lat,
    longitude = a.avg_lng
FROM agg a
WHERE c.id = a.crag_id;

-- Enforce invariant: if no images with GPS exist for a crag, coordinates must be NULL.
UPDATE public.crags c
SET latitude = NULL,
    longitude = NULL
WHERE (c.latitude IS NOT NULL OR c.longitude IS NOT NULL)
  AND NOT EXISTS (
    SELECT 1
    FROM public.images i
    WHERE i.crag_id = c.id
      AND i.latitude IS NOT NULL
      AND i.longitude IS NOT NULL
  );

-- Migration: 20260228000001_drop_map_rpc.sql

-- Cleanup: drop the experimental map RPC function.

DROP FUNCTION IF EXISTS public.get_map_crag_points(
  double precision,
  double precision,
  double precision,
  double precision,
  integer
);

-- Migration: 20260301000000_auto_delete_empty_crags.sql

-- Auto-delete empty crags immediately when the last image is deleted.
-- Also deletes crags when images are moved to different crags (leaving old crag empty).
-- Note: This will cascade delete all climbs associated with the crag.

CREATE OR REPLACE FUNCTION public.delete_empty_crag(
  target_crag_id uuid,
  grace_period interval DEFAULT interval '24 hours'
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  deleted_count integer := 0;
BEGIN
  IF target_crag_id IS NULL THEN
    RETURN false;
  END IF;

  DELETE FROM public.crags c
  WHERE c.id = target_crag_id
    AND c.created_at < now() - grace_period
    AND NOT EXISTS (
      SELECT 1
      FROM public.images i
      WHERE i.crag_id = c.id
    );

  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count > 0;
END;
$$;


CREATE OR REPLACE FUNCTION public.delete_empty_crags(
  grace_period interval DEFAULT interval '24 hours'
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  deleted_count integer := 0;
BEGIN
  DELETE FROM public.crags c
  WHERE c.created_at < now() - grace_period
    AND NOT EXISTS (
      SELECT 1
      FROM public.images i
      WHERE i.crag_id = c.id
    );

  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$$;


CREATE OR REPLACE FUNCTION public.images_recompute_crag_location_trigger()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    PERFORM public.recompute_crag_location(NEW.crag_id);
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' THEN
      IF NEW.crag_id IS DISTINCT FROM OLD.crag_id THEN
      PERFORM public.recompute_crag_location(OLD.crag_id);
      PERFORM public.recompute_crag_location(NEW.crag_id);
      PERFORM public.delete_empty_crag(OLD.crag_id, interval '0 seconds');
      RETURN NEW;
    END IF;

    IF NEW.latitude IS DISTINCT FROM OLD.latitude OR NEW.longitude IS DISTINCT FROM OLD.longitude THEN
      PERFORM public.recompute_crag_location(NEW.crag_id);
      RETURN NEW;
    END IF;

    RETURN NEW;
  END IF;

  IF TG_OP = 'DELETE' THEN
    PERFORM public.recompute_crag_location(OLD.crag_id);
    PERFORM public.delete_empty_crag(OLD.crag_id, interval '0 seconds');
    RETURN OLD;
  END IF;

  RETURN NULL;
END;
$$;


-- One-time cleanup for existing legacy rows.
SELECT public.delete_empty_crags(interval '24 hours');

-- Migration: 20260302000000_add_images_face_direction.sql

ALTER TABLE images
ADD COLUMN IF NOT EXISTS face_direction VARCHAR(2);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'images_face_direction_check'
      AND conrelid = 'images'::regclass
  ) THEN
    ALTER TABLE images
    ADD CONSTRAINT images_face_direction_check
    CHECK (face_direction IS NULL OR face_direction IN ('N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'));
  END IF;
END $$;

-- Migration: 20260302000012_add_delete_policy_for_submission_drafts.sql

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_class
    JOIN pg_namespace ON pg_namespace.oid = pg_class.relnamespace
    WHERE pg_namespace.nspname = 'public'
      AND pg_class.relname = 'submission_drafts'
      AND pg_class.relkind = 'r'
  ) AND NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'submission_drafts' AND policyname = 'Users delete own submission_drafts'
  ) THEN
    CREATE POLICY "Users delete own submission_drafts"
      ON public.submission_drafts
      FOR DELETE
      USING (auth.uid() = user_id);
  END IF;

  IF EXISTS (
    SELECT 1
    FROM pg_class
    JOIN pg_namespace ON pg_namespace.oid = pg_class.relnamespace
    WHERE pg_namespace.nspname = 'public'
      AND pg_class.relname = 'submission_draft_images'
      AND pg_class.relkind = 'r'
  ) AND NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'submission_draft_images' AND policyname = 'Users delete own submission_draft_images'
  ) THEN
    CREATE POLICY "Users delete own submission_draft_images"
      ON public.submission_draft_images
      FOR DELETE
      USING (
        EXISTS (
          SELECT 1
          FROM public.submission_drafts d
          WHERE d.id = submission_draft_images.draft_id
            AND d.user_id = auth.uid()
        )
      );
  END IF;
END $$;

-- Migration: 20260302161000_add_owner_read_images_policy.sql

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'images'
      AND policyname = 'Owner read own images'
  ) THEN
    CREATE POLICY "Owner read own images"
      ON public.images
      FOR SELECT
      USING (auth.uid() = created_by);
  END IF;
END $$;

-- Migration: 20260303000000_fix_profiles_id_uniqueness.sql

-- Ensure one profile row per auth user and enforce uniqueness on profiles.id

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'profiles'
      AND column_name = 'id'
  ) THEN
    WITH ranked_profiles AS (
      SELECT
        ctid,
        ROW_NUMBER() OVER (
          PARTITION BY id
          ORDER BY updated_at DESC NULLS LAST, ctid DESC
        ) AS row_num
      FROM public.profiles
    )
    DELETE FROM public.profiles p
    USING ranked_profiles r
    WHERE p.ctid = r.ctid
      AND r.row_num > 1;
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'profiles'
      AND column_name = 'id'
  ) THEN
    CREATE UNIQUE INDEX IF NOT EXISTS profiles_id_key ON public.profiles USING btree (id);
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_indexes
    WHERE schemaname = 'public'
      AND tablename = 'profiles'
      AND indexname = 'profiles_id_key'
  )
  AND NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'public.profiles'::regclass
      AND contype = 'p'
  ) THEN
    ALTER TABLE public.profiles
    ADD CONSTRAINT profiles_pkey PRIMARY KEY USING INDEX profiles_id_key;
  END IF;
END $$;

-- Migration: 20260303000001_add_comments_community_boards.sql

-- Community comments for crags and images (public read, authenticated write)

CREATE TABLE IF NOT EXISTS public.comments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  target_type TEXT NOT NULL CHECK (target_type IN ('crag', 'image')),
  target_id UUID NOT NULL,
  author_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  body TEXT NOT NULL CHECK (char_length(body) BETWEEN 1 AND 2000),
  category TEXT NOT NULL DEFAULT 'other' CHECK (category IN ('history', 'broken_hold', 'approach_beta', 'beta', 'conditions', 'other')),
  deleted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_comments_target_created
  ON public.comments(target_type, target_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_comments_author_created
  ON public.comments(author_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_comments_visible_target_created
  ON public.comments(target_type, target_id, created_at DESC)
  WHERE deleted_at IS NULL;

CREATE OR REPLACE FUNCTION public.validate_comment_target()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.target_type = 'crag' THEN
    IF NOT EXISTS (SELECT 1 FROM public.crags c WHERE c.id = NEW.target_id) THEN
      RAISE EXCEPTION 'Target crag does not exist';
    END IF;
  ELSIF NEW.target_type = 'image' THEN
    IF NOT EXISTS (SELECT 1 FROM public.images i WHERE i.id = NEW.target_id) THEN
      RAISE EXCEPTION 'Target image does not exist';
    END IF;
  ELSE
    RAISE EXCEPTION 'Invalid target type';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS comments_validate_target_trigger ON public.comments;
CREATE TRIGGER comments_validate_target_trigger
BEFORE INSERT OR UPDATE OF target_type, target_id ON public.comments
FOR EACH ROW
EXECUTE FUNCTION public.validate_comment_target();

CREATE OR REPLACE FUNCTION public.enforce_comment_soft_delete_only()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF OLD.target_type <> NEW.target_type
     OR OLD.target_id <> NEW.target_id
     OR OLD.author_id IS DISTINCT FROM NEW.author_id
     OR OLD.body <> NEW.body
     OR OLD.category <> NEW.category
     OR OLD.created_at <> NEW.created_at THEN
    RAISE EXCEPTION 'Comments cannot be edited';
  END IF;

  IF OLD.deleted_at IS NOT NULL THEN
    RAISE EXCEPTION 'Comment already deleted';
  END IF;

  IF NEW.deleted_at IS NULL THEN
    RAISE EXCEPTION 'Comments can only be soft-deleted';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS comments_soft_delete_only_trigger ON public.comments;
CREATE TRIGGER comments_soft_delete_only_trigger
BEFORE UPDATE ON public.comments
FOR EACH ROW
EXECUTE FUNCTION public.enforce_comment_soft_delete_only();

DO $$
BEGIN
  ALTER TABLE public.comments ENABLE ROW LEVEL SECURITY;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'comments'
      AND policyname = 'Public read visible comments'
  ) THEN
    CREATE POLICY "Public read visible comments"
      ON public.comments
      FOR SELECT
      USING (deleted_at IS NULL);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'comments'
      AND policyname = 'Authenticated create comments'
  ) THEN
    CREATE POLICY "Authenticated create comments"
      ON public.comments
      FOR INSERT
      WITH CHECK (auth.role() = 'authenticated' AND auth.uid() = author_id AND deleted_at IS NULL);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'comments'
      AND policyname = 'Author soft delete comments'
  ) THEN
    CREATE POLICY "Author soft delete comments"
      ON public.comments
      FOR UPDATE
      USING (auth.uid() = author_id AND deleted_at IS NULL)
      WITH CHECK (auth.uid() = author_id);
  END IF;
END $$;

-- Migration: 20260306000000_fix_comment_soft_delete_and_enable_rls.sql

-- Fix comment soft-delete RLS and address Security Advisor RLS findings.

-- ---------------------------------------------------------------------
-- comments: allow author soft-delete transition (deleted_at NULL -> NOT NULL)
-- ---------------------------------------------------------------------
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'comments'
      AND policyname = 'Author soft delete comments'
  ) THEN
    DROP POLICY "Author soft delete comments" ON public.comments;
  END IF;

  CREATE POLICY "Author soft delete comments"
    ON public.comments
    FOR UPDATE
    USING (auth.uid() = author_id AND deleted_at IS NULL)
    WITH CHECK (auth.uid() = author_id AND deleted_at IS NOT NULL);
END $$;

-- ---------------------------------------------------------------------
-- product_clicks: enable RLS and keep public read + public click increment
-- ---------------------------------------------------------------------
DO $$
BEGIN
  IF to_regclass('public.product_clicks') IS NOT NULL THEN
    ALTER TABLE public.product_clicks ENABLE ROW LEVEL SECURITY;

    IF EXISTS (
      SELECT 1
      FROM pg_policies
      WHERE schemaname = 'public'
        AND tablename = 'product_clicks'
        AND policyname = 'Public read product clicks'
    ) THEN
      DROP POLICY "Public read product clicks" ON public.product_clicks;
    END IF;

    CREATE POLICY "Public read product clicks"
      ON public.product_clicks
      FOR SELECT
      USING (true);

    REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON TABLE public.product_clicks FROM anon;
    REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON TABLE public.product_clicks FROM authenticated;

    GRANT SELECT ON TABLE public.product_clicks TO anon;
    GRANT SELECT ON TABLE public.product_clicks TO authenticated;

    CREATE OR REPLACE FUNCTION public.increment_gear_click(product_id_input text)
    RETURNS void
    LANGUAGE plpgsql
    SECURITY DEFINER
    SET search_path = public
    AS $func$
    BEGIN
      INSERT INTO public.product_clicks (product_id, click_count, updated_at)
      VALUES (product_id_input, 1, NOW())
      ON CONFLICT (product_id)
      DO UPDATE SET
        click_count = public.product_clicks.click_count + 1,
        updated_at = NOW();
    END;
    $func$;

    REVOKE ALL ON FUNCTION public.increment_gear_click(text) FROM PUBLIC;
    GRANT EXECUTE ON FUNCTION public.increment_gear_click(text) TO anon;
    GRANT EXECUTE ON FUNCTION public.increment_gear_click(text) TO authenticated;
    GRANT EXECUTE ON FUNCTION public.increment_gear_click(text) TO service_role;
  END IF;
END $$;

-- ---------------------------------------------------------------------
-- deleted_accounts: enable RLS and lock down to service_role only
-- ---------------------------------------------------------------------
DO $$
BEGIN
  IF to_regclass('public.deleted_accounts') IS NOT NULL THEN
    ALTER TABLE public.deleted_accounts ENABLE ROW LEVEL SECURITY;

    IF EXISTS (
      SELECT 1
      FROM pg_policies
      WHERE schemaname = 'public'
        AND tablename = 'deleted_accounts'
        AND policyname = 'Service role manage deleted accounts'
    ) THEN
      DROP POLICY "Service role manage deleted accounts" ON public.deleted_accounts;
    END IF;

    CREATE POLICY "Service role manage deleted accounts"
      ON public.deleted_accounts
      FOR ALL
      TO service_role
      USING (true)
      WITH CHECK (true);

    REVOKE SELECT, INSERT, UPDATE, DELETE, TRUNCATE ON TABLE public.deleted_accounts FROM anon;
    REVOKE SELECT, INSERT, UPDATE, DELETE, TRUNCATE ON TABLE public.deleted_accounts FROM authenticated;
  END IF;
END $$;

-- ---------------------------------------------------------------------
-- spatial_ref_sys: enable RLS with public read policy (PostGIS reference)
-- ---------------------------------------------------------------------
DO $$
BEGIN
  IF to_regclass('public.spatial_ref_sys') IS NOT NULL THEN
    BEGIN
      ALTER TABLE public.spatial_ref_sys ENABLE ROW LEVEL SECURITY;
    EXCEPTION
      WHEN insufficient_privilege THEN
        RAISE NOTICE 'Skipping RLS enable on public.spatial_ref_sys (insufficient privilege)';
        RETURN;
    END;

    IF EXISTS (
      SELECT 1
      FROM pg_policies
      WHERE schemaname = 'public'
        AND tablename = 'spatial_ref_sys'
        AND policyname = 'Public read spatial_ref_sys'
    ) THEN
      DROP POLICY "Public read spatial_ref_sys" ON public.spatial_ref_sys;
    END IF;

    CREATE POLICY "Public read spatial_ref_sys"
      ON public.spatial_ref_sys
      FOR SELECT
      USING (true);
  END IF;
END $$;

-- Migration: 20260306010000_add_soft_delete_comment_rpc.sql

-- Use SECURITY DEFINER RPC for comment soft-delete to avoid
-- PostgREST UPDATE+RLS visibility edge cases.

CREATE OR REPLACE FUNCTION public.soft_delete_comment(p_comment_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  current_user_id UUID := auth.uid();
BEGIN
  IF current_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  UPDATE public.comments
  SET deleted_at = NOW()
  WHERE id = p_comment_id
    AND author_id = current_user_id
    AND deleted_at IS NULL;

  RETURN FOUND;
END;
$function$;

REVOKE ALL ON FUNCTION public.soft_delete_comment(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.soft_delete_comment(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.soft_delete_comment(UUID) TO service_role;

-- Migration: 20260306020000_scope_comment_categories_by_target.sql

-- Scope comment categories by target type to reduce duplicate discussion.

DROP TRIGGER IF EXISTS comments_soft_delete_only_trigger ON public.comments;

ALTER TABLE public.comments
  DROP CONSTRAINT IF EXISTS comments_target_type_check;

ALTER TABLE public.comments
  DROP CONSTRAINT IF EXISTS comments_category_check;

UPDATE public.comments
SET category = CASE
  WHEN target_type = 'crag' THEN
    CASE
      WHEN category = 'access' THEN 'access'
      WHEN category IN ('approach', 'approach_beta') THEN 'approach'
      WHEN category = 'parking' THEN 'parking'
      WHEN category = 'closure' THEN 'closure'
      ELSE 'general'
    END
  WHEN target_type = 'image' THEN
    CASE
      WHEN category = 'topo_error' THEN 'topo_error'
      WHEN category = 'line_request' THEN 'line_request'
      WHEN category = 'photo_outdated' THEN 'photo_outdated'
      ELSE 'other_topo'
    END
  WHEN target_type = 'climb' THEN
    CASE
      WHEN category = 'beta' THEN 'beta'
      WHEN category = 'broken_hold' THEN 'broken_hold'
      WHEN category = 'conditions' THEN 'conditions'
      WHEN category = 'grade' THEN 'grade'
      WHEN category = 'history' THEN 'history'
      ELSE 'beta'
    END
  ELSE 'general'
END;

ALTER TABLE public.comments
  ADD CONSTRAINT comments_target_type_check
  CHECK (target_type IN ('crag', 'image', 'climb'));

ALTER TABLE public.comments
  ADD CONSTRAINT comments_category_check
  CHECK (
    category IN (
      'access',
      'approach',
      'parking',
      'closure',
      'general',
      'topo_error',
      'line_request',
      'photo_outdated',
      'other_topo',
      'beta',
      'broken_hold',
      'conditions',
      'grade',
      'history'
    )
  );

CREATE OR REPLACE FUNCTION public.validate_comment_target()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.target_type = 'crag' THEN
    IF NOT EXISTS (SELECT 1 FROM public.crags c WHERE c.id = NEW.target_id) THEN
      RAISE EXCEPTION 'Target crag does not exist';
    END IF;
  ELSIF NEW.target_type = 'image' THEN
    IF NOT EXISTS (SELECT 1 FROM public.images i WHERE i.id = NEW.target_id) THEN
      RAISE EXCEPTION 'Target image does not exist';
    END IF;
  ELSIF NEW.target_type = 'climb' THEN
    IF NOT EXISTS (SELECT 1 FROM public.climbs cl WHERE cl.id = NEW.target_id) THEN
      RAISE EXCEPTION 'Target climb does not exist';
    END IF;
  ELSE
    RAISE EXCEPTION 'Invalid target type';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER comments_soft_delete_only_trigger
BEFORE UPDATE ON public.comments
FOR EACH ROW
EXECUTE FUNCTION public.enforce_comment_soft_delete_only();

-- Migration: 20260307000000_add_image_storage_columns.sql

ALTER TABLE public.images
ADD COLUMN IF NOT EXISTS storage_bucket TEXT;

ALTER TABLE public.images
ADD COLUMN IF NOT EXISTS storage_path TEXT;

UPDATE public.images
SET
  storage_bucket = 'route-uploads',
  storage_path = split_part(split_part(url, '/route-uploads/', 2), '?', 1)
WHERE
  storage_bucket IS NULL
  AND storage_path IS NULL
  AND url LIKE '%/route-uploads/%';

CREATE INDEX IF NOT EXISTS idx_images_storage_location
ON public.images(storage_bucket, storage_path);

-- Migration: 20260307010000_gate_route_upload_reads.sql

-- Gate private route upload reads:
-- - anyone can read approved images
-- - uploader can read their own uploads (for submit flow preview before moderation)

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'storage'
      AND tablename = 'objects'
      AND policyname = 'Route uploads read gated'
  ) THEN
    EXECUTE 'DROP POLICY "Route uploads read gated" ON storage.objects';
  END IF;

  EXECUTE $policy$
    CREATE POLICY "Route uploads read gated"
    ON storage.objects
    FOR SELECT
    TO public
    USING (
      bucket_id = 'route-uploads'
      AND (
        split_part(name, '/', 1) = auth.uid()::text
        OR EXISTS (
          SELECT 1
          FROM public.images i
          WHERE i.storage_bucket = 'route-uploads'
            AND i.storage_path = storage.objects.name
            AND coalesce(i.moderation_status, 'pending') = 'approved'
        )
      )
    )
  $policy$;
END $$;

-- Migration: 20260308000000_update_topo_note_categories.sql

-- Replace image comment categories with positive topo note buckets.

ALTER TABLE public.comments
  DROP CONSTRAINT IF EXISTS comments_category_check;

ALTER TABLE public.comments
  ADD CONSTRAINT comments_category_check
  CHECK (
    category IN (
      'access',
      'approach',
      'parking',
      'closure',
      'general',
      'beta',
      'fa_history',
      'safety',
      'gear_protection',
      'conditions',
      'approach_access',
      'descent',
      'rock_quality',
      'highlights',
      'variations',
      'topo_error',
      'line_request',
      'photo_outdated',
      'other_topo',
      'broken_hold',
      'grade',
      'history'
    )
  );

-- Migration: 20260309000000_add_user_climb_feedback_and_consensus_votes.sql

ALTER TABLE public.user_climbs
ADD COLUMN IF NOT EXISTS grade_opinion VARCHAR(10),
ADD COLUMN IF NOT EXISTS grade_vote_baseline VARCHAR(10),
ADD COLUMN IF NOT EXISTS star_rating SMALLINT;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'user_climbs_grade_opinion_check'
  ) THEN
    ALTER TABLE public.user_climbs
    ADD CONSTRAINT user_climbs_grade_opinion_check
    CHECK (grade_opinion IS NULL OR grade_opinion IN ('soft', 'agree', 'hard'));
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'user_climbs_star_rating_check'
  ) THEN
    ALTER TABLE public.user_climbs
    ADD CONSTRAINT user_climbs_star_rating_check
    CHECK (star_rating IS NULL OR (star_rating >= 1 AND star_rating <= 5));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_user_climbs_grade_opinion
ON public.user_climbs(climb_id, grade_opinion)
WHERE grade_opinion IS NOT NULL;

-- Migration: 20260309010000_add_star_rating_summary_rpc.sql

CREATE OR REPLACE FUNCTION public.get_star_rating_summary(p_climb_id UUID)
RETURNS TABLE(avg_rating NUMERIC, rating_count INTEGER)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $function$
  SELECT
    ROUND(AVG(star_rating)::numeric, 2) AS avg_rating,
    COUNT(star_rating)::int AS rating_count
  FROM public.user_climbs
  WHERE climb_id = p_climb_id
    AND star_rating IS NOT NULL;
$function$;

REVOKE ALL ON FUNCTION public.get_star_rating_summary(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_star_rating_summary(UUID) TO anon;
GRANT EXECUTE ON FUNCTION public.get_star_rating_summary(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_star_rating_summary(UUID) TO service_role;

-- Migration: 20260310000000_add_places_and_sync_with_crags.sql

-- =====================================================
-- Places model (indoor + outdoor) with legacy crags sync
-- =====================================================

CREATE EXTENSION IF NOT EXISTS postgis;

CREATE TABLE IF NOT EXISTS public.places (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  type TEXT NOT NULL CHECK (type IN ('crag', 'gym')),
  name VARCHAR(200) NOT NULL,
  latitude DECIMAL(10,8),
  longitude DECIMAL(11,8),
  region_id UUID REFERENCES public.regions(id) ON DELETE SET NULL,
  description TEXT,
  access_notes TEXT,
  rock_type VARCHAR(50),
  boundary GEOMETRY(POLYGON, 4326),
  region_name VARCHAR(100),
  country VARCHAR(100),
  country_code VARCHAR(2),
  tide_dependency VARCHAR(20),
  report_count INTEGER NOT NULL DEFAULT 0,
  is_flagged BOOLEAN NOT NULL DEFAULT false,
  slug TEXT,
  primary_discipline TEXT,
  disciplines TEXT[] NOT NULL DEFAULT '{}'::TEXT[],
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT places_primary_discipline_valid
    CHECK (
      primary_discipline IS NULL
      OR primary_discipline = ANY(ARRAY['boulder', 'sport', 'trad', 'deep_water_solo', 'mixed', 'top_rope'])
    ),
  CONSTRAINT places_disciplines_valid
    CHECK (
      disciplines <@ ARRAY['boulder', 'sport', 'trad', 'deep_water_solo', 'mixed', 'top_rope']::TEXT[]
    ),
  CONSTRAINT places_primary_discipline_in_disciplines
    CHECK (
      primary_discipline IS NULL
      OR primary_discipline = ANY(disciplines)
    ),
  CONSTRAINT places_gym_disciplines_guard
    CHECK (
      type <> 'gym'
      OR NOT (disciplines && ARRAY['trad', 'deep_water_solo']::TEXT[])
    )
);

CREATE INDEX IF NOT EXISTS idx_places_type ON public.places(type);
CREATE INDEX IF NOT EXISTS idx_places_name ON public.places(name);
CREATE INDEX IF NOT EXISTS idx_places_location ON public.places(latitude, longitude);
CREATE INDEX IF NOT EXISTS idx_places_region ON public.places(region_id);
CREATE INDEX IF NOT EXISTS idx_places_country_code ON public.places(country_code);
CREATE INDEX IF NOT EXISTS idx_places_slug ON public.places(slug);
CREATE INDEX IF NOT EXISTS idx_places_boundary ON public.places USING GIST(boundary);

CREATE UNIQUE INDEX IF NOT EXISTS uq_places_country_code_slug
  ON public.places(country_code, slug)
  WHERE country_code IS NOT NULL AND slug IS NOT NULL;

INSERT INTO public.places (
  id,
  type,
  name,
  latitude,
  longitude,
  region_id,
  description,
  access_notes,
  rock_type,
  boundary,
  region_name,
  country,
  country_code,
  tide_dependency,
  report_count,
  is_flagged,
  slug,
  primary_discipline,
  disciplines,
  created_at,
  updated_at
)
SELECT
  c.id,
  'crag'::TEXT,
  c.name,
  c.latitude,
  c.longitude,
  c.region_id,
  c.description,
  c.access_notes,
  c.rock_type,
  c.boundary,
  c.region_name,
  c.country,
  c.country_code,
  c.tide_dependency,
  COALESCE(c.report_count, 0),
  COALESCE(c.is_flagged, false),
  c.slug,
  CASE
    WHEN c.type IN ('boulder', 'sport', 'trad', 'deep_water_solo', 'mixed', 'top_rope') THEN c.type
    WHEN c.type = 'crag' THEN 'mixed'
    ELSE 'boulder'
  END AS primary_discipline,
  ARRAY[
    CASE
      WHEN c.type IN ('boulder', 'sport', 'trad', 'deep_water_solo', 'mixed', 'top_rope') THEN c.type
      WHEN c.type = 'crag' THEN 'mixed'
      ELSE 'boulder'
    END
  ]::TEXT[] AS disciplines,
  c.created_at,
  c.updated_at
FROM public.crags c
ON CONFLICT (id) DO UPDATE
SET
  type = EXCLUDED.type,
  name = EXCLUDED.name,
  latitude = EXCLUDED.latitude,
  longitude = EXCLUDED.longitude,
  region_id = EXCLUDED.region_id,
  description = EXCLUDED.description,
  access_notes = EXCLUDED.access_notes,
  rock_type = EXCLUDED.rock_type,
  boundary = EXCLUDED.boundary,
  region_name = EXCLUDED.region_name,
  country = EXCLUDED.country,
  country_code = EXCLUDED.country_code,
  tide_dependency = EXCLUDED.tide_dependency,
  report_count = EXCLUDED.report_count,
  is_flagged = EXCLUDED.is_flagged,
  slug = EXCLUDED.slug,
  primary_discipline = EXCLUDED.primary_discipline,
  disciplines = EXCLUDED.disciplines,
  updated_at = NOW();

ALTER TABLE public.images ADD COLUMN IF NOT EXISTS place_id UUID;
ALTER TABLE public.climbs ADD COLUMN IF NOT EXISTS place_id UUID;

UPDATE public.images
SET place_id = crag_id
WHERE place_id IS NULL
  AND crag_id IS NOT NULL;

UPDATE public.climbs
SET place_id = crag_id
WHERE place_id IS NULL
  AND crag_id IS NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'images_place_id_fkey'
  ) THEN
    ALTER TABLE public.images
      ADD CONSTRAINT images_place_id_fkey
      FOREIGN KEY (place_id) REFERENCES public.places(id) ON DELETE SET NULL;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'climbs_place_id_fkey'
  ) THEN
    ALTER TABLE public.climbs
      ADD CONSTRAINT climbs_place_id_fkey
      FOREIGN KEY (place_id) REFERENCES public.places(id) ON DELETE SET NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_images_place ON public.images(place_id);
CREATE INDEX IF NOT EXISTS idx_climbs_place ON public.climbs(place_id);

CREATE OR REPLACE FUNCTION public.sync_crag_to_place()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  resolved_primary TEXT;
BEGIN
  IF pg_trigger_depth() > 1 THEN
    IF TG_OP = 'DELETE' THEN
      RETURN OLD;
    END IF;
    RETURN NEW;
  END IF;

  IF TG_OP = 'DELETE' THEN
    DELETE FROM public.places WHERE id = OLD.id AND type = 'crag';
    RETURN OLD;
  END IF;

  resolved_primary := CASE
    WHEN NEW.type IN ('boulder', 'sport', 'trad', 'deep_water_solo', 'mixed', 'top_rope') THEN NEW.type
    WHEN NEW.type = 'crag' THEN 'mixed'
    ELSE 'boulder'
  END;

  INSERT INTO public.places (
    id,
    type,
    name,
    latitude,
    longitude,
    region_id,
    description,
    access_notes,
    rock_type,
    boundary,
    region_name,
    country,
    country_code,
    tide_dependency,
    report_count,
    is_flagged,
    slug,
    primary_discipline,
    disciplines,
    created_at,
    updated_at
  )
  VALUES (
    NEW.id,
    'crag',
    NEW.name,
    NEW.latitude,
    NEW.longitude,
    NEW.region_id,
    NEW.description,
    NEW.access_notes,
    NEW.rock_type,
    NEW.boundary,
    NEW.region_name,
    NEW.country,
    NEW.country_code,
    NEW.tide_dependency,
    COALESCE(NEW.report_count, 0),
    COALESCE(NEW.is_flagged, false),
    NEW.slug,
    resolved_primary,
    ARRAY[resolved_primary]::TEXT[],
    COALESCE(NEW.created_at, NOW()),
    COALESCE(NEW.updated_at, NOW())
  )
  ON CONFLICT (id) DO UPDATE
  SET
    type = 'crag',
    name = EXCLUDED.name,
    latitude = EXCLUDED.latitude,
    longitude = EXCLUDED.longitude,
    region_id = EXCLUDED.region_id,
    description = EXCLUDED.description,
    access_notes = EXCLUDED.access_notes,
    rock_type = EXCLUDED.rock_type,
    boundary = EXCLUDED.boundary,
    region_name = EXCLUDED.region_name,
    country = EXCLUDED.country,
    country_code = EXCLUDED.country_code,
    tide_dependency = EXCLUDED.tide_dependency,
    report_count = EXCLUDED.report_count,
    is_flagged = EXCLUDED.is_flagged,
    slug = EXCLUDED.slug,
    primary_discipline = EXCLUDED.primary_discipline,
    disciplines = EXCLUDED.disciplines,
    updated_at = NOW();

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS crags_sync_to_places_after_write ON public.crags;
CREATE TRIGGER crags_sync_to_places_after_write
AFTER INSERT OR UPDATE OR DELETE ON public.crags
FOR EACH ROW
EXECUTE FUNCTION public.sync_crag_to_place();

CREATE OR REPLACE FUNCTION public.sync_place_to_crag()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF pg_trigger_depth() > 1 THEN
    IF TG_OP = 'DELETE' THEN
      RETURN OLD;
    END IF;
    RETURN NEW;
  END IF;

  IF TG_OP = 'DELETE' THEN
    IF OLD.type = 'crag' THEN
      DELETE FROM public.crags WHERE id = OLD.id;
    END IF;
    RETURN OLD;
  END IF;

  IF NEW.type = 'crag' THEN
    INSERT INTO public.crags (
      id,
      name,
      latitude,
      longitude,
      region_id,
      description,
      access_notes,
      rock_type,
      type,
      created_at,
      updated_at,
      report_count,
      is_flagged,
      boundary,
      region_name,
      country,
      tide_dependency,
      country_code,
      slug
    )
    VALUES (
      NEW.id,
      NEW.name,
      NEW.latitude,
      NEW.longitude,
      NEW.region_id,
      NEW.description,
      NEW.access_notes,
      NEW.rock_type,
      COALESCE(NEW.primary_discipline, 'boulder'),
      COALESCE(NEW.created_at, NOW()),
      COALESCE(NEW.updated_at, NOW()),
      COALESCE(NEW.report_count, 0),
      COALESCE(NEW.is_flagged, false),
      NEW.boundary,
      NEW.region_name,
      NEW.country,
      NEW.tide_dependency,
      NEW.country_code,
      NEW.slug
    )
    ON CONFLICT (id) DO UPDATE
    SET
      name = EXCLUDED.name,
      latitude = EXCLUDED.latitude,
      longitude = EXCLUDED.longitude,
      region_id = EXCLUDED.region_id,
      description = EXCLUDED.description,
      access_notes = EXCLUDED.access_notes,
      rock_type = EXCLUDED.rock_type,
      type = EXCLUDED.type,
      updated_at = NOW(),
      report_count = EXCLUDED.report_count,
      is_flagged = EXCLUDED.is_flagged,
      boundary = EXCLUDED.boundary,
      region_name = EXCLUDED.region_name,
      country = EXCLUDED.country,
      tide_dependency = EXCLUDED.tide_dependency,
      country_code = EXCLUDED.country_code,
      slug = EXCLUDED.slug;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS places_sync_to_crags_after_write ON public.places;
CREATE TRIGGER places_sync_to_crags_after_write
AFTER INSERT OR UPDATE OR DELETE ON public.places
FOR EACH ROW
EXECUTE FUNCTION public.sync_place_to_crag();

DO $$
BEGIN
  ALTER TABLE public.places ENABLE ROW LEVEL SECURITY;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'places'
      AND policyname = 'Public read places'
  ) THEN
    CREATE POLICY "Public read places"
      ON public.places
      FOR SELECT
      USING (true);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'places'
      AND policyname = 'Authenticated create places'
  ) THEN
    CREATE POLICY "Authenticated create places"
      ON public.places
      FOR INSERT
      WITH CHECK (auth.role() = 'authenticated');
  END IF;
END $$;

-- Migration: 20260311000000_create_community_place_tables.sql

-- =====================================================
-- Community place-centric foundation (posts, rsvps, comments, follows)
-- =====================================================

CREATE TABLE IF NOT EXISTS public.community_posts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  author_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  place_id UUID NOT NULL REFERENCES public.places(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('session', 'update', 'conditions', 'question')),
  title TEXT,
  body TEXT NOT NULL CHECK (char_length(body) BETWEEN 1 AND 2000),
  discipline TEXT CHECK (discipline IN ('boulder', 'sport', 'trad', 'deep_water_solo', 'mixed', 'top_rope')),
  grade_min TEXT,
  grade_max TEXT,
  start_at TIMESTAMPTZ,
  end_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT community_posts_title_length CHECK (title IS NULL OR char_length(title) BETWEEN 1 AND 120),
  CONSTRAINT community_posts_grade_min_length CHECK (grade_min IS NULL OR char_length(grade_min) <= 10),
  CONSTRAINT community_posts_grade_max_length CHECK (grade_max IS NULL OR char_length(grade_max) <= 10),
  CONSTRAINT community_posts_session_start_required CHECK (type <> 'session' OR start_at IS NOT NULL),
  CONSTRAINT community_posts_end_after_start CHECK (end_at IS NULL OR start_at IS NULL OR end_at >= start_at)
);

CREATE TABLE IF NOT EXISTS public.community_post_rsvps (
  post_id UUID NOT NULL REFERENCES public.community_posts(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'going' CHECK (status IN ('going', 'interested')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (post_id, user_id)
);

CREATE TABLE IF NOT EXISTS public.community_post_comments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id UUID NOT NULL REFERENCES public.community_posts(id) ON DELETE CASCADE,
  author_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  body TEXT NOT NULL CHECK (char_length(body) BETWEEN 1 AND 2000),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.community_place_follows (
  place_id UUID NOT NULL REFERENCES public.places(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  notification_level TEXT NOT NULL DEFAULT 'all' CHECK (notification_level IN ('all', 'daily', 'off')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (place_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_community_posts_place_created
  ON public.community_posts(place_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_community_posts_place_type_created
  ON public.community_posts(place_id, type, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_community_posts_session_place_start
  ON public.community_posts(place_id, start_at ASC)
  WHERE type = 'session';

CREATE INDEX IF NOT EXISTS idx_community_posts_author_created
  ON public.community_posts(author_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_community_post_rsvps_user_created
  ON public.community_post_rsvps(user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_community_post_comments_post_created
  ON public.community_post_comments(post_id, created_at ASC);

CREATE INDEX IF NOT EXISTS idx_community_post_comments_author_created
  ON public.community_post_comments(author_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_community_place_follows_user_updated
  ON public.community_place_follows(user_id, updated_at DESC);

DO $$
BEGIN
  ALTER TABLE public.community_posts ENABLE ROW LEVEL SECURITY;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE public.community_post_rsvps ENABLE ROW LEVEL SECURITY;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE public.community_post_comments ENABLE ROW LEVEL SECURITY;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE public.community_place_follows ENABLE ROW LEVEL SECURITY;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'community_posts'
      AND policyname = 'Public read community posts'
  ) THEN
    CREATE POLICY "Public read community posts"
      ON public.community_posts
      FOR SELECT
      USING (true);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'community_posts'
      AND policyname = 'Authenticated create own community posts'
  ) THEN
    CREATE POLICY "Authenticated create own community posts"
      ON public.community_posts
      FOR INSERT
      WITH CHECK (auth.role() = 'authenticated' AND auth.uid() = author_id);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'community_posts'
      AND policyname = 'Owner update community posts'
  ) THEN
    CREATE POLICY "Owner update community posts"
      ON public.community_posts
      FOR UPDATE
      USING (auth.uid() = author_id)
      WITH CHECK (auth.uid() = author_id);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'community_posts'
      AND policyname = 'Owner delete community posts'
  ) THEN
    CREATE POLICY "Owner delete community posts"
      ON public.community_posts
      FOR DELETE
      USING (auth.uid() = author_id);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'community_post_rsvps'
      AND policyname = 'Public read community rsvps'
  ) THEN
    CREATE POLICY "Public read community rsvps"
      ON public.community_post_rsvps
      FOR SELECT
      USING (true);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'community_post_rsvps'
      AND policyname = 'Users manage own community rsvps'
  ) THEN
    CREATE POLICY "Users manage own community rsvps"
      ON public.community_post_rsvps
      FOR ALL
      USING (auth.uid() = user_id)
      WITH CHECK (auth.uid() = user_id);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'community_post_comments'
      AND policyname = 'Public read community comments'
  ) THEN
    CREATE POLICY "Public read community comments"
      ON public.community_post_comments
      FOR SELECT
      USING (true);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'community_post_comments'
      AND policyname = 'Authenticated create own community comments'
  ) THEN
    CREATE POLICY "Authenticated create own community comments"
      ON public.community_post_comments
      FOR INSERT
      WITH CHECK (auth.role() = 'authenticated' AND auth.uid() = author_id);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'community_post_comments'
      AND policyname = 'Owner update community comments'
  ) THEN
    CREATE POLICY "Owner update community comments"
      ON public.community_post_comments
      FOR UPDATE
      USING (auth.uid() = author_id)
      WITH CHECK (auth.uid() = author_id);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'community_post_comments'
      AND policyname = 'Owner delete community comments'
  ) THEN
    CREATE POLICY "Owner delete community comments"
      ON public.community_post_comments
      FOR DELETE
      USING (auth.uid() = author_id);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'community_place_follows'
      AND policyname = 'Users read own place follows'
  ) THEN
    CREATE POLICY "Users read own place follows"
      ON public.community_place_follows
      FOR SELECT
      USING (auth.uid() = user_id);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'community_place_follows'
      AND policyname = 'Users manage own place follows'
  ) THEN
    CREATE POLICY "Users manage own place follows"
      ON public.community_place_follows
      FOR ALL
      USING (auth.uid() = user_id)
      WITH CHECK (auth.uid() = user_id);
  END IF;
END $$;

-- Migration: 20260312000000_add_climb_video_betas.sql

-- =====================================================
-- Climb video beta links + profile body metrics
-- =====================================================

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS height_cm INTEGER,
  ADD COLUMN IF NOT EXISTS reach_cm INTEGER;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'profiles_height_cm_check'
      AND conrelid = 'public.profiles'::regclass
  ) THEN
    ALTER TABLE public.profiles
      ADD CONSTRAINT profiles_height_cm_check
      CHECK (height_cm IS NULL OR (height_cm >= 100 AND height_cm <= 250));
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'profiles_reach_cm_check'
      AND conrelid = 'public.profiles'::regclass
  ) THEN
    ALTER TABLE public.profiles
      ADD CONSTRAINT profiles_reach_cm_check
      CHECK (reach_cm IS NULL OR (reach_cm >= 100 AND reach_cm <= 260));
  END IF;
END
$$;

CREATE TABLE IF NOT EXISTS public.climb_video_betas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  climb_id UUID NOT NULL REFERENCES public.climbs(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  url TEXT NOT NULL,
  platform TEXT NOT NULL DEFAULT 'other'
    CHECK (platform IN ('youtube', 'instagram', 'tiktok', 'vimeo', 'other')),
  title TEXT,
  notes TEXT,
  uploader_gender TEXT CHECK (uploader_gender IN ('male', 'female', 'other', 'prefer_not_to_say')),
  uploader_height_cm INTEGER CHECK (uploader_height_cm IS NULL OR (uploader_height_cm >= 100 AND uploader_height_cm <= 250)),
  uploader_reach_cm INTEGER CHECK (uploader_reach_cm IS NULL OR (uploader_reach_cm >= 100 AND uploader_reach_cm <= 260)),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (climb_id, user_id, url)
);

CREATE INDEX IF NOT EXISTS idx_climb_video_betas_climb_created_at
  ON public.climb_video_betas(climb_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_climb_video_betas_climb_platform
  ON public.climb_video_betas(climb_id, platform);

CREATE INDEX IF NOT EXISTS idx_climb_video_betas_user_created_at
  ON public.climb_video_betas(user_id, created_at DESC);

ALTER TABLE public.climb_video_betas ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'climb_video_betas'
      AND policyname = 'Public read climb_video_betas'
  ) THEN
    CREATE POLICY "Public read climb_video_betas"
      ON public.climb_video_betas
      FOR SELECT
      USING (true);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'climb_video_betas'
      AND policyname = 'Owner create climb_video_betas'
  ) THEN
    CREATE POLICY "Owner create climb_video_betas"
      ON public.climb_video_betas
      FOR INSERT
      WITH CHECK (auth.uid() = user_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'climb_video_betas'
      AND policyname = 'Owner update climb_video_betas'
  ) THEN
    CREATE POLICY "Owner update climb_video_betas"
      ON public.climb_video_betas
      FOR UPDATE
      USING (auth.uid() = user_id)
      WITH CHECK (auth.uid() = user_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'climb_video_betas'
      AND policyname = 'Owner delete climb_video_betas'
  ) THEN
    CREATE POLICY "Owner delete climb_video_betas"
      ON public.climb_video_betas
      FOR DELETE
      USING (auth.uid() = user_id);
  END IF;
END
$$;

-- Migration: 20260313000000_add_images_face_directions.sql

ALTER TABLE images
ADD COLUMN IF NOT EXISTS face_directions TEXT[];

UPDATE images
SET face_directions = ARRAY[face_direction]
WHERE face_direction IS NOT NULL
  AND (face_directions IS NULL OR array_length(face_directions, 1) IS NULL);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'images_face_directions_check'
      AND conrelid = 'images'::regclass
  ) THEN
    ALTER TABLE images
    ADD CONSTRAINT images_face_directions_check
    CHECK (
      face_directions IS NULL
      OR face_directions <@ ARRAY['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW']::TEXT[]
    );
  END IF;
END $$;

-- Migration: 20260314000000_cleanup_orphan_route_uploads.sql

CREATE OR REPLACE FUNCTION public.cleanup_orphan_route_uploads(
  max_age INTERVAL DEFAULT INTERVAL '72 hours',
  max_delete INTEGER DEFAULT 300
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, storage
AS $$
DECLARE
  deleted_count INTEGER := 0;
BEGIN
  WITH candidates AS (
    SELECT o.name
    FROM storage.objects o
    LEFT JOIN public.images i
      ON i.storage_bucket = o.bucket_id
     AND i.storage_path = o.name
    WHERE o.bucket_id = 'route-uploads'
      AND i.id IS NULL
      AND o.created_at < NOW() - max_age
    ORDER BY o.created_at ASC
    LIMIT GREATEST(max_delete, 0)
  ), deleted AS (
    DELETE FROM storage.objects o
    USING candidates c
    WHERE o.bucket_id = 'route-uploads'
      AND o.name = c.name
    RETURNING 1
  )
  SELECT COUNT(*) INTO deleted_count FROM deleted;

  RETURN deleted_count;
END;
$$;

REVOKE ALL ON FUNCTION public.cleanup_orphan_route_uploads(INTERVAL, INTEGER) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.cleanup_orphan_route_uploads(INTERVAL, INTEGER) TO service_role;

DO $$
BEGIN
  BEGIN
    CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA extensions;

    PERFORM cron.unschedule(jobid)
    FROM cron.job
    WHERE jobname = 'cleanup-orphan-route-uploads';

    PERFORM cron.schedule(
      'cleanup-orphan-route-uploads',
      '25 3 * * *',
      'SELECT public.cleanup_orphan_route_uploads(INTERVAL ''72 hours'', 300);'
    );
  EXCEPTION
    WHEN OTHERS THEN
      RAISE NOTICE 'pg_cron scheduling skipped: %', SQLERRM;
  END;
END;
$$;

-- Migration: 20260315000000_add_route_edit_rpc.sql

CREATE OR REPLACE FUNCTION public.update_own_submitted_routes(
  p_image_id UUID,
  p_routes JSONB
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  current_user_id UUID := auth.uid();
  route_item JSONB;
  route_id UUID;
  climb_id UUID;
  route_name TEXT;
  route_description TEXT;
  route_points JSONB;
  updated_count INTEGER := 0;
BEGIN
  IF current_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  IF p_image_id IS NULL THEN
    RAISE EXCEPTION 'Image ID is required';
  END IF;

  IF p_routes IS NULL OR jsonb_typeof(p_routes) <> 'array' OR jsonb_array_length(p_routes) = 0 THEN
    RAISE EXCEPTION 'At least one route is required';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.images i
    WHERE i.id = p_image_id
      AND i.created_by = current_user_id
  ) THEN
    RAISE EXCEPTION 'You do not have permission to edit routes for this image';
  END IF;

  FOR route_item IN
    SELECT value FROM jsonb_array_elements(p_routes)
  LOOP
    BEGIN
      route_id := (route_item->>'id')::UUID;
    EXCEPTION WHEN OTHERS THEN
      RAISE EXCEPTION 'Invalid route id provided';
    END;

    route_name := btrim(COALESCE(route_item->>'name', ''));
    route_description := NULLIF(btrim(COALESCE(route_item->>'description', '')), '');
    route_points := route_item->'points';

    IF route_name = '' THEN
      RAISE EXCEPTION 'Route name is required';
    END IF;

    IF char_length(route_name) > 200 THEN
      RAISE EXCEPTION 'Route name must be 200 characters or less';
    END IF;

    IF route_description IS NOT NULL AND char_length(route_description) > 500 THEN
      RAISE EXCEPTION 'Route description must be 500 characters or less';
    END IF;

    IF route_points IS NULL OR jsonb_typeof(route_points) <> 'array' OR jsonb_array_length(route_points) < 2 THEN
      RAISE EXCEPTION 'Route points must contain at least 2 points';
    END IF;

    IF EXISTS (
      SELECT 1
      FROM jsonb_array_elements(route_points) AS pt
      WHERE jsonb_typeof(pt->'x') <> 'number'
        OR jsonb_typeof(pt->'y') <> 'number'
        OR (pt->>'x')::double precision < 0
        OR (pt->>'x')::double precision > 1
        OR (pt->>'y')::double precision < 0
        OR (pt->>'y')::double precision > 1
    ) THEN
      RAISE EXCEPTION 'Route points must be normalized values between 0 and 1';
    END IF;

    SELECT rl.climb_id
    INTO climb_id
    FROM public.route_lines rl
    INNER JOIN public.climbs c ON c.id = rl.climb_id
    WHERE rl.id = route_id
      AND rl.image_id = p_image_id
      AND c.user_id = current_user_id;

    IF climb_id IS NULL THEN
      RAISE EXCEPTION 'Route not found or not editable';
    END IF;

    UPDATE public.climbs
    SET
      name = route_name,
      description = route_description,
      updated_at = NOW()
    WHERE id = climb_id;

    UPDATE public.route_lines
    SET points = route_points
    WHERE id = route_id;

    updated_count := updated_count + 1;
  END LOOP;

  RETURN updated_count;
END;
$function$;

REVOKE ALL ON FUNCTION public.update_own_submitted_routes(UUID, JSONB) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.update_own_submitted_routes(UUID, JSONB) TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_own_submitted_routes(UUID, JSONB) TO service_role;

-- Migration: 20260315000046_gold_standard_geography.sql

-- Auto-generated migration: Gold Standard Geography
-- Simplified version - adds countries without schema restructure

-- 0. Drop old regions table (replaced by new geography schema)
DROP TABLE IF EXISTS public.regions CASCADE;

-- 1. Create countries table (with boundary column for future Natural Earth data)
CREATE TABLE IF NOT EXISTS public.countries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  iso_a2 TEXT NOT NULL UNIQUE,
  iso_a3 TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  name_long TEXT,
  formal_name TEXT,
  abbrev TEXT,
  admin_type TEXT,
  region_id UUID,
  scale_rank INTEGER,
  label_rank INTEGER,
  map_color INTEGER,
  boundary geometry(Geometry, 4326),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2. Create continents table
CREATE TABLE IF NOT EXISTS public.continents (
  name TEXT PRIMARY KEY
);

-- 3. Create un_regions table  
CREATE TABLE IF NOT EXISTS public.un_regions (
  name TEXT PRIMARY KEY,
  continent_name TEXT NOT NULL REFERENCES public.continents(name)
);

-- 4. Create regions table (subregions)
CREATE TABLE IF NOT EXISTS public.regions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  un_region_name TEXT NOT NULL REFERENCES public.un_regions(name),
  country_code VARCHAR(2),
  center_lat NUMERIC(10,8),
  center_lon NUMERIC(11,8),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 5. Add country_id to existing tables
ALTER TABLE public.crags ADD COLUMN IF NOT EXISTS country_id UUID REFERENCES public.countries(id) ON DELETE SET NULL;
ALTER TABLE public.places ADD COLUMN IF NOT EXISTS country_id UUID REFERENCES public.countries(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_crags_country_id ON public.crags(country_id);
CREATE INDEX IF NOT EXISTS idx_places_country_id ON public.places(country_id);

-- 6. Insert continents
INSERT INTO public.continents (name) VALUES
  ('Africa'),
  ('Americas'),
  ('Antarctica'),
  ('Asia'),
  ('Europe'),
  ('Oceania'),
  ('Seven seas (open ocean)')
ON CONFLICT (name) DO NOTHING;

-- 7. Insert UN regions
INSERT INTO public.un_regions (name, continent_name) VALUES
  ('Africa', 'Africa'),
  ('Americas', 'Americas'),
  ('Antarctica', 'Antarctica'),
  ('Asia', 'Asia'),
  ('Europe', 'Europe'),
  ('Oceania', 'Oceania'),
  ('Seven seas (open ocean)', 'Seven seas (open ocean)')
ON CONFLICT (name) DO UPDATE SET continent_name = EXCLUDED.continent_name;

-- 8. Insert regions (subregions)
INSERT INTO public.regions (name, un_region_name) VALUES
  ('Antarctica', 'Antarctica'),
  ('Australia and New Zealand', 'Oceania'),
  ('Caribbean', 'Americas'),
  ('Central America', 'Americas'),
  ('Central Asia', 'Asia'),
  ('Eastern Africa', 'Africa'),
  ('Eastern Asia', 'Asia'),
  ('Eastern Europe', 'Europe'),
  ('Melanesia', 'Oceania'),
  ('Middle Africa', 'Africa'),
  ('Northern Africa', 'Africa'),
  ('Northern America', 'Americas'),
  ('Northern Europe', 'Europe'),
  ('Seven seas (open ocean)', 'Seven seas (open ocean)'),
  ('South America', 'Americas'),
  ('South-Eastern Asia', 'Asia'),
  ('Southern Africa', 'Africa'),
  ('Southern Asia', 'Asia'),
  ('Southern Europe', 'Europe'),
  ('Western Africa', 'Africa'),
  ('Western Asia', 'Asia'),
  ('Western Europe', 'Europe')
ON CONFLICT (name) DO UPDATE SET un_region_name = EXCLUDED.un_region_name;

-- 9. Insert countries
INSERT INTO public.countries (iso_a2, iso_a3, name, name_long, formal_name, abbrev, admin_type, region_id, scale_rank, label_rank, map_color) VALUES
  ('AF', 'AFG', 'Afghanistan', 'Afghanistan', 'Islamic State of Afghanistan', 'Afg.', 'Sovereign country', (SELECT id FROM public.regions WHERE name = 'Southern Asia' LIMIT 1), 1, 3, 5),
  ('AO', 'AGO', 'Angola', 'Angola', 'People''s Republic of Angola', 'Ang.', 'Sovereign country', (SELECT id FROM public.regions WHERE name = 'Middle Africa' LIMIT 1), 1, 3, 3),
  ('AL', 'ALB', 'Albania', 'Albania', 'Republic of Albania', 'Alb.', 'Sovereign country', (SELECT id FROM public.regions WHERE name = 'Southern Europe' LIMIT 1), 1, 6, 1),
  ('AE', 'ARE', 'United Arab Emirates', 'United Arab Emirates', 'United Arab Emirates', 'U.A.E.', 'Sovereign country', (SELECT id FROM public.regions WHERE name = 'Western Asia' LIMIT 1), 1, 4, 2),
  ('AR', 'ARG', 'Argentina', 'Argentina', 'Argentine Republic', 'Arg.', 'Sovereign country', (SELECT id FROM public.regions WHERE name = 'South America' LIMIT 1), 1, 2, 3),
  ('AM', 'ARM', 'Armenia', 'Armenia', 'Republic of Armenia', 'Arm.', 'Sovereign country', (SELECT id FROM public.regions WHERE name = 'Western Asia' LIMIT 1), 1, 6, 3),
  ('AQ', 'ATA', 'Antarctica', 'Antarctica', '', 'Ant.', 'Indeterminate', (SELECT id FROM public.regions WHERE name = 'Antarctica' LIMIT 1), 1, 4, 4),
  ('TF', 'ATF', 'Fr. S. Antarctic Lands', 'French Southern and Antarctic Lands', 'Territory of the French Southern and Antarctic Lands', 'Fr. S.A.L.', 'Dependency', (SELECT id FROM public.regions WHERE name = 'Seven seas (open ocean)' LIMIT 1), 3, 6, 7),
  ('AU', 'AUS', 'Australia', 'Australia', 'Commonwealth of Australia', 'Auz.', 'Country', (SELECT id FROM public.regions WHERE name = 'Australia and New Zealand' LIMIT 1), 1, 2, 1),
  ('AT', 'AUT', 'Austria', 'Austria', 'Republic of Austria', 'Aust.', 'Sovereign country', (SELECT id FROM public.regions WHERE name = 'Western Europe' LIMIT 1), 1, 4, 3),
  ('AZ', 'AZE', 'Azerbaijan', 'Azerbaijan', 'Republic of Azerbaijan', 'Aze.', 'Sovereign country', (SELECT id FROM public.regions WHERE name = 'Western Asia' LIMIT 1), 1, 5, 1),
  ('BI', 'BDI', 'Burundi', 'Burundi', 'Republic of Burundi', 'Bur.', 'Sovereign country', (SELECT id FROM public.regions WHERE name = 'Eastern Africa' LIMIT 1), 1, 6, 2),
  ('BE', 'BEL', 'Belgium', 'Belgium', 'Kingdom of Belgium', 'Belg.', 'Sovereign country', (SELECT id FROM public.regions WHERE name = 'Western Europe' LIMIT 1), 1, 2, 3),
  ('BJ', 'BEN', 'Benin', 'Benin', 'Republic of Benin', 'Benin', 'Sovereign country', (SELECT id FROM public.regions WHERE name = 'Western Africa' LIMIT 1), 1, 5, 1),
  ('BF', 'BFA', 'Burkina Faso', 'Burkina Faso', 'Burkina Faso', 'B.F.', 'Sovereign country', (SELECT id FROM public.regions WHERE name = 'Western Africa' LIMIT 1), 1, 3, 2),
  ('BD', 'BGD', 'Bangladesh', 'Bangladesh', 'People''s Republic of Bangladesh', 'Bang.', 'Sovereign country', (SELECT id FROM public.regions WHERE name = 'Southern Asia' LIMIT 1), 1, 3, 3),
  ('BG', 'BGR', 'Bulgaria', 'Bulgaria', 'Republic of Bulgaria', 'Bulg.', 'Sovereign country', (SELECT id FROM public.regions WHERE name = 'Eastern Europe' LIMIT 1), 1, 4, 4),
  ('BS', 'BHS', 'Bahamas', 'Bahamas', 'Commonwealth of the Bahamas', 'Bhs.', 'Sovereign country', (SELECT id FROM public.regions WHERE name = 'Caribbean' LIMIT 1), 1, 4, 1),
  ('BA', 'BIH', 'Bosnia and Herz.', 'Bosnia and Herzegovina', 'Bosnia and Herzegovina', 'B.H.', 'Sovereign country', (SELECT id FROM public.regions WHERE name = 'Southern Europe' LIMIT 1), 1, 5, 1),
  ('BY', 'BLR', 'Belarus', 'Belarus', 'Republic of Belarus', 'Bela.', 'Sovereign country', (SELECT id FROM public.regions WHERE name = 'Eastern Europe' LIMIT 1), 1, 4, 1),
  ('BZ', 'BLZ', 'Belize', 'Belize', 'Belize', 'Belize', 'Sovereign country', (SELECT id FROM public.regions WHERE name = 'Central America' LIMIT 1), 1, 6, 1),
  ('BO', 'BOL', 'Bolivia', 'Bolivia', 'Plurinational State of Bolivia', 'Bolivia', 'Sovereign country', (SELECT id FROM public.regions WHERE name = 'South America' LIMIT 1), 1, 3, 1),
  ('BR', 'BRA', 'Brazil', 'Brazil', 'Federative Republic of Brazil', 'Brazil', 'Sovereign country', (SELECT id FROM public.regions WHERE name = 'South America' LIMIT 1), 1, 2, 5),
  ('BN', 'BRN', 'Brunei', 'Brunei Darussalam', 'Negara Brunei Darussalam', 'Brunei', 'Sovereign country', (SELECT id FROM public.regions WHERE name = 'South-Eastern Asia' LIMIT 1), 1, 6, 4),
  ('BT', 'BTN', 'Bhutan', 'Bhutan', 'Kingdom of Bhutan', 'Bhutan', 'Sovereign country', (SELECT id FROM public.regions WHERE name = 'Southern Asia' LIMIT 1), 1, 5, 5),
  ('BW', 'BWA', 'Botswana', 'Botswana', 'Republic of Botswana', 'Bwa.', 'Sovereign country', (SELECT id FROM public.regions WHERE name = 'Southern Africa' LIMIT 1), 1, 4, 6),
  ('CF', 'CAF', 'Central African Rep.', 'Central African Republic', 'Central African Republic', 'C.A.R.', 'Sovereign country', (SELECT id FROM public.regions WHERE name = 'Middle Africa' LIMIT 1), 1, 4, 5),
  ('CA', 'CAN', 'Canada', 'Canada', 'Canada', 'Can.', 'Sovereign country', (SELECT id FROM public.regions WHERE name = 'Northern America' LIMIT 1), 1, 2, 6),
  ('CH', 'CHE', 'Switzerland', 'Switzerland', 'Swiss Confederation', 'Switz.', 'Sovereign country', (SELECT id FROM public.regions WHERE name = 'Western Europe' LIMIT 1), 1, 4, 5),
  ('CL', 'CHL', 'Chile', 'Chile', 'Republic of Chile', 'Chile', 'Sovereign country', (SELECT id FROM public.regions WHERE name = 'South America' LIMIT 1), 1, 2, 5),
  ('CN', 'CHN', 'China', 'China', 'People''s Republic of China', 'China', 'Country', (SELECT id FROM public.regions WHERE name = 'Eastern Asia' LIMIT 1), 1, 2, 4),
  ('CI', 'CIV', 'Côte d''Ivoire', 'Côte d''Ivoire', 'Republic of Ivory Coast', 'I.C.', 'Sovereign country', (SELECT id FROM public.regions WHERE name = 'Western Africa' LIMIT 1), 1, 3, 4),
  ('CM', 'CMR', 'Cameroon', 'Cameroon', 'Republic of Cameroon', 'Cam.', 'Sovereign country', (SELECT id FROM public.regions WHERE name = 'Middle Africa' LIMIT 1), 1, 3, 1),
  ('CD', 'COD', 'Dem. Rep. Congo', 'Democratic Republic of the Congo', 'Democratic Republic of the Congo', 'D.R.C.', 'Sovereign country', (SELECT id FROM public.regions WHERE name = 'Middle Africa' LIMIT 1), 1, 2, 4),
  ('CG', 'COG', 'Congo', 'Republic of Congo', 'Republic of Congo', 'Rep. Congo', 'Sovereign country', (SELECT id FROM public.regions WHERE name = 'Middle Africa' LIMIT 1), 1, 4, 2),
  ('CO', 'COL', 'Colombia', 'Colombia', 'Republic of Colombia', 'Col.', 'Sovereign country', (SELECT id FROM public.regions WHERE name = 'South America' LIMIT 1), 1, 2, 2),
  ('CR', 'CRI', 'Costa Rica', 'Costa Rica', 'Republic of Costa Rica', 'C.R.', 'Sovereign country', (SELECT id FROM public.regions WHERE name = 'Central America' LIMIT 1), 1, 5, 3),
  ('CU', 'CUB', 'Cuba', 'Cuba', 'Republic of Cuba', 'Cuba', 'Sovereign country', (SELECT id FROM public.regions WHERE name = 'Caribbean' LIMIT 1), 1, 3, 3),
  ('CY', 'CYP', 'Cyprus', 'Cyprus', 'Republic of Cyprus', 'Cyp.', 'Sovereign country', (SELECT id FROM public.regions WHERE name = 'Western Asia' LIMIT 1), 1, 5, 1),
  ('CZ', 'CZE', 'Czech Rep.', 'Czech Republic', 'Czech Republic', 'Cz. Rep.', 'Sovereign country', (SELECT id FROM public.regions WHERE name = 'Eastern Europe' LIMIT 1), 1, 5, 1),
  ('DE', 'DEU', 'Germany', 'Germany', 'Federal Republic of Germany', 'Ger.', 'Sovereign country', (SELECT id FROM public.regions WHERE name = 'Western Europe' LIMIT 1), 1, 2, 2),
  ('DJ', 'DJI', 'Djibouti', 'Djibouti', 'Republic of Djibouti', 'Dji.', 'Sovereign country', (SELECT id FROM public.regions WHERE name = 'Eastern Africa' LIMIT 1), 1, 5, 1),
  ('DK', 'DNK', 'Denmark', 'Denmark', 'Kingdom of Denmark', 'Den.', 'Country', (SELECT id FROM public.regions WHERE name = 'Northern Europe' LIMIT 1), 1, 4, 4),
  ('DO', 'DOM', 'Dominican Rep.', 'Dominican Republic', 'Dominican Republic', 'Dom. Rep.', 'Sovereign country', (SELECT id FROM public.regions WHERE name = 'Caribbean' LIMIT 1), 1, 5, 5),
  ('DZ', 'DZA', 'Algeria', 'Algeria', 'People''s Democratic Republic of Algeria', 'Alg.', 'Sovereign country', (SELECT id FROM public.regions WHERE name = 'Northern Africa' LIMIT 1), 1, 3, 5),
  ('EC', 'ECU', 'Ecuador', 'Ecuador', 'Republic of Ecuador', 'Ecu.', 'Sovereign country', (SELECT id FROM public.regions WHERE name = 'South America' LIMIT 1), 1, 3, 1),
  ('EG', 'EGY', 'Egypt', 'Egypt', 'Arab Republic of Egypt', 'Egypt', 'Sovereign country', (SELECT id FROM public.regions WHERE name = 'Northern Africa' LIMIT 1), 1, 2, 4),
  ('ER', 'ERI', 'Eritrea', 'Eritrea', 'State of Eritrea', 'Erit.', 'Sovereign country', (SELECT id FROM public.regions WHERE name = 'Eastern Africa' LIMIT 1), 1, 4, 3),
  ('ES', 'ESP', 'Spain', 'Spain', 'Kingdom of Spain', 'Sp.', 'Sovereign country', (SELECT id FROM public.regions WHERE name = 'Southern Europe' LIMIT 1), 1, 2, 4),
  ('EE', 'EST', 'Estonia', 'Estonia', 'Republic of Estonia', 'Est.', 'Sovereign country', (SELECT id FROM public.regions WHERE name = 'Northern Europe' LIMIT 1), 1, 6, 3),
  ('ET', 'ETH', 'Ethiopia', 'Ethiopia', 'Federal Democratic Republic of Ethiopia', 'Eth.', 'Sovereign country', (SELECT id FROM public.regions WHERE name = 'Eastern Africa' LIMIT 1), 1, 2, 4),
  ('FI', 'FIN', 'Finland', 'Finland', 'Republic of Finland', 'Fin.', 'Country', (SELECT id FROM public.regions WHERE name = 'Northern Europe' LIMIT 1), 1, 3, 4),
  ('FJ', 'FJI', 'Fiji', 'Fiji', 'Republic of Fiji', 'Fiji', 'Sovereign country', (SELECT id FROM public.regions WHERE name = 'Melanesia' LIMIT 1), 1, 6, 5),
  ('FK', 'FLK', 'Falkland Is.', 'Falkland Islands', 'Falkland Islands', 'Flk. Is.', 'Dependency', (SELECT id FROM public.regions WHERE name = 'South America' LIMIT 1), 1, 5, 6),
  ('FR', 'FRA', 'France', 'France', 'French Republic', 'Fr.', 'Country', (SELECT id FROM public.regions WHERE name = 'Western Europe' LIMIT 1), 1, 2, 7),
  ('GA', 'GAB', 'Gabon', 'Gabon', 'Gabonese Republic', 'Gabon', 'Sovereign country', (SELECT id FROM public.regions WHERE name = 'Middle Africa' LIMIT 1), 1, 4, 6),
  ('GB', 'GBR', 'United Kingdom', 'United Kingdom', 'United Kingdom of Great Britain and Northern Ireland', 'U.K.', 'Country', (SELECT id FROM public.regions WHERE name = 'Northern Europe' LIMIT 1), 1, 2, 6),
  ('GE', 'GEO', 'Georgia', 'Georgia', 'Georgia', 'Geo.', 'Sovereign country', (SELECT id FROM public.regions WHERE name = 'Western Asia' LIMIT 1), 1, 5, 5),
  ('GH', 'GHA', 'Ghana', 'Ghana', 'Republic of Ghana', 'Ghana', 'Sovereign country', (SELECT id FROM public.regions WHERE name = 'Western Africa' LIMIT 1), 1, 3, 5),
  ('GN', 'GIN', 'Guinea', 'Guinea', 'Republic of Guinea', 'Gin.', 'Sovereign country', (SELECT id FROM public.regions WHERE name = 'Western Africa' LIMIT 1), 1, 3, 6),
  ('GM', 'GMB', 'Gambia', 'The Gambia', 'Republic of the Gambia', 'Gambia', 'Sovereign country', (SELECT id FROM public.regions WHERE name = 'Western Africa' LIMIT 1), 1, 6, 1),
  ('GW', 'GNB', 'Guinea-Bissau', 'Guinea-Bissau', 'Republic of Guinea-Bissau', 'GnB.', 'Sovereign country', (SELECT id FROM public.regions WHERE name = 'Western Africa' LIMIT 1), 1, 6, 3),
  ('GQ', 'GNQ', 'Eq. Guinea', 'Equatorial Guinea', 'Republic of Equatorial Guinea', 'Eq. G.', 'Sovereign country', (SELECT id FROM public.regions WHERE name = 'Middle Africa' LIMIT 1), 1, 4, 4),
  ('GR', 'GRC', 'Greece', 'Greece', 'Hellenic Republic', 'Greece', 'Sovereign country', (SELECT id FROM public.regions WHERE name = 'Southern Europe' LIMIT 1), 1, 3, 2),
  ('GL', 'GRL', 'Greenland', 'Greenland', 'Greenland', 'Grlnd.', 'Country', (SELECT id FROM public.regions WHERE name = 'Northern America' LIMIT 1), 1, 3, 4),
  ('GT', 'GTM', 'Guatemala', 'Guatemala', 'Republic of Guatemala', 'Guat.', 'Sovereign country', (SELECT id FROM public.regions WHERE name = 'Central America' LIMIT 1), 1, 3, 3),
  ('GY', 'GUY', 'Guyana', 'Guyana', 'Co-operative Republic of Guyana', 'Guy.', 'Sovereign country', (SELECT id FROM public.regions WHERE name = 'South America' LIMIT 1), 1, 4, 3),
  ('HN', 'HND', 'Honduras', 'Honduras', 'Republic of Honduras', 'Hond.', 'Sovereign country', (SELECT id FROM public.regions WHERE name = 'Central America' LIMIT 1), 1, 5, 2),
  ('HR', 'HRV', 'Croatia', 'Croatia', 'Republic of Croatia', 'Cro.', 'Sovereign country', (SELECT id FROM public.regions WHERE name = 'Southern Europe' LIMIT 1), 1, 6, 5),
  ('HT', 'HTI', 'Haiti', 'Haiti', 'Republic of Haiti', 'Haiti', 'Sovereign country', (SELECT id FROM public.regions WHERE name = 'Caribbean' LIMIT 1), 1, 5, 2),
  ('HU', 'HUN', 'Hungary', 'Hungary', 'Republic of Hungary', 'Hun.', 'Sovereign country', (SELECT id FROM public.regions WHERE name = 'Eastern Europe' LIMIT 1), 1, 5, 4),
  ('ID', 'IDN', 'Indonesia', 'Indonesia', 'Republic of Indonesia', 'Indo.', 'Sovereign country', (SELECT id FROM public.regions WHERE name = 'South-Eastern Asia' LIMIT 1), 1, 2, 6),
  ('IN', 'IND', 'India', 'India', 'Republic of India', 'India', 'Sovereign country', (SELECT id FROM public.regions WHERE name = 'Southern Asia' LIMIT 1), 1, 2, 1),
  ('IE', 'IRL', 'Ireland', 'Ireland', 'Ireland', 'Ire.', 'Sovereign country', (SELECT id FROM public.regions WHERE name = 'Northern Europe' LIMIT 1), 1, 3, 2),
  ('IR', 'IRN', 'Iran', 'Iran', 'Islamic Republic of Iran', 'Iran', 'Sovereign country', (SELECT id FROM public.regions WHERE name = 'Southern Asia' LIMIT 1), 1, 2, 4),
  ('IQ', 'IRQ', 'Iraq', 'Iraq', 'Republic of Iraq', 'Iraq', 'Sovereign country', (SELECT id FROM public.regions WHERE name = 'Western Asia' LIMIT 1), 1, 3, 1),
  ('IS', 'ISL', 'Iceland', 'Iceland', 'Republic of Iceland', 'Iceland', 'Sovereign country', (SELECT id FROM public.regions WHERE name = 'Northern Europe' LIMIT 1), 1, 3, 1),
  ('IL', 'ISR', 'Israel', 'Israel', 'State of Israel', 'Isr.', 'Sovereign country', (SELECT id FROM public.regions WHERE name = 'Western Asia' LIMIT 1), 1, 4, 3),
  ('IT', 'ITA', 'Italy', 'Italy', 'Italian Republic', 'Italy', 'Sovereign country', (SELECT id FROM public.regions WHERE name = 'Southern Europe' LIMIT 1), 1, 2, 6),
  ('JM', 'JAM', 'Jamaica', 'Jamaica', 'Jamaica', 'Jam.', 'Sovereign country', (SELECT id FROM public.regions WHERE name = 'Caribbean' LIMIT 1), 1, 4, 1),
  ('JO', 'JOR', 'Jordan', 'Jordan', 'Hashemite Kingdom of Jordan', 'Jord.', 'Sovereign country', (SELECT id FROM public.regions WHERE name = 'Western Asia' LIMIT 1), 1, 4, 5),
  ('JP', 'JPN', 'Japan', 'Japan', 'Japan', 'Japan', 'Sovereign country', (SELECT id FROM public.regions WHERE name = 'Eastern Asia' LIMIT 1), 1, 2, 5),
  ('KZ', 'KAZ', 'Kazakhstan', 'Kazakhstan', 'Republic of Kazakhstan', 'Kaz.', 'Sovereign country', (SELECT id FROM public.regions WHERE name = 'Central Asia' LIMIT 1), 1, 3, 6),
  ('KE', 'KEN', 'Kenya', 'Kenya', 'Republic of Kenya', 'Ken.', 'Sovereign country', (SELECT id FROM public.regions WHERE name = 'Eastern Africa' LIMIT 1), 1, 2, 5),
  ('KG', 'KGZ', 'Kyrgyzstan', 'Kyrgyzstan', 'Kyrgyz Republic', 'Kgz.', 'Sovereign country', (SELECT id FROM public.regions WHERE name = 'Central Asia' LIMIT 1), 1, 4, 5),
  ('KH', 'KHM', 'Cambodia', 'Cambodia', 'Kingdom of Cambodia', 'Camb.', 'Sovereign country', (SELECT id FROM public.regions WHERE name = 'South-Eastern Asia' LIMIT 1), 1, 3, 6),
  ('KR', 'KOR', 'Korea', 'Republic of Korea', 'Republic of Korea', 'S.K.', 'Sovereign country', (SELECT id FROM public.regions WHERE name = 'Eastern Asia' LIMIT 1), 1, 2, 4),
  ('KW', 'KWT', 'Kuwait', 'Kuwait', 'State of Kuwait', 'Kwt.', 'Sovereign country', (SELECT id FROM public.regions WHERE name = 'Western Asia' LIMIT 1), 1, 6, 2),
  ('LA', 'LAO', 'Lao PDR', 'Lao PDR', 'Lao People''s Democratic Republic', 'Laos', 'Sovereign country', (SELECT id FROM public.regions WHERE name = 'South-Eastern Asia' LIMIT 1), 1, 4, 1),
  ('LB', 'LBN', 'Lebanon', 'Lebanon', 'Lebanese Republic', 'Leb.', 'Sovereign country', (SELECT id FROM public.regions WHERE name = 'Western Asia' LIMIT 1), 1, 5, 4),
  ('LR', 'LBR', 'Liberia', 'Liberia', 'Republic of Liberia', 'Liberia', 'Sovereign country', (SELECT id FROM public.regions WHERE name = 'Western Africa' LIMIT 1), 1, 4, 2),
  ('LY', 'LBY', 'Libya', 'Libya', 'Libya', 'Libya', 'Sovereign country', (SELECT id FROM public.regions WHERE name = 'Northern Africa' LIMIT 1), 1, 3, 1),
  ('LK', 'LKA', 'Sri Lanka', 'Sri Lanka', 'Democratic Socialist Republic of Sri Lanka', 'Sri L.', 'Sovereign country', (SELECT id FROM public.regions WHERE name = 'Southern Asia' LIMIT 1), 1, 3, 3),
  ('LS', 'LSO', 'Lesotho', 'Lesotho', 'Kingdom of Lesotho', 'Les.', 'Sovereign country', (SELECT id FROM public.regions WHERE name = 'Southern Africa' LIMIT 1), 1, 6, 1),
  ('LT', 'LTU', 'Lithuania', 'Lithuania', 'Republic of Lithuania', 'Lith.', 'Sovereign country', (SELECT id FROM public.regions WHERE name = 'Northern Europe' LIMIT 1), 1, 5, 6),
  ('LU', 'LUX', 'Luxembourg', 'Luxembourg', 'Grand Duchy of Luxembourg', 'Lux.', 'Sovereign country', (SELECT id FROM public.regions WHERE name = 'Western Europe' LIMIT 1), 1, 6, 1),
  ('LV', 'LVA', 'Latvia', 'Latvia', 'Republic of Latvia', 'Lat.', 'Sovereign country', (SELECT id FROM public.regions WHERE name = 'Northern Europe' LIMIT 1), 1, 5, 4),
  ('MA', 'MAR', 'Morocco', 'Morocco', 'Kingdom of Morocco', 'Mor.', 'Sovereign country', (SELECT id FROM public.regions WHERE name = 'Northern Africa' LIMIT 1), 1, 3, 2),
  ('MD', 'MDA', 'Moldova', 'Moldova', 'Republic of Moldova', 'Mda.', 'Sovereign country', (SELECT id FROM public.regions WHERE name = 'Eastern Europe' LIMIT 1), 1, 6, 3),
  ('MG', 'MDG', 'Madagascar', 'Madagascar', 'Republic of Madagascar', 'Mad.', 'Sovereign country', (SELECT id FROM public.regions WHERE name = 'Eastern Africa' LIMIT 1), 1, 3, 6),
  ('MX', 'MEX', 'Mexico', 'Mexico', 'United Mexican States', 'Mex.', 'Sovereign country', (SELECT id FROM public.regions WHERE name = 'Central America' LIMIT 1), 1, 2, 6),
  ('MK', 'MKD', 'Macedonia', 'Macedonia', 'Former Yugoslav Republic of Macedonia', 'Mkd.', 'Sovereign country', (SELECT id FROM public.regions WHERE name = 'Southern Europe' LIMIT 1), 1, 6, 5),
  ('ML', 'MLI', 'Mali', 'Mali', 'Republic of Mali', 'Mali', 'Sovereign country', (SELECT id FROM public.regions WHERE name = 'Western Africa' LIMIT 1), 1, 3, 1),
  ('MM', 'MMR', 'Myanmar', 'Myanmar', 'Republic of the Union of Myanmar', 'Myan.', 'Sovereign country', (SELECT id FROM public.regions WHERE name = 'South-Eastern Asia' LIMIT 1), 1, 3, 2),
  ('ME', 'MNE', 'Montenegro', 'Montenegro', 'Montenegro', 'Mont.', 'Sovereign country', (SELECT id FROM public.regions WHERE name = 'Southern Europe' LIMIT 1), 1, 6, 4),
  ('MN', 'MNG', 'Mongolia', 'Mongolia', 'Mongolia', 'Mong.', 'Sovereign country', (SELECT id FROM public.regions WHERE name = 'Eastern Asia' LIMIT 1), 1, 3, 3),
  ('MZ', 'MOZ', 'Mozambique', 'Mozambique', 'Republic of Mozambique', 'Moz.', 'Sovereign country', (SELECT id FROM public.regions WHERE name = 'Eastern Africa' LIMIT 1), 1, 3, 4),
  ('MR', 'MRT', 'Mauritania', 'Mauritania', 'Islamic Republic of Mauritania', 'Mrt.', 'Sovereign country', (SELECT id FROM public.regions WHERE name = 'Western Africa' LIMIT 1), 1, 3, 3),
  ('MW', 'MWI', 'Malawi', 'Malawi', 'Republic of Malawi', 'Mal.', 'Sovereign country', (SELECT id FROM public.regions WHERE name = 'Eastern Africa' LIMIT 1), 1, 6, 1),
  ('MY', 'MYS', 'Malaysia', 'Malaysia', 'Malaysia', 'Malay.', 'Sovereign country', (SELECT id FROM public.regions WHERE name = 'South-Eastern Asia' LIMIT 1), 1, 3, 2),
  ('NA', 'NAM', 'Namibia', 'Namibia', 'Republic of Namibia', 'Nam.', 'Sovereign country', (SELECT id FROM public.regions WHERE name = 'Southern Africa' LIMIT 1), 1, 3, 4),
  ('NC', 'NCL', 'New Caledonia', 'New Caledonia', 'New Caledonia', 'New C.', 'Dependency', (SELECT id FROM public.regions WHERE name = 'Melanesia' LIMIT 1), 1, 3, 7),
  ('NE', 'NER', 'Niger', 'Niger', 'Republic of Niger', 'Niger', 'Sovereign country', (SELECT id FROM public.regions WHERE name = 'Western Africa' LIMIT 1), 1, 3, 4),
  ('NG', 'NGA', 'Nigeria', 'Nigeria', 'Federal Republic of Nigeria', 'Nigeria', 'Sovereign country', (SELECT id FROM public.regions WHERE name = 'Western Africa' LIMIT 1), 1, 2, 3),
  ('NI', 'NIC', 'Nicaragua', 'Nicaragua', 'Republic of Nicaragua', 'Nic.', 'Sovereign country', (SELECT id FROM public.regions WHERE name = 'Central America' LIMIT 1), 1, 5, 1),
  ('NL', 'NLD', 'Netherlands', 'Netherlands', 'Kingdom of the Netherlands', 'Neth.', 'Country', (SELECT id FROM public.regions WHERE name = 'Western Europe' LIMIT 1), 1, 5, 4),
  ('NO', 'NOR', 'Norway', 'Norway', 'Kingdom of Norway', 'Nor.', 'Sovereign country', (SELECT id FROM public.regions WHERE name = 'Northern Europe' LIMIT 1), 1, 3, 5),
  ('NP', 'NPL', 'Nepal', 'Nepal', 'Nepal', 'Nepal', 'Sovereign country', (SELECT id FROM public.regions WHERE name = 'Southern Asia' LIMIT 1), 1, 3, 2),
  ('NZ', 'NZL', 'New Zealand', 'New Zealand', 'New Zealand', 'N.Z.', 'Country', (SELECT id FROM public.regions WHERE name = 'Australia and New Zealand' LIMIT 1), 1, 2, 3),
  ('OM', 'OMN', 'Oman', 'Oman', 'Sultanate of Oman', 'Oman', 'Sovereign country', (SELECT id FROM public.regions WHERE name = 'Western Asia' LIMIT 1), 1, 4, 1),
  ('PK', 'PAK', 'Pakistan', 'Pakistan', 'Islamic Republic of Pakistan', 'Pak.', 'Sovereign country', (SELECT id FROM public.regions WHERE name = 'Southern Asia' LIMIT 1), 1, 2, 2),
  ('PA', 'PAN', 'Panama', 'Panama', 'Republic of Panama', 'Pan.', 'Sovereign country', (SELECT id FROM public.regions WHERE name = 'Central America' LIMIT 1), 1, 4, 4),
  ('PE', 'PER', 'Peru', 'Peru', 'Republic of Peru', 'Peru', 'Sovereign country', (SELECT id FROM public.regions WHERE name = 'South America' LIMIT 1), 1, 2, 4),
  ('PH', 'PHL', 'Philippines', 'Philippines', 'Republic of the Philippines', 'Phil.', 'Sovereign country', (SELECT id FROM public.regions WHERE name = 'South-Eastern Asia' LIMIT 1), 1, 2, 3),
  ('PG', 'PNG', 'Papua New Guinea', 'Papua New Guinea', 'Independent State of Papua New Guinea', 'P.N.G.', 'Sovereign country', (SELECT id FROM public.regions WHERE name = 'Melanesia' LIMIT 1), 1, 2, 4),
  ('PL', 'POL', 'Poland', 'Poland', 'Republic of Poland', 'Pol.', 'Sovereign country', (SELECT id FROM public.regions WHERE name = 'Eastern Europe' LIMIT 1), 1, 3, 3),
  ('PR', 'PRI', 'Puerto Rico', 'Puerto Rico', 'Commonwealth of Puerto Rico', 'P.R.', 'Dependency', (SELECT id FROM public.regions WHERE name = 'Caribbean' LIMIT 1), 1, 5, 4),
  ('KP', 'PRK', 'Dem. Rep. Korea', 'Dem. Rep. Korea', 'Democratic People''s Republic of Korea', 'N.K.', 'Sovereign country', (SELECT id FROM public.regions WHERE name = 'Eastern Asia' LIMIT 1), 1, 3, 3),
  ('PT', 'PRT', 'Portugal', 'Portugal', 'Portuguese Republic', 'Port.', 'Sovereign country', (SELECT id FROM public.regions WHERE name = 'Southern Europe' LIMIT 1), 1, 2, 1),
  ('PY', 'PRY', 'Paraguay', 'Paraguay', 'Republic of Paraguay', 'Para.', 'Sovereign country', (SELECT id FROM public.regions WHERE name = 'South America' LIMIT 1), 1, 4, 6),
  ('PS', 'PSE', 'Palestine', 'Palestine', 'West Bank and Gaza', 'Pal.', 'Disputed', (SELECT id FROM public.regions WHERE name = 'Western Asia' LIMIT 1), 1, 5, 3),
  ('QA', 'QAT', 'Qatar', 'Qatar', 'State of Qatar', 'Qatar', 'Sovereign country', (SELECT id FROM public.regions WHERE name = 'Western Asia' LIMIT 1), 1, 5, 3),
  ('RO', 'ROU', 'Romania', 'Romania', 'Romania', 'Rom.', 'Sovereign country', (SELECT id FROM public.regions WHERE name = 'Eastern Europe' LIMIT 1), 1, 3, 1),
  ('RU', 'RUS', 'Russia', 'Russian Federation', 'Russian Federation', 'Rus.', 'Sovereign country', (SELECT id FROM public.regions WHERE name = 'Eastern Europe' LIMIT 1), 1, 2, 2),
  ('RW', 'RWA', 'Rwanda', 'Rwanda', 'Republic of Rwanda', 'Rwa.', 'Sovereign country', (SELECT id FROM public.regions WHERE name = 'Eastern Africa' LIMIT 1), 1, 3, 5),
  ('EH', 'ESH', 'W. Sahara', 'Western Sahara', 'Sahrawi Arab Democratic Republic', 'W. Sah.', 'Indeterminate', (SELECT id FROM public.regions WHERE name = 'Northern Africa' LIMIT 1), 1, 7, 4),
  ('SA', 'SAU', 'Saudi Arabia', 'Saudi Arabia', 'Kingdom of Saudi Arabia', 'Saud.', 'Sovereign country', (SELECT id FROM public.regions WHERE name = 'Western Asia' LIMIT 1), 1, 2, 6),
  ('SD', 'SDN', 'Sudan', 'Sudan', 'Republic of the Sudan', 'Sudan', 'Sovereign country', (SELECT id FROM public.regions WHERE name = 'Northern Africa' LIMIT 1), 1, 3, 2),
  ('SS', 'SSD', 'S. Sudan', 'South Sudan', 'Republic of South Sudan', 'S. Sud.', 'Sovereign country', (SELECT id FROM public.regions WHERE name = 'Eastern Africa' LIMIT 1), 1, 3, 1),
  ('SN', 'SEN', 'Senegal', 'Senegal', 'Republic of Senegal', 'Sen.', 'Sovereign country', (SELECT id FROM public.regions WHERE name = 'Western Africa' LIMIT 1), 1, 3, 2),
  ('SB', 'SLB', 'Solomon Is.', 'Solomon Islands', '', 'S. Is.', 'Sovereign country', (SELECT id FROM public.regions WHERE name = 'Melanesia' LIMIT 1), 1, 3, 1),
  ('SL', 'SLE', 'Sierra Leone', 'Sierra Leone', 'Republic of Sierra Leone', 'S.L.', 'Sovereign country', (SELECT id FROM public.regions WHERE name = 'Western Africa' LIMIT 1), 1, 4, 1),
  ('SV', 'SLV', 'El Salvador', 'El Salvador', 'Republic of El Salvador', 'El. S.', 'Sovereign country', (SELECT id FROM public.regions WHERE name = 'Central America' LIMIT 1), 1, 6, 1),
  ('SO', 'SOM', 'Somalia', 'Somalia', 'Federal Republic of Somalia', 'Som.', 'Sovereign country', (SELECT id FROM public.regions WHERE name = 'Eastern Africa' LIMIT 1), 1, 6, 2),
  ('RS', 'SRB', 'Serbia', 'Serbia', 'Republic of Serbia', 'Serb.', 'Sovereign country', (SELECT id FROM public.regions WHERE name = 'Southern Europe' LIMIT 1), 1, 5, 3),
  ('SR', 'SUR', 'Suriname', 'Suriname', 'Republic of Suriname', 'Sur.', 'Sovereign country', (SELECT id FROM public.regions WHERE name = 'South America' LIMIT 1), 1, 4, 1),
  ('SK', 'SVK', 'Slovakia', 'Slovakia', 'Slovak Republic', 'Svk.', 'Sovereign country', (SELECT id FROM public.regions WHERE name = 'Eastern Europe' LIMIT 1), 1, 6, 2),
  ('SI', 'SVN', 'Slovenia', 'Slovenia', 'Republic of Slovenia', 'Slo.', 'Sovereign country', (SELECT id FROM public.regions WHERE name = 'Southern Europe' LIMIT 1), 1, 6, 2),
  ('SE', 'SWE', 'Sweden', 'Sweden', 'Kingdom of Sweden', 'Swe.', 'Sovereign country', (SELECT id FROM public.regions WHERE name = 'Northern Europe' LIMIT 1), 1, 3, 1),
  ('SZ', 'SWZ', 'Swaziland', 'Swaziland', 'Kingdom of Swaziland', 'Swz.', 'Sovereign country', (SELECT id FROM public.regions WHERE name = 'Southern Africa' LIMIT 1), 1, 4, 3),
  ('SY', 'SYR', 'Syria', 'Syria', 'Syrian Arab Republic', 'Syria', 'Sovereign country', (SELECT id FROM public.regions WHERE name = 'Western Asia' LIMIT 1), 1, 3, 2),
  ('TD', 'TCD', 'Chad', 'Chad', 'Republic of Chad', 'Chad', 'Sovereign country', (SELECT id FROM public.regions WHERE name = 'Middle Africa' LIMIT 1), 1, 3, 6),
  ('TG', 'TGO', 'Togo', 'Togo', 'Togolese Republic', 'Togo', 'Sovereign country', (SELECT id FROM public.regions WHERE name = 'Western Africa' LIMIT 1), 1, 6, 3),
  ('TH', 'THA', 'Thailand', 'Thailand', 'Kingdom of Thailand', 'Thai.', 'Sovereign country', (SELECT id FROM public.regions WHERE name = 'South-Eastern Asia' LIMIT 1), 1, 3, 3),
  ('TJ', 'TJK', 'Tajikistan', 'Tajikistan', 'Republic of Tajikistan', 'Tjk.', 'Sovereign country', (SELECT id FROM public.regions WHERE name = 'Central Asia' LIMIT 1), 1, 4, 3),
  ('TM', 'TKM', 'Turkmenistan', 'Turkmenistan', 'Turkmenistan', 'Turkm.', 'Sovereign country', (SELECT id FROM public.regions WHERE name = 'Central Asia' LIMIT 1), 1, 4, 3),
  ('TL', 'TLS', 'Timor-Leste', 'Timor-Leste', 'Democratic Republic of Timor-Leste', 'T.L.', 'Sovereign country', (SELECT id FROM public.regions WHERE name = 'South-Eastern Asia' LIMIT 1), 1, 5, 2),
  ('TT', 'TTO', 'Trinidad and Tobago', 'Trinidad and Tobago', 'Republic of Trinidad and Tobago', 'Tr.T.', 'Sovereign country', (SELECT id FROM public.regions WHERE name = 'Caribbean' LIMIT 1), 1, 5, 5),
  ('TN', 'TUN', 'Tunisia', 'Tunisia', 'Republic of Tunisia', 'Tun.', 'Sovereign country', (SELECT id FROM public.regions WHERE name = 'Northern Africa' LIMIT 1), 1, 3, 4),
  ('TR', 'TUR', 'Turkey', 'Turkey', 'Republic of Turkey', 'Tur.', 'Sovereign country', (SELECT id FROM public.regions WHERE name = 'Western Asia' LIMIT 1), 1, 2, 6),
  ('TW', 'TWN', 'Taiwan', 'Taiwan', '', 'Taiwan', 'Sovereign country', (SELECT id FROM public.regions WHERE name = 'Eastern Asia' LIMIT 1), 1, 3, 1),
  ('TZ', 'TZA', 'Tanzania', 'Tanzania', 'United Republic of Tanzania', 'Tanz.', 'Sovereign country', (SELECT id FROM public.regions WHERE name = 'Eastern Africa' LIMIT 1), 1, 3, 3),
  ('UG', 'UGA', 'Uganda', 'Uganda', 'Republic of Uganda', 'Uga.', 'Sovereign country', (SELECT id FROM public.regions WHERE name = 'Eastern Africa' LIMIT 1), 1, 3, 6),
  ('UA', 'UKR', 'Ukraine', 'Ukraine', 'Ukraine', 'Ukr.', 'Sovereign country', (SELECT id FROM public.regions WHERE name = 'Eastern Europe' LIMIT 1), 1, 3, 5),
  ('UY', 'URY', 'Uruguay', 'Uruguay', 'Oriental Republic of Uruguay', 'Ury.', 'Sovereign country', (SELECT id FROM public.regions WHERE name = 'South America' LIMIT 1), 1, 4, 1),
  ('US', 'USA', 'United States', 'United States', 'United States of America', 'U.S.A.', 'Country', (SELECT id FROM public.regions WHERE name = 'Northern America' LIMIT 1), 1, 2, 4),
  ('UZ', 'UZB', 'Uzbekistan', 'Uzbekistan', 'Republic of Uzbekistan', 'Uzb.', 'Sovereign country', (SELECT id FROM public.regions WHERE name = 'Central Asia' LIMIT 1), 1, 3, 2),
  ('VE', 'VEN', 'Venezuela', 'Venezuela', 'Bolivarian Republic of Venezuela', 'Ven.', 'Sovereign country', (SELECT id FROM public.regions WHERE name = 'South America' LIMIT 1), 1, 3, 1),
  ('VN', 'VNM', 'Vietnam', 'Vietnam', 'Socialist Republic of Vietnam', 'Viet.', 'Sovereign country', (SELECT id FROM public.regions WHERE name = 'South-Eastern Asia' LIMIT 1), 1, 2, 5),
  ('VU', 'VUT', 'Vanuatu', 'Vanuatu', 'Republic of Vanuatu', 'Van.', 'Sovereign country', (SELECT id FROM public.regions WHERE name = 'Melanesia' LIMIT 1), 1, 4, 6),
  ('YE', 'YEM', 'Yemen', 'Yemen', 'Republic of Yemen', 'Yem.', 'Sovereign country', (SELECT id FROM public.regions WHERE name = 'Western Asia' LIMIT 1), 1, 3, 5),
  ('ZA', 'ZAF', 'South Africa', 'South Africa', 'Republic of South Africa', 'S.Af.', 'Sovereign country', (SELECT id FROM public.regions WHERE name = 'Southern Africa' LIMIT 1), 1, 2, 2),
  ('ZM', 'ZMB', 'Zambia', 'Zambia', 'Republic of Zambia', 'Zambia', 'Sovereign country', (SELECT id FROM public.regions WHERE name = 'Eastern Africa' LIMIT 1), 1, 3, 5),
  ('ZW', 'ZWE', 'Zimbabwe', 'Zimbabwe', 'Republic of Zimbabwe', 'Zimb.', 'Sovereign country', (SELECT id FROM public.regions WHERE name = 'Eastern Africa' LIMIT 1), 1, 3, 1)
ON CONFLICT (iso_a2) DO UPDATE SET
  iso_a3 = EXCLUDED.iso_a3,
  name = EXCLUDED.name,
  name_long = EXCLUDED.name_long,
  formal_name = EXCLUDED.formal_name,
  abbrev = EXCLUDED.abbrev,
  admin_type = EXCLUDED.admin_type,
  region_id = EXCLUDED.region_id,
  scale_rank = EXCLUDED.scale_rank,
  label_rank = EXCLUDED.label_rank,
  map_color = EXCLUDED.map_color;

-- Migration: 20260315000400_images_atlas_persistence.sql

-- 1. Extend images table with atlas hierarchy columns
ALTER TABLE public.images
ADD COLUMN IF NOT EXISTS country_id uuid REFERENCES public.countries(id);

ALTER TABLE public.images
ADD COLUMN IF NOT EXISTS country_code text;

ALTER TABLE public.images
ADD COLUMN IF NOT EXISTS country_name text;

ALTER TABLE public.images
ADD COLUMN IF NOT EXISTS admin_region_name text;

ALTER TABLE public.images
ADD COLUMN IF NOT EXISTS un_region_name text;

ALTER TABLE public.images
ADD COLUMN IF NOT EXISTS continent_name text;

-- 2. Add performance indexes
CREATE INDEX IF NOT EXISTS idx_images_country_id ON public.images(country_id);
CREATE INDEX IF NOT EXISTS idx_images_country_code ON public.images(country_code);
CREATE INDEX IF NOT EXISTS idx_images_continent ON public.images(continent_name);

-- 3. Add comment explaining the source of truth
COMMENT ON COLUMN public.images.country_id IS 'Derived from location GPS via Natural Earth Admin-0 boundaries';

-- 4. Backfill existing images with atlas data using ST_Point constructor
-- NOTE: ST_Covers check was disabled here because countries.boundary was not yet populated.
-- Boundaries were populated later in 20260335000047_fix_get_upload_context_country_lookup.sql.
-- This migration is historical and should not be re-run. New images get country resolution
-- via get_upload_context RPC which uses ST_Covers with the GIST index on countries.boundary.
UPDATE public.images i
SET
  country_id = c.id,
  country_code = c.iso_a2,
  country_name = c.name,
  admin_region_name = r.name,
  un_region_name = r.un_region_name,
  continent_name = u.continent_name
FROM public.countries c
JOIN public.regions r ON c.region_id = r.id
JOIN public.un_regions u ON r.un_region_name = u.name
WHERE i.latitude IS NOT NULL
  AND i.longitude IS NOT NULL
  AND i.country_id IS NULL
  AND false; -- Disabled: was historical, boundaries populated in 20260335000047

-- Migration: 20260316000000_add_submission_credit.sql

ALTER TABLE public.images
  ADD COLUMN IF NOT EXISTS contribution_credit_platform TEXT,
  ADD COLUMN IF NOT EXISTS contribution_credit_handle TEXT;

CREATE OR REPLACE FUNCTION public.update_own_submission_credit(
  p_image_id UUID,
  p_platform TEXT,
  p_handle TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  current_user_id UUID := auth.uid();
  normalized_platform TEXT;
  normalized_handle TEXT;
BEGIN
  IF current_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  IF p_image_id IS NULL THEN
    RAISE EXCEPTION 'Image ID is required';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.images i
    WHERE i.id = p_image_id
      AND i.created_by = current_user_id
  ) THEN
    RAISE EXCEPTION 'You do not have permission to edit this submission';
  END IF;

  normalized_handle := NULLIF(btrim(COALESCE(p_handle, '')), '');

  IF normalized_handle IS NULL THEN
    normalized_platform := NULL;
  ELSE
    normalized_handle := regexp_replace(normalized_handle, '^@+', '');

    IF char_length(normalized_handle) > 50 THEN
      RAISE EXCEPTION 'Handle must be 50 characters or less';
    END IF;

    IF normalized_handle !~ '^[A-Za-z0-9._-]+$' THEN
      RAISE EXCEPTION 'Handle can only include letters, numbers, periods, underscores, and hyphens';
    END IF;

    normalized_platform := lower(NULLIF(btrim(COALESCE(p_platform, '')), ''));

    IF normalized_platform IS NULL THEN
      RAISE EXCEPTION 'Platform is required when a handle is provided';
    END IF;

    IF normalized_platform NOT IN ('instagram', 'tiktok', 'youtube', 'x', 'other') THEN
      RAISE EXCEPTION 'Invalid platform';
    END IF;
  END IF;

  UPDATE public.images
  SET
    contribution_credit_platform = normalized_platform,
    contribution_credit_handle = normalized_handle
  WHERE id = p_image_id;

  RETURN jsonb_build_object(
    'platform', normalized_platform,
    'handle', normalized_handle
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.update_own_submission_credit(UUID, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.update_own_submission_credit(UUID, TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_own_submission_credit(UUID, TEXT, TEXT) TO service_role;

-- Migration: 20260316000001_populate_country_boundaries.sql

-- Migration: Populate country boundaries from Natural Earth
-- Date: 2026-03-16
-- Purpose: Inject 174 country polygons for ST_Covers spatial queries
-- Source: Natural Earth 110m Admin-0 Countries

UPDATE public.countries SET boundary = ST_GeomFromGeoJSON('{"type": "Polygon", "coordinates": [[[61.210817091725744, 35.650072333309225], [62.230651483005886, 35.270663967422294], [62.98466230657661, 35.40404083916762], [63.19353844590035, 35.857165635718914], [63.98289594915871, 36.0079574651466], [64.5464791197339, 36.31207326918427], [64.7461051776774, 37.111817735333304], [65.58894778835784, 37.30521678318564], [65.74563073106683, 37.66116404881207], [66.21738488145934, 37.39379018813392], [66.51860680528867, 37.36278432875879], [67.07578209825962, 37.35614390720929], [67.82999962755952, 37.144994004864685], [68.13556237170138, 37.02311513930431], [68.85944583524594, 37.344335842430596], [69.19627282092438, 37.15114350030743], [69.51878543485796, 37.60899669041342], [70.11657840361033, 37.58822276463209], [70.27057417184014, 37.735164699854025], [70.3763041523093, 38.13839590102752], [70.80682050973289, 38.486281643216415], [71.34813113799026, 38.25890534113216], [71.23940392444817, 37.953265082341886], [71.54191775908478, 37.905774441065645], [71.44869347523024, 37.06564484308052], [71.8446382994506, 36.73817129164692], [72.1930408059624, 36.948287665345674], [72.63688968291729, 37.047558091778356], [73.26005577992501, 37.495256862939], [73.9486959166465, 37.4215662704908], [74.98000247589542, 37.419990139305895], [75.15802778514092, 37.13303091078912], [74.57589277537298, 37.02084137628346], [74.06755171091783, 36.83617564548845], [72.92002485544447, 36.72000702569632], [71.84629194528392, 36.50994232842986], [71.26234826038575, 36.074387518857804], [71.49876793812109, 35.650563259416], [71.61307620635071, 35.153203436822864], [71.11501875192164, 34.733125718722235], [71.15677330921346, 34.34891144463215], [70.8818030129884, 33.98885590263852], [69.9305432473596, 34.02012014417511], [70.3235941913716, 33.35853261975839], [69.68714725126486, 33.105498969041236], [69.26252200712256, 32.5019440780883], [69.31776411324256, 31.901412258424443], [68.92667687365767, 31.620189113892067], [68.55693200060932, 31.713310044882018], [67.79268924344478, 31.58293040620963], [67.68339358914747, 31.30315420178142], [66.93889122911847, 31.304911200479353], [66.38145755398602, 30.738899237586452], [66.34647260932442, 29.887943427036177], [65.0468620136161, 29.472180691031905], [64.35041873561852, 29.560030625928093], [64.14800215033125, 29.340819200145972], [63.55026085801117, 29.468330796826166], [62.54985680527278, 29.31857249604431], [60.87424848820879, 29.829238999952608], [61.781221551363444, 30.735850328081238], [61.69931440618083, 31.379506130492672], [60.94194461451113, 31.548074652628753], [60.863654819588966, 32.18291962333443], [60.536077915290775, 32.98126882581157], [60.963700392506006, 33.52883230237626], [60.52842980331158, 33.676446031218006], [60.80319339380745, 34.40410187431986], [61.210817091725744, 35.650072333309225]]]}') WHERE iso_a2 = 'AF';
UPDATE public.countries SET boundary = ST_GeomFromGeoJSON('{"type": "MultiPolygon", "coordinates": [[[[16.326528354567046, -5.877470391466218], [16.573179965896145, -6.622644545115094], [16.86019087084523, -7.222297865429979], [17.08999596524717, -7.545688978712477], [17.472970004962292, -8.068551120641658], [18.13422163256905, -7.987677504104866], [18.464175652752687, -7.847014255406478], [19.01675174324967, -7.98824594486014], [19.166613396896082, -7.738183688999726], [19.417502475673217, -7.155428562044278], [20.037723016040218, -7.11636117923166], [20.09162153492062, -6.943090101756951], [20.601822950938327, -6.939317722199689], [20.51474816252653, -7.299605808138665], [21.728110792739756, -7.290872491081316], [21.746455926203367, -7.920084730667114], [21.94913089365204, -8.305900974158305], [21.801801385187957, -8.908706556842986], [21.875181919042404, -9.523707777548566], [22.208753289486424, -9.89479623783653], [22.155268182064333, -11.084801120653779], [22.402798292742432, -10.993075453335692], [22.83734541188477, -11.017621758674338], [23.45679080576747, -10.867863457892483], [23.912215203555746, -10.926826267137542], [24.017893507592618, -11.237298272347118], [23.90415368011824, -11.722281589406336], [24.079905226342902, -12.191296888887308], [23.930922072045377, -12.565847670138822], [24.016136508894704, -12.911046237848552], [21.933886346125945, -12.898437188369357], [21.887842644953878, -16.080310153876894], [22.56247846852429, -16.898451429921835], [23.215048455506093, -17.523116143465955], [21.377176141045595, -17.93063648851971], [18.95618696460363, -17.789094740472237], [18.26330936043422, -17.309950860262006], [14.209706658595053, -17.353100681225712], [14.058501417709039, -17.423380629142656], [13.462362094789967, -16.971211846588744], [12.814081251688407, -16.941342868724078], [12.215461460019384, -17.111668389558062], [11.73419884608515, -17.3018893368245], [11.64009606288161, -16.67314218512921], [11.778537224991567, -15.79381601325069], [12.123580763404448, -14.878316338767931], [12.175618930722266, -14.449143568583892], [12.500095249083017, -13.547699883684402], [12.738478631245442, -13.137905775609937], [13.312913852601838, -12.483630466362513], [13.633721144269828, -12.038644707897191], [13.738727654686926, -11.297863050993143], [13.686379428775297, -10.731075941615842], [13.387327915102162, -10.373578383020728], [13.120987583069876, -9.766897067914115], [12.875369500386569, -9.16693368900549], [12.929061313537801, -8.959091078327575], [13.236432732809874, -8.562629489784342], [12.933040398824318, -7.596538588087753], [12.72829837408392, -6.927122084178805], [12.227347039446443, -6.294447523629373], [12.322431674863566, -6.100092461779653], [12.735171339578699, -5.965682061388478], [13.02486941900699, -5.984388929878108], [13.375597364971895, -5.864241224799557], [16.326528354567046, -5.877470391466218]]], [[[12.436688266660923, -5.684303887559224], [12.18233686692028, -5.789930515163803], [11.914963006242118, -5.037986748884734], [12.318607618873926, -4.606230157086159], [12.62075971848455, -4.438023369976122], [12.995517205465205, -4.781103203961919], [12.631611769265845, -4.991271254092936], [12.468004184629763, -5.248361504744992], [12.436688266660923, -5.684303887559224]]]]}') WHERE iso_a2 = 'AO';
UPDATE public.countries SET boundary = ST_GeomFromGeoJSON('{"type": "Polygon", "coordinates": [[[20.59024743010491, 41.855404161133606], [20.463175083099202, 41.51508901627534], [20.605181919037364, 41.086226304685226], [21.0200403174764, 40.84272695572588], [20.999989861747224, 40.58000397395398], [20.674996779063633, 40.43499990494303], [20.615000441172754, 40.11000682225938], [20.15001590341052, 39.62499766698397], [19.980000441170148, 39.69499339452341], [19.960001661873207, 39.91500580500605], [19.406081984136733, 40.250773423822466], [19.319058872157143, 40.72723012955356], [19.40354983895429, 41.40956574153546], [19.540027296637106, 41.71998607031276], [19.37176883309496, 41.877547512370654], [19.304486118250793, 42.19574514420782], [19.73805138517963, 42.68824738216557], [19.801613396898688, 42.50009349219084], [20.0707, 42.58863], [20.283754510181893, 42.32025950781508], [20.52295, 42.21787], [20.59024743010491, 41.855404161133606]]]}') WHERE iso_a2 = 'AL';
UPDATE public.countries SET boundary = ST_GeomFromGeoJSON('{"type": "Polygon", "coordinates": [[[51.57951867046327, 24.245497137951105], [51.757440626844186, 24.29407298430547], [51.79438927593287, 24.019826158132506], [52.57708051942561, 24.177439276622707], [53.404006788960146, 24.15131684009917], [54.00800092958758, 24.121757920828216], [54.69302371604863, 24.79789236093509], [55.43902469261414, 25.43914520924494], [56.07082075381456, 26.05546417897398], [56.261041701080956, 25.71460643157677], [56.396847365144005, 24.924732163995486], [55.88623253766801, 24.920830593357447], [55.804118686756226, 24.269604193615265], [55.98121382022046, 24.13054291431783], [55.52863162620824, 23.933604030853502], [55.525841098864475, 23.524869289640932], [55.234489373602884, 23.110992743415324], [55.208341098863194, 22.708329982997046], [55.006803012924905, 22.496947536707136], [52.000733270074335, 23.00115448657894], [51.61770755392698, 24.01421926522883], [51.57951867046327, 24.245497137951105]]]}') WHERE iso_a2 = 'AE';
UPDATE public.countries SET boundary = ST_GeomFromGeoJSON('{"type": "MultiPolygon", "coordinates": [[[[-65.5, -55.2], [-66.45, -55.25], [-66.95992, -54.89681], [-67.56244, -54.87001], [-68.63335, -54.8695], [-68.63401022758316, -52.63637045887446], [-68.25, -53.1], [-67.75, -53.85], [-66.45, -54.45], [-65.05, -54.7], [-65.5, -55.2]]], [[[-64.96489213729458, -22.07586150481235], [-64.37702104354227, -22.798091322523547], [-63.98683814152247, -21.993644301035957], [-62.846468471921554, -22.034985446869456], [-62.6850571356579, -22.249029229422405], [-60.84656470400995, -23.880712579038303], [-60.028966030503994, -24.032796319273245], [-58.80712846539495, -24.771459242453275], [-57.77721716981796, -25.16233977630904], [-57.63366004091114, -25.60365650808167], [-58.61817359071972, -27.123718763947124], [-57.60975969097615, -27.395898532828426], [-56.486701626192996, -27.54849903738625], [-55.6958455063982, -27.38783700939082], [-54.78879492859505, -26.62178557709609], [-54.625290696823555, -25.739255466415486], [-54.13004960795442, -25.54763925547725], [-53.62834896504873, -26.124865004177437], [-53.64873531758789, -26.92347258881611], [-54.49072526713553, -27.47475676850577], [-55.1622863429846, -27.88191537853342], [-56.2908996242391, -28.852760512000856], [-57.62513342958292, -30.216294854454247], [-57.87493730328191, -31.016556084926165], [-58.14244035504075, -32.04450367607619], [-58.13264767112142, -33.040566908502015], [-58.34961117209883, -33.263188978815435], [-58.42707414410438, -33.90945444105755], [-58.49544206402655, -34.43148976007011], [-57.225829637263644, -35.28802662530789], [-57.36235877137875, -35.977390232081504], [-56.73748735210546, -36.41312590916658], [-56.788285285048346, -36.901571547189334], [-57.74915686708343, -38.183870538079915], [-59.23185706240187, -38.720220228837206], [-61.237445237865614, -38.928424574541154], [-62.33595699731015, -38.82770720800437], [-62.12576310896293, -39.424104913084875], [-62.330530971919444, -40.17258635840032], [-62.14599443220524, -40.67689666113674], [-62.74580278181699, -41.02876148861209], [-63.770494757732536, -41.166789239263665], [-64.73208980981971, -40.802677097335135], [-65.11803524439159, -41.06431487402888], [-64.97856055363584, -42.058000990569326], [-64.30340796574248, -42.3590162086695], [-63.75594784204236, -42.04368661882451], [-63.45805904809589, -42.56313811622236], [-64.3788038804563, -42.873558444999645], [-65.1818039618397, -43.495380954767796], [-65.32882341171015, -44.501366062193696], [-65.5652689276616, -45.036785577169795], [-66.50996578638936, -45.03962778094585], [-67.29379391139244, -45.5518962542552], [-67.58054643418009, -46.30177296324254], [-66.59706641301727, -47.03392465595381], [-65.64102657740145, -47.236134535511894], [-65.98508826360074, -48.13328907653114], [-67.16617896184766, -48.697337334996945], [-67.81608761256646, -49.86966887797042], [-68.72874508327317, -50.26421843851887], [-69.1385391913478, -50.7325102679478], [-68.81556148952353, -51.771104011594105], [-68.14999487982041, -52.349983406127706], [-68.57154537624135, -52.29944385534626], [-69.49836218939609, -52.14276091263725], [-71.91480383979635, -52.009022305865926], [-72.32940385607404, -51.42595631287241], [-72.30997351753237, -50.677009779666356], [-72.97574683296463, -50.74145029073431], [-73.32805091011448, -50.37878508890987], [-73.41543575712004, -49.31843637471296], [-72.64824744331494, -48.87861825947679], [-72.33116085477195, -48.244238376661826], [-72.44735531278027, -47.73853281025353], [-71.91725847033021, -46.8848381487918], [-71.55200944689125, -45.56073292417713], [-71.65931555854533, -44.97368865334144], [-71.22277889675973, -44.784242852559416], [-71.32980078803621, -44.40752166115169], [-71.79362260607195, -44.20717213315611], [-71.46405615913051, -43.78761117937833], [-71.91542395698391, -43.40856454851742], [-72.14889807807853, -42.25488819760139], [-71.74680375841547, -42.051386407235995], [-71.91573401557756, -40.83233936947073], [-71.68076127794646, -39.80816415787807], [-71.41351660834906, -38.916022230791114], [-70.81466427273472, -38.55299529394074], [-71.11862504747543, -37.5768274879472], [-71.1218806627098, -36.65812387466234], [-70.36476925320167, -36.005088799789945], [-70.3880494859491, -35.16968759535945], [-69.81730912950147, -34.193571465798286], [-69.81477698431922, -33.27388600029985], [-70.07439938015364, -33.09120981214804], [-70.53506893581945, -31.36501026787029], [-69.91900834825194, -30.336339206668313], [-70.01355038112987, -29.36792286551855], [-69.65613033718316, -28.459141127233693], [-69.00123491074828, -27.521213881136134], [-68.2955415513704, -26.89933969493579], [-68.59479977077268, -26.506908868111267], [-68.38600114609736, -26.185016371365236], [-68.41765296087613, -24.518554782816878], [-67.32844295924414, -24.025303236590915], [-66.98523393417764, -22.98634856536283], [-67.10667355006362, -22.7359245744764], [-66.27333940292485, -21.832310479420684], [-64.96489213729458, -22.07586150481235]]]]}') WHERE iso_a2 = 'AR';
UPDATE public.countries SET boundary = ST_GeomFromGeoJSON('{"type": "Polygon", "coordinates": [[[43.58274580259273, 41.09214325618257], [44.97248009621808, 41.248128567055595], [45.17949588397934, 40.98535390885141], [45.56035118997045, 40.812289537105926], [45.35917483905817, 40.56150381119346], [45.89190717955509, 40.21847565364], [45.61001224140293, 39.89999380142518], [46.034534132680676, 39.628020738273065], [46.48349897643246, 39.464154771475535], [46.50571984231797, 38.770605373686294], [46.14362308124882, 38.74120148371222], [45.73537926614301, 39.31971914321974], [45.73997846861698, 39.47399913182713], [45.29814497252146, 39.471751207022436], [45.00198733905675, 39.740003567049555], [44.79398969908195, 39.71300263117705], [44.4000085792887, 40.00500031184228], [43.65643639504094, 40.253563951166186], [43.75265791196841, 40.74020091405876], [43.58274580259273, 41.09214325618257]]]}') WHERE iso_a2 = 'AM';
UPDATE public.countries SET boundary = ST_GeomFromGeoJSON('{"type": "MultiPolygon", "coordinates": [[[[-59.57209469261153, -80.0401787250963], [-59.86584937197472, -80.54965667106185], [-60.1596557277702, -81.00032683707931], [-62.25539343936708, -80.86317758577665], [-64.48812537296976, -80.92193368929256], [-65.74166642928984, -80.58882740673914], [-65.74166642928984, -80.54965667106185], [-66.29003089055513, -80.25577280061799], [-64.03768775089765, -80.29494353629518], [-61.88324561221714, -80.39287037548829], [-61.13897579613345, -79.9813709451481], [-60.610119188058405, -79.62867929475613], [-59.57209469261153, -80.0401787250963]]], [[[-159.20818356019765, -79.49705942170873], [-161.12760128481466, -79.6342086730113], [-162.4398467682184, -79.28146534618702], [-163.02740780337697, -78.92877369579496], [-163.06660437727032, -78.86996591584676], [-163.71289567772874, -78.59566741324153], [-163.71289567772874, -78.59566660579728], [-163.10580095116381, -78.2233379111343], [-161.24511349184638, -78.38017588314017], [-160.2462080556445, -78.69364512142266], [-159.48240454815448, -79.04633757925899], [-159.20818356019765, -79.49705942170873]]], [[[-45.154757656421026, -78.04706960058674], [-43.920827806155756, -78.47810272233326], [-43.489949713706096, -79.08555999136846], [-43.37243750667437, -79.51664478954727], [-43.333266770997085, -80.02612273551293], [-44.88053666846429, -80.33964365022771], [-46.506173875502014, -80.59435678499432], [-48.38642086444179, -80.82948455192235], [-50.482106899606464, -81.02544158317312], [-52.85198808451179, -80.9666854796573], [-54.164259406131606, -80.63352752067158], [-53.98799109558405, -80.2220280903314], [-51.8531343247422, -79.94772958772609], [-50.99132646341059, -79.61462330517266], [-50.36459469257474, -79.18348683056163], [-49.91413123228651, -78.81120900488669], [-49.30695899107312, -78.45856903092692], [-48.66061601418252, -78.04701792415445], [-48.66061601418252, -78.04701873159868], [-48.1513964503784, -78.04706960058674], [-46.662856818211026, -77.83147552506503], [-45.154757656421026, -78.04706960058674]]], [[[-121.21151139385712, -73.50099049900604], [-119.91885127829205, -73.65772511814734], [-118.72414303269191, -73.4813534547352], [-119.29211870001195, -73.83409678155948], [-120.23221716370998, -74.08880991632616], [-121.62282995668426, -74.01046844497161], [-122.6217345854419, -73.65777760202388], [-122.62173539288614, -73.65777679457963], [-122.40624467022903, -73.32461883559391], [-121.21151139385712, -73.50099049900604]]], [[[-125.55956640689531, -73.4813534547352], [-124.03188187726685, -73.87326751723674], [-124.61946875064153, -73.83409678155948], [-125.91218054263891, -73.7361182659341], [-127.28312964568191, -73.46176889434082], [-127.28313045312616, -73.46176808689657], [-126.55847184309721, -73.24622568780717], [-125.55956640689531, -73.4813534547352]]], [[[-98.9815496488239, -71.93333424899978], [-97.88474321164503, -72.07053517673474], [-96.78793677446623, -71.9529712932707], [-96.20034990109144, -72.52120534275218], [-96.98376461463621, -72.44286387139763], [-98.19808325884685, -72.48203460707492], [-99.4320131091122, -72.44286387139763], [-100.78345516640921, -72.50161997491355], [-101.80186845580134, -72.30566294366278], [-102.33072506387639, -71.89416432076685], [-102.33072506387639, -71.89416351332261], [-101.70396745482444, -71.71779184991038], [-100.4309185453141, -71.85499277764532], [-98.9815496488239, -71.93333424899978]]], [[[-68.45134599473042, -70.95582285576674], [-68.3338337876987, -71.40649302178419], [-68.51012793646242, -71.79840708428573], [-68.78429724798698, -72.17073577894863], [-69.95947099473642, -72.3078850302513], [-71.07588863797014, -72.50384206150207], [-72.38813412137378, -72.48425669366343], [-71.89849992540829, -72.09234263116188], [-73.07362199572543, -72.22949188246454], [-74.19003963895906, -72.3666928101995], [-74.95389482288138, -72.07275726332324], [-75.01262508818121, -71.66125783298307], [-73.91581865100233, -71.26934457792578], [-73.91581865100233, -71.26934377048153], [-73.23033077665056, -71.15177988701751], [-72.07471655952355, -71.19095062269477], [-71.78096188016036, -70.68147267672913], [-71.72217993842844, -70.30919565849851], [-71.74179114448319, -69.5057821656568], [-71.17381547716315, -69.03547495536841], [-70.25325151231573, -68.8787403362272], [-69.72444658067306, -69.25101735445782], [-69.48942216660959, -69.62334604912073], [-69.05851823594381, -70.07401621513819], [-68.72554114447107, -70.50515268974928], [-68.45134599473042, -70.95582285576674]]], [[[-58.61414282900091, -64.15246713013315], [-59.045072597882864, -64.36800952922263], [-59.78934241396655, -64.21122323364905], [-60.6119278631887, -64.30920174927444], [-61.297415737540376, -64.54432951620257], [-62.02210018578543, -64.79909432740136], [-62.5117602199669, -65.09302987427752], [-62.64885779483737, -65.48494232189066], [-62.59012752953774, -65.85721934012136], [-62.120078701410705, -66.1903256226747], [-62.805566575762384, -66.42550506603496], [-63.74569007023237, -66.50384653738959], [-64.29410620792996, -66.83700449637522], [-64.88169308130463, -67.15047373465772], [-65.50842485214056, -67.58161020926892], [-65.66508195663329, -67.95388722749945], [-65.31254533553809, -68.36533498140741], [-64.78371456567933, -68.6789075725545], [-63.9611032782411, -68.91398366305017], [-63.197299770751044, -69.22755625419725], [-62.78595536970775, -69.6194186402665], [-62.570516323482906, -69.9917473349295], [-62.27673580590354, -70.38366139743104], [-61.80666113956059, -70.71676767998447], [-61.5129064601974, -71.08904469821508], [-61.37580888532713, -72.01007375095313], [-61.08197669131553, -72.38235076918383], [-61.00366105817719, -72.77426483168537], [-60.69026933454316, -73.16617889418708], [-60.82736690941343, -73.69524220799119], [-61.37580888532713, -74.10674163833137], [-61.96336992048569, -74.43984792088489], [-63.29520077172796, -74.57699717218738], [-63.74569007023237, -74.92974049901173], [-64.35283647322959, -75.26284678156516], [-65.86098731145177, -75.63512379979578], [-67.19281816269412, -75.79191009536945], [-68.44628170436576, -76.00745249445876], [-69.79772376166284, -76.22299489354818], [-70.60072384304624, -76.63449432388845], [-72.20677568224536, -76.67366505956572], [-73.96953630236968, -76.63449432388845], [-75.55597693551402, -76.7128874716752], [-77.24037024606761, -76.7128874716752], [-76.92697852243359, -77.10480153417674], [-75.39929399280493, -77.28106984472439], [-74.28287634957141, -77.55542002376181], [-73.65611874051945, -77.90811167415396], [-74.77253638375308, -78.22163258886867], [-76.49610042998401, -78.12365407324329], [-77.92585812041926, -78.37841888444225], [-77.98466590036747, -78.78991831478234], [-78.02378495961247, -79.18183318472822], [-76.84863705107912, -79.51493946728165], [-76.6332238430704, -79.88721648551227], [-75.36009741891175, -80.25954518017525], [-73.24485185412462, -80.41633147574876], [-71.44294633653922, -80.69062997835398], [-70.01316280788777, -81.00415089306878], [-68.19164608424754, -81.31767180778357], [-65.70427853052666, -81.47445810335725], [-63.2560300360507, -81.74875660596248], [-61.55202551944231, -82.04269215283854], [-59.69141557477346, -82.37585011182435], [-58.71212134462621, -82.84610564568035], [-58.22248714866092, -83.21843434034335], [-57.00811682801782, -82.86569101351908], [-55.36289425314155, -82.57175546664283], [-53.619770677288244, -82.25823455192804], [-51.543644171746024, -82.00352141716135], [-49.76134986021546, -81.72917123812375], [-47.27393063006221, -81.7095858702853], [-44.82570797380251, -81.84673512158777], [-42.80836340999238, -82.08191456494811], [-42.16202043310179, -81.65082976676929], [-40.771433478343596, -81.35689421989322], [-38.24481767429705, -81.33730885205459], [-36.26666968438022, -81.12171477653298], [-34.386396857224355, -80.90617237744348], [-32.31029618989831, -80.76902312614074], [-30.097097947701997, -80.5926514627287], [-28.549802212018704, -80.33793832796201], [-29.25490129242513, -79.98519500113765], [-29.685805223090966, -79.63250335074568], [-29.685805223090966, -79.26022633251497], [-31.62480831554663, -79.29939706819223], [-33.68132361503396, -79.45613168733345], [-35.639912075328255, -79.45613168733345], [-35.91410722506902, -79.08385466910292], [-35.77700965019872, -78.33924814876498], [-35.32654618991043, -78.12365407324329], [-33.89676266125886, -77.88852630631524], [-32.2123693507053, -77.65345021581957], [-30.99805070649461, -77.35951466894332], [-29.78373206228406, -77.06557912206726], [-28.88277930349136, -76.67366505956572], [-27.511751878355653, -76.49734507258579], [-26.16033565927475, -76.36014414485075], [-25.474821946706868, -76.28180267349629], [-23.92755204923978, -76.24258026138673], [-22.45859778491095, -76.10543101008425], [-21.22469377286177, -75.90947397883347], [-20.010375128651077, -75.67434621190543], [-18.91354285325616, -75.43921844497729], [-17.522981736714172, -75.1256975302625], [-16.641588507544014, -74.79253957127688], [-15.70149085129026, -74.49860402440063], [-15.407710333710867, -74.10674163833137], [-16.465320196996373, -73.87161387140341], [-16.11278357590126, -73.46011444106315], [-15.446855231171952, -73.14654184991608], [-14.408804897508986, -72.9505848186653], [-13.311972622113984, -72.71545705173733], [-12.293507656289563, -72.40193613702255], [-11.510067104528588, -72.01007375095313], [-11.020432908563038, -71.53976654066483], [-10.295774298534155, -71.2654163616273], [-9.101015183946089, -71.32422414157551], [-8.611380987980596, -71.65733042412884], [-7.416621873392415, -71.69650115980603], [-7.377451137715241, -71.32422414157551], [-6.868231573911117, -70.93231007907397], [-5.790984666354774, -71.03028859469927], [-5.53637488445267, -71.40261728936225], [-4.341667446296867, -71.46137339287807], [-3.048981492515594, -71.28505340589814], [-1.795492112627784, -71.16743784600183], [-0.659489101555522, -71.22624562595004], [-0.228636847322065, -71.6377450562903], [0.868195428072937, -71.30463877373678], [1.886686232113533, -71.12826711032474], [3.022637566753417, -70.99111785902207], [4.139055209987049, -70.85391693128705], [5.157546014027673, -70.61878916435909], [6.273911980828927, -70.4620545452178], [7.135719842160626, -70.24651214612838], [7.742866245157842, -69.89376881930403], [8.487110223025326, -70.148533630503], [9.525134718472202, -70.01133270276821], [10.249845004933434, -70.48163991305651], [10.81782067225339, -70.8343315634485], [11.953823683325652, -70.63837453219773], [12.404287143613942, -70.24651214612838], [13.422777947654396, -69.97216196709095], [14.734997592842006, -70.03091807060677], [15.126756626046586, -70.40324676526976], [15.949342075268646, -70.03091807060677], [17.02658898282516, -69.91335418714274], [18.201711053142333, -69.87418345146548], [19.259372592860046, -69.89376881930403], [20.37573855966147, -70.01133270276821], [21.452985467217815, -70.07014048271625], [21.923034295344735, -70.40324676526976], [22.569403110451447, -70.69718231214583], [23.666183709414213, -70.5208106487337], [24.841357456163593, -70.48163991305651], [25.977308790803647, -70.48163991305651], [27.09372643403728, -70.4620545452178], [28.092580193806867, -70.32485361748293], [29.15024173352458, -70.20728973401899], [30.03158328626253, -69.93293955498129], [30.971732618948607, -69.75661956800145], [31.990171746556854, -69.65864105237607], [32.75405276869529, -69.38429087333846], [33.30244306817676, -68.83564219169571], [33.8704187354966, -68.50258758557456], [34.908494907375854, -68.65927052828349], [35.300202264148226, -69.01201385510794], [36.16201012547978, -69.24714162203597], [37.20003462092657, -69.16874847424904], [37.9051078631168, -69.5214401246412], [38.649403517416914, -69.77620493584018], [39.66789432145734, -69.54107716891204], [40.020430942552565, -69.10994069430095], [40.92135786312909, -68.93362070732118], [41.95943403500823, -68.60051442476767], [42.9387024269391, -68.46331349703271], [44.113876173688624, -68.26740814221424], [44.897290887233424, -68.05186574312492], [45.719928012887834, -67.81673797619678], [46.503342726432635, -67.60119557710746], [47.443440382686305, -67.71875946057148], [48.34441897969512, -67.36606781017942], [48.9907361183696, -67.0917176311419], [49.93088545105567, -67.11130299898045], [50.75347090027773, -66.8761752320524], [50.94932457866392, -66.52348358166043], [51.791547072157044, -66.2491334026229], [52.614132521378934, -66.05317637137213], [53.613037957580815, -65.89639007579855], [54.533550245996054, -65.818048604444], [55.41494347516621, -65.8768047079599], [56.35504113141988, -65.97478322358538], [57.15809288923569, -66.2491334026229], [57.25596805199646, -66.68021820080163], [58.13736128116662, -67.01332448335515], [58.74450768416395, -67.28767466239267], [59.93931847518425, -67.40523854585669], [60.60522098169744, -67.67958872489422], [61.42780643091933, -67.95388722749945], [62.38748945501166, -68.01269500744755], [63.19048953639523, -67.81673797619678], [64.05234907415903, -67.40523854585669], [64.99244673041292, -67.62072926851371], [65.97171512234397, -67.73834482841004], [66.91186445502976, -67.85590871187415], [67.89113284696091, -67.9343018596608], [68.89003828316291, -67.9343018596608], [69.71262373238474, -68.97279144299837], [69.67345299670748, -69.22755625419725], [69.55594078967582, -69.67822642021471], [68.59625776558349, -69.93293955498129], [67.81273969917416, -70.30526824964429], [67.94988895047666, -70.69718231214583], [69.06630659371027, -70.67754526787499], [68.92915734240776, -71.06945933037653], [68.41998945503596, -71.44178802503953], [67.94988895047666, -71.85328745537961], [68.71376997261515, -72.16680837009442], [69.86930667509395, -72.2647868857198], [71.02489505400459, -72.08841522230776], [71.57328535348606, -71.69650115980603], [71.90628828317492, -71.32422414157551], [72.45462690622404, -71.01070322686063], [73.08141035349209, -70.71676767998447], [73.3360201353942, -70.3640243531602], [73.86487674346924, -69.87418345146548], [74.49155683787271, -69.77620493584018], [75.62755984894497, -69.73703420016281], [76.62646528514685, -69.6194186402665], [77.64490441275527, -69.4626840211253], [78.13453860872059, -69.07076995862376], [78.42837080273225, -68.69844126396067], [79.11385867708393, -68.32621592216243], [80.09312706901486, -68.07150278739576], [80.93534956250775, -67.87554575614499], [81.48379153842146, -67.54238779715926], [82.05176720574147, -67.36606781017942], [82.77642581577041, -67.20928151460592], [83.7753312519724, -67.30726003023122], [84.67620649611663, -67.20928151460592], [85.65552656447997, -67.0917176311419], [86.75235883987486, -67.15047373465772], [87.4770174499038, -66.8761752320524], [87.98628869014024, -66.20991099051335], [88.35841067907396, -66.48426116955086], [88.82840783076855, -66.95456837983923], [89.67063032426157, -67.15047373465772], [90.6303650247863, -67.22886688244446], [91.59009972531081, -67.11130299898045], [92.60853885291905, -67.1896961467672], [93.54863650917295, -67.20928151460592], [94.175419956441, -67.11130299898045], [95.01759077350167, -67.17011077892865], [95.78147179564027, -67.38565317801798], [96.6823987162168, -67.24850392671549], [97.75964562377314, -67.24850392671549], [98.68020958862056, -67.11130299898045], [99.71818240763506, -67.24850392671549], [100.38418826701277, -66.91534596772968], [100.89335615438469, -66.58223968517625], [101.57889570516855, -66.30788950613864], [102.83241092327265, -65.56328379324512], [103.47867638551477, -65.70048472097997], [104.2425574076531, -65.97478322358538], [104.90845991416623, -66.32752655040966], [106.18156050010876, -66.9349313355684], [107.1608805684721, -66.95456837983923], [108.08139285688716, -66.95456837983923], [109.15863976444368, -66.83700449637522], [110.23583499556784, -66.69980356864036], [111.05847212122208, -66.42550506603496], [111.74395999557393, -66.13156951915889], [112.86037763880748, -66.09234710704932], [113.60467329310737, -65.8768047079599], [114.38808800665205, -66.07276173921068], [114.89730757045626, -66.38628265392548], [115.60238081264654, -66.69980356864036], [116.69916141160942, -66.66063283296299], [117.38470096239323, -66.91534596772968], [118.57946007698129, -67.17011077892865], [119.8329236186531, -67.26808929455395], [120.87099979053218, -67.1896961467672], [121.6544145040771, -66.8761752320524], [122.32036868702235, -66.56265431733769], [123.22129560759893, -66.48426116955086], [124.12227420460763, -66.6214620972859], [125.16024702362225, -66.71938893647891], [126.10039635630838, -66.56265431733769], [127.00142662974932, -66.56265431733769], [127.88276818248724, -66.66063283296299], [128.80328047090242, -66.75861134858846], [129.70425906791118, -66.58223968517625], [130.78145429903546, -66.42550506603496], [131.79994510307588, -66.38628265392548], [132.93589643771614, -66.38628265392548], [133.85646040256339, -66.28830413830009], [134.7573873231399, -66.20996266694563], [135.03158247288073, -65.72007008881862], [135.07075320855782, -65.30857065847843], [135.69748497939358, -65.58286916108366], [135.8738049663735, -66.03359100353342], [136.2067045431978, -66.44509043387367], [136.6180489442411, -66.77819671642702], [137.46027143773395, -66.95456837983923], [138.59622277237415, -66.89576059989113], [139.90844241756147, -66.8761752320524], [140.8094210145703, -66.81736745210438], [142.1216923361902, -66.81736745210438], [143.06184166887616, -66.79778208426566], [144.3740613140637, -66.83700449637522], [145.49042728086502, -66.91534596772968], [146.19555219948782, -67.22886688244446], [145.99969852110152, -67.60119557710746], [146.64606733620823, -67.8951311239837], [147.72326256733234, -68.13025889091166], [148.8396285341337, -68.38502370211054], [150.1323144879149, -68.56129201265819], [151.4837048687796, -68.71812998466397], [152.50224734925249, -68.87481292737299], [153.63819868389257, -68.8945016480761], [154.28456749899928, -68.56129201265819], [155.16585737530485, -68.83564219169571], [155.92979007387547, -69.14921478284279], [156.8111316266134, -69.38429087333846], [158.0255277854724, -69.48226938896394], [159.18101281151874, -69.59983327242796], [159.67069868391653, -69.9917473349295], [160.8066500185565, -70.22687510185754], [161.5704793642628, -70.57961842868181], [162.68689700749636, -70.7363530478232], [163.84243370997493, -70.71676767998447], [164.9196806175312, -70.77552378350029], [166.11443973211945, -70.75593841566175], [167.309095493843, -70.8343315634485], [168.42561648994118, -70.97148081475106], [169.46358930895596, -71.2066602581114], [170.50166548083504, -71.40261728936225], [171.20679039945762, -71.69650115980603], [171.08922651599377, -72.08841522230776], [170.56042158435073, -72.44115854913211], [170.1099581240624, -72.89182871514939], [169.75736982653515, -73.24452036554155], [169.28732099840832, -73.65601979588163], [167.97510135322077, -73.81280609145513], [167.38748864162974, -74.16549774184719], [166.09480268784844, -74.3810401409366], [165.64439090399244, -74.77295420343815], [164.9588513532086, -75.14528289810123], [164.2341927431797, -75.45880381281593], [163.82279666570392, -75.8703032431562], [163.56823856023428, -76.24258026138673], [163.47026004460898, -76.69330210383656], [163.48989708887976, -77.06557912206726], [164.05787275619977, -77.45744150813643], [164.27336347885696, -77.82977020279932], [164.74346398341615, -78.18251352962378], [166.60412560451735, -78.31961110449406], [166.99578128485743, -78.75074757910525], [165.19387576727203, -78.9074830056907], [163.66621707585958, -79.12302540478002], [161.76638471908112, -79.16224781688967], [160.92416222558833, -79.73048186637098], [160.74789391504075, -80.20073740022715], [160.3169641461587, -80.57306609488997], [159.78821089094842, -80.94539478955305], [161.1200159039744, -81.27850107210648], [161.6292871442109, -81.69000050244657], [162.49099165267805, -82.06227752067727], [163.70533613510477, -82.3954354796629], [165.09594892807885, -82.70895639437778], [166.60412560451735, -83.02247730909258], [168.89566531806796, -83.33599822380737], [169.40478152900758, -83.82589080193438], [172.28393395414938, -84.04143320102371], [172.47704878162418, -84.11791432081567], [173.2240832868354, -84.41371021925441], [175.98567182851312, -84.15899708448764], [178.27721154206407, -84.47251799920244], [180.00000000000014, -84.71338], [180.00000000000014, -90], [-180, -90], [-180, -84.71338], [-179.94249935617893, -84.72144337355249], [-179.0586773346912, -84.1394117166491], [-177.25677181710574, -84.45293263136388], [-177.14080667326579, -84.41794122714832], [-176.0846728180776, -84.09925912875842], [-175.94723461362776, -84.11044871021662], [-175.82988216866252, -84.11791432081567], [-174.3825028148157, -84.53432301222357], [-173.11655941474547, -84.11791432081567], [-172.8891055980128, -84.06101856886234], [-169.95122290757143, -83.88464690545013], [-168.99998898015863, -84.11791432081567], [-168.53019853419323, -84.23739023227448], [-167.02209937240332, -84.57049651482791], [-164.18214352115507, -84.82520964959458], [-161.92977454328138, -85.13873056430938], [-158.07137956442494, -85.3739100076697], [-155.1922529774993, -85.09955982863211], [-150.94209896543802, -85.29551685988288], [-148.5330728830715, -85.60903777459767], [-145.88891822633298, -85.31510222772161], [-143.10771847860045, -85.04075204868391], [-142.89227943237563, -84.57049651482791], [-146.8290683664633, -84.53127410271834], [-150.06073157448395, -84.29614633579038], [-150.90292822976073, -83.90423227328884], [-153.5862011383002, -83.68868987419935], [-153.40990698953647, -83.23801970818207], [-153.0377591623864, -82.82652027784181], [-152.66563717345275, -82.45419158317881], [-152.86151669005505, -82.04269215283854], [-154.5262987945539, -81.76839365023332], [-155.2901798166924, -81.41565032340904], [-156.8374497141595, -81.10212940869425], [-154.40878658752223, -81.16093718864245], [-152.09766150613282, -81.00415089306878], [-150.64829260964262, -81.33730885205459], [-148.86599829811206, -81.04337330517833], [-147.2207498850195, -80.67104461051544], [-146.41774899619185, -80.33793832796201], [-146.77028642473118, -79.92643889762192], [-148.06294654029637, -79.65208871858422], [-149.5319008046251, -79.35820484814045], [-151.5884161041124, -79.29939706819223], [-153.3903216216978, -79.16224781688967], [-155.32937639058576, -79.0642693012642], [-155.97566769104418, -78.69193979915704], [-157.26830196839305, -78.37841888444225], [-158.0517683583701, -78.0256755576179], [-158.36513424378796, -76.88920745865495], [-157.87547420960635, -76.98723765071261], [-156.97457312724595, -77.30075856542751], [-155.32937639058576, -77.20272837336975], [-153.74283240457675, -77.06557912206726], [-152.92024695535477, -77.496663920246], [-151.3337804839943, -77.3987370810528], [-150.00194963275194, -77.18314300553119], [-148.74848609108034, -76.90884450292597], [-147.61248308000808, -76.57573822037253], [-146.10440894899, -76.47775970474706], [-146.143528008235, -76.10543101008425], [-146.49609127499048, -75.73315399185354], [-146.202309949967, -75.38041066502919], [-144.90962399618576, -75.20403900161696], [-144.32203712281108, -75.53719696060277], [-142.79435259318262, -75.341239929352], [-141.63876421427162, -75.08647511815295], [-140.20900652383617, -75.06688975031439], [-138.85759030475535, -74.96891123468892], [-137.50619992389045, -74.73378346776096], [-136.42890133990193, -74.51824106867164], [-135.2145826956913, -74.30269866958214], [-134.4311938203626, -74.36145477309796], [-133.74565426957855, -74.43984792088489], [-132.25716792873206, -74.30269866958214], [-130.92531123927358, -74.47901865656199], [-129.55428381413776, -74.45943328872343], [-128.24203833073426, -74.3222840374207], [-126.89062211165324, -74.42026255304617], [-125.40208247948578, -74.51824106867164], [-124.01149552472761, -74.47901865656199], [-122.56215246645361, -74.49860402440063], [-121.07361283428624, -74.51824106867164], [-119.70255957093423, -74.47901865656199], [-118.68414547409793, -74.18508310968583], [-117.4698009916712, -74.02834849054463], [-116.21631161178341, -74.24389088963395], [-115.02155249719542, -74.06751922622189], [-113.94433142785508, -73.71482757582983], [-113.29798845096448, -74.02834849054463], [-112.94545182986937, -74.3810401409366], [-112.29908301476259, -74.71419809992241], [-111.26105851931563, -74.42026255304617], [-110.06632524294373, -74.79253957127688], [-108.71490902386273, -74.91010345474089], [-107.55934648316811, -75.18445363377842], [-106.14914832235502, -75.1256975302625], [-104.87607357462866, -74.94932586685046], [-103.36794857462266, -74.98849660252765], [-102.01650651732565, -75.1256975302625], [-100.64553076862231, -75.30201751724243], [-100.11669999876327, -74.87093271906353], [-100.76304297565395, -74.53782643651019], [-101.25270300983553, -74.18508310968583], [-102.54533728718451, -74.10674163833137], [-103.11331295450454, -73.73441294366839], [-103.32875200072928, -73.36208424900556], [-103.6812886218244, -72.61753021254415], [-102.91748511433435, -72.75467946384681], [-101.60523963093073, -72.81343556736263], [-100.31252783893345, -72.75467946384681], [-99.1373799304001, -72.9114140829881], [-98.11888912635948, -73.20534962986417], [-97.6880368721261, -73.55804128025633], [-96.33659481482891, -73.61684906020436], [-95.04396053747985, -73.47969980890187], [-93.67290727412811, -73.28374277765093], [-92.43900326207896, -73.16617889418708], [-91.42056413447071, -73.40130666111513], [-90.08873328322844, -73.3229135133282], [-89.22695126011294, -72.55872243259596], [-88.42395117872951, -73.0093925986134], [-87.26833696160261, -73.18576426202563], [-86.01482174349843, -73.08778574640016], [-85.19223629427657, -73.47969980890187], [-83.87999081087275, -73.51887054457897], [-82.66564632844603, -73.63643442804309], [-81.47091305207414, -73.8519768271324], [-80.68744666209699, -73.47969980890187], [-80.295790981757, -73.12695648207743], [-79.296885545555, -73.51887054457897], [-77.92585812041926, -73.42089202895359], [-76.90736731637875, -73.63643442804309], [-76.22187944202707, -73.96954071059642], [-74.8900485907848, -73.87161387140341], [-73.85202409533792, -73.65601979588163], [-72.83353329129741, -73.40130666111513], [-71.61921464708686, -73.26415740981238], [-70.20904232448996, -73.14654184991608], [-68.93591590033122, -73.0093925986134], [-67.95662167018409, -72.79385019952409], [-67.36906063502559, -72.4803292848093], [-67.13403622096203, -72.04924448663039], [-67.25154842799367, -71.6377450562903], [-67.5649401516279, -71.24583099378876], [-67.917476772723, -70.85391693128705], [-68.23084265814092, -70.4620545452178], [-68.48545244004302, -70.10931121839351], [-68.54420854355894, -69.71739715589197], [-68.44628170436576, -69.32553476982272], [-67.9762328762389, -68.95320607515973], [-67.58449968125032, -68.54170664481947], [-67.42784257675751, -68.14984425875022], [-67.6236704169277, -67.71875946057148], [-67.74118262395933, -67.32684539806993], [-67.25154842799367, -66.8761752320524], [-66.70318396672857, -66.58223968517625], [-66.05681515162186, -66.20996266694563], [-65.3713272772701, -65.89639007579855], [-64.5682755194544, -65.60250620535467], [-64.17654232446583, -65.17142302206445], [-63.62815202498453, -64.89707284302675], [-63.001394415932566, -64.64230803182787], [-62.04168555362398, -64.58355192831195], [-61.414927944572014, -64.27003101359716], [-60.709854702381705, -64.07407398234639], [-59.88726925315956, -63.95651009888237], [-59.16258480491453, -63.70174528768357], [-58.59455746116228, -63.3882243729686], [-57.81114274761751, -63.27066048950458], [-57.22358171245884, -63.52542530070364], [-57.59572953960887, -63.85853158325707], [-58.61414282900091, -64.15246713013315]]]]}') WHERE iso_a2 = 'AQ';
UPDATE public.countries SET boundary = ST_GeomFromGeoJSON('{"type": "Polygon", "coordinates": [[[68.935, -48.625], [69.58, -48.94], [70.525, -49.065], [70.56, -49.255], [70.28, -49.71], [68.745, -49.775], [68.72, -49.2425], [68.8675, -48.83], [68.935, -48.625]]]}') WHERE iso_a2 = 'TF';
UPDATE public.countries SET boundary = ST_GeomFromGeoJSON('{"type": "MultiPolygon", "coordinates": [[[[145.39797814349484, -40.79254851660589], [146.36412072162372, -41.13769540788334], [146.90858361225085, -41.00054615658068], [147.68925947488415, -40.80825815202269], [148.28906782449602, -40.87543751400213], [148.35986453673584, -42.062445163746446], [148.0173014670731, -42.407023614268624], [147.9140519553538, -43.21152231218849], [147.564564243764, -42.93768889747386], [146.87034305235497, -43.634597263362096], [146.66332726459368, -43.58085377377856], [146.04837772032042, -43.54974456153889], [145.43192955951056, -42.693776137056275], [145.2950903668017, -42.03360971452756], [144.71807132383063, -41.162551771815714], [144.74375451067968, -40.70397511165771], [145.39797814349484, -40.79254851660589]]], [[[143.56181115129996, -13.763655694232213], [143.92209923723894, -14.548310642152003], [144.56371382057486, -14.171176039285882], [144.89490807513354, -14.594457696188627], [145.37472374896348, -14.984976495018287], [145.27199100156727, -15.428205254785695], [145.48525963763578, -16.285672295804773], [145.63703331927698, -16.784918308176614], [145.8889042502677, -16.90692636481765], [146.1603088726645, -17.761654554925244], [146.0636739442787, -18.28007252367732], [146.3874784690196, -18.95827402107591], [147.47108157774792, -19.48072275154668], [148.1776017600425, -19.95593922290277], [148.84841352762325, -20.39120981209726], [148.7174654481956, -20.633468926681516], [149.28942020080208, -21.260510756111103], [149.67833703023067, -22.342511895438392], [150.07738244038862, -22.12278370533332], [150.4829390810152, -22.556142266533016], [150.72726525289121, -22.40240488046466], [150.89955447815228, -23.462236830338682], [151.60917524638424, -24.076256198830762], [152.07353966695908, -24.457886651306197], [152.85519738180594, -25.267501316023015], [153.13616214417678, -26.07117319102619], [153.16194868389042, -26.641319268502443], [153.0929089703486, -27.26029957449451], [153.5694690289442, -28.110066827102102], [153.51210818910025, -28.995077406532758], [153.33909549378708, -29.45820159273245], [153.06924116435889, -30.35024016695482], [153.08960167868182, -30.92364185966545], [152.8915775901394, -31.640445651985956], [152.45000247620536, -32.550002536755244], [151.70911746643682, -33.041342054986345], [151.34397179586242, -33.81602345147385], [151.01055545471516, -34.310360202777886], [150.71413943908905, -35.17345997491681], [150.32821984273326, -35.67187916437193], [150.07521203023228, -36.420205580390515], [149.94612430236717, -37.10905242284123], [149.99728397033616, -37.42526051203514], [149.42388227762555, -37.77268116633347], [148.30462243061592, -37.80906137466688], [147.3817330263153, -38.21921721776755], [146.92212283751135, -38.60653207779512], [146.3179219911548, -39.03575652441144], [145.48965213438058, -38.59376799901905], [144.87697635312819, -38.41744801203912], [145.03221235573298, -37.896187839510986], [144.48568240781404, -38.08532358169927], [143.6099735861961, -38.80946542740533], [142.745426873953, -38.538267510737526], [142.178329705982, -38.38003427505984], [141.6065816591047, -38.30851409276788], [140.63857872941324, -38.019332777662555], [139.99215823787435, -37.40293629328511], [139.80658816951407, -36.64360279718828], [139.57414757706525, -36.13836231867067], [139.0828080588341, -35.73275400161178], [138.12074791885632, -35.612296237939404], [138.44946170466503, -35.127261244447894], [138.2075643251067, -34.38472258884593], [137.71917036351616, -35.07682504653103], [136.82940555231474, -35.26053476332862], [137.3523710471085, -34.7073385556441], [137.50388634658836, -34.130267836240776], [137.89011600153768, -33.640478610978334], [137.81032759007914, -32.90000701266811], [136.99683719294038, -33.752771498348636], [136.37206912653167, -34.09476612725619], [135.98904341038437, -34.89011809666049], [135.20821251845413, -34.47867034275261], [135.2392183778292, -33.94795338311498], [134.61341678277464, -33.22277800876314], [134.08590376193914, -32.848072198214766], [134.27390262261704, -32.61723357516696], [132.99077680880984, -32.011224053680195], [132.2880806825049, -31.98264698662277], [131.32633060112093, -31.49580331800105], [129.5357938986397, -31.590422865527486], [128.24093753470223, -31.94848886487786], [127.10286746633832, -32.28226694105105], [126.14871382050117, -32.21596607842061], [125.08862348846563, -32.728751316052836], [124.22164798390494, -32.95948658623607], [124.02894656788854, -33.483847344701715], [123.65966678273074, -33.89017913181273], [122.81103641163364, -33.91446705498984], [122.18306440642286, -34.003402194964224], [121.2991907085026, -33.82103606540613], [120.58026818245813, -33.930176690406626], [119.89369510302825, -33.976065362281815], [119.29889936734881, -34.50936614353397], [119.00734093635802, -34.464149265278536], [118.5057178081008, -34.7468193499151], [118.02497195848954, -35.064732761374714], [117.29550744025747, -35.02545867283287], [116.62510908413495, -35.025096937806836], [115.56434695847972, -34.386427911111554], [115.02680870977954, -34.196517022438925], [115.04861616420678, -33.62342538832203], [115.5451233256671, -33.48725798923296], [115.71467370001668, -33.25957162855495], [115.6793786967614, -32.90036874769413], [115.80164513556397, -32.20506235120703], [115.68961063035513, -31.61243702568379], [115.16090905157697, -30.601594333622458], [114.99704308477945, -30.03072478609417], [115.04003787644629, -29.461095472940798], [114.64197431850201, -28.810230808224716], [114.61649783738218, -28.516398614213045], [114.17357913620847, -28.11807667410733], [114.04888390508816, -27.334765313427127], [113.4774975932369, -26.543134047147902], [113.3389530782625, -26.116545098578484], [113.77835778204027, -26.54902516042918], [113.44096235560662, -25.62127817149316], [113.93690107631167, -25.911234633082884], [114.23285200404732, -26.298446140245872], [114.21616051641703, -25.78628101980111], [113.72125532435771, -24.998938897402127], [113.62534386602405, -24.683971042583153], [113.39352339076268, -24.38476449961327], [113.50204389857564, -23.806350192970257], [113.70699262904517, -23.560215345964068], [113.8434184102957, -23.05998748137874], [113.7365515483161, -22.47547535572538], [114.1497563009219, -21.755881036061012], [114.22530724493268, -22.517488295178637], [114.6477620789187, -21.829519952076907], [115.46016727097933, -21.495173435148544], [115.94737267462702, -21.06868783944371], [116.71161543179156, -20.70168181730682], [117.16631635952771, -20.623598728113805], [117.44154503791427, -20.746898695562166], [118.22955895393298, -20.374208265873236], [118.83608523974274, -20.26331064217483], [118.98780724495177, -20.044202569257322], [119.25249393115067, -19.95294198982984], [119.80522505094459, -19.976506442954985], [120.85622033089666, -19.68370777758919], [121.39985639860723, -19.239755547769732], [121.65513797412908, -18.705317885007133], [122.24166548064179, -18.19764861417177], [122.28662397673568, -17.798603204013915], [122.31277225147542, -17.25496713630345], [123.01257449757193, -16.405199883695857], [123.43378909718305, -17.26855803799623], [123.85934451710662, -17.069035332917252], [123.50324222218327, -16.596506036040367], [123.81707319549193, -16.111316013251994], [124.25828657439988, -16.327943617419564], [124.37972619028582, -15.567059828353976], [124.92615278534007, -15.075100192935324], [125.1672750184139, -14.680395603090005], [125.67008670461385, -14.510070082256021], [125.68579634003052, -14.230655612853838], [126.12514936737611, -14.347340996968953], [126.14282270721989, -14.095986830301214], [126.58258914602376, -13.952791436420412], [127.06586714081735, -13.817967624570926], [127.80463341686195, -14.276906019755046], [128.35968997610897, -14.869169610252257], [128.98554324759593, -14.875990899314743], [129.62147342337963, -14.969783623924556], [129.40960005098302, -14.420669854391036], [129.88864057832862, -13.618703301653483], [130.33946577364296, -13.357375583553477], [130.183506300986, -13.107520033422304], [130.617795037967, -12.536392103732467], [131.22349450086003, -12.183648776908115], [131.73509118054952, -12.302452894747162], [132.57529829318312, -12.114040622611014], [132.55721154188106, -11.603012383676685], [131.82469811414367, -11.273781833545101], [132.35722374891142, -11.128519382372644], [133.01956058159644, -11.376411228076847], [133.55084598198906, -11.786515394745138], [134.393068475482, -12.042365411022175], [134.67863244032705, -11.941182956594702], [135.29849124566803, -12.248606052299053], [135.88269331272764, -11.962266940969798], [136.25838097548947, -12.04934172938161], [136.49247521377166, -11.857208754120393], [136.95162031468502, -12.351958916882737], [136.68512495335577, -12.887223402562057], [136.30540652887512, -13.291229750219898], [135.96175825413414, -13.324509372615893], [136.07761681533256, -13.724278252825783], [135.78383629775325, -14.223989353088214], [135.42866417861123, -14.7154322241839], [135.5001843609032, -14.997740573794431], [136.2951745952814, -15.550264987859123], [137.0653601421595, -15.870762220933358], [137.58047081924482, -16.215082289294088], [138.303217401279, -16.80760426195266], [138.5851640158634, -16.806622409739177], [139.1085429221155, -17.06267913174537], [139.26057498591823, -17.371600843986187], [140.2152453960783, -17.710804945550066], [140.87546349503927, -17.369068698803943], [141.0711104676963, -16.832047214426723], [141.27409549373883, -16.388870131091608], [141.3982222841038, -15.840531508042588], [141.70218305884467, -15.044921156476931], [141.5633801617087, -14.56133310308951], [141.63552046118812, -14.270394789286286], [141.51986860571898, -13.698078301653808], [141.65092003801104, -12.944687595270565], [141.84269127824624, -12.74154753993119], [141.6869901877508, -12.407614434461138], [141.92862918514757, -11.877465915578782], [142.118488397388, -11.328042087451621], [142.14370649634637, -11.042736504768143], [142.51526004452498, -10.668185723516643], [142.79731001197408, -11.157354831591519], [142.8667631369743, -11.784706719614931], [143.1159468934857, -11.905629571177911], [143.1586316265588, -12.325655612846191], [143.5221236512999, -12.834358412327433], [143.5971578309877, -13.400422051652598], [143.56181115129996, -13.763655694232213]]]]}') WHERE iso_a2 = 'AU';
UPDATE public.countries SET boundary = ST_GeomFromGeoJSON('{"type": "Polygon", "coordinates": [[[16.979666782304037, 48.123497015976305], [16.90375410326726, 47.71486562762833], [16.340584344150415, 47.71290192320123], [16.534267612380376, 47.49617096616912], [16.202298211337364, 46.85238597267696], [16.011663852612656, 46.6836107448117], [15.137091912504985, 46.65870270444703], [14.63247155117483, 46.43181732846955], [13.806475457421527, 46.509306138691215], [12.376485223040817, 46.76755910906985], [12.153088006243054, 47.11539317482645], [11.16482791509327, 46.94157949481273], [11.048555942436536, 46.75135854754634], [10.44270145024663, 46.89354625099743], [9.932448357796659, 46.92072805438296], [9.479969516649021, 47.102809963563374], [9.632931756232978, 47.34760122332999], [9.59422610844635, 47.52505809182027], [9.89606814946319, 47.580196845075704], [10.402083774465211, 47.30248769793916], [10.544504021861627, 47.56639923765377], [11.426414015354737, 47.523766181012974], [12.141357456112788, 47.703083401065776], [12.620759718484493, 47.67238760028441], [12.932626987365948, 47.467645575544], [13.02585127122049, 47.63758352313583], [12.884102817443903, 48.28914581968792], [13.243357374737, 48.416114813829054], [13.595945672264437, 48.87717194273715], [14.338897739324722, 48.55530528420721], [14.901447381254057, 48.964401760445824], [15.253415561593982, 49.03907420510758], [16.02964725105022, 48.73389903420793], [16.499282667718774, 48.78580801044511], [16.960288120194576, 48.5969823268506], [16.879982944413, 48.47001333270947], [16.979666782304037, 48.123497015976305]]]}') WHERE iso_a2 = 'AT';
UPDATE public.countries SET boundary = ST_GeomFromGeoJSON('{"type": "MultiPolygon", "coordinates": [[[[45.0019873390568, 39.7400035670496], [45.29814497252144, 39.471751207022436], [45.73997846861701, 39.473999131827156], [45.7353792661431, 39.3197191432198], [46.14362308124882, 38.74120148371222], [45.457721795438744, 38.874139105783115], [44.95268802265028, 39.33576467544643], [44.793989699082005, 39.713002631177034], [45.0019873390568, 39.7400035670496]]], [[[47.37331546406622, 41.219732367511256], [47.81566572448472, 41.15141612402135], [47.98728315612604, 41.40581920019423], [48.58435265482629, 41.808869533854676], [49.11026370626067, 41.282286688800525], [49.6189148293096, 40.57292430272997], [50.0848295428531, 40.526157131505784], [50.39282107931271, 40.256561184239104], [49.5692021014448, 40.17610097916071], [49.39525923035043, 39.39948171646225], [49.223228387250714, 39.04921885838792], [48.85653242370759, 38.81548635513178], [48.88324913920255, 38.320245266262646], [48.634375441284845, 38.27037750910094], [48.010744256386516, 38.794014797514535], [48.355529412637935, 39.28876496027689], [48.06009524922527, 39.582235419262446], [47.685079380083124, 39.50836395930119], [46.50571984231797, 38.770605373686266], [46.48349897643246, 39.464154771475535], [46.034534132680704, 39.62802073827305], [45.61001224140293, 39.89999380142518], [45.89190717955515, 40.218475653639985], [45.35917483905817, 40.56150381119349], [45.560351189970476, 40.812289537105954], [45.1794958839794, 40.98535390885144], [44.97248009621816, 41.24812856705563], [45.21742638528164, 41.41145193131405], [45.962600538930445, 41.1238725856098], [46.501637404166985, 41.06444468847411], [46.637908156120574, 41.181672675128226], [46.145431756379, 41.72280243587264], [46.404950799348825, 41.86067515722735], [46.68607059101666, 41.827137152669906], [47.37331546406622, 41.219732367511256]]]]}') WHERE iso_a2 = 'AZ';
UPDATE public.countries SET boundary = ST_GeomFromGeoJSON('{"type": "Polygon", "coordinates": [[[29.339997592900346, -4.499983412294092], [29.276383904749053, -3.293907159034063], [29.024926385216787, -2.839257907730158], [29.632176141078588, -2.917857761246097], [29.93835900240794, -2.348486830254238], [30.46969607923299, -2.413857517103459], [30.527677036264464, -2.807631931167535], [30.7430127296247, -3.034284763199686], [30.752262811004954, -3.35932952231557], [30.505559523243566, -3.568567396665365], [30.11633263522117, -4.090137627787243], [29.753512404099922, -4.452389418153281], [29.339997592900346, -4.499983412294092]]]}') WHERE iso_a2 = 'BI';
UPDATE public.countries SET boundary = ST_GeomFromGeoJSON('{"type": "Polygon", "coordinates": [[[3.314971144228537, 51.345780951536085], [4.047071160507528, 51.26725861266857], [4.973991326526914, 51.47502370869813], [5.606975945670001, 51.03729848896978], [6.15665815595878, 50.80372101501058], [6.043073357781111, 50.128051662794235], [5.782417433300907, 50.09032786722122], [5.674051954784829, 49.529483547557504], [4.79922163251581, 49.985373033236385], [4.286022983425084, 49.907496649772554], [3.588184441755686, 50.37899241800358], [3.123251580425801, 50.780363267614575], [2.658422071960274, 50.796848049515745], [2.513573032246143, 51.14850617126183], [3.314971144228537, 51.345780951536085]]]}') WHERE iso_a2 = 'BE';
UPDATE public.countries SET boundary = ST_GeomFromGeoJSON('{"type": "Polygon", "coordinates": [[[2.691701694356254, 6.258817246928629], [1.865240512712319, 6.142157701029731], [1.618950636409238, 6.832038072126238], [1.664477573258381, 9.12859039960938], [1.46304284018467, 9.334624335157088], [1.425060662450136, 9.825395412633], [1.077795037448738, 10.175606594275024], [0.772335646171484, 10.470808213742359], [0.899563022474069, 10.99733938236426], [1.243469679376489, 11.110510769083461], [1.447178175471066, 11.547719224488858], [1.935985548519881, 11.641150214072553], [2.154473504249921, 11.940150051313339], [2.49016360841793, 12.233052069543675], [2.848643019226671, 12.235635891158267], [3.611180454125559, 11.660167141155968], [3.572216424177469, 11.32793935795152], [3.797112257511714, 10.734745591673105], [3.600070021182802, 10.332186184119408], [3.705438266625919, 10.063210354040208], [3.220351596702101, 9.444152533399702], [2.912308383810256, 9.137607937044322], [2.723792758809509, 8.50684540448971], [2.74906253420022, 7.870734361192888], [2.691701694356254, 6.258817246928629]]]}') WHERE iso_a2 = 'BJ';
UPDATE public.countries SET boundary = ST_GeomFromGeoJSON('{"type": "Polygon", "coordinates": [[[-2.827496303712707, 9.642460842319778], [-3.511898972986273, 9.90032623945622], [-3.980449184576685, 9.8623440617217], [-4.330246954760383, 9.610834865757141], [-4.779883592131966, 9.821984768101743], [-4.954653286143099, 10.152713934769736], [-5.404341599946974, 10.370736802609146], [-5.470564947929006, 10.951269842976048], [-5.197842576508648, 11.37514577885014], [-5.220941941743121, 11.713858954307227], [-4.427166103523803, 12.542645575404295], [-4.28040503581488, 13.228443508349741], [-4.006390753587226, 13.472485459848116], [-3.522802700199861, 13.337661647998615], [-3.10370683431276, 13.541266791228594], [-2.967694464520577, 13.79815033615151], [-2.191824510090385, 14.246417548067356], [-2.001035122068771, 14.559008287000893], [-1.066363491205664, 14.973815009007765], [-0.515854458000348, 15.116157741755728], [-0.26625729003058, 14.924308986872148], [0.374892205414682, 14.92890818934613], [0.295646396495101, 14.444234930880654], [0.429927605805517, 13.988733018443924], [0.993045688490071, 13.335749620003824], [1.024103224297477, 12.851825669806574], [2.177107781593776, 12.625017808477535], [2.154473504249921, 11.940150051313339], [1.935985548519881, 11.641150214072553], [1.447178175471066, 11.547719224488858], [1.243469679376489, 11.110510769083461], [0.899563022474069, 10.99733938236426], [0.023802524423701, 11.018681748900804], [-0.438701544588582, 11.098340969278722], [-0.761575893548183, 10.936929633015055], [-1.203357713211432, 11.009819240762738], [-2.940409308270461, 10.962690334512558], [-2.963896246747112, 10.395334784380083], [-2.827496303712707, 9.642460842319778]]]}') WHERE iso_a2 = 'BF';
UPDATE public.countries SET boundary = ST_GeomFromGeoJSON('{"type": "Polygon", "coordinates": [[[92.67272098182556, 22.041238918541254], [92.65225711463799, 21.324047552978485], [92.30323449093868, 21.47548533780982], [92.36855350135562, 20.670883287025347], [92.08288618364614, 21.19219513598577], [92.02521528520839, 21.701569729086767], [91.83489098507744, 22.182935695885565], [91.41708702999766, 22.76501902922122], [90.49600630082728, 22.80501658781513], [90.58695682166098, 22.392793687422866], [90.27297081905556, 21.83636770272011], [89.84746707556428, 22.039146023033425], [89.70204959509493, 21.857115790285306], [89.41886274613549, 21.9661789006373], [89.03196129756623, 22.055708319582976], [88.87631188350309, 22.87914642993783], [88.52976972855379, 23.631141872649167], [88.69994022009092, 24.23371491138856], [88.08442223506242, 24.501657212821925], [88.30637251175602, 24.866079413344206], [88.93155398962308, 25.238692328384776], [88.2097892598025, 25.768065700782714], [88.56304935094977, 26.446525580342723], [89.35509402868729, 26.014407253518073], [89.83248091019962, 25.96508209889548], [89.92069258012185, 25.26974986419218], [90.87221072791212, 25.132600612889547], [91.79959598182208, 25.147431748957317], [92.37620161333481, 24.976692816664965], [91.91509280799443, 24.130413723237112], [91.46772993364368, 24.072639471934792], [91.15896325069973, 23.50352692310439], [91.70647505083211, 22.985263983649187], [91.86992760617132, 23.624346421802784], [92.14603478390681, 23.627498684172593], [92.67272098182556, 22.041238918541254]]]}') WHERE iso_a2 = 'BD';
UPDATE public.countries SET boundary = ST_GeomFromGeoJSON('{"type": "Polygon", "coordinates": [[[22.65714969248299, 44.23492300066128], [22.944832391051847, 43.82378530534713], [23.332302280376325, 43.897010809904714], [24.100679152124172, 43.74105133724785], [25.569271681426926, 43.68844472917472], [26.065158725699746, 43.94349376075127], [27.242399529740908, 44.175986029632405], [27.970107049275075, 43.81246816667522], [28.558081495891997, 43.70746165625813], [28.03909508638472, 43.293171698574184], [27.67389773937805, 42.57789236100622], [27.99672041190539, 42.00735871028779], [27.13573937349048, 42.14148489030134], [26.1170418637208, 41.82690460872456], [26.106138136507212, 41.32889883072778], [25.197201368925448, 41.23448598893053], [24.492644891058035, 41.583896185872035], [23.692073601992348, 41.309080918943856], [22.952377150166452, 41.33799388281115], [22.88137373219743, 41.99929718685026], [22.380525750424592, 42.32025950781509], [22.54501183440962, 42.46136200618804], [22.43659467946128, 42.580321153323936], [22.60480146657133, 42.898518785161144], [22.986018507588483, 43.211161200526966], [22.50015669118028, 43.64281443946099], [22.410446404721597, 44.008063462899955], [22.65714969248299, 44.23492300066128]]]}') WHERE iso_a2 = 'BG';
UPDATE public.countries SET boundary = ST_GeomFromGeoJSON('{"type": "MultiPolygon", "coordinates": [[[[-77.53466, 23.75975], [-77.78, 23.71], [-78.03405, 24.28615], [-78.40848, 24.57564], [-78.19087, 25.2103], [-77.89, 25.17], [-77.54, 24.34], [-77.53466, 23.75975]]], [[[-77.82, 26.58], [-78.91, 26.42], [-78.98, 26.79], [-78.51, 26.87], [-77.85, 26.84], [-77.82, 26.58]]], [[[-77, 26.59], [-77.17255, 25.87918], [-77.35641, 26.00735], [-77.34, 26.53], [-77.78802, 26.92516], [-77.79, 27.04], [-77, 26.59]]]]}') WHERE iso_a2 = 'BS';
UPDATE public.countries SET boundary = ST_GeomFromGeoJSON('{"type": "Polygon", "coordinates": [[[19.00548628101012, 44.86023366960916], [19.36803, 44.863], [19.11761, 44.42307000000011], [19.59976, 44.03847], [19.454, 43.56810000000013], [19.21852, 43.52384], [19.03165, 43.43253], [18.70648, 43.20011], [18.56, 42.65], [17.674921502358984, 43.02856252702361], [17.297373488034452, 43.44634064388737], [16.91615644701733, 43.66772247982567], [16.456442905348865, 44.04123973243128], [16.23966027188453, 44.35114329688571], [15.750026075918981, 44.818711656262565], [15.959367303133376, 45.23377676043094], [16.318156772535872, 45.00412669532591], [16.534939406000206, 45.21160757097772], [17.002146030351014, 45.23377676043094], [17.861783481526402, 45.067740383477144], [18.553214145591653, 45.08158966733146], [19.00548628101012, 44.86023366960916]]]}') WHERE iso_a2 = 'BA';
UPDATE public.countries SET boundary = ST_GeomFromGeoJSON('{"type": "Polygon", "coordinates": [[[23.48412763844985, 53.91249766704114], [24.450683628037037, 53.905702216194754], [25.536353794056993, 54.28242340760253], [25.7684326514798, 54.84696259217509], [26.58827924979039, 55.16717560487167], [26.494331495883756, 55.615106919977634], [27.10245975109453, 55.783313707087686], [28.176709425577997, 56.169129950578814], [29.229513380660308, 55.91834422466636], [29.371571893030673, 55.670090643936184], [29.896294386522356, 55.78946320253041], [30.87390913262001, 55.55097646750341], [30.971835971813135, 55.08154775656404], [30.75753380709872, 54.81177094178432], [31.38447228366374, 54.157056382862436], [31.79142418796224, 53.974638576872124], [31.731272820774507, 53.79402944601202], [32.405598585751164, 53.61804535584204], [32.69364301934604, 53.35142080343212], [32.30451948418823, 53.13272614197291], [31.49764367038293, 53.1674268662569], [31.305200636528014, 53.07399587667321], [31.54001834486226, 52.74205231384636], [31.785998162571587, 52.101677964885454], [30.927549269338982, 52.04235342061439], [30.619454380014844, 51.822806098022376], [30.555117221811457, 51.31950348571566], [30.157363722460897, 51.41613841410147], [29.254938185347925, 51.368234361366895], [28.992835320763533, 51.602044379271476], [28.61761274589225, 51.42771393493484], [28.24161502453657, 51.57222707783907], [27.454066196408434, 51.59230337178447], [26.337958611768556, 51.83228872334793], [25.32778771332701, 51.91065603291855], [24.553106316839518, 51.888461005249184], [24.00507775238421, 51.61744395609446], [23.527070753684374, 51.57845408793024], [23.508002150168693, 52.02364655212473], [23.199493849386187, 52.48697744405367], [23.79919884613338, 52.69109935160657], [23.80493493011778, 53.089731350306074], [23.527535841575002, 53.470121568406555], [23.48412763844985, 53.91249766704114]]]}') WHERE iso_a2 = 'BY';
UPDATE public.countries SET boundary = ST_GeomFromGeoJSON('{"type": "Polygon", "coordinates": [[[-89.14308041050332, 17.80831899664932], [-89.15090938999553, 17.95546763760042], [-89.02985734735182, 18.001511338772488], [-88.84834387892661, 17.883198147040233], [-88.49012285027935, 18.486830552641607], [-88.3000310940937, 18.4999822046599], [-88.29633622918482, 18.35327281338327], [-88.10681291375438, 18.348673610909287], [-88.1234785631685, 18.07667470954101], [-88.2853549873228, 17.644142971258034], [-88.19786678745265, 17.489475409408456], [-88.30264075392444, 17.131693630435663], [-88.23951799187991, 17.036066392479555], [-88.35542822951057, 16.530774237529627], [-88.55182451043585, 16.265467434143147], [-88.73243364129594, 16.233634751851355], [-88.93061275913527, 15.887273464415076], [-89.22912167026928, 15.886937567605171], [-89.15080603713095, 17.015576687075836], [-89.14308041050332, 17.80831899664932]]]}') WHERE iso_a2 = 'BZ';
UPDATE public.countries SET boundary = ST_GeomFromGeoJSON('{"type": "Polygon", "coordinates": [[[-62.84646847192156, -22.03498544686945], [-63.986838141522476, -21.99364430103595], [-64.37702104354226, -22.79809132252354], [-64.96489213729461, -22.075861504812327], [-66.27333940292485, -21.83231047942072], [-67.1066735500636, -22.735924574476417], [-67.82817989772273, -22.872918796482175], [-68.21991309271128, -21.494346612231865], [-68.75716712103375, -20.372657972904463], [-68.44222510443092, -19.40506845467143], [-68.96681840684187, -18.981683444904107], [-69.10024695501949, -18.260125420812678], [-69.59042375352405, -17.580011895419332], [-68.9596353827533, -16.50069793057127], [-69.38976416693471, -15.660129082911652], [-69.16034664577495, -15.323973890853019], [-69.33953467474701, -14.953195489158832], [-68.9488866848366, -14.453639418193283], [-68.92922380234954, -13.602683607643009], [-68.88007951523997, -12.899729099176653], [-68.66507971868963, -12.561300144097173], [-69.52967810736496, -10.951734307502194], [-68.78615759954948, -11.03638030359628], [-68.27125362819326, -11.01452117273682], [-68.04819230820539, -10.712059014532485], [-67.17380123561074, -10.306812432499612], [-66.6469083319628, -9.931331475466862], [-65.33843522811642, -9.761987806846392], [-65.44483700220539, -10.511451104375432], [-65.32189876978302, -10.895872084194679], [-65.40228146021303, -11.566270440317155], [-64.3163529120316, -12.461978041232193], [-63.19649878605057, -12.627032565972435], [-62.803060268796386, -13.000653171442686], [-62.127080857986385, -13.198780612849724], [-61.71320431176078, -13.489202162330052], [-61.08412126325565, -13.479383640194598], [-60.503304002511136, -13.775954685117659], [-60.45919816755003, -14.354007256734555], [-60.26432634137737, -14.645979099183641], [-60.251148851142936, -15.07721892665932], [-60.54296566429515, -15.093910414289596], [-60.158389655179036, -16.258283786690086], [-58.24121985536668, -16.299573256091293], [-58.38805843772404, -16.877109063385276], [-58.28080400250225, -17.271710300366017], [-57.734558274961, -17.55246835700777], [-57.49837114117099, -18.174187513911292], [-57.67600887717431, -18.96183969490403], [-57.949997321185826, -19.40000416430682], [-57.85380164247451, -19.96999521248619], [-58.166392381408045, -20.176700941653678], [-58.183471442280506, -19.868399346600363], [-59.11504248720611, -19.3569060197754], [-60.04356462262649, -19.342746677327426], [-61.78632646345377, -19.633736667562964], [-62.2659612697708, -20.513734633061276], [-62.291179368729225, -21.051634616787393], [-62.685057135657885, -22.249029229422387], [-62.84646847192156, -22.03498544686945]]]}') WHERE iso_a2 = 'BO';
UPDATE public.countries SET boundary = ST_GeomFromGeoJSON('{"type": "Polygon", "coordinates": [[[-57.62513342958296, -30.21629485445426], [-56.29089962423908, -28.852760512000895], [-55.16228634298457, -27.881915378533463], [-54.490725267135524, -27.47475676850579], [-53.64873531758789, -26.92347258881609], [-53.628348965048744, -26.124865004177472], [-54.13004960795439, -25.547639255477254], [-54.625290696823576, -25.739255466415514], [-54.42894609233059, -25.162184747012166], [-54.29347632507745, -24.570799655863965], [-54.29295956075452, -24.02101409271073], [-54.65283423523513, -23.83957813893396], [-55.02790178080955, -24.00127369557523], [-55.40074723979542, -23.956935316668805], [-55.517639329639636, -23.571997572526637], [-55.610682745981144, -22.655619398694846], [-55.79795813660691, -22.356929620047822], [-56.47331743022939, -22.086300144135283], [-56.8815095689029, -22.28215382252148], [-57.937155727761294, -22.090175876557172], [-57.8706739976178, -20.73268767668195], [-58.166392381408045, -20.176700941653678], [-57.85380164247451, -19.96999521248619], [-57.949997321185826, -19.40000416430682], [-57.67600887717431, -18.96183969490403], [-57.49837114117099, -18.174187513911292], [-57.734558274961, -17.55246835700777], [-58.28080400250225, -17.271710300366017], [-58.38805843772404, -16.877109063385276], [-58.24121985536668, -16.299573256091293], [-60.158389655179036, -16.258283786690086], [-60.54296566429515, -15.093910414289596], [-60.251148851142936, -15.07721892665932], [-60.26432634137737, -14.645979099183641], [-60.45919816755003, -14.354007256734555], [-60.503304002511136, -13.775954685117659], [-61.08412126325565, -13.479383640194598], [-61.71320431176078, -13.489202162330052], [-62.127080857986385, -13.198780612849724], [-62.803060268796386, -13.000653171442686], [-63.19649878605057, -12.627032565972435], [-64.3163529120316, -12.461978041232193], [-65.40228146021303, -11.566270440317155], [-65.32189876978302, -10.895872084194679], [-65.44483700220539, -10.511451104375432], [-65.33843522811642, -9.761987806846392], [-66.6469083319628, -9.931331475466862], [-67.17380123561074, -10.306812432499612], [-68.04819230820539, -10.712059014532485], [-68.27125362819326, -11.01452117273682], [-68.78615759954948, -11.03638030359628], [-69.52967810736496, -10.951734307502194], [-70.0937522040469, -11.123971856331012], [-70.54868567572841, -11.009146823778465], [-70.48189388699117, -9.490118096558845], [-71.30241227892154, -10.079436130415374], [-72.18489071316985, -10.053597914269432], [-72.56303300646564, -9.520193780152717], [-73.22671342639016, -9.462212823121234], [-73.01538265653255, -9.032833347208062], [-73.57105933296707, -8.424446709835834], [-73.98723548042966, -7.523829847853065], [-73.7234014553635, -7.340998630404414], [-73.72448666044164, -6.91859547285064], [-73.1200274319236, -6.629930922068239], [-73.21971126981461, -6.089188734566078], [-72.9645072089412, -5.741251315944893], [-72.89192765978726, -5.274561455916981], [-71.74840572781655, -4.593982842633011], [-70.92884334988358, -4.401591485210368], [-70.7947688463023, -4.251264743673303], [-69.89363521999663, -4.298186944194327], [-69.44410193548961, -1.556287123219818], [-69.42048580593223, -1.122618503426409], [-69.5770653957766, -0.549991957200163], [-70.02065589057005, -0.185156345219539], [-70.01556576198931, 0.541414292804205], [-69.45239600287246, 0.706158758950693], [-69.25243404811906, 0.602650865070075], [-69.21863766140018, 0.985676581217433], [-69.80459672715773, 1.089081122233466], [-69.81697323269162, 1.714805202639624], [-67.86856502955884, 1.692455145673392], [-67.5378100246747, 2.03716278727633], [-67.2599975246736, 1.719998684084956], [-67.0650481838525, 1.130112209473225], [-66.87632585312258, 1.253360500489336], [-66.32576514348496, 0.724452215982012], [-65.54826738143757, 0.78925446207603], [-65.35471330428837, 1.0952822941085], [-64.61101192895987, 1.328730576987042], [-64.19930579289051, 1.49285492594602], [-64.08308549666609, 1.91636912679408], [-63.368788011311665, 2.200899562993129], [-63.42286739770512, 2.411067613124175], [-64.2699991522658, 2.497005520025567], [-64.40882788761792, 3.126786200366624], [-64.3684944322141, 3.797210394705246], [-64.81606401229402, 4.056445217297423], [-64.62865943058755, 4.14848094320925], [-63.88834286157416, 4.020530096854571], [-63.093197597899106, 3.770571193858785], [-62.804533047116706, 4.006965033377952], [-62.08542965355913, 4.162123521334308], [-60.96689327660154, 4.536467596856639], [-60.601179165271944, 4.91809804933213], [-60.73357418480372, 5.200277207861901], [-60.21368343773133, 5.244486395687602], [-59.980958624904886, 5.014061184098139], [-60.11100236676738, 4.574966538914083], [-59.767405768458715, 4.423502915866607], [-59.53803992373123, 3.958802598481938], [-59.815413174057866, 3.606498521332085], [-59.97452490908456, 2.755232652188056], [-59.71854570172675, 2.24963043864436], [-59.64604366722126, 1.786893825686789], [-59.03086157900265, 1.317697658692722], [-58.540012986878295, 1.268088283692521], [-58.429477098205965, 1.463941962078721], [-58.11344987652502, 1.507195135907025], [-57.66097103537737, 1.682584947105639], [-57.335822923396904, 1.948537705895759], [-56.78270423036083, 1.863710842288654], [-56.539385748914555, 1.899522609866921], [-55.995698004771754, 1.817667141116601], [-55.905600145070885, 2.02199575439866], [-56.0733418442903, 2.220794989425499], [-55.973322109589375, 2.510363877773017], [-55.569755011606, 2.421506252447131], [-55.09758744975514, 2.523748073736613], [-54.524754197799716, 2.311848863123785], [-54.08806250671725, 2.105556545414629], [-53.77852067728892, 2.376702785650082], [-53.554839240113544, 2.334896551925951], [-53.41846513529531, 2.053389187015981], [-52.939657151894956, 2.124857692875636], [-52.55642473001842, 2.504705308437053], [-52.249337531123956, 3.241094468596245], [-51.65779741067889, 4.156232408053029], [-51.31714636901086, 4.203490505383954], [-51.069771287629656, 3.650397650564031], [-50.508875291533656, 1.901563828942457], [-49.97407589374506, 1.736483465986069], [-49.94710079608871, 1.046189683431223], [-50.699251268096916, 0.222984117021682], [-50.38821082213214, -0.078444512536819], [-48.62056677915632, -0.235489190271821], [-48.58449662941659, -1.237805271005001], [-47.824956427590635, -0.5816179337628], [-46.566583624851226, -0.941027520352776], [-44.905703090990414, -1.551739597178134], [-44.417619187993665, -2.137750339367976], [-44.58158850765578, -2.691308282078524], [-43.418791266440195, -2.383110039889793], [-41.47265682632825, -2.912018324397116], [-39.97866533055404, -2.873054294449041], [-38.50038347019657, -3.700652357603396], [-37.2232521225352, -4.820945733258917], [-36.45293738457639, -5.109403578312154], [-35.59779578301047, -5.149504489770649], [-35.23538896334756, -5.464937432480247], [-34.89602983248683, -6.738193047719711], [-34.729993455533034, -7.343220716992967], [-35.12821204277422, -8.996401462442286], [-35.636966518687714, -9.649281508017815], [-37.046518724097, -11.040721123908803], [-37.68361161960736, -12.171194756725823], [-38.42387651218844, -13.038118584854288], [-38.67388709161652, -13.057652276260619], [-38.953275722802545, -13.793369642800023], [-38.88229814304965, -15.667053724838768], [-39.16109249526431, -17.208406670808472], [-39.2673392400564, -17.867746270420483], [-39.58352149103423, -18.262295830968938], [-39.76082333022764, -19.59911345792741], [-40.77474077001034, -20.904511814052423], [-40.94475623225061, -21.93731698983781], [-41.754164191238225, -22.370675551037458], [-41.98828426773656, -22.970070489190896], [-43.07470374202475, -22.96769337330547], [-44.64781185563781, -23.351959323827842], [-45.35213578955992, -23.796841729428582], [-46.47209326840554, -24.088968601174543], [-47.64897233742066, -24.885199069927722], [-48.4954581365777, -25.877024834905654], [-48.64100480812774, -26.623697605090932], [-48.474735887228654, -27.17591196056189], [-48.661520351747626, -28.18613453543572], [-48.8884574041574, -28.674115085567884], [-49.587329474472675, -29.224469089476337], [-50.696874152211485, -30.98446502047296], [-51.576226162306156, -31.77769825615321], [-52.256081305538046, -32.24536996839467], [-52.712099982297694, -33.19657805759118], [-53.373661668498244, -33.768377780900764], [-53.6505439927181, -33.20200408298183], [-53.209588995971544, -32.727666110974724], [-53.78795162618219, -32.047242526987624], [-54.57245154480512, -31.494511407193748], [-55.601510179249345, -30.853878676071393], [-55.97324459494094, -30.883075860316303], [-56.976025763564735, -30.109686374636127], [-57.62513342958296, -30.21629485445426]]]}') WHERE iso_a2 = 'BR';
UPDATE public.countries SET boundary = ST_GeomFromGeoJSON('{"type": "Polygon", "coordinates": [[[114.20401655482837, 4.525873928236805], [114.59996137904872, 4.900011298029966], [115.45071048386981, 5.447729803891534], [115.40570031134361, 4.955227565933839], [115.34746097215066, 4.316636053887009], [114.8695573263154, 4.348313706881925], [114.65959598191353, 4.007636826997754], [114.20401655482837, 4.525873928236805]]]}') WHERE iso_a2 = 'BN';
UPDATE public.countries SET boundary = ST_GeomFromGeoJSON('{"type": "Polygon", "coordinates": [[[91.69665652869668, 27.771741848251665], [92.10371178585974, 27.452614040633208], [92.03348351437509, 26.83831045176356], [91.21751264848643, 26.808648179628022], [90.37327477413407, 26.87572418874288], [89.74452762243885, 26.719402981059957], [88.83564253128938, 27.098966376243762], [88.81424848832056, 27.299315904239364], [89.47581017452111, 28.042758897406397], [90.01582889197118, 28.296438503527217], [90.7305139505678, 28.064953925075756], [91.25885379431992, 28.040614325466294], [91.69665652869668, 27.771741848251665]]]}') WHERE iso_a2 = 'BT';
UPDATE public.countries SET boundary = ST_GeomFromGeoJSON('{"type": "Polygon", "coordinates": [[[25.649163445750162, -18.53602589281899], [25.85039147309473, -18.714412937090536], [26.164790887158485, -19.29308562589494], [27.296504754350508, -20.391519870691], [27.724747348753255, -20.49905852629039], [27.72722781750326, -20.851801853114715], [28.021370070108617, -21.485975030200585], [28.794656202924216, -21.63945403410745], [29.43218834810904, -22.091312758067588], [28.01723595552525, -22.82775359465908], [27.119409620886245, -23.574323011979775], [26.786406691197413, -24.240690606383485], [26.4857532081233, -24.616326592713104], [25.94165205252216, -24.69637338633322], [25.76584882986521, -25.17484547292368], [25.66466637543772, -25.486816094669713], [25.025170525825786, -25.7196700985769], [24.211266717228796, -25.670215752873574], [23.73356977712271, -25.390129489851617], [23.312096795350186, -25.26868987396572], [22.8242712745149, -25.50045867279477], [22.57953169118059, -25.979447523708146], [22.105968865657868, -26.280256036079138], [21.605896030369394, -26.726533705351756], [20.88960900237174, -26.828542982695915], [20.66647016773544, -26.477453301704923], [20.75860924651184, -25.86813648855145], [20.16572553882719, -24.91796192800077], [19.895767856534434, -24.76779021576059], [19.89545779794068, -21.84915699634787], [20.88113406747587, -21.814327080983148], [20.910641310314535, -18.252218926672022], [21.655040317478978, -18.219146010005225], [23.1968583513393, -17.869038181227786], [23.579005568137717, -18.28126108162006], [24.217364536239213, -17.88934701911849], [24.520705193792537, -17.887124932529936], [25.08444339366457, -17.661815687737374], [25.264225701608012, -17.736539808831417], [25.649163445750162, -18.53602589281899]]]}') WHERE iso_a2 = 'BW';
UPDATE public.countries SET boundary = ST_GeomFromGeoJSON('{"type": "Polygon", "coordinates": [[[15.279460483469109, 7.421924546737969], [16.10623172370677, 7.497087917506505], [16.290561557691888, 7.754307359239306], [16.456184523187346, 7.734773667832968], [16.705988396886255, 7.508327541529979], [17.964929640380888, 7.890914008002866], [18.38955488452322, 8.281303615751824], [18.911021762780507, 8.630894680206353], [18.812009718509273, 8.982914536978598], [19.09400800952602, 9.07484691002584], [20.05968549976427, 9.012706000194854], [21.000868361096167, 9.475985215691509], [21.723821648859456, 10.567055568885976], [22.231129184668788, 10.97188873946051], [22.864165480244225, 11.142395127807546], [22.97754357269261, 10.71446259199854], [23.554304233502194, 10.089255275915308], [23.55724979014283, 9.681218166538684], [23.394779087017184, 9.265067857292223], [23.459012892355986, 8.954285793488893], [23.805813429466752, 8.666318874542426], [24.567369012152085, 8.229187933785468], [25.11493248871679, 7.825104071479174], [25.124130893664727, 7.500085150579437], [25.79664798351118, 6.979315904158071], [26.213418409945117, 6.546603298362072], [26.465909458123235, 5.94671743410187], [27.21340905122517, 5.550953477394557], [27.37422610851749, 5.233944403500061], [27.04406538260471, 5.127852688004836], [26.402760857862543, 5.150874538590871], [25.650455356557472, 5.256087754737123], [25.278798455514305, 5.170408229997192], [25.12883344900328, 4.92724477784779], [24.805028924262416, 4.89724660890235], [24.410531040146253, 5.10878408448913], [23.29721398285014, 4.609693101414223], [22.841479526468106, 4.710126247573484], [22.70412356943629, 4.633050848810157], [22.405123732195538, 4.029160061047321], [21.659122755630023, 4.22434194581372], [20.927591180106276, 4.322785549329737], [20.290679152108936, 4.691677761245288], [19.46778364429315, 5.03152781821278], [18.93231245288476, 4.709506130385975], [18.54298221199778, 4.201785183118318], [18.45306521980993, 3.504385891123349], [17.809900343505262, 3.56019643799857], [17.133042433346304, 3.728196519379452], [16.537058139724138, 3.198254706226279], [16.012852410555354, 2.267639675298085], [15.907380812247652, 2.557389431158612], [15.862732374747482, 3.013537298998983], [15.405395948964383, 3.33530060466434], [15.036219516671252, 3.851367295747124], [14.950953403389661, 4.210389309094921], [14.47837243008047, 4.732605495620447], [14.558935988023507, 5.03059764243153], [14.459407179429348, 5.4517605656103], [14.536560092841114, 6.22695872642069], [14.776545444404576, 6.408498033062045], [15.279460483469109, 7.421924546737969]]]}') WHERE iso_a2 = 'CF';
UPDATE public.countries SET boundary = ST_GeomFromGeoJSON('{"type": "MultiPolygon", "coordinates": [[[[-63.6645, 46.55001], [-62.9393, 46.41587], [-62.01208, 46.44314], [-62.50391, 46.03339], [-62.87433, 45.96818], [-64.1428, 46.39265], [-64.39261, 46.72747], [-64.01486, 47.03601], [-63.6645, 46.55001]]], [[[-61.8063, 49.10506], [-62.29318, 49.08717], [-63.58926, 49.40069], [-64.51912, 49.87304], [-64.17322, 49.95718], [-62.85829, 49.70641], [-61.835585, 49.28855], [-61.8063, 49.10506]]], [[[-123.51000158755116, 48.51001089130344], [-124.0128907883995, 48.370846259141416], [-125.65501277733837, 48.8250045843385], [-125.95499446679277, 49.179995835967645], [-126.85000443587188, 49.53000031188043], [-127.02999344954442, 49.81499583597008], [-128.05933630436624, 49.9949590114266], [-128.44458410710217, 50.539137681676124], [-128.35841365625544, 50.770648098343685], [-127.3085810960299, 50.552573554071955], [-126.69500097721232, 50.400903225295394], [-125.7550066738232, 50.29501821552938], [-125.4150015875588, 49.95000051533262], [-124.92076818911934, 49.475274970083404], [-123.92250870832102, 49.06248362893581], [-123.51000158755116, 48.51001089130344]]], [[[-56.134035814017125, 50.687009792679305], [-56.795881720595276, 49.81230866149096], [-56.1431050278843, 50.150117499382844], [-55.47149227560294, 49.93581533466846], [-55.82240108908093, 49.58712860777911], [-54.935142584845664, 49.31301097268684], [-54.473775397343786, 49.55669118915918], [-53.476549445191324, 49.24913890237406], [-53.78601375997124, 48.51678050393363], [-53.08613399922626, 48.687803656603535], [-52.958648240762244, 48.157164211614486], [-52.64809872090419, 47.535548407575504], [-53.06915829121834, 46.65549876564495], [-53.52145626485304, 46.61829173439483], [-54.17893551290254, 46.80706574155701], [-53.961868659060485, 47.62520701760192], [-54.24048214376214, 47.75227936460763], [-55.4007730780115, 46.884993801453135], [-55.99748084168584, 46.9197203639533], [-55.29121904155278, 47.389562486351], [-56.25079871278052, 47.63254507098739], [-57.3252292547771, 47.572807115258], [-59.26601518414677, 47.60334788674251], [-59.419494188053704, 47.899453843774864], [-58.79658647320741, 48.25152537697949], [-59.23162451845653, 48.52318838153781], [-58.39180497906523, 49.12558055276418], [-57.358689744686046, 50.71827403421585], [-56.73865007183201, 51.287438259478535], [-55.870976935435294, 51.632094224649194], [-55.406974249886616, 51.58827261006573], [-55.60021826844209, 51.31707469339793], [-56.134035814017125, 50.687009792679305]]], [[[-133.1800040417117, 54.169975490935315], [-132.71000788443132, 54.04000931542353], [-131.7499895840033, 54.12000438090922], [-132.049480347351, 52.984621487024526], [-131.1790425218266, 52.180432847698285], [-131.57782954982292, 52.18237071390925], [-132.18042842677855, 52.639707139692405], [-132.54999243231387, 53.100014960332146], [-133.05461117875552, 53.41146881775538], [-133.2396644827927, 53.8510802272624], [-133.1800040417117, 54.169975490935315]]], [[[-79.26582, 62.158675], [-79.65752, 61.63308], [-80.09956, 61.7181], [-80.36215, 62.01649], [-80.31539, 62.085565], [-79.92939, 62.3856], [-79.52002, 62.36371], [-79.26582, 62.158675]]], [[[-81.89825, 62.7108], [-83.06857, 62.15922], [-83.77462, 62.18231], [-83.99367, 62.4528], [-83.25048, 62.91409], [-81.87699, 62.90458], [-81.89825, 62.7108]]], [[[-85.16130794954987, 65.65728465439281], [-84.97576371940596, 65.217518215589], [-84.46401201041951, 65.37177236598018], [-83.88262630891975, 65.10961782496355], [-82.78757687043878, 64.76669302027469], [-81.64201371939254, 64.45513580998696], [-81.55344031444426, 63.97960928003715], [-80.81736121287886, 64.05748566350101], [-80.10345130076661, 63.725981350348604], [-80.99101986359568, 63.411246039474975], [-82.54717810741701, 63.65172231714524], [-83.10879757356506, 64.10187571883972], [-84.10041663281388, 63.56971181909802], [-85.52340471061902, 63.0523790554241], [-85.86676876498237, 63.63725291610356], [-87.22198320183674, 63.54123810490523], [-86.35275977247127, 64.03583323837071], [-86.22488644076515, 64.82291697860828], [-85.88384782585487, 65.73877838811705], [-85.16130794954987, 65.65728465439281]]], [[[-75.86588, 67.14886], [-76.98687, 67.09873], [-77.2364, 67.58809], [-76.81166, 68.14856], [-75.89521, 68.28721], [-75.1145, 68.01036], [-75.10333, 67.58202], [-75.21597, 67.44425], [-75.86588, 67.14886]]], [[[-95.64768120380052, 69.10769035832178], [-96.2695212038006, 68.75704035832175], [-97.61740120380057, 69.0600303583218], [-98.43180120380052, 68.9507003583218], [-99.79740120380053, 69.4000303583218], [-98.91740120380055, 69.7100303583218], [-98.2182612038005, 70.14354035832176], [-97.15740120380056, 69.86003035832181], [-96.55740120380054, 69.68003035832177], [-96.25740120380053, 69.49003035832177], [-95.64768120380052, 69.10769035832178]]], [[[-90.5471, 69.49766], [-90.55151, 68.47499], [-89.21515, 69.25873], [-88.01966, 68.61508], [-88.31749, 67.87338], [-87.35017, 67.19872], [-86.30607, 67.92146], [-85.57664, 68.78456], [-85.52197, 69.88211], [-84.10081, 69.80539], [-82.62258, 69.65826], [-81.28043, 69.16202], [-81.2202, 68.66567], [-81.96436, 68.13253], [-81.25928, 67.59716], [-81.38653, 67.11078], [-83.34456, 66.41154], [-84.73542, 66.2573], [-85.76943, 66.55833], [-86.0676, 66.05625], [-87.03143, 65.21297], [-87.32324, 64.77563], [-88.48296, 64.09897], [-89.91444, 64.03273], [-90.70398, 63.61017], [-90.77004, 62.96021], [-91.93342, 62.83508], [-93.15698, 62.02469], [-94.24153, 60.89865], [-94.62931, 60.11021], [-94.6846, 58.94882], [-93.21502, 58.78212], [-92.76462, 57.84571], [-92.29703, 57.08709], [-90.89769, 57.28468], [-89.03953, 56.85172], [-88.03978, 56.47162], [-87.32421, 55.99914], [-86.07121, 55.72383], [-85.01181, 55.3026], [-83.36055, 55.24489], [-82.27285, 55.14832], [-82.4362, 54.28227], [-82.12502, 53.27703], [-81.40075, 52.15788], [-79.91289, 51.20842], [-79.14301, 51.53393], [-78.60191, 52.56208], [-79.12421, 54.14145], [-79.82958, 54.66772], [-78.22874, 55.13645], [-77.0956, 55.83741], [-76.54137, 56.53423], [-76.62319, 57.20263], [-77.30226, 58.05209], [-78.51688, 58.80458], [-77.33676, 59.85261], [-77.77272, 60.75788], [-78.10687, 62.31964], [-77.41067, 62.55053], [-75.69621, 62.2784], [-74.6682, 62.18111], [-73.83988, 62.4438], [-72.90853, 62.10507], [-71.67708, 61.52535], [-71.37369, 61.13717], [-69.59042, 61.06141], [-69.62033, 60.22125], [-69.2879, 58.95736], [-68.37455, 58.80106], [-67.64976, 58.21206], [-66.20178, 58.76731], [-65.24517, 59.87071], [-64.58352, 60.33558], [-63.80475, 59.4426], [-62.50236, 58.16708], [-61.39655, 56.96745], [-61.79866, 56.33945], [-60.46853, 55.77548], [-59.56962, 55.20407], [-57.97508, 54.94549], [-57.3332, 54.6265], [-56.93689, 53.78032], [-56.15811, 53.64749], [-55.75632, 53.27036], [-55.68338, 52.14664], [-56.40916, 51.7707], [-57.12691, 51.41972], [-58.77482, 51.0643], [-60.03309, 50.24277], [-61.72366, 50.08046], [-63.86251, 50.29099], [-65.36331, 50.2982], [-66.39905, 50.22897], [-67.23631, 49.51156], [-68.51114, 49.06836], [-69.95362, 47.74488], [-71.10458, 46.82171], [-70.25522, 46.98606], [-68.65, 48.3], [-66.55243, 49.1331], [-65.05626, 49.23278], [-64.17099, 48.74248], [-65.11545, 48.07085], [-64.79854, 46.99297], [-64.47219, 46.23849], [-63.17329, 45.73902], [-61.52072, 45.88377], [-60.51815, 47.00793], [-60.4486, 46.28264], [-59.80287, 45.9204], [-61.03988, 45.26525], [-63.25471, 44.67014], [-64.24656, 44.26553], [-65.36406, 43.54523], [-66.1234, 43.61867], [-66.16173, 44.46512], [-64.42549, 45.29204], [-66.02605, 45.25931], [-67.13741, 45.13753], [-67.79134, 45.70281], [-67.79046, 47.06636], [-68.23444, 47.35486], [-68.905, 47.185], [-69.23722, 47.447781], [-69.99997, 46.69307], [-70.305, 45.915], [-70.66, 45.46], [-71.08482, 45.30524], [-71.405, 45.255], [-71.50506, 45.0082], [-73.34783, 45.00738], [-74.867, 45.00048], [-75.31821, 44.81645], [-76.375, 44.09631], [-76.5, 44.01845889375872], [-76.82003414580558, 43.628784288093755], [-77.7378850979577, 43.629055589363304], [-78.72027991404238, 43.625089423184875], [-79.17167355011188, 43.46633942318422], [-79.01, 43.27], [-78.92, 42.965], [-78.9393621487437, 42.86361135514804], [-80.24744767934794, 42.36619985612259], [-81.27774654816716, 42.20902598730686], [-82.43927771679162, 41.675105088867156], [-82.69008928092018, 41.675105088867156], [-83.02981014680694, 41.83279572200584], [-83.14199968131257, 41.97568105729283], [-83.12, 42.08], [-82.9, 42.43], [-82.43, 42.98], [-82.1376423815039, 43.571087551439916], [-82.33776312543108, 44.44], [-82.55092464875818, 45.347516587905375], [-83.59285071484308, 45.81689362241238], [-83.46955074739463, 45.99468638771259], [-83.61613094759059, 46.11692698829907], [-83.89076534700575, 46.11692698829907], [-84.09185126416148, 46.275418606138174], [-84.14211951367338, 46.51222585711574], [-84.3367, 46.40877], [-84.6049, 46.4396], [-84.54374874544587, 46.538684190449146], [-84.77923824739992, 46.637101955749046], [-84.87607988151487, 46.90008331968238], [-85.65236324740343, 47.22021881773051], [-86.46199083122826, 47.553338019392044], [-87.43979262330024, 47.94], [-88.37811418328673, 48.302917588893735], [-89.27291744663668, 48.01980825458267], [-89.6, 48.01], [-90.83, 48.27], [-91.64, 48.14], [-92.61, 48.45], [-93.63087, 48.60926], [-94.32914, 48.67074], [-94.64, 48.84], [-94.81758, 49.38905], [-95.15609, 49.38425], [-95.15906950917204, 49], [-97.22872000000481, 49.0007], [-100.65, 49], [-104.04826, 48.99986], [-107.05, 49], [-110.05, 49], [-113, 49], [-116.04818, 49], [-117.03121, 49], [-120, 49], [-122.84, 49], [-122.97421, 49.0025377777778], [-124.91024, 49.98456], [-125.62461, 50.41656], [-127.43561, 50.83061], [-127.99276, 51.71583], [-127.85032, 52.32961], [-129.12979, 52.75538], [-129.30523, 53.56159], [-130.51497, 54.28757], [-130.53611, 54.80278], [-129.98, 55.285], [-130.00778, 55.91583], [-131.70781, 56.55212], [-132.73042, 57.69289], [-133.35556, 58.41028], [-134.27111, 58.86111], [-134.945, 59.27056], [-135.47583, 59.78778], [-136.47972, 59.46389], [-137.4525, 58.905], [-138.34089, 59.56211], [-139.039, 60], [-140.013, 60.27682], [-140.99778, 60.30639], [-140.9925, 66.00003], [-140.986, 69.712], [-139.12052, 69.47102], [-137.54636, 68.99002], [-136.50358, 68.89804], [-135.62576, 69.31512], [-134.41464, 69.62743], [-132.92925, 69.50534], [-131.43136, 69.94451], [-129.79471, 70.19369], [-129.10773, 69.77927], [-128.36156, 70.01286], [-128.13817, 70.48384], [-127.44712, 70.37721], [-125.75632, 69.48058], [-124.42483, 70.1584], [-124.28968, 69.39969], [-123.06108, 69.56372], [-122.6835, 69.85553], [-121.47226, 69.79778], [-119.94288, 69.37786], [-117.60268, 69.01128], [-116.22643, 68.84151], [-115.2469, 68.90591], [-113.89794, 68.3989], [-115.30489, 67.90261], [-113.49727, 67.68815], [-110.798, 67.80612], [-109.94619, 67.98104], [-108.8802, 67.38144], [-107.79239, 67.88736], [-108.81299, 68.31164], [-108.16721, 68.65392], [-106.95, 68.7], [-106.15, 68.8], [-105.34282, 68.56122], [-104.33791, 68.018], [-103.22115, 68.09775], [-101.45433, 67.64689], [-99.90195, 67.80566], [-98.4432, 67.78165], [-98.5586, 68.40394], [-97.66948, 68.57864], [-96.11991, 68.23939], [-96.12588, 67.29338], [-95.48943, 68.0907], [-94.685, 68.06383], [-94.23282, 69.06903], [-95.30408, 69.68571], [-96.47131, 70.08976], [-96.39115, 71.19482], [-95.2088, 71.92053], [-93.88997, 71.76015], [-92.87818, 71.31869], [-91.51964, 70.19129], [-92.40692, 69.69997], [-90.5471, 69.49766]]], [[[-114.1671699999999, 73.12145], [-114.66634, 72.65277], [-112.4410199999999, 72.95540000000011], [-111.05039, 72.4504], [-109.92034999999989, 72.96113000000011], [-109.00654, 72.63335], [-108.18835, 71.65089], [-107.68599, 72.06548], [-108.39639, 73.08953000000011], [-107.51645, 73.23598], [-106.52259, 73.07601], [-105.40246, 72.67259], [-104.77484, 71.6984000000001], [-104.46475999999984, 70.99297], [-102.78537, 70.49776], [-100.9807799999999, 70.02432], [-101.08929, 69.58447000000012], [-102.73116, 69.50402], [-102.09329, 69.11962000000011], [-102.43024, 68.75282], [-104.24, 68.91], [-105.96, 69.18000000000015], [-107.12254, 69.11922], [-109, 68.78], [-111.53414887520015, 68.63005915681794], [-113.3132, 68.53554], [-113.85495999999983, 69.00744000000012], [-115.22, 69.28], [-116.10794, 69.16821], [-117.34, 69.96000000000012], [-116.6747299999999, 70.06655], [-115.13112, 70.2373], [-113.72141, 70.19237], [-112.4161, 70.36638], [-114.35, 70.6], [-116.48684, 70.52045], [-117.9048, 70.54056000000014], [-118.43238, 70.9092], [-116.11311, 71.30918], [-117.65568, 71.2952], [-119.40199, 71.55859], [-118.56267, 72.30785], [-117.86642, 72.70594], [-115.18909, 73.31459000000012], [-114.1671699999999, 73.12145]]], [[[-104.5, 73.42], [-105.38, 72.76], [-106.94, 73.46], [-106.6, 73.6], [-105.26, 73.64], [-104.5, 73.42]]], [[[-76.34, 73.10268498995302], [-76.25140380859375, 72.82638549804688], [-77.31443786621091, 72.85554504394528], [-78.39167022705081, 72.87665557861328], [-79.48625183105466, 72.74220275878909], [-79.77583312988284, 72.80290222167974], [-80.87609863281253, 73.33318328857422], [-80.83388519287107, 73.69318389892578], [-80.35305786132812, 73.75971984863278], [-78.06443786621094, 73.65193176269534], [-76.34, 73.10268498995302]]], [[[-86.56217851433414, 73.15744700793846], [-85.77437130404454, 72.53412588163383], [-84.85011247428824, 73.34027822538712], [-82.31559017610098, 73.75095083281059], [-80.60008765330764, 72.71654368762421], [-80.7489416165244, 72.06190664335077], [-78.77063859731078, 72.35217316353416], [-77.8246239895596, 72.74961660429105], [-75.60584469267573, 72.24367849393741], [-74.22861609566499, 71.7671442735579], [-74.09914079455771, 71.33084015571765], [-72.24222571479766, 71.55692454699451], [-71.2000154283352, 70.92001251899723], [-68.7860542466849, 70.52502370877426], [-67.91497046575694, 70.12194753689761], [-66.96903337265417, 69.18608734809189], [-68.80512285020055, 68.72019847276442], [-66.44986609563387, 68.06716339789202], [-64.86231441919523, 67.84753856065163], [-63.42493445499676, 66.92847321234066], [-61.85198137068059, 66.86212067327784], [-62.1631768459423, 66.16025136988961], [-63.918444383384184, 64.99866852483285], [-65.14886023625363, 65.42603261988668], [-66.72121904159854, 66.3880410834322], [-68.01501603867396, 66.2627257351244], [-68.14128740097917, 65.68978913030438], [-67.0896461656234, 65.108455105237], [-65.73208045109976, 64.64840566675863], [-65.32016760930128, 64.38273712834606], [-64.66940629744968, 63.39292674422748], [-65.01380388045891, 62.674185085695996], [-66.27504472519047, 62.945098781986076], [-68.78318620469273, 63.74567007105182], [-67.36968075221304, 62.883965562584876], [-66.32829728866722, 62.280074774822054], [-66.16556820338016, 61.93089712182589], [-68.87736650254465, 62.33014923771282], [-71.02343705919384, 62.91070811629584], [-72.235378587519, 63.397836005295176], [-71.8862784491713, 63.67998932560886], [-73.37830624051838, 64.19396312118383], [-74.8344189114226, 64.67907562932379], [-74.81850257027673, 64.38909332951798], [-77.70997982452005, 64.22954234481679], [-78.55594885935417, 64.57290639918014], [-77.89728105336192, 65.30919220647479], [-76.0182742987972, 65.32696889918316], [-73.95979529488272, 65.4547647162409], [-74.29388342964964, 65.8117713487294], [-73.94491248238265, 66.31057811142674], [-72.65116716173941, 67.28457550726387], [-72.92605994331609, 67.72692576768239], [-73.31161780464575, 68.06943716091291], [-74.84330725777681, 68.55462718370129], [-76.86910091826675, 68.89473562283027], [-76.22864905465735, 69.14776927354742], [-77.28736996123712, 69.76954010688328], [-78.1686339993266, 69.82648753526891], [-78.95724219431673, 70.16688019477542], [-79.49245500356366, 69.87180776638891], [-81.30547095409176, 69.74318512641435], [-84.94470618359847, 69.9666340196444], [-87.06000342481789, 70.26000112576537], [-88.68171322300151, 70.41074127876081], [-89.51341956252304, 70.76203766548099], [-88.46772111688077, 71.21818553332133], [-89.8881512112875, 71.22255219184996], [-90.20516028518202, 72.2350743679608], [-89.43657670770494, 73.12946421985237], [-88.40824154331281, 73.53788890247122], [-85.82615108920092, 73.80381582304523], [-86.56217851433414, 73.15744700793846]]], [[[-100.35642, 73.84389], [-99.16387, 73.63339], [-97.38, 73.76], [-97.12, 73.47], [-98.05359, 72.99052], [-96.54, 72.56], [-96.72, 71.66], [-98.35966, 71.27285], [-99.32286, 71.35639], [-100.01482, 71.73827], [-102.5, 72.51], [-102.48, 72.83], [-100.43836, 72.70588], [-101.54, 73.36], [-100.35642, 73.84389]]], [[[-93.19629553910022, 72.77199249947336], [-94.26904659704726, 72.02459625923598], [-95.40985551632266, 72.06188080513459], [-96.03374508338246, 72.94027680123182], [-96.01826799191099, 73.4374299180958], [-95.49579342322403, 73.86241689726418], [-94.50365759965234, 74.13490672473921], [-92.42001217321177, 74.10002513294219], [-90.50979285354259, 73.85673248971204], [-92.0039652168299, 72.9662442084585], [-93.19629553910022, 72.77199249947336]]], [[[-120.46, 71.38360179308759], [-123.09219, 70.90164], [-123.62, 71.34], [-125.92894873747333, 71.86868846301141], [-125.5, 72.29226081179502], [-124.80729, 73.02256], [-123.9399999999999, 73.68000000000015], [-124.91775, 74.29275000000013], [-121.53788, 74.44893], [-120.10978, 74.24135], [-117.55563999999987, 74.18577], [-116.58442, 73.89607], [-115.51081, 73.47519], [-116.7679399999999, 73.22292], [-119.22, 72.52], [-120.46, 71.82], [-120.46, 71.38360179308759]]], [[[-93.61275590694049, 74.97999726022445], [-94.15690873897384, 74.59234650338686], [-95.60868058956561, 74.66686391875177], [-96.82093217648458, 74.92762319609659], [-96.28858740922982, 75.37782827422336], [-94.85081987178913, 75.6472175157609], [-93.97774654821794, 75.29648956979597], [-93.61275590694049, 74.97999726022445]]], [[[-98.5, 76.72], [-97.73558, 76.25656], [-97.704415, 75.74344], [-98.16, 75], [-99.80874, 74.89744], [-100.88366, 75.05736], [-100.86292, 75.64075], [-102.50209, 75.5638], [-102.56552, 76.3366], [-101.48973, 76.30537], [-99.98349, 76.64634], [-98.57699, 76.58859], [-98.5, 76.72]]], [[[-108.21141, 76.20168], [-107.81943, 75.84552], [-106.92893, 76.01282], [-105.881, 75.9694], [-105.70498, 75.47951], [-106.31347, 75.00527], [-109.7, 74.85], [-112.22307, 74.41696], [-113.74381, 74.39427], [-113.87135, 74.72029], [-111.79421, 75.1625], [-116.31221, 75.04343], [-117.7104, 75.2222], [-116.34602, 76.19903], [-115.40487, 76.47887], [-112.59056, 76.14134], [-110.81422, 75.54919], [-109.0671, 75.47321], [-110.49726, 76.42982], [-109.5811, 76.79417], [-108.54859, 76.67832], [-108.21141, 76.20168]]], [[[-94.68408586299947, 77.09787832305838], [-93.57392106807313, 76.77629588490609], [-91.60502315953661, 76.77851797149461], [-90.74184587274922, 76.44959747995682], [-90.96966142450799, 76.07401317005946], [-89.82223792189927, 75.84777374948564], [-89.18708289259979, 75.61016551380763], [-87.83827633334963, 75.56618886992723], [-86.37919226758868, 75.48242137318218], [-84.78962521029061, 75.69920400664651], [-82.75344458691006, 75.78431509063125], [-81.12853084992437, 75.71398346628203], [-80.05751095245915, 75.3368488634159], [-79.83393286814834, 74.9231273464872], [-80.45777075877584, 74.65730377877779], [-81.94884253612554, 74.44245901152433], [-83.22889360221143, 74.56402781849096], [-86.0974523587333, 74.41003205026115], [-88.15035030796022, 74.39230703398499], [-89.76472205275837, 74.51555532500115], [-92.42244096552943, 74.837757880341], [-92.76828548864282, 75.38681997344216], [-92.88990597204173, 75.88265534128266], [-93.893824022176, 76.31924367950054], [-95.96245744503582, 76.44138092722247], [-97.12137895382949, 76.75107778594761], [-96.74512285031236, 77.16138865834515], [-94.68408586299947, 77.09787832305838]]], [[[-116.19858659550735, 77.64528677032621], [-116.33581336145839, 76.87696157501057], [-117.1060505847688, 76.53003184681913], [-118.04041215703815, 76.4811717800871], [-119.8993175868857, 76.05321340606199], [-121.4999950771265, 75.9000186225328], [-122.85492448615898, 76.1165428738357], [-122.85492529360322, 76.1165428738357], [-121.15753536032825, 76.86450755482835], [-119.10393897182105, 77.51221995717464], [-117.57013078496597, 77.49831899688812], [-116.19858659550735, 77.64528677032621]]], [[[-93.84000301794399, 77.5199972602345], [-94.29560828324526, 77.4913426785287], [-96.16965410031008, 77.5551113959769], [-96.43630449093612, 77.83462921824363], [-94.42257727738638, 77.82000478790499], [-93.72065629756588, 77.63433136668033], [-93.84000301794399, 77.5199972602345]]], [[[-110.18693803591297, 77.6970148790503], [-112.05119116905848, 77.40922882761686], [-113.53427893761906, 77.73220652944116], [-112.72458675825385, 78.05105011668195], [-111.26444332563085, 78.15295604116156], [-109.8544518705471, 77.99632477488484], [-110.18693803591297, 77.6970148790503]]], [[[-109.66314571820259, 78.60197256134569], [-110.88131425661886, 78.40691986766001], [-112.54209143761517, 78.40790171987351], [-112.5258908760916, 78.55055451121524], [-111.5000103422334, 78.84999359813057], [-110.96366065147602, 78.80444082306522], [-109.66314571820259, 78.60197256134569]]], [[[-95.83029496944934, 78.05694122996326], [-97.309842902398, 77.8505972358218], [-98.12428931353398, 78.0828569607576], [-98.55286780474665, 78.45810537384511], [-98.63198442258553, 78.87193024363839], [-97.33723141151262, 78.83198436147677], [-96.75439876990879, 78.765812689927], [-95.55927792029459, 78.41831452098029], [-95.83029496944934, 78.05694122996326]]], [[[-100.06019182005214, 78.3247543403159], [-99.67093909381362, 77.90754466420742], [-101.30394019245301, 78.01898489044481], [-102.94980872273305, 78.34322866486022], [-105.17613277873154, 78.38033234324575], [-104.21042945027716, 78.6774201524918], [-105.41958045125854, 78.91833567983645], [-105.49228919149316, 79.3015939399292], [-103.52928239623793, 79.16534902619165], [-100.82515804726881, 78.8004617377787], [-100.06019182005214, 78.3247543403159]]], [[[-87.02, 79.66], [-85.81435, 79.3369], [-87.18756, 79.0393], [-89.03535, 78.28723], [-90.80436, 78.21533], [-92.87669, 78.34333], [-93.95116, 78.75099], [-93.93574, 79.11373], [-93.14524, 79.3801], [-94.974, 79.37248], [-96.07614, 79.70502], [-96.70972, 80.15777], [-96.01644, 80.60233], [-95.32345, 80.90729], [-94.29843, 80.97727], [-94.73542, 81.20646], [-92.40984, 81.25739], [-91.13289, 80.72345], [-89.45, 80.50932203389829], [-87.81, 80.32], [-87.02, 79.66]]], [[[-68.5, 83.10632151676575], [-65.82735, 83.02801], [-63.68, 82.9], [-61.85, 82.6286], [-61.89388, 82.36165], [-64.334, 81.92775], [-66.75342, 81.72527], [-67.65755, 81.50141], [-65.48031, 81.50657], [-67.84, 80.9], [-69.4697, 80.61683], [-71.18, 79.8], [-73.2428, 79.63415], [-73.88, 79.43016220480209], [-76.90773, 79.32309], [-75.52924, 79.19766], [-76.22046, 79.01907], [-75.39345, 78.52581], [-76.34354, 78.18296], [-77.88851, 77.89991], [-78.36269, 77.50859], [-79.75951, 77.20968], [-79.61965, 76.98336], [-77.91089, 77.022045], [-77.88911, 76.777955], [-80.56125, 76.17812], [-83.17439, 76.45403], [-86.11184, 76.29901], [-87.6, 76.42], [-89.49068, 76.47239], [-89.6161, 76.95213], [-87.76739, 77.17833], [-88.26, 77.9], [-87.65, 77.97022222222222], [-84.97634, 77.53873], [-86.34, 78.18], [-87.96192, 78.37181], [-87.15198, 78.75867], [-85.37868, 78.9969], [-85.09495, 79.34543], [-86.50734, 79.73624], [-86.93179, 80.25145], [-84.19844, 80.20836], [-83.40869565217383, 80.1], [-81.84823, 80.46442], [-84.1, 80.58], [-87.59895, 80.51627], [-89.36663, 80.85569], [-90.2, 81.26], [-91.36786, 81.5531], [-91.58702, 81.89429], [-90.1, 82.085], [-88.93227, 82.11751], [-86.97024, 82.27961], [-85.5, 82.65227345805704], [-84.26, 82.6], [-83.18, 82.32], [-82.42, 82.86], [-81.1, 83.02], [-79.30664, 83.13056], [-76.25, 83.1720588235294], [-75.71878, 83.06404], [-72.83153, 83.23324], [-70.66576, 83.16978075838284], [-68.5, 83.10632151676575]]]]}') WHERE iso_a2 = 'CA';
UPDATE public.countries SET boundary = ST_GeomFromGeoJSON('{"type": "Polygon", "coordinates": [[[9.59422610844635, 47.52505809182027], [9.632931756232978, 47.34760122332999], [9.479969516649021, 47.102809963563374], [9.932448357796659, 46.92072805438296], [10.44270145024663, 46.89354625099743], [10.363378126678612, 46.48357127540986], [9.922836541390382, 46.31489940040919], [9.182881707403055, 46.44021474871698], [8.966305779667806, 46.03693187111119], [8.489952426801324, 46.005150865251686], [8.31662967289438, 46.16364248309086], [7.755992058959833, 45.82449005795931], [7.273850945676656, 45.776947740250776], [6.843592970414505, 45.99114655210061], [6.500099724970426, 46.42967275652944], [6.022609490593538, 46.27298981382047], [6.037388950229001, 46.725778713561866], [6.768713820023606, 47.2877082383037], [6.736571079138059, 47.541801255882845], [7.192202182655507, 47.44976552997102], [7.466759067422231, 47.62058197691181], [8.317301466514152, 47.61357982033626], [8.522611932009767, 47.83082754169129], [9.59422610844635, 47.52505809182027]]]}') WHERE iso_a2 = 'CH';
UPDATE public.countries SET boundary = ST_GeomFromGeoJSON('{"type": "MultiPolygon", "coordinates": [[[[-68.63401022758316, -52.63637045887437], [-68.6333499999999, -54.8695], [-67.56244, -54.87001], [-66.95992, -54.89681], [-67.29102999999989, -55.30124], [-68.14862999999986, -55.61183], [-68.63999081081181, -55.58001799908689], [-69.2321, -55.49906], [-69.95809, -55.19843], [-71.00568, -55.05383], [-72.2639, -54.49514], [-73.2852, -53.95751999999989], [-74.66253, -52.83749], [-73.8381, -53.04743], [-72.43418, -53.7154], [-71.10773, -54.07433], [-70.5917799999998, -53.61583], [-70.26748, -52.93123], [-69.34564999999989, -52.5183], [-68.63401022758316, -52.63637045887437]]], [[[-68.21991309271124, -21.494346612231837], [-67.82817989772266, -22.872918796482182], [-67.10667355006362, -22.7359245744764], [-66.98523393417764, -22.98634856536283], [-67.32844295924414, -24.025303236590915], [-68.41765296087613, -24.518554782816878], [-68.38600114609736, -26.185016371365236], [-68.59479977077268, -26.506908868111267], [-68.2955415513704, -26.89933969493579], [-69.00123491074828, -27.521213881136134], [-69.65613033718316, -28.459141127233693], [-70.01355038112987, -29.36792286551855], [-69.91900834825194, -30.336339206668313], [-70.53506893581945, -31.36501026787029], [-70.07439938015364, -33.09120981214804], [-69.81477698431922, -33.27388600029985], [-69.81730912950147, -34.193571465798286], [-70.3880494859491, -35.16968759535945], [-70.36476925320167, -36.005088799789945], [-71.1218806627098, -36.65812387466234], [-71.11862504747543, -37.5768274879472], [-70.81466427273472, -38.55299529394074], [-71.41351660834906, -38.916022230791114], [-71.68076127794646, -39.80816415787807], [-71.91573401557756, -40.83233936947073], [-71.74680375841547, -42.051386407235995], [-72.14889807807853, -42.25488819760139], [-71.91542395698391, -43.40856454851742], [-71.46405615913051, -43.78761117937833], [-71.79362260607195, -44.20717213315611], [-71.32980078803621, -44.40752166115169], [-71.22277889675973, -44.784242852559416], [-71.65931555854533, -44.97368865334144], [-71.55200944689125, -45.56073292417713], [-71.91725847033021, -46.8848381487918], [-72.44735531278027, -47.73853281025353], [-72.33116085477195, -48.244238376661826], [-72.64824744331494, -48.87861825947679], [-73.41543575712004, -49.31843637471296], [-73.32805091011448, -50.37878508890987], [-72.97574683296463, -50.74145029073431], [-72.30997351753237, -50.677009779666356], [-72.32940385607404, -51.42595631287241], [-71.91480383979635, -52.009022305865926], [-69.49836218939609, -52.14276091263725], [-68.57154537624135, -52.29944385534626], [-69.46128434922664, -52.29195077266393], [-69.94277950710614, -52.53793059037326], [-70.84510169135453, -52.899200528525725], [-71.00633216010525, -53.83325204220135], [-71.42979468452094, -53.85645476030039], [-72.55794287788487, -53.53141000118446], [-73.70275672066288, -52.835069268607256], [-73.70275672066288, -52.8350700760515], [-74.94676347522517, -52.26275358841903], [-75.26002600777852, -51.629354750373224], [-74.97663245308982, -51.04339568461569], [-75.4797541978835, -50.37837167745156], [-75.60801510283196, -48.6737728818718], [-75.18276974150214, -47.71191944762316], [-74.1265809801047, -46.9392534319951], [-75.64439531116545, -46.64764332457203], [-74.69215369332306, -45.76397633238098], [-74.35170935738427, -44.103044122087894], [-73.2403560045152, -44.454960625995625], [-72.71780392117978, -42.38335580827899], [-73.38889990913825, -42.117532240569574], [-73.70133561877486, -43.365776462579745], [-74.33194312203258, -43.22495818458441], [-74.01795711942717, -41.794812920906836], [-73.67709937202997, -39.942212823243125], [-73.21759253609068, -39.258688653318515], [-73.50555945503706, -38.28288258235108], [-73.58806087919109, -37.15628468195602], [-73.1667170884993, -37.12378020604436], [-72.55313696968173, -35.508840020491036], [-71.86173214383257, -33.90909270603153], [-71.43845048692992, -32.41889942803083], [-71.66872066922244, -30.92064462659252], [-71.37008256700773, -30.095682061485007], [-71.48989437527646, -28.861442152625912], [-70.90512386746158, -27.6403797340012], [-70.72495398627598, -25.705924167587213], [-70.40396582709505, -23.628996677344546], [-70.09124589708068, -21.393319187101227], [-70.16441972520599, -19.756468194256186], [-70.37257239447774, -18.347975355708883], [-69.85844356960581, -18.092693780187034], [-69.590423753524, -17.58001189541929], [-69.10024695501943, -18.260125420812656], [-68.96681840684184, -18.981683444904093], [-68.44222510443095, -19.405068454671422], [-68.75716712103372, -20.372657972904477], [-68.21991309271124, -21.494346612231837]]]]}') WHERE iso_a2 = 'CL';
UPDATE public.countries SET boundary = ST_GeomFromGeoJSON('{"type": "MultiPolygon", "coordinates": [[[[110.33918786015155, 18.678395087147607], [109.47520958866372, 18.197700913968617], [108.65520796105616, 18.5076819930714], [108.62621748254045, 19.367887885001977], [109.11905561730802, 19.821038519769388], [110.21159874882287, 20.101253973872076], [110.78655073450224, 20.07753449145008], [111.01005130416465, 19.695929877190736], [110.57064660038682, 19.255879218009312], [110.33918786015155, 18.678395087147607]]], [[[127.65740726126242, 49.76027049417294], [129.39781782442046, 49.44060008401544], [130.5822933289824, 48.72968740497612], [130.98728152885386, 47.790132351261406], [132.50667199109952, 47.78896963153488], [133.37359581922803, 48.18344167743493], [135.02631147678673, 48.47822988544391], [134.50081383681064, 47.57843984637785], [134.11236209527263, 47.21246735288673], [133.7696439963129, 46.11692698829907], [133.09712690646646, 45.144066473972174], [131.8834542176596, 45.32116160743644], [131.0252120301561, 44.96795319272158], [131.28855512911557, 44.111519680348266], [131.14468794161488, 42.92998973242695], [130.63386640840983, 42.90301463477056], [130.64001590385246, 42.39500946712528], [129.99426720593326, 42.9853868678438], [129.5966687358795, 42.4249817978546], [128.05221520397234, 41.99428457291799], [128.20843305879075, 41.46677155208255], [127.34378299368305, 41.50315176041596], [126.8690832866499, 41.81656932226616], [126.18204511932944, 41.10733612727637], [125.07994184784062, 40.569823716792456], [124.26562462778534, 39.92849335383414], [122.86757042856104, 39.63778758397626], [122.13138797413094, 39.17045176854464], [121.05455447803288, 38.89747101496292], [121.5859949077225, 39.36085358332414], [121.37675703337268, 39.75026133885953], [122.16859500538104, 40.42244253189605], [121.64035851449356, 40.94638987890332], [120.76862877816197, 40.5933881699176], [119.63960208544907, 39.89805593521422], [119.02346398323303, 39.2523330755111], [118.04274865119791, 39.20427399347969], [117.53270226447708, 38.7376358098841], [118.05969852098971, 38.06147553156106], [118.87814985562838, 37.897325344385905], [118.91163618375353, 37.44846385349874], [119.70280236214208, 37.15638865818508], [120.82345747282366, 37.87042776137798], [121.71125857959797, 37.48112335870718], [122.35793745329849, 37.45448415786069], [122.51999474496583, 36.930614325501836], [121.10416385303304, 36.65132904718044], [120.63700890511458, 36.11143952081113], [119.66456180224608, 35.609790554337735], [119.1512081238586, 34.909859117160465], [120.22752485563373, 34.36033193616862], [120.6203690939166, 33.37672272392513], [121.22901411345023, 32.46031871187719], [121.90814578663006, 31.69217438407469], [121.89191938689035, 30.949351508095106], [121.26425744027333, 30.676267401648715], [121.50351932178475, 30.142914943964257], [122.0921138855891, 29.832520453403163], [121.93842817595308, 29.01802236583481], [121.68443851123848, 28.225512600206685], [121.12566124886646, 28.135673122667185], [120.39547326058235, 27.053206895449392], [119.58549686083958, 25.740780544532612], [118.65687137255455, 24.547390855400238], [117.28160647997086, 23.624501451099718], [115.89073530483515, 22.782873236578098], [114.76382734584624, 22.66807404224167], [114.15254682826568, 22.223760077396207], [113.80677981980077, 22.54833974862143], [113.24107791550162, 22.05136749927047], [111.84359215703248, 21.550493679281516], [110.78546552942416, 21.397143866455338], [110.44403934127169, 20.341032619706397], [109.88986128137358, 20.282457383703445], [109.62765506392466, 21.008227037026728], [109.86448815311834, 21.395050970947523], [108.52281294152445, 21.71521230721183], [108.050180291783, 21.552379869060104], [107.04342003787266, 21.811898912029903], [106.56727339073538, 22.218204860924743], [106.7254032735485, 22.79426788989838], [105.81124718630522, 22.976892401617903], [105.32920942588666, 23.352063300056983], [104.4768583516645, 22.819150092046925], [103.50451460166053, 22.70375661873922], [102.70699222210018, 22.708795070887703], [102.17043582561357, 22.464753119389343], [101.65201785686159, 22.31819875740956], [101.80311974488293, 21.174366766845054], [101.27002566936002, 21.20165192309517], [101.18000532430759, 21.43657298429406], [101.15003299357826, 21.849984442629022], [100.41653771362738, 21.558839423096657], [99.98348921102158, 21.74293671313646], [99.24089887898722, 22.118314317304566], [99.53199222208744, 22.9490388046126], [98.89874922078283, 23.142722072842588], [98.6602624857558, 24.063286037690006], [97.60471967976204, 23.897404690033056], [97.72460900267916, 25.083637193293043], [98.67183800658924, 25.918702500913497], [98.71209394734458, 26.74353587494025], [98.68269005737054, 27.508812160750665], [98.24623091023338, 27.74722138112918], [97.91198774616944, 28.335945136014374], [97.32711388549004, 28.261582749946342], [96.24883344928784, 28.41103099213447], [96.58659061074755, 28.83097951915437], [96.11767866413103, 29.45280202892252], [95.40480228066465, 29.03171662039216], [94.56599043170294, 29.277438055939967], [93.41334760943269, 28.64062938080724], [92.50311893104364, 27.89687632904645], [91.6966565286967, 27.771741848251622], [91.25885379431989, 28.04061432546635], [90.73051395056783, 28.06495392507574], [90.01582889197121, 28.296438503527185], [89.47581017452117, 28.042758897406372], [88.8142484883206, 27.299315904239393], [88.73032596227856, 28.08686473236756], [88.12044070836996, 27.87654165293958], [86.95451704300066, 27.97426178640353], [85.82331994013154, 28.20357595469875], [85.01163821812307, 28.642773952747376], [84.23457970575018, 28.839893703724698], [83.89899295444675, 29.32022614187764], [83.33711510613719, 29.463731594352197], [82.32751264845089, 30.115268052688208], [81.5258044778748, 30.422716986608663], [81.11125613802929, 30.183480943313413], [79.72136681510713, 30.882714748654735], [78.73889448437401, 31.51590607352705], [78.45844648632604, 32.61816437431273], [79.17612877799556, 32.483779812137755], [79.20889163606856, 32.994394639613745], [78.81108646028574, 33.506198025032404], [78.91226891471322, 34.321936346975775], [77.83745079947462, 35.49400950778781], [76.19284834178572, 35.89840342868786], [75.89689741405019, 36.66680613865188], [75.158027785141, 37.13303091078916], [74.98000247589542, 37.419990139305895], [74.82998579295216, 37.99000702570146], [74.8648157083168, 38.3788463404816], [74.2575142760227, 38.60650686294349], [73.92885216664641, 38.505815334622724], [73.67537926625485, 39.43123688410557], [73.96001305531846, 39.66000844986172], [73.82224368682833, 39.89397349706314], [74.77686242055606, 40.36642527929163], [75.46782799673073, 40.56207225194868], [76.52636803579745, 40.42794607193514], [76.90448449087714, 41.06648590754966], [78.18719689322606, 41.185315863604814], [78.54366092317528, 41.58224254003872], [80.11943037305142, 42.123940741538235], [80.25999026888533, 42.34999929459909], [80.18015018099439, 42.92006785742686], [80.86620649610123, 43.180362046881015], [79.96610639844144, 44.91751699480463], [81.9470707539181, 45.31702749285316], [82.45892581576905, 45.539649563166506], [83.18048383986056, 47.33003123635075], [85.16429039911324, 47.00095571551611], [85.7204838398707, 47.45296946877309], [85.76823286330838, 48.4557506373969], [86.59877648310336, 48.54918162698061], [87.3599703307627, 49.21498078062916], [87.75126427607668, 49.29719798440547], [88.0138322285517, 48.5994627956006], [88.85429772334678, 48.069081732773014], [90.28082563676392, 47.693549099307916], [90.97080936072499, 46.888146063822944], [90.58576826371834, 45.7197160914875], [90.94553958533433, 45.28607330991025], [92.13389082231825, 45.115075995456436], [93.48073367714133, 44.975472113620015], [94.68892866412537, 44.35233185482846], [95.30687544147153, 44.24133087826547], [95.76245486855672, 43.31944916439463], [96.34939578652782, 42.72563528092866], [97.451757440178, 42.74888967546008], [99.51581749878002, 42.524691473961695], [100.8458655131083, 42.663804429691425], [101.83304039917996, 42.51487295182628], [103.31227827353482, 41.90746816666763], [104.52228193564903, 41.90834666601663], [104.96499393109346, 41.59740957291635], [106.12931562706169, 42.1343277044289], [107.744772576938, 42.481515814781915], [109.24359581913146, 42.51944631608416], [110.41210330611531, 42.87123362891103], [111.12968224492025, 43.40683401140018], [111.8295878438814, 43.74311839453949], [111.66773725794323, 44.07317576758771], [111.34837690637946, 44.45744171811006], [111.87330610560028, 45.10207937273512], [112.43606245325887, 45.01164561622426], [113.46390669154422, 44.80889313412712], [114.46033165899607, 45.33981679949389], [115.98509647020015, 45.72723501238602], [116.71786828009888, 46.388202419615254], [117.42170128791426, 46.67273285581422], [118.87432579963874, 46.80541209572365], [119.66326989143877, 46.69267995867895], [119.77282392789758, 47.04805878355015], [118.86657433479499, 47.74706004494621], [118.06414269416675, 48.06673045510374], [117.29550744025747, 47.6977090521074], [116.30895267137325, 47.853410142602826], [115.74283735561576, 47.72654450132629], [115.48528201707305, 48.135382595403456], [116.19180219936763, 49.13459809019906], [116.67880089728621, 49.888531399121405], [117.87924441942639, 49.51098338479696], [119.28846072802585, 50.14288279886205], [119.27936567594239, 50.582907619827296], [120.18204959521697, 51.64356639261803], [120.73819135954201, 51.964115302124554], [120.725789015792, 52.51622630473082], [120.1770886577169, 52.75388621684121], [121.00308475147025, 53.25140106873124], [122.24574791879289, 53.431725979213695], [123.57150678924089, 53.45880442973464], [125.06821129771046, 53.161044826868846], [125.9463489116462, 52.79279857035695], [126.564399041857, 51.7842554795327], [126.93915652883769, 51.35389415140591], [127.28745568248493, 50.73979726826545], [127.65740726126242, 49.76027049417294]]]]}') WHERE iso_a2 = 'CN';
UPDATE public.countries SET boundary = ST_GeomFromGeoJSON('{"type": "Polygon", "coordinates": [[[-2.856125047202397, 4.994475816259509], [-3.311084357100071, 4.984295559098015], [-4.008819545904942, 5.179813340674315], [-4.649917364917911, 5.168263658057086], [-5.834496222344526, 4.993700669775137], [-6.528769090185847, 4.705087795425015], [-7.518941209330436, 4.338288479017308], [-7.71215938966975, 4.364565944837722], [-7.635368211284031, 5.188159084489456], [-7.539715135111763, 5.313345241716519], [-7.570152553731688, 5.707352199725904], [-7.993692592795881, 6.126189683451543], [-8.311347622094019, 6.193033148621083], [-8.60288021486862, 6.46756419517166], [-8.385451626000574, 6.911800645368743], [-8.48544552248535, 7.39520783124307], [-8.439298468448698, 7.686042792181738], [-8.280703497744938, 7.687179673692157], [-8.221792364932199, 8.123328762235573], [-8.299048631208564, 8.316443589710303], [-8.20349890790088, 8.455453192575447], [-7.832100389019188, 8.575704250518626], [-8.07911373537435, 9.376223863152035], [-8.30961646161225, 9.789531968622441], [-8.229337124046822, 10.1290202905639], [-8.029943610048619, 10.206534939001713], [-7.899589809592372, 10.297382106970828], [-7.622759161804809, 10.147236232946796], [-6.850506557635057, 10.138993841996239], [-6.666460944027548, 10.430810655148449], [-6.493965013037268, 10.411302801958271], [-6.205222947606431, 10.524060777219134], [-6.050452032892267, 10.096360785355444], [-5.816926235365287, 10.222554633012194], [-5.404341599946974, 10.370736802609146], [-4.954653286143099, 10.152713934769736], [-4.779883592131966, 9.821984768101743], [-4.330246954760383, 9.610834865757141], [-3.980449184576685, 9.8623440617217], [-3.511898972986273, 9.90032623945622], [-2.827496303712707, 9.642460842319778], [-2.562189500326241, 8.219627793811483], [-2.983584967450327, 7.379704901555513], [-3.244370083011262, 6.250471503113502], [-2.81070146321784, 5.38905121502411], [-2.856125047202397, 4.994475816259509]]]}') WHERE iso_a2 = 'CI';
UPDATE public.countries SET boundary = ST_GeomFromGeoJSON('{"type": "Polygon", "coordinates": [[[13.075822381246752, 2.267097072759015], [12.951333855855609, 2.32161570882694], [12.359380323952221, 2.19281220133945], [11.75166548019979, 2.326757513839993], [11.276449008843713, 2.261050930180872], [9.649158155972628, 2.283866075037736], [9.795195753629457, 3.073404445809117], [9.404366896206, 3.734526882335203], [8.948115675501072, 3.904128933117136], [8.744923943729418, 4.35221527751996], [8.48881554529089, 4.495617377129918], [8.500287713259695, 4.771982937026849], [8.757532993208628, 5.479665839047911], [9.233162876023044, 6.444490668153335], [9.522705926154401, 6.453482367372117], [10.118276808318257, 7.03876963950988], [10.497375115611419, 7.055357774275564], [11.058787876030351, 6.644426784690594], [11.74577436691851, 6.981382961449754], [11.839308709366803, 7.397042344589437], [12.063946160539558, 7.799808457872302], [12.218872104550599, 8.305824082874324], [12.753671502339216, 8.717762762888995], [12.955467970438974, 9.417771714714704], [13.167599724997103, 9.640626328973411], [13.308676385153918, 10.160362046748928], [13.572949659894562, 10.798565985553566], [14.415378859116684, 11.572368882692075], [14.468192172918975, 11.904751695193411], [14.577177768622533, 12.085360826053503], [14.181336297266794, 12.483656927943116], [14.213530714584635, 12.802035427293347], [14.495787387762846, 12.85939626713733], [14.893385857816526, 12.219047756392584], [14.9601518083376, 11.555574042197224], [14.92356489427496, 10.891325181517473], [15.46787275560527, 9.98233673750343], [14.909353875394716, 9.992129421422732], [14.62720055508106, 9.920919297724538], [14.171466098699028, 10.021378282099931], [13.954218377344006, 9.549494940626687], [14.54446658698177, 8.965861314322268], [14.97999555833769, 8.796104234243472], [15.120865512765334, 8.382150173369425], [15.43609174974577, 7.692812404811973], [15.279460483469109, 7.421924546737969], [14.776545444404576, 6.408498033062045], [14.536560092841114, 6.22695872642069], [14.459407179429348, 5.4517605656103], [14.558935988023507, 5.03059764243153], [14.47837243008047, 4.732605495620447], [14.950953403389661, 4.210389309094921], [15.036219516671252, 3.851367295747124], [15.405395948964383, 3.33530060466434], [15.862732374747482, 3.013537298998983], [15.907380812247652, 2.557389431158612], [16.012852410555354, 2.267639675298085], [15.940918816805066, 1.727672634280296], [15.146341993885244, 1.964014797367184], [14.33781253424658, 2.227874660649491], [13.075822381246752, 2.267097072759015]]]}') WHERE iso_a2 = 'CM';
UPDATE public.countries SET boundary = ST_GeomFromGeoJSON('{"type": "Polygon", "coordinates": [[[30.83385989759381, 3.509165961110341], [30.77334679538004, 2.339883327642127], [31.174149204235817, 2.204465236821264], [30.85267011894806, 1.849396470543809], [30.468507521290295, 1.583805446779721], [30.086153598762706, 1.062312730306289], [29.87577884290249, 0.597379868976304], [29.819503208136638, -0.205310153813372], [29.58783776217217, -0.587405694179481], [29.579466180140884, -1.341313164885626], [29.291886834436614, -1.620055840667987], [29.254834832483343, -2.215109958508911], [29.117478875451553, -2.292211195488385], [29.024926385216787, -2.839257907730158], [29.276383904749053, -3.293907159034063], [29.339997592900346, -4.499983412294092], [29.519986606572928, -5.419978936386315], [29.419992710088167, -5.939998874539434], [29.620032179490014, -6.520015150583426], [30.199996779101696, -7.079980970898163], [30.74001549655179, -8.340007419470915], [30.346086053190817, -8.238256524288218], [29.00291222506047, -8.407031752153472], [28.734866570762502, -8.526559340044578], [28.449871046672826, -9.164918308146085], [28.67368167492893, -9.605924981324932], [28.49606977714177, -10.789883721564046], [28.372253045370428, -11.793646742401393], [28.642417433392353, -11.971568698782315], [29.34154788586909, -12.360743910372413], [29.61600141777123, -12.178894545137311], [29.69961388521949, -13.257226657771831], [28.934285922976837, -13.248958428605135], [28.523561639121027, -12.698604424696683], [28.155108676879987, -12.272480564017897], [27.388798862423783, -12.132747491100666], [27.164419793412463, -11.608748467661075], [26.553087599399618, -11.924439792532127], [25.752309604604733, -11.784965101776358], [25.418118116973204, -11.330935967659961], [24.78316979340295, -11.238693536018964], [24.31451622894795, -11.26282642989927], [24.25715538910399, -10.951992689663657], [23.912215203555718, -10.926826267137514], [23.45679080576744, -10.867863457892483], [22.83734541188474, -11.01762175867433], [22.402798292742375, -10.993075453335692], [22.155268182064308, -11.084801120653772], [22.208753289486395, -9.894796237836509], [21.875181919042348, -9.523707777548566], [21.8018013851879, -8.90870655684298], [21.949130893652043, -8.305900974158277], [21.74645592620331, -7.920084730667149], [21.7281107927397, -7.290872491081302], [20.5147481625265, -7.299605808138629], [20.6018229509383, -6.939317722199682], [20.091621534920648, -6.943090101756994], [20.037723016040218, -7.116361179231646], [19.41750247567316, -7.155428562044299], [19.16661339689611, -7.738183688999754], [19.01675174324967, -7.988245944860132], [18.464175652752687, -7.847014255406443], [18.13422163256905, -7.987677504104923], [17.472970004962235, -8.0685511206417], [17.08999596524717, -7.545688978712526], [16.8601908708452, -7.222297865429987], [16.573179965896145, -6.622644545115087], [16.326528354567046, -5.877470391466268], [13.375597364971895, -5.864241224799549], [13.024869419006961, -5.984388929878158], [12.735171339578699, -5.965682061388499], [12.32243167486351, -6.10009246177966], [12.182336866920252, -5.789930515163839], [12.436688266660868, -5.684303887559246], [12.468004184629736, -5.248361504745005], [12.63161176926579, -4.991271254092936], [12.995517205465177, -4.781103203961884], [13.258240187237048, -4.882957452009165], [13.600234816144678, -4.50013844159097], [14.144956088933299, -4.510008640158716], [14.209034864975223, -4.793092136253598], [14.582603794013181, -4.97023894615014], [15.170991652088444, -4.343507175314301], [15.753540073314753, -3.855164890156097], [16.0062895036543, -3.535132744972529], [15.972803175529151, -2.712392266453612], [16.407091912510054, -1.740927015798682], [16.865306837642123, -1.225816338713287], [17.523716261472856, -0.743830254726987], [17.638644646889986, -0.424831638189247], [17.66355268725468, -0.058083998213817], [17.826540154703252, 0.288923244626105], [17.774191928791566, 0.855658677571085], [17.898835483479587, 1.741831976728278], [18.094275750407434, 2.365721543788055], [18.393792351971143, 2.90044342692822], [18.45306521980993, 3.504385891123349], [18.54298221199778, 4.201785183118318], [18.93231245288476, 4.709506130385975], [19.46778364429315, 5.03152781821278], [20.290679152108936, 4.691677761245288], [20.927591180106276, 4.322785549329737], [21.659122755630023, 4.22434194581372], [22.405123732195538, 4.029160061047321], [22.70412356943629, 4.633050848810157], [22.841479526468106, 4.710126247573484], [23.29721398285014, 4.609693101414223], [24.410531040146253, 5.10878408448913], [24.805028924262416, 4.89724660890235], [25.12883344900328, 4.92724477784779], [25.278798455514305, 5.170408229997192], [25.650455356557472, 5.256087754737123], [26.402760857862543, 5.150874538590871], [27.04406538260471, 5.127852688004836], [27.37422610851749, 5.233944403500061], [27.97997724784281, 4.408413397637375], [28.428993768026913, 4.287154649264494], [28.696677687298802, 4.455077215996937], [29.1590784034465, 4.389267279473231], [29.71599531425602, 4.600804755060025], [29.953500197069474, 4.173699042167684], [30.83385989759381, 3.509165961110341]]]}') WHERE iso_a2 = 'CD';
UPDATE public.countries SET boundary = ST_GeomFromGeoJSON('{"type": "Polygon", "coordinates": [[[12.995517205465177, -4.781103203961884], [12.620759718484493, -4.438023369976136], [12.318607618873926, -4.606230157086188], [11.91496300624209, -5.037986748884791], [11.093772820691925, -3.978826592630547], [11.855121697648116, -3.426870619321051], [11.478038771214303, -2.765618991714241], [11.820963575903193, -2.514161472181982], [12.495702752338161, -2.391688327650243], [12.575284458067642, -1.948511244315135], [13.109618767965628, -2.428740329603514], [13.99240726080771, -2.4708049454891], [14.299210239324566, -1.998275648612214], [14.425455763413595, -1.333406670744971], [14.316418491277744, -0.552627455247048], [13.843320753645656, 0.038757635901149], [14.276265903386957, 1.196929836426619], [14.026668735417218, 1.395677395021153], [13.282631463278818, 1.31418366129688], [13.003113641012078, 1.83089630778332], [13.075822381246752, 2.267097072759015], [14.33781253424658, 2.227874660649491], [15.146341993885244, 1.964014797367184], [15.940918816805066, 1.727672634280296], [16.012852410555354, 2.267639675298085], [16.537058139724138, 3.198254706226279], [17.133042433346304, 3.728196519379452], [17.809900343505262, 3.56019643799857], [18.45306521980993, 3.504385891123349], [18.393792351971143, 2.90044342692822], [18.094275750407434, 2.365721543788055], [17.898835483479587, 1.741831976728278], [17.774191928791566, 0.855658677571085], [17.826540154703252, 0.288923244626105], [17.66355268725468, -0.058083998213817], [17.638644646889986, -0.424831638189247], [17.523716261472856, -0.743830254726987], [16.865306837642123, -1.225816338713287], [16.407091912510054, -1.740927015798682], [15.972803175529151, -2.712392266453612], [16.0062895036543, -3.535132744972529], [15.753540073314753, -3.855164890156097], [15.170991652088444, -4.343507175314301], [14.582603794013181, -4.97023894615014], [14.209034864975223, -4.793092136253598], [14.144956088933299, -4.510008640158716], [13.600234816144678, -4.50013844159097], [13.258240187237048, -4.882957452009165], [12.995517205465177, -4.781103203961884]]]}') WHERE iso_a2 = 'CG';
UPDATE public.countries SET boundary = ST_GeomFromGeoJSON('{"type": "Polygon", "coordinates": [[[-75.37322323271385, -0.15203175212045], [-75.8014658271166, 0.084801337073202], [-76.29231441924097, 0.416047268064119], [-76.5763797675494, 0.256935533037435], [-77.4249843004304, 0.395686753741117], [-77.66861284047044, 0.825893052570962], [-77.85506140817952, 0.809925034992773], [-78.85525875518871, 1.380923773601822], [-78.99093522817104, 1.691369940595251], [-78.61783138702371, 1.766404120283056], [-78.66211808949785, 2.267355454920477], [-78.42761043975733, 2.629555568854215], [-77.93154252797149, 2.696605739752926], [-77.51043128122501, 3.325016994638247], [-77.12768978545526, 3.849636135265357], [-77.49627193877703, 4.087606105969428], [-77.3076012844794, 4.667984117039452], [-77.53322058786573, 5.582811997902497], [-77.31881507028675, 5.84535411216136], [-77.47666073272228, 6.691116441266303], [-77.88157141794525, 7.223771267114785], [-77.7534138658614, 7.709839789252143], [-77.43110795765699, 7.638061224798734], [-77.24256649444008, 7.935278225125444], [-77.47472286651133, 8.524286200388218], [-77.35336076527386, 8.67050466555807], [-76.83667395700357, 8.638749497914716], [-76.08638383655786, 9.336820583529487], [-75.67460018584006, 9.443248195834599], [-75.66470414905618, 9.774003200718738], [-75.48042599150335, 10.618990383339309], [-74.90689510771199, 11.083044745320322], [-74.27675269234489, 11.102035834187587], [-74.1972226630477, 11.310472723836867], [-73.41476396350029, 11.22701528568548], [-72.62783525255963, 11.731971543825523], [-72.23819495307892, 11.955549628136326], [-71.75409013536864, 12.437303168177309], [-71.3998223537917, 12.376040757695293], [-71.13746110704588, 12.112981879113505], [-71.3315836249503, 11.776284084515808], [-71.97392167833829, 11.60867157637712], [-72.22757544624294, 11.10870209395324], [-72.61465776232521, 10.821975409381778], [-72.9052860175347, 10.450344346554772], [-73.02760413276957, 9.736770331252444], [-73.30495154488005, 9.151999823437606], [-72.7887298245004, 9.085027167187334], [-72.6604947577681, 8.625287787302682], [-72.43986223009796, 8.405275376820029], [-72.36090064155597, 8.002638454617895], [-72.47967892117885, 7.632506008327354], [-72.44448727078807, 7.423784898300482], [-72.19835242378188, 7.340430813013683], [-71.96017574734864, 6.991614895043539], [-70.67423356798152, 7.087784735538719], [-70.09331295437242, 6.96037649172311], [-69.38947994655712, 6.099860541198836], [-68.98531856960236, 6.206804917826858], [-68.26505245631823, 6.153268133972475], [-67.69508724635502, 6.267318020040647], [-67.34143958196557, 6.095468044454023], [-67.52153194850275, 5.556870428891969], [-67.74469662135522, 5.221128648291668], [-67.82301225449355, 4.503937282728899], [-67.62183590358129, 3.839481716319995], [-67.33756384954368, 3.542342230641722], [-67.30317318385345, 3.31845408773718], [-67.8099381171237, 2.820655015469569], [-67.44709204778631, 2.600280869960869], [-67.18129431829307, 2.250638129074062], [-66.87632585312258, 1.253360500489336], [-67.0650481838525, 1.130112209473225], [-67.2599975246736, 1.719998684084956], [-67.5378100246747, 2.03716278727633], [-67.86856502955884, 1.692455145673392], [-69.81697323269162, 1.714805202639624], [-69.80459672715773, 1.089081122233466], [-69.21863766140018, 0.985676581217433], [-69.25243404811906, 0.602650865070075], [-69.45239600287246, 0.706158758950693], [-70.01556576198931, 0.541414292804205], [-70.02065589057005, -0.185156345219539], [-69.5770653957766, -0.549991957200163], [-69.42048580593223, -1.122618503426409], [-69.44410193548961, -1.556287123219818], [-69.89363521999663, -4.298186944194327], [-70.39404395209499, -3.766591485207825], [-70.69268205430971, -3.742872002785859], [-70.04770850287485, -2.725156345229699], [-70.81347571479196, -2.256864515800743], [-71.41364579942979, -2.342802422702128], [-71.7747607082854, -2.169789727388938], [-72.32578650581365, -2.434218031426454], [-73.07039221870724, -2.308954359550953], [-73.6595035468346, -1.260491224781134], [-74.12239518908906, -1.002832533373848], [-74.44160051135597, -0.530820000819887], [-75.10662451852008, -0.05720549886486], [-75.37322323271385, -0.15203175212045]]]}') WHERE iso_a2 = 'CO';
UPDATE public.countries SET boundary = ST_GeomFromGeoJSON('{"type": "Polygon", "coordinates": [[[-82.96578304719736, 8.225027980985985], [-83.50843726269431, 8.446926581247283], [-83.71147396516908, 8.656836249216866], [-83.59631303580665, 8.830443223501419], [-83.63264156770784, 9.051385809765321], [-83.90988562695374, 9.29080272057358], [-84.30340165885636, 9.487354030795714], [-84.64764421256866, 9.61553742109571], [-84.71335079622777, 9.908051866083852], [-84.97566036654133, 10.086723130733006], [-84.91137488477024, 9.795991522658923], [-85.11092342806532, 9.55703969974131], [-85.33948828809227, 9.83454214114866], [-85.66078650586698, 9.933347479690724], [-85.79744483106285, 10.134885565629034], [-85.79170874707843, 10.439337266476613], [-85.65931372754667, 10.75433095951172], [-85.94172543002176, 10.895278428587801], [-85.7125404528073, 11.088444932494824], [-85.5618519762442, 11.217119248901597], [-84.90300330273895, 10.952303371621896], [-84.67306901725627, 11.082657172078143], [-84.35593075228104, 10.999225572142905], [-84.19017859570485, 10.793450018756674], [-83.89505449088595, 10.726839097532446], [-83.65561174186158, 10.938764146361422], [-83.40231970898296, 10.395438137244653], [-83.01567664257517, 9.992982082555557], [-82.54619625520348, 9.566134751824677], [-82.93289099804358, 9.476812038608173], [-82.92715491405916, 9.074330145702916], [-82.71918311230053, 8.925708726431495], [-82.86865719270477, 8.807266343618522], [-82.82977067740516, 8.62629547773237], [-82.91317643912421, 8.42351715741907], [-82.96578304719736, 8.225027980985985]]]}') WHERE iso_a2 = 'CR';
UPDATE public.countries SET boundary = ST_GeomFromGeoJSON('{"type": "Polygon", "coordinates": [[[-82.26815121125706, 23.188610744717707], [-81.40445716014683, 23.117271429938782], [-80.6187686835812, 23.105980129483], [-79.67952368846025, 22.76530324959883], [-79.28148596873208, 22.399201565027056], [-78.34743445505649, 22.512166246017088], [-77.99329586456028, 22.277193508385935], [-77.14642249216105, 21.657851467367834], [-76.52382483590856, 21.206819566324373], [-76.19462012399319, 21.220565497314013], [-75.59822241891267, 21.016624457274133], [-75.67106035022806, 20.735091254148003], [-74.9338960435845, 20.693905137611385], [-74.17802486845126, 20.28462779385974], [-74.29664811877726, 20.05037852628068], [-74.96159461129294, 19.92343537035569], [-75.63468014189459, 19.873774318923196], [-76.323656175426, 19.95289093676206], [-77.75548092315307, 19.855480861891877], [-77.08510840524674, 20.413353786698792], [-77.49265458851661, 20.673105373613893], [-78.13729224314159, 20.739948838783434], [-78.48282670766119, 21.02861338956585], [-78.71986650258401, 21.598113511638434], [-79.28499996612794, 21.5591753199065], [-80.21747534861865, 21.827324327069036], [-80.51753455272141, 22.03707896574176], [-81.82094336620318, 22.19205658618507], [-82.16999182811864, 22.387109279870753], [-81.79500179719267, 22.636964830001958], [-82.77589799674085, 22.688150336187064], [-83.49445878775936, 22.16851797127613], [-83.90880042187563, 22.154565334557333], [-84.05215084505326, 21.910575059491254], [-84.54703019889638, 21.801227728761646], [-84.97491105827311, 21.89602814380109], [-84.44706214062776, 22.204949856041907], [-84.23035702181178, 22.565754706303764], [-83.7782399156902, 22.788118394455694], [-83.26754757356575, 22.983041897060644], [-82.51043616405751, 23.078746649665188], [-82.26815121125706, 23.188610744717707]]]}') WHERE iso_a2 = 'CU';
UPDATE public.countries SET boundary = ST_GeomFromGeoJSON('{"type": "Polygon", "coordinates": [[[33.97361657078346, 35.058506374648005], [34.00488081232004, 34.97809784600186], [32.97982710137845, 34.57186941175544], [32.49029625827754, 34.701654771456475], [32.25666710788596, 35.10323232679663], [32.73178022637745, 35.14002594658844], [32.919572381326134, 35.08783274997364], [33.19097700372305, 35.17312470147138], [33.3838334490363, 35.16271190036457], [33.45592207208347, 35.10142365166641], [33.47581749851585, 35.000344550103506], [33.5256852556775, 35.03868846286407], [33.675391880027064, 35.01786286065045], [33.86643965021011, 35.09359467217419], [33.97361657078346, 35.058506374648005]]]}') WHERE iso_a2 = 'CY';
UPDATE public.countries SET boundary = ST_GeomFromGeoJSON('{"type": "Polygon", "coordinates": [[[16.960288120194576, 48.5969823268506], [16.499282667718774, 48.78580801044511], [16.02964725105022, 48.73389903420793], [15.253415561593982, 49.03907420510758], [14.901447381254057, 48.964401760445824], [14.338897739324722, 48.55530528420721], [13.595945672264437, 48.87717194273715], [13.031328973043431, 49.30706818297324], [12.521024204161193, 49.547415269562734], [12.415190870827445, 49.96912079528057], [12.240111118222558, 50.266337795607285], [12.966836785543194, 50.484076443069085], [13.338131951560285, 50.73323436136435], [14.056227654688172, 50.9269176295943], [14.307013380600637, 51.117267767941414], [14.570718214586066, 51.002339382524276], [15.01699588385867, 51.10667409932158], [15.490972120839729, 50.78472992614321], [16.23862674323857, 50.69773265237984], [16.176253289462267, 50.42260732685791], [16.719475945714436, 50.21574656839354], [16.86876915860566, 50.47397370055603], [17.55456709155112, 50.36214590107642], [17.64944502123899, 50.049038397819956], [18.392913852622172, 49.98862864847075], [18.853144158613617, 49.49622976337764], [18.554971144289482, 49.495015367218784], [18.399993523846177, 49.31500051533004], [18.170498488037964, 49.271514797556435], [18.104972771891852, 49.04398346617531], [17.913511590250465, 48.996492824899086], [17.88648481616181, 48.90347524677371], [17.545006951577108, 48.80001902932537], [17.101984897538898, 48.816968899117114], [16.960288120194576, 48.5969823268506]]]}') WHERE iso_a2 = 'CZ';
UPDATE public.countries SET boundary = ST_GeomFromGeoJSON('{"type": "Polygon", "coordinates": [[[9.921906365609232, 54.98310415304803], [9.9395797054529, 54.596641954153256], [10.950112338920519, 54.363607082733154], [10.93946699386845, 54.00869334575259], [11.956252475643282, 54.19648550070116], [12.518440382546714, 54.470370591847995], [13.647467075259499, 54.0755109727059], [14.119686313542559, 53.75702912049104], [14.353315463934166, 53.248171291713106], [14.074521111719434, 52.98126251892535], [14.437599725002201, 52.624850165408304], [14.685026482815715, 52.089947414755216], [14.607098422919648, 51.74518809671997], [15.016995883858783, 51.10667409932171], [14.570718214586122, 51.00233938252438], [14.307013380600665, 51.11726776794137], [14.056227654688314, 50.92691762959436], [13.338131951560399, 50.73323436136428], [12.96683678554325, 50.48407644306917], [12.240111118222671, 50.26633779560723], [12.415190870827473, 49.96912079528062], [12.521024204161336, 49.54741526956275], [13.031328973043514, 49.30706818297324], [13.595945672264577, 48.877171942737164], [13.243357374737116, 48.41611481382904], [12.884102817443875, 48.28914581968786], [13.025851271220517, 47.63758352313596], [12.932626987366064, 47.467645575544], [12.620759718484521, 47.672387600284424], [12.141357456112871, 47.70308340106578], [11.426414015354851, 47.52376618101306], [10.544504021861599, 47.5663992376538], [10.402083774465325, 47.30248769793917], [9.89606814946319, 47.580196845075704], [9.594226108446378, 47.5250580918202], [8.522611932009795, 47.83082754169135], [8.317301466514095, 47.61357982033627], [7.466759067422288, 47.62058197691192], [7.593676385131062, 48.33301911070373], [8.099278598674857, 49.01778351500343], [6.65822960778371, 49.20195831969164], [6.186320428094177, 49.463802802114515], [6.242751092156993, 49.90222565367873], [6.043073357781111, 50.128051662794235], [6.15665815595878, 50.80372101501058], [5.988658074577813, 51.851615709025054], [6.589396599970826, 51.852029120483394], [6.842869500362383, 52.22844025329755], [7.092053256873896, 53.144043280644894], [6.905139601274129, 53.48216217713065], [7.100424838905269, 53.69393219666267], [7.936239454793963, 53.74829580343379], [8.121706170289485, 53.52779246684429], [8.800734490604668, 54.020785630908904], [8.57211795414537, 54.39564647075406], [8.526229282270208, 54.96274363872516], [9.282048780971138, 54.83086538351631], [9.921906365609232, 54.98310415304803]]]}') WHERE iso_a2 = 'DE';
UPDATE public.countries SET boundary = ST_GeomFromGeoJSON('{"type": "Polygon", "coordinates": [[[43.08122602720016, 12.699638576707116], [43.31785241066467, 12.390148423711025], [43.286381463398925, 11.974928290245884], [42.715873650896526, 11.735640570518342], [43.14530480324214, 11.462039699748857], [42.77685184100096, 10.92687856693442], [42.55493000000013, 11.105110000000195], [42.31414000000012, 11.0342], [41.755570000000205, 11.050910000000101], [41.73959000000019, 11.355110000000138], [41.66176000000013, 11.6312], [42.000000000000114, 12.100000000000136], [42.35156000000012, 12.542230000000131], [42.77964236834475, 12.455415757695675], [43.08122602720016, 12.699638576707116]]]}') WHERE iso_a2 = 'DJ';
UPDATE public.countries SET boundary = ST_GeomFromGeoJSON('{"type": "MultiPolygon", "coordinates": [[[[12.690006137755631, 55.609990953180784], [12.089991082414741, 54.80001455343793], [11.043543328504228, 55.364863796604254], [10.903913608451631, 55.77995473898875], [12.370904168353292, 56.111407375708836], [12.690006137755631, 55.609990953180784]]], [[[10.912181837618363, 56.458621324277914], [10.667803989309988, 56.08138336854722], [10.369992710011985, 56.19000722922473], [9.649984978889307, 55.469999498102055], [9.921906365609175, 54.98310415304806], [9.282048780971138, 54.83086538351617], [8.526229282270236, 54.96274363872499], [8.12031090661759, 55.517722683323626], [8.08997684086225, 56.5400117051376], [8.256581658571264, 56.8099693874303], [8.543437534223386, 57.110002753316905], [9.42446902836761, 57.17206614849948], [9.775558709358563, 57.44794078228966], [10.580005730846153, 57.73001658795485], [10.546105991262692, 57.215732733786155], [10.250000034230226, 56.89001618105047], [10.369992710011985, 56.609981594460834], [10.912181837618363, 56.458621324277914]]]]}') WHERE iso_a2 = 'DK';
UPDATE public.countries SET boundary = ST_GeomFromGeoJSON('{"type": "Polygon", "coordinates": [[[-71.71236141629296, 19.714455878167357], [-71.58730445014663, 19.8849105900821], [-70.80670610216174, 19.880285549391985], [-70.21436499701613, 19.62288524014616], [-69.95081519232758, 19.64799998624001], [-69.76925004747008, 19.29326711677244], [-69.22212582057988, 19.313214219637103], [-69.25434607611385, 19.015196234609874], [-68.80941199408083, 18.979074408437853], [-68.31794328476897, 18.612197577381693], [-68.68931596543452, 18.205142320218613], [-69.16494584824892, 18.42264842373511], [-69.62398759629764, 18.38071299893025], [-69.95293392605154, 18.42830699307106], [-70.1332329983179, 18.245915025296895], [-70.51713721381422, 18.184290879788833], [-70.66929846869763, 18.426885891183034], [-70.99995012071719, 18.283328762276213], [-71.4002099270339, 17.5985643579766], [-71.65766191271202, 17.7575727401387], [-71.70830481635805, 18.044997056546094], [-71.68773759630588, 18.31666006110447], [-71.94511206733556, 18.61690013272026], [-71.7013026597825, 18.785416978424053], [-71.62487321642283, 19.169837958243306], [-71.71236141629296, 19.714455878167357]]]}') WHERE iso_a2 = 'DO';
UPDATE public.countries SET boundary = ST_GeomFromGeoJSON('{"type": "Polygon", "coordinates": [[[11.999505649471613, 23.47166840259645], [8.572893100629784, 21.565660712159143], [5.677565952180686, 19.601206976799716], [4.267419467800039, 19.155265204337], [3.158133172222705, 19.057364203360038], [3.1466610042539, 19.693578599521445], [2.683588494486429, 19.856230170160117], [2.06099083823392, 20.142233384679486], [1.823227573259032, 20.610809434486043], [-1.550054897457613, 22.792665920497384], [-4.923337368174231, 24.974574082941], [-8.684399786809053, 27.395744126896005], [-8.665124477564191, 27.589479071558227], [-8.665589565454809, 27.656425889592356], [-8.674116176782974, 28.84128896739658], [-7.059227667661929, 29.57922842052453], [-6.060632290053774, 29.731699734001694], [-5.242129278982787, 30.00044302013559], [-4.859646165374471, 30.501187649043846], [-3.690441046554696, 30.896951605751156], [-3.647497931320146, 31.637294012980675], [-3.068980271812648, 31.724497992473218], [-2.616604783529567, 32.09434621838615], [-1.30789913573787, 32.2628889023061], [-1.124551153966308, 32.65152151135713], [-1.388049282222568, 32.86401500094131], [-1.733454555661467, 33.919712836231994], [-1.792985805661687, 34.527918606091205], [-2.169913702798624, 35.16839630791668], [-1.208602871089056, 35.7148487411871], [-0.127454392894606, 35.888662421200806], [0.503876580415209, 36.30127289483528], [1.466918572606545, 36.605647081034405], [3.161698846050825, 36.78390493422522], [4.81575809084913, 36.86503693292346], [5.320120070017794, 36.71651886651662], [6.261819695672613, 37.11065501560674], [7.330384962603971, 37.11838064223437], [7.737078484741005, 36.885707505840216], [8.420964389691676, 36.94642731378316], [8.217824334352315, 36.433176988260286], [8.376367628623768, 35.479876003555944], [8.140981479534304, 34.65514598239379], [7.524481642292244, 34.09737641045146], [7.612641635782182, 33.34411489514896], [8.430472853233368, 32.74833730725595], [8.439102817426118, 32.50628489840082], [9.05560265466815, 32.10269196220129], [9.482139926805274, 30.307556057246188], [9.805634392952413, 29.42463837332339], [9.859997999723447, 28.959989732371014], [9.683884718472768, 28.1441738957792], [9.756128370816782, 27.68825857188415], [9.629056023811074, 27.14095347748092], [9.716285841519749, 26.512206325785698], [9.319410841518163, 26.094324856057455], [9.910692579801776, 25.36545461679674], [9.94826134607797, 24.936953640232517], [10.303846876678362, 24.379313259370917], [10.771363559622927, 24.56253205006175], [11.560669386449005, 24.097909247325518], [11.999505649471613, 23.47166840259645]]]}') WHERE iso_a2 = 'DZ';
UPDATE public.countries SET boundary = ST_GeomFromGeoJSON('{"type": "Polygon", "coordinates": [[[-80.30256059438722, -3.404856459164713], [-79.77029334178093, -2.65751189535964], [-79.98655921092242, -2.220794366061014], [-80.36878394236925, -2.685158786635788], [-80.96776546906436, -2.246942640800704], [-80.76480628123804, -1.965047702648533], [-80.93365902375172, -1.057454522306358], [-80.58337032746127, -0.906662692878683], [-80.39932471385376, -0.283703301600141], [-80.02089820018037, 0.360340074053468], [-80.09060970734211, 0.768428859862397], [-79.5427620103998, 0.982937730305963], [-78.85525875518871, 1.380923773601822], [-77.85506140817952, 0.809925034992773], [-77.66861284047044, 0.825893052570962], [-77.4249843004304, 0.395686753741117], [-76.5763797675494, 0.256935533037435], [-76.29231441924097, 0.416047268064119], [-75.8014658271166, 0.084801337073202], [-75.37322323271385, -0.15203175212045], [-75.23372270374195, -0.911416924649529], [-75.54499569365204, -1.56160979574588], [-76.63539425322672, -2.608677666843818], [-77.83790483265861, -3.003020521663103], [-78.45068396677564, -3.873096612161376], [-78.63989722361234, -4.547784112164074], [-79.20528906931773, -4.959128513207389], [-79.62497921417618, -4.454198093283495], [-80.02890804718561, -4.346090996928893], [-80.44224199087216, -4.425724379090674], [-80.46929460317695, -4.059286797708999], [-80.18401485870967, -3.821161797708044], [-80.30256059438722, -3.404856459164713]]]}') WHERE iso_a2 = 'EC';
UPDATE public.countries SET boundary = ST_GeomFromGeoJSON('{"type": "Polygon", "coordinates": [[[34.9226, 29.50133], [34.64174, 29.09942], [34.42655, 28.34399], [34.15451, 27.8233], [33.92136, 27.6487], [33.58811, 27.97136], [33.13676, 28.41765], [32.42323, 29.85108], [32.32046, 29.76043], [32.73482, 28.70523], [33.34876, 27.69989], [34.10455, 26.14227], [34.47387, 25.59856], [34.79507, 25.03375], [35.69241, 23.92671], [35.49372, 23.75237], [35.52598, 23.10244], [36.69069, 22.20485], [36.86623, 22], [32.9, 22], [29.02, 22], [25, 22], [25, 25.682499996361], [25, 29.23865452953346], [24.70007, 30.04419], [24.95762, 30.6616], [24.80287, 31.08929], [25.16482, 31.56915], [26.49533, 31.58568], [27.45762, 31.32126], [28.45048, 31.02577], [28.91353, 30.87005], [29.68342, 31.18686], [30.09503, 31.4734], [30.97693, 31.55586], [31.68796, 31.4296], [31.96041, 30.9336], [32.19247, 31.26034], [32.99392, 31.02407], [33.7734, 30.96746], [34.26544, 31.21936], [34.9226, 29.50133]]]}') WHERE iso_a2 = 'EG';
UPDATE public.countries SET boundary = ST_GeomFromGeoJSON('{"type": "Polygon", "coordinates": [[[42.35156000000012, 12.542230000000131], [42.00975, 12.86582], [41.59856, 13.452090000000112], [41.15519371924984, 13.773319810435225], [40.8966, 14.118640000000141], [40.026218702969175, 14.519579169162284], [39.34061, 14.53155], [39.0994, 14.74064], [38.51295, 14.50547], [37.90607000000011, 14.959430000000168], [37.59377, 14.2131], [36.42951, 14.42211], [36.32318891779812, 14.822480577041063], [36.75386030451858, 16.291874091044292], [36.852530000000115, 16.95655], [37.16747, 17.263140000000135], [37.90400000000011, 17.42754], [38.410089959473225, 17.998307399970315], [38.990622999840014, 16.840626125551694], [39.26611006038803, 15.92272349696725], [39.814293654140215, 15.435647284400318], [41.17927493669765, 14.491079616753211], [41.73495161313235, 13.921036892141558], [42.27683068214486, 13.343992010954423], [42.58957645037526, 13.000421250861905], [43.08122602720016, 12.699638576707116], [42.77964236834475, 12.455415757695675], [42.35156000000012, 12.542230000000131]]]}') WHERE iso_a2 = 'ER';
UPDATE public.countries SET boundary = ST_GeomFromGeoJSON('{"type": "Polygon", "coordinates": [[[-9.034817674180246, 41.880570583659676], [-8.984433152695672, 42.59277517350627], [-9.392883673530648, 43.0266246608127], [-7.97818966310831, 43.74833771420099], [-6.754491746436756, 43.567909450853925], [-5.411886359061597, 43.57423981380968], [-4.347842779955783, 43.40344920508504], [-3.517531704106091, 43.4559007838613], [-1.901351284177764, 43.42280202897834], [-1.502770961910528, 43.03401439063043], [0.338046909190581, 42.57954600683955], [0.701590610363894, 42.795734361332606], [1.826793247087153, 42.34338471126569], [2.985998976258458, 42.47301504166986], [3.039484083680549, 41.892120266276905], [2.091841668312185, 41.226088568683096], [0.810524529635188, 41.01473196060934], [0.721331007499401, 40.678318386389236], [0.106691521819869, 40.12393362076202], [-0.278711310212941, 39.30997813573272], [0.111290724293838, 38.73851430923304], [-0.467123582349103, 38.29236583104115], [-0.683389451490598, 37.642353827457825], [-1.438382127274849, 37.44306366632422], [-2.146452602538119, 36.67414419203729], [-3.415780808923387, 36.65889964451118], [-4.368900926114719, 36.677839056946155], [-4.995219285492212, 36.32470815687964], [-5.377159796561457, 35.946850083961465], [-5.866432257500904, 36.02981659600606], [-6.236693894872175, 36.367677110330334], [-6.520190802425404, 36.94291331638732], [-7.453725551778092, 37.09778758396607], [-7.537105475281024, 37.42890432387624], [-7.166507941099865, 37.803894354802225], [-7.029281175148796, 38.07576406508977], [-7.374092169616318, 38.37305858006492], [-7.098036668313128, 39.03007274022379], [-7.498632371439726, 39.62957103124181], [-7.066591559263529, 39.711891587882775], [-7.026413133156595, 40.184524237624245], [-6.864019944679385, 40.33087189387483], [-6.851126674822552, 41.11108266861753], [-6.389087693700915, 41.381815497394655], [-6.668605515967656, 41.883386949219584], [-7.251308966490824, 41.91834605566505], [-7.422512986673795, 41.79207469335984], [-8.013174607769912, 41.790886135417125], [-8.263856980817792, 42.28046865495034], [-8.67194576662672, 42.13468943945496], [-9.034817674180246, 41.880570583659676]]]}') WHERE iso_a2 = 'ES';
UPDATE public.countries SET boundary = ST_GeomFromGeoJSON('{"type": "Polygon", "coordinates": [[[24.312862583114622, 57.79342357037697], [24.42892785004216, 58.38341339785329], [24.061198357853186, 58.25737457949341], [23.426560092876684, 58.612753404364625], [23.339795363058645, 59.187240302153384], [24.604214308376186, 59.46585378685502], [25.86418908051664, 59.61109039981133], [26.949135776484525, 59.445803331125774], [27.981114129353244, 59.475388088612874], [28.13169925305175, 59.300825100330925], [27.420166456824944, 58.72458120384424], [27.71668582531572, 57.79189911562436], [27.288184848751513, 57.47452830670383], [26.463532342237787, 57.47638865826633], [25.60280968598437, 57.84752879498657], [25.16459354014927, 57.97015696881519], [24.312862583114622, 57.79342357037697]]]}') WHERE iso_a2 = 'EE';
UPDATE public.countries SET boundary = ST_GeomFromGeoJSON('{"type": "Polygon", "coordinates": [[[37.90607000000011, 14.959430000000168], [38.51295, 14.50547], [39.0994, 14.74064], [39.34061, 14.53155], [40.02625000000012, 14.51959], [40.8966, 14.118640000000141], [41.1552, 13.77333], [41.59856, 13.452090000000112], [42.00975, 12.86582], [42.35156000000012, 12.542230000000131], [42.000000000000114, 12.100000000000136], [41.66176000000013, 11.6312], [41.73959000000019, 11.355110000000138], [41.755570000000205, 11.050910000000101], [42.31414000000012, 11.0342], [42.55493000000013, 11.105110000000195], [42.77685184100096, 10.92687856693442], [42.55876, 10.57258000000013], [42.92812, 10.021940000000143], [43.29699000000011, 9.540480000000173], [43.67875, 9.18358000000012], [46.94834, 7.99688], [47.78942, 8.003], [44.9636, 5.001620000000116], [43.66087, 4.95755], [42.76967000000013, 4.252590000000225], [42.12861, 4.234130000000164], [41.85508309264412, 3.918911920483765], [41.17180000000013, 3.91909], [40.768480000000125, 4.257020000000125], [39.85494000000011, 3.838790000000131], [39.55938425876593, 3.422060000000215], [38.89251, 3.50074], [38.67114, 3.61607], [38.436970000000144, 3.58851], [38.12091500000014, 3.598605], [36.85509323800824, 4.447864127672858], [36.15907863285565, 4.447864127672858], [35.81744766235363, 4.776965663462022], [35.81744766235363, 5.338232082790853], [35.2980071182331, 5.506], [34.70702, 6.594220000000121], [34.25032, 6.82607], [34.07510000000019, 7.22595], [33.568290000000104, 7.71334], [32.954180000000235, 7.784970000000101], [33.29480000000012, 8.35458], [33.82550000000015, 8.37916], [33.97498, 8.684560000000147], [33.96162, 9.58358], [34.25745, 10.63009], [34.73115000000013, 10.910170000000107], [34.83163000000013, 11.318960000000118], [35.26049, 12.08286], [35.86363000000017, 12.57828], [36.27022, 13.563330000000121], [36.42951, 14.42211], [37.59377, 14.2131], [37.90607000000011, 14.959430000000168]]]}') WHERE iso_a2 = 'ET';
UPDATE public.countries SET boundary = ST_GeomFromGeoJSON('{"type": "Polygon", "coordinates": [[[28.591929559043194, 69.06477692328666], [28.445943637818658, 68.36461294216404], [29.97742638522061, 67.69829702419266], [29.054588657352326, 66.94428620062193], [30.21765, 65.80598], [29.54442955904699, 64.94867157659048], [30.44468468600371, 64.20445343693909], [30.035872430142717, 63.55281362573855], [31.516092156711125, 62.86768748641289], [31.139991082490894, 62.35769277612441], [30.21110721204445, 61.780027777749694], [28.069997592895277, 60.50351654727584], [26.255172967236973, 60.4239606797625], [24.496623976344523, 60.05731639265166], [22.869694858499457, 59.846373196036225], [22.290763787533592, 60.39192129174154], [21.322244093519316, 60.720169989659524], [21.544866163832694, 61.70532949487179], [21.05921105315369, 62.60739329695874], [21.536029493910803, 63.18973501245587], [22.442744174903993, 63.81781037053129], [24.730511508897536, 64.90234365504084], [25.398067661243942, 65.11142650009374], [25.294043003040404, 65.53434642197045], [23.903378533633802, 66.00692739527962], [23.565879754335583, 66.39605093043743], [23.53947309743444, 67.93600861273525], [21.978534783626117, 68.6168456081807], [20.645592889089528, 69.10624726020087], [21.244936150810673, 69.37044302029308], [22.356237827247412, 68.84174144151491], [23.66204959483076, 68.89124746365054], [24.735679152126725, 68.64955678982146], [25.689212680776365, 69.09211375596904], [26.179622023226244, 69.82529897732614], [27.732292107867863, 70.16419302029625], [29.015572950971972, 69.76649119737799], [28.591929559043194, 69.06477692328666]]]}') WHERE iso_a2 = 'FI';
UPDATE public.countries SET boundary = ST_GeomFromGeoJSON('{"type": "MultiPolygon", "coordinates": [[[[178.3736, -17.33992], [178.71806, -17.62846], [178.55271, -18.15059], [177.93266, -18.28799], [177.38146, -18.16432], [177.28504, -17.72465], [177.67087000000012, -17.38114], [178.12557, -17.50481], [178.3736, -17.33992]]], [[[179.36414266196428, -16.80135407694685], [178.7250593629971, -17.01204167436802], [178.59683859511708, -16.63915], [179.09660936299716, -16.433984277547424], [179.41350936299713, -16.379054277547397], [180.00000000000014, -16.06713266364244], [180.00000000000014, -16.55521656663916], [179.36414266196428, -16.80135407694685]]], [[[-179.91736938476527, -16.50178313564936], [-180, -16.55521656663916], [-180, -16.06713266364244], [-179.7933201090486, -16.02088225674123], [-179.91736938476527, -16.50178313564936]]]]}') WHERE iso_a2 = 'FJ';
UPDATE public.countries SET boundary = ST_GeomFromGeoJSON('{"type": "Polygon", "coordinates": [[[-61.2, -51.85], [-60, -51.25], [-59.15, -51.5], [-58.55, -51.1], [-57.75, -51.55], [-58.05, -51.9], [-59.4, -52.2], [-59.85, -51.85], [-60.7, -52.3], [-61.2, -51.85]]]}') WHERE iso_a2 = 'FK';
UPDATE public.countries SET boundary = ST_GeomFromGeoJSON('{"type": "MultiPolygon", "coordinates": [[[[-52.55642473001839, 2.504705308437053], [-52.93965715189498, 2.124857692875622], [-53.418465135295264, 2.053389187016037], [-53.554839240113495, 2.334896551925965], [-53.778520677288896, 2.376702785650053], [-54.08806250671728, 2.105556545414629], [-54.52475419779975, 2.311848863123785], [-54.27122962097579, 2.738747870286943], [-54.18428402364475, 3.194172268075235], [-54.01150387227682, 3.622569891774859], [-54.399542202356514, 4.212611395683481], [-54.47863298197922, 4.896755682795643], [-53.95804460307093, 5.756548163267809], [-53.618452928264844, 5.646529038918402], [-52.88214128275408, 5.409850979021599], [-51.82334286152593, 4.565768133966145], [-51.65779741067888, 4.156232408053029], [-52.249337531123984, 3.241094468596287], [-52.55642473001839, 2.504705308437053]]], [[[9.560016310269134, 42.15249197037957], [9.229752231491773, 41.38000682226445], [8.775723097375362, 41.58361196549444], [8.54421268070783, 42.256516628583086], [8.746009148807588, 42.62812185319396], [9.390000848028905, 43.00998484961474], [9.560016310269134, 42.15249197037957]]], [[[3.588184441755715, 50.37899241800358], [4.286022983425141, 49.907496649772554], [4.799221632515753, 49.98537303323633], [5.674051954784886, 49.52948354755745], [5.897759230176376, 49.44266714130717], [6.186320428094206, 49.46380280211446], [6.658229607783539, 49.201958319691556], [8.099278598674772, 49.01778351500337], [7.593676385131062, 48.33301911070373], [7.466759067422231, 47.620581976911865], [7.192202182655535, 47.44976552997099], [6.736571079138088, 47.54180125588289], [6.768713820023635, 47.28770823830368], [6.037388950228973, 46.72577871356191], [6.022609490593567, 46.272989813820516], [6.500099724970454, 46.42967275652944], [6.843592970414562, 45.99114655210067], [6.802355177445662, 45.70857982032868], [7.096652459347837, 45.333098863295874], [6.749955275101712, 45.02851797136759], [7.007562290076663, 44.25476675066139], [7.549596388386163, 44.12790110938482], [7.435184767291844, 43.69384491634918], [6.529245232783069, 43.12889232031836], [4.556962517931396, 43.39965098731159], [3.10041059735272, 43.075200507167125], [2.985998976258486, 42.473015041669896], [1.826793247087181, 42.34338471126566], [0.701590610363922, 42.79573436133265], [0.338046909190581, 42.579546006839564], [-1.502770961910471, 43.03401439063049], [-1.901351284177736, 43.42280202897834], [-1.384225226232957, 44.02261037859017], [-1.193797573237362, 46.014917710954876], [-2.225724249673789, 47.06436269793821], [-2.963276129559574, 47.570326646507965], [-4.491554938159481, 47.95495433205642], [-4.592349819344747, 48.68416046812695], [-3.295813971357745, 48.901692409859635], [-1.616510789384932, 48.644421291694584], [-1.933494025063254, 49.77634186461577], [-0.98946895995536, 49.347375800160876], [1.338761020522753, 50.12717316344526], [1.6390010921385, 50.946606350297515], [2.513573032246171, 51.14850617126186], [2.658422071960331, 50.79684804951566], [3.123251580425716, 50.78036326761452], [3.588184441755715, 50.37899241800358]]]]}') WHERE iso_a2 = 'FR';
UPDATE public.countries SET boundary = ST_GeomFromGeoJSON('{"type": "Polygon", "coordinates": [[[11.093772820691925, -3.978826592630547], [10.06613528813574, -2.969482517105682], [9.40524539555497, -2.144313246269043], [8.79799563969317, -1.111301364754496], [8.830086704146424, -0.779073581550037], [9.048419630579588, -0.459351494960217], [9.29135053878369, 0.268666083167687], [9.492888624721985, 1.010119533691494], [9.830284051155644, 1.067893784993799], [11.285078973036462, 1.057661851400013], [11.276449008843713, 2.261050930180872], [11.75166548019979, 2.326757513839993], [12.359380323952221, 2.19281220133945], [12.951333855855609, 2.32161570882694], [13.075822381246752, 2.267097072759015], [13.003113641012078, 1.83089630778332], [13.282631463278818, 1.31418366129688], [14.026668735417218, 1.395677395021153], [14.276265903386957, 1.196929836426619], [13.843320753645656, 0.038757635901149], [14.316418491277744, -0.552627455247048], [14.425455763413595, -1.333406670744971], [14.299210239324566, -1.998275648612214], [13.99240726080771, -2.4708049454891], [13.109618767965628, -2.428740329603514], [12.575284458067642, -1.948511244315135], [12.495702752338161, -2.391688327650243], [11.820963575903193, -2.514161472181982], [11.478038771214303, -2.765618991714241], [11.855121697648116, -3.426870619321051], [11.093772820691925, -3.978826592630547]]]}') WHERE iso_a2 = 'GA';
UPDATE public.countries SET boundary = ST_GeomFromGeoJSON('{"type": "MultiPolygon", "coordinates": [[[[-5.661948614921897, 54.55460317648385], [-6.197884894220977, 53.86756500916334], [-6.953730231137996, 54.073702297575636], [-7.572167934591079, 54.05995636658599], [-7.366030646178785, 54.595840969452695], [-7.572167934591079, 55.1316222194549], [-6.733847011736145, 55.1728600124238], [-5.661948614921897, 54.55460317648385]]], [[[-3.005004848635281, 58.63500010846633], [-4.073828497728016, 57.55302480735526], [-3.055001796877661, 57.69001902936094], [-1.959280564776918, 57.68479970969952], [-2.219988165689301, 56.87001740175353], [-3.119003058271119, 55.973793036515474], [-2.085009324543023, 55.90999848085127], [-2.005675679673857, 55.80490285035023], [-1.11499101399221, 54.624986477265395], [-0.4304849918542, 54.46437612570216], [0.184981316742039, 53.32501414653103], [0.469976840831777, 52.92999949809197], [1.681530795914739, 52.739520168664], [1.559987827164377, 52.09999848083601], [1.050561557630914, 51.806760565795685], [1.449865349950301, 51.28942780212196], [0.550333693045502, 50.765738837275876], [-0.78751746255864, 50.77498891865622], [-2.489997524414377, 50.50001862243124], [-2.956273972984036, 50.696879991247016], [-3.617448085942328, 50.22835561787272], [-4.542507900399244, 50.341837063185665], [-5.245023159191135, 49.95999990498109], [-5.776566941745301, 50.15967763935683], [-4.309989793301838, 51.21000112568916], [-3.414850633142123, 51.42600861266925], [-3.422719467108323, 51.42684816740609], [-4.984367234710874, 51.593466091510976], [-5.267295701508885, 51.991400458374585], [-4.222346564134853, 52.301355699261364], [-4.770013393564113, 52.840004991255626], [-4.579999152026915, 53.49500377055517], [-3.093830673788659, 53.404547400669685], [-3.092079637047107, 53.40444082296355], [-2.945008510744344, 53.984999701546684], [-3.614700825433033, 54.600936773292574], [-3.630005458989331, 54.615012925833014], [-4.844169073903004, 54.790971177786844], [-5.082526617849226, 55.06160065369937], [-4.719112107756644, 55.50847260194348], [-5.047980922862109, 55.78398550070753], [-5.58639767091114, 55.31114614523682], [-5.644998745130181, 56.275014960344805], [-6.149980841486354, 56.78500967063354], [-5.786824713555291, 57.81884837506465], [-5.009998745127575, 58.63001333275005], [-4.211494513353557, 58.55084503847917], [-3.005004848635281, 58.63500010846633]]]]}') WHERE iso_a2 = 'GB';
UPDATE public.countries SET boundary = ST_GeomFromGeoJSON('{"type": "Polygon", "coordinates": [[[41.55408410011066, 41.53565623632757], [41.70317060727271, 41.96294281673292], [41.45347008643839, 42.64512339941794], [40.87546919125379, 43.013628038091284], [40.32139448422032, 43.128633938156845], [39.955008579270924, 43.43499766699922], [40.07696495947977, 43.553104153002316], [40.922184686045625, 43.38215851498079], [42.39439456560882, 43.22030792904263], [43.75601688006739, 42.74082815202249], [43.931199985536836, 42.55497386328477], [44.537622918481986, 42.71199270280363], [45.47027916848572, 42.50278066666998], [45.77641035338277, 42.09244395605636], [46.404950799348825, 41.860675157227305], [46.14543175637902, 41.72280243587258], [46.63790815612058, 41.181672675128226], [46.50163740416693, 41.06444468847411], [45.96260053893039, 41.123872585609774], [45.217426385281584, 41.41145193131405], [44.97248009621808, 41.248128567055595], [43.58274580259273, 41.09214325618257], [42.61954878110449, 41.58317271581994], [41.55408410011066, 41.53565623632757]]]}') WHERE iso_a2 = 'GE';
UPDATE public.countries SET boundary = ST_GeomFromGeoJSON('{"type": "Polygon", "coordinates": [[[1.060121697604927, 5.928837388528876], [-0.507637905265938, 5.343472601742675], [-1.063624640294194, 5.000547797053812], [-1.964706590167594, 4.710462144383371], [-2.856125047202397, 4.994475816259509], [-2.81070146321784, 5.38905121502411], [-3.244370083011262, 6.250471503113502], [-2.983584967450327, 7.379704901555513], [-2.562189500326241, 8.219627793811483], [-2.827496303712707, 9.642460842319778], [-2.963896246747112, 10.395334784380083], [-2.940409308270461, 10.962690334512558], [-1.203357713211432, 11.009819240762738], [-0.761575893548183, 10.936929633015055], [-0.438701544588582, 11.098340969278722], [0.023802524423701, 11.018681748900804], [-0.049784715159944, 10.706917832883931], [0.367579990245389, 10.19121287682718], [0.365900506195885, 9.465003973829482], [0.461191847342121, 8.677222601756014], [0.712029249686879, 8.31246450442383], [0.490957472342245, 7.411744289576475], [0.570384148774849, 6.914358628767189], [0.836931186536333, 6.279978745952149], [1.060121697604927, 5.928837388528876]]]}') WHERE iso_a2 = 'GH';
UPDATE public.countries SET boundary = ST_GeomFromGeoJSON('{"type": "Polygon", "coordinates": [[[-8.439298468448698, 7.686042792181738], [-8.722123582382125, 7.71167430259851], [-8.926064622422004, 7.309037380396376], [-9.208786383490846, 7.313920803247953], [-9.40334815106975, 7.526905218938907], [-9.337279832384581, 7.928534450711354], [-9.755342169625834, 8.541055202666925], [-10.016566534861255, 8.428503933135232], [-10.23009355309128, 8.406205552601293], [-10.505477260774668, 8.348896389189605], [-10.494315151399633, 8.715540676300435], [-10.654770473665891, 8.977178452994195], [-10.622395188835041, 9.267910061068278], [-10.839151984083301, 9.688246161330369], [-11.11748124840733, 10.045872911006285], [-11.917277390988659, 10.046983954300558], [-12.150338100625005, 9.858571682164381], [-12.425928514037565, 9.835834051955956], [-12.59671912276221, 9.62018830000197], [-12.71195756677308, 9.342711696810767], [-13.246550258832515, 8.903048610871508], [-13.685153977909792, 9.49474376061346], [-14.074044969122282, 9.886166897008252], [-14.33007585291237, 10.015719712763968], [-14.579698859098258, 10.214467271358515], [-14.693231980843505, 10.656300767454042], [-14.839553798877944, 10.87657156009814], [-15.130311245168173, 11.040411688679526], [-14.685687221728898, 11.527823798056488], [-14.382191534878729, 11.509271958863692], [-14.121406419317779, 11.677117010947697], [-13.900799729863776, 11.678718980348748], [-13.743160773157413, 11.811269029177412], [-13.828271857142125, 12.142644151249044], [-13.718743658899513, 12.24718557377551], [-13.700476040084325, 12.586182969610194], [-13.217818162478238, 12.575873521367967], [-12.499050665730564, 12.332089952031057], [-12.27859900557344, 12.354440008997287], [-12.203564825885634, 12.465647691289405], [-11.658300950557932, 12.386582749882836], [-11.51394283695059, 12.442987575729418], [-11.456168585648271, 12.076834214725338], [-11.297573614944511, 12.077971096235771], [-11.03655595543826, 12.211244615116515], [-10.870829637078215, 12.17788747807211], [-10.593223842806282, 11.92397532800598], [-10.165213792348837, 11.844083563682744], [-9.890992804392013, 12.060478623904972], [-9.567911749703214, 12.194243068892476], [-9.327616339546012, 12.334286200403454], [-9.127473517279583, 12.308060411015333], [-8.90526485842453, 12.088358059126437], [-8.786099005559464, 11.812560939984706], [-8.376304897484914, 11.393645941610629], [-8.581305304386774, 11.136245632364805], [-8.620321010767128, 10.810890814655183], [-8.407310756860028, 10.909256903522762], [-8.282357143578281, 10.792597357623846], [-8.33537716310974, 10.494811916541934], [-8.029943610048619, 10.206534939001713], [-8.229337124046822, 10.1290202905639], [-8.30961646161225, 9.789531968622441], [-8.07911373537435, 9.376223863152035], [-7.832100389019188, 8.575704250518626], [-8.20349890790088, 8.455453192575447], [-8.299048631208564, 8.316443589710303], [-8.221792364932199, 8.123328762235573], [-8.280703497744938, 7.687179673692157], [-8.439298468448698, 7.686042792181738]]]}') WHERE iso_a2 = 'GN';
UPDATE public.countries SET boundary = ST_GeomFromGeoJSON('{"type": "Polygon", "coordinates": [[[-16.841524624081273, 13.15139394780256], [-16.71372880702347, 13.594958604379855], [-15.624596320039942, 13.62358734786956], [-15.39877031092446, 13.86036876063092], [-15.08173539881382, 13.876491807505985], [-14.687030808968487, 13.630356960499784], [-14.376713833055788, 13.625680243377374], [-14.046992356817482, 13.79406789800045], [-13.844963344772408, 13.505041612192002], [-14.277701788784555, 13.280585028532244], [-14.712197231494628, 13.298206691943777], [-15.141163295949468, 13.509511623585238], [-15.511812506562933, 13.278569647672867], [-15.691000535534995, 13.270353094938457], [-15.931295945692211, 13.130284125211332], [-16.841524624081273, 13.15139394780256]]]}') WHERE iso_a2 = 'GM';
UPDATE public.countries SET boundary = ST_GeomFromGeoJSON('{"type": "Polygon", "coordinates": [[[-15.130311245168173, 11.040411688679526], [-15.664180467175527, 11.458474025920795], [-16.085214199273565, 11.52459402103824], [-16.314786749730203, 11.80651479740655], [-16.30894731288123, 11.95870189050612], [-16.61383826340328, 12.170911159712702], [-16.677451951554573, 12.384851589401052], [-16.147716844130585, 12.547761542201187], [-15.816574266004254, 12.515567124883347], [-15.54847693527401, 12.628170070847347], [-13.700476040084325, 12.586182969610194], [-13.718743658899513, 12.24718557377551], [-13.828271857142125, 12.142644151249044], [-13.743160773157413, 11.811269029177412], [-13.900799729863776, 11.678718980348748], [-14.121406419317779, 11.677117010947697], [-14.382191534878729, 11.509271958863692], [-14.685687221728898, 11.527823798056488], [-15.130311245168173, 11.040411688679526]]]}') WHERE iso_a2 = 'GW';
UPDATE public.countries SET boundary = ST_GeomFromGeoJSON('{"type": "Polygon", "coordinates": [[[9.492888624721985, 1.010119533691494], [9.305613234096256, 1.160911363119183], [9.649158155972628, 2.283866075037736], [11.276449008843713, 2.261050930180872], [11.285078973036462, 1.057661851400013], [9.830284051155644, 1.067893784993799], [9.492888624721985, 1.010119533691494]]]}') WHERE iso_a2 = 'GQ';
UPDATE public.countries SET boundary = ST_GeomFromGeoJSON('{"type": "MultiPolygon", "coordinates": [[[[23.699980096133004, 35.70500438083553], [24.24666507334868, 35.368022365860156], [25.02501549652888, 35.424995632461986], [25.769207797964185, 35.35401805270908], [25.745023227651586, 35.179997666966216], [26.290002882601726, 35.29999034274792], [26.16499759288766, 35.004995429009796], [24.724982130642303, 34.91998769788961], [24.735007358506948, 35.08499054619759], [23.514978468528113, 35.27999156345098], [23.699980096133004, 35.70500438083553]]], [[[26.604195590936285, 41.562114569661105], [26.29460208507578, 40.93626129817426], [26.056942172965506, 40.824123440100834], [25.447677036244187, 40.85254547786147], [24.92584842296094, 40.94706167252323], [23.714811232200816, 40.68712921809512], [24.407998894964066, 40.1249929876241], [23.899967889102584, 39.96200552017558], [23.3429993018608, 39.96099782974579], [22.813987664488963, 40.476005153966554], [22.62629886240478, 40.25656118423919], [22.84974775563481, 39.65931081802577], [23.3500272966526, 39.19001129816726], [22.973099399515547, 38.97090322524966], [23.530016310324953, 38.51000112563847], [24.025024855248944, 38.21999298761645], [24.040011020613605, 37.655014553369426], [23.115002882589152, 37.92001129816222], [23.409971958111072, 37.409990749657396], [22.774971958108637, 37.30501007745656], [23.15422529469862, 36.422505804992056], [22.490028110451107, 36.41000010837746], [21.670026482843696, 36.8449864771942], [21.295010613701578, 37.644989325504696], [21.120034213961333, 38.31032339126273], [20.730032179454582, 38.769985256498785], [20.217712029712857, 39.340234686839636], [20.15001590341052, 39.62499766698403], [20.615000441172782, 40.110006822259436], [20.674996779063633, 40.434999904943055], [20.99998986174728, 40.58000397395398], [21.02004031747643, 40.84272695572588], [21.674160597426976, 40.93127452245798], [22.05537763844427, 41.14986583105269], [22.597308383889015, 41.130487168943205], [22.76177, 41.3048], [22.95237715016657, 41.33799388281122], [23.692073601992462, 41.30908091894386], [24.492644891058035, 41.58389618587205], [25.197201368925533, 41.23448598893066], [26.106138136507184, 41.32889883072784], [26.117041863720914, 41.82690460872473], [26.604195590936285, 41.562114569661105]]]]}') WHERE iso_a2 = 'GR';
UPDATE public.countries SET boundary = ST_GeomFromGeoJSON('{"type": "Polygon", "coordinates": [[[-46.76379, 82.62796], [-43.40644, 83.22516], [-39.89753, 83.18018], [-38.62214, 83.54905], [-35.08787, 83.64513], [-27.10046, 83.51966], [-20.84539, 82.72669], [-22.69182, 82.34165], [-26.51753, 82.29765], [-31.9, 82.2], [-31.39646, 82.02154], [-27.85666, 82.13178], [-24.84448, 81.78697], [-22.90328, 82.09317], [-22.07175, 81.73449], [-23.16961, 81.15271], [-20.62363, 81.52462], [-15.76818, 81.91245], [-12.77018, 81.71885], [-12.20855, 81.29154], [-16.28533, 80.58004], [-16.85, 80.35], [-20.04624, 80.17708], [-17.73035, 80.12912], [-18.9, 79.4], [-19.70499, 78.75128], [-19.67353, 77.63859], [-18.47285, 76.98565], [-20.03503, 76.94434], [-21.67944, 76.62795], [-19.83407, 76.09808], [-19.59896, 75.24838], [-20.66818, 75.15585], [-19.37281, 74.29561], [-21.59422, 74.22382], [-20.43454, 73.81713], [-20.76234, 73.46436], [-22.17221, 73.30955], [-23.56593, 73.30663], [-22.31311, 72.62928], [-22.29954, 72.18409], [-24.27834, 72.59788], [-24.79296, 72.3302], [-23.44296, 72.08016], [-22.13281, 71.46898], [-21.75356, 70.66369], [-23.53603, 70.471], [-24.30702, 70.85649], [-25.54341, 71.43094], [-25.20135, 70.75226], [-26.36276, 70.22646], [-23.72742, 70.18401], [-22.34902, 70.12946], [-25.02927, 69.2588], [-27.74737, 68.47046], [-30.67371, 68.12503], [-31.77665, 68.12078], [-32.81105, 67.73547], [-34.20196, 66.67974], [-36.35284, 65.9789], [-37.04378, 65.93768], [-38.37505, 65.69213], [-39.81222, 65.45848], [-40.66899, 64.83997], [-40.68281, 64.13902], [-41.1887, 63.48246], [-42.81938, 62.68233], [-42.41666, 61.90093], [-42.86619, 61.07404], [-43.3784, 60.09772], [-44.7875, 60.03676], [-46.26364, 60.85328], [-48.26294, 60.85843], [-49.23308, 61.40681], [-49.90039, 62.38336], [-51.63325, 63.62691], [-52.14014, 64.27842], [-52.27659, 65.1767], [-53.66166, 66.09957], [-53.30161, 66.8365], [-53.96911, 67.18899], [-52.9804, 68.35759], [-51.47536, 68.72958], [-51.08041, 69.14781], [-50.87122, 69.9291], [-52.013585, 69.574925], [-52.55792, 69.42616], [-53.45629, 69.283625], [-54.68336, 69.61003], [-54.75001, 70.28932], [-54.35884, 70.821315], [-53.431315, 70.835755], [-51.39014, 70.56978], [-53.10937, 71.20485], [-54.00422, 71.54719], [-55, 71.40653696727257], [-55.83468, 71.65444], [-54.71819, 72.58625], [-55.32634, 72.95861], [-56.12003, 73.64977], [-57.32363, 74.71026], [-58.59679, 75.09861], [-58.58516, 75.51727], [-61.26861, 76.10238], [-63.39165, 76.1752], [-66.06427, 76.13486], [-68.50438, 76.06141], [-69.66485, 76.37975], [-71.40257, 77.00857], [-68.77671, 77.32312], [-66.76397, 77.37595], [-71.04293, 77.63595], [-73.297, 78.04419], [-73.15938, 78.43271], [-69.37345, 78.91388], [-65.7107, 79.39436], [-65.3239, 79.75814], [-68.02298, 80.11721], [-67.15129, 80.51582], [-63.68925, 81.21396], [-62.23444, 81.3211], [-62.65116, 81.77042], [-60.28249, 82.03363], [-57.20744, 82.19074], [-54.13442, 82.19962], [-53.04328, 81.88833], [-50.39061, 82.43883], [-48.00386, 82.06481], [-46.59984, 81.985945], [-44.523, 81.6607], [-46.9007, 82.19979], [-46.76379, 82.62796]]]}') WHERE iso_a2 = 'GL';
UPDATE public.countries SET boundary = ST_GeomFromGeoJSON('{"type": "Polygon", "coordinates": [[[-90.09555457229098, 13.735337632700734], [-90.60862403030085, 13.909771429901951], [-91.23241024449605, 13.927832342987957], [-91.68974667027913, 14.126218166556455], [-92.22775000686983, 14.538828640190928], [-92.20322953974733, 14.830102850804069], [-92.08721594925207, 15.064584662328441], [-92.22924862340628, 15.25144664149586], [-91.74796017125593, 16.066564846251723], [-90.46447262242266, 16.069562079324655], [-90.43886695022204, 16.410109768128095], [-90.60084672724092, 16.47077789963876], [-90.71182186558772, 16.687483018454728], [-91.08167009150065, 16.918476670799407], [-91.45392127151516, 17.252177232324172], [-91.00226925328421, 17.25465770107418], [-91.00151994501596, 17.81759491624571], [-90.06793351923098, 17.819326076727478], [-89.14308041050332, 17.80831899664932], [-89.15080603713095, 17.015576687075836], [-89.22912167026928, 15.886937567605171], [-88.93061275913527, 15.887273464415076], [-88.60458614780585, 15.70638011317736], [-88.51836402052686, 15.855389105690975], [-88.22502275262202, 15.727722479713904], [-88.68067969435563, 15.346247056535304], [-89.15481096063357, 15.06641917567481], [-89.22522009963127, 14.874286200413621], [-89.14553504103718, 14.678019110569082], [-89.3533259752828, 14.424132798719114], [-89.58734269891656, 14.36258616785949], [-89.53421932652051, 14.244815578666305], [-89.72193396682073, 14.134228013561696], [-90.0646779039966, 13.881969509328925], [-90.09555457229098, 13.735337632700734]]]}') WHERE iso_a2 = 'GT';
UPDATE public.countries SET boundary = ST_GeomFromGeoJSON('{"type": "Polygon", "coordinates": [[[-59.758284878159195, 8.367034816924047], [-59.10168412945866, 7.999201971870492], [-58.48296220562806, 7.347691351750697], [-58.45487606467742, 6.832787380394464], [-58.078103196837375, 6.809093736188643], [-57.542218593970645, 6.321268215353356], [-57.14743648947689, 5.973149929219161], [-57.307245856339506, 5.073566595882227], [-57.91428890647214, 4.812626451024414], [-57.8602095200787, 4.57680105226045], [-58.04469438336068, 4.060863552258382], [-57.60156897645787, 3.334654649260685], [-57.28143347840971, 3.333491929534119], [-57.15009782573991, 2.768926906745406], [-56.539385748914555, 1.899522609866921], [-56.78270423036083, 1.863710842288654], [-57.335822923396904, 1.948537705895759], [-57.66097103537737, 1.682584947105639], [-58.11344987652502, 1.507195135907025], [-58.429477098205965, 1.463941962078721], [-58.540012986878295, 1.268088283692521], [-59.03086157900265, 1.317697658692722], [-59.64604366722126, 1.786893825686789], [-59.71854570172675, 2.24963043864436], [-59.97452490908456, 2.755232652188056], [-59.815413174057866, 3.606498521332085], [-59.53803992373123, 3.958802598481938], [-59.767405768458715, 4.423502915866607], [-60.11100236676738, 4.574966538914083], [-59.980958624904886, 5.014061184098139], [-60.21368343773133, 5.244486395687602], [-60.73357418480372, 5.200277207861901], [-61.410302903881956, 5.959068101419618], [-61.13941504580795, 6.234296779806144], [-61.15933631045648, 6.696077378766319], [-60.54399919294099, 6.856584377464883], [-60.2956680975624, 7.043911444522919], [-60.637972785063766, 7.414999904810855], [-60.5505879380582, 7.779602972846178], [-59.758284878159195, 8.367034816924047]]]}') WHERE iso_a2 = 'GY';
UPDATE public.countries SET boundary = ST_GeomFromGeoJSON('{"type": "Polygon", "coordinates": [[[-87.31665442579549, 12.984685777229004], [-87.48940873894713, 13.297534898323931], [-87.79311113152653, 13.384480495655168], [-87.72350297722932, 13.785050360565606], [-87.85951534702161, 13.893312486217098], [-88.06534257684012, 13.964625962779792], [-88.50399797234962, 13.845485948130943], [-88.54123084181595, 13.980154730683523], [-88.84307288283276, 14.140506700085211], [-89.05851192905766, 14.340029405164216], [-89.35332597528281, 14.424132798719086], [-89.14553504103719, 14.678019110569153], [-89.22522009963126, 14.874286200413678], [-89.15481096063354, 15.066419175674866], [-88.6806796943556, 15.34624705653539], [-88.22502275262195, 15.727722479714032], [-88.12115312371537, 15.688655096901357], [-87.90181250685242, 15.864458319558196], [-87.61568010125234, 15.878798529519202], [-87.52292090528846, 15.797278957578783], [-87.36776241733213, 15.846940009011291], [-86.90319129102818, 15.75671295822957], [-86.44094560417739, 15.782835394753192], [-86.11923397494434, 15.893448798073962], [-86.00195431185784, 16.00540578863439], [-85.68331743034628, 15.953651841693954], [-85.44400387240256, 15.885749009662447], [-85.18244361035721, 15.909158433490632], [-84.98372188997882, 15.995923163308703], [-84.52697974316715, 15.857223619037427], [-84.36825558138258, 15.835157782448732], [-84.06305457226682, 15.648244126849136], [-83.77397661002612, 15.424071763566872], [-83.41038123242038, 15.270902818253774], [-83.14721900097413, 14.99582916916421], [-83.48998877636603, 15.016267198135665], [-83.6285849677729, 14.880073960830373], [-83.97572140169359, 14.749435939996488], [-84.22834164095241, 14.74876414637663], [-84.4493359036486, 14.621614284722511], [-84.64958207877964, 14.666805324761867], [-84.8200367906943, 14.81958669683263], [-84.92450069857233, 14.790492865452336], [-85.05278744173688, 14.551541042534723], [-85.14875057650289, 14.560196844943619], [-85.16536454948482, 14.354369615125051], [-85.51441301140028, 14.079011745657908], [-85.69866533073696, 13.960078436738002], [-85.80129472526852, 13.836054999237604], [-86.09626380079061, 14.038187364147234], [-86.31214209668985, 13.771356106008227], [-86.52070817741992, 13.778487453664468], [-86.75508663607962, 13.75484548589094], [-86.73382178419149, 13.2630925562014], [-86.88055701368438, 13.254204209847217], [-87.00576900912745, 13.025794379117258], [-87.31665442579549, 12.984685777229004]]]}') WHERE iso_a2 = 'HN';
UPDATE public.countries SET boundary = ST_GeomFromGeoJSON('{"type": "Polygon", "coordinates": [[[18.829838087650046, 45.908877671891844], [19.072768995854176, 45.52151113543209], [19.39047570158459, 45.236515611342384], [19.00548628101012, 44.86023366960916], [18.553214145591653, 45.08158966733146], [17.861783481526402, 45.067740383477144], [17.002146030351014, 45.23377676043094], [16.534939406000206, 45.21160757097772], [16.318156772535872, 45.00412669532591], [15.959367303133376, 45.23377676043094], [15.750026075918981, 44.818711656262565], [16.23966027188453, 44.35114329688571], [16.456442905348865, 44.04123973243128], [16.91615644701733, 43.66772247982567], [17.297373488034452, 43.44634064388737], [17.674921502358984, 43.02856252702361], [18.56, 42.65], [18.450016310304818, 42.47999136002932], [17.509970330483327, 42.849994615239154], [16.930005730871642, 43.20999848080038], [16.015384555737683, 43.50721548112722], [15.174453973052096, 44.243191229827914], [15.376250441151797, 44.31791535092208], [14.92030927904051, 44.73848399512946], [14.901602410550879, 45.07606028907611], [14.258747592839995, 45.23377676043094], [13.952254672917036, 44.80212352149687], [13.656975538801191, 45.13693512631596], [13.67940311041582, 45.48414907488501], [13.715059848697251, 45.500323798192426], [14.4119682145855, 45.46616567644742], [14.59510949062792, 45.63494090431283], [14.935243767972963, 45.471695054702764], [15.327674594797429, 45.45231639259333], [15.323953891672431, 45.731782538427694], [15.671529575267641, 45.83415355079791], [15.768732944408612, 46.23810822202353], [16.564808383864943, 46.50375092221981], [16.882515089595415, 46.38063182228444], [17.630066359129557, 45.9517691106941], [18.45606245288286, 45.75948110613615], [18.829838087650046, 45.908877671891844]]]}') WHERE iso_a2 = 'HR';
UPDATE public.countries SET boundary = ST_GeomFromGeoJSON('{"type": "Polygon", "coordinates": [[[-73.18979061551762, 19.915683905511912], [-72.57967281766362, 19.871500555902358], [-71.71236141629296, 19.714455878167357], [-71.62487321642283, 19.169837958243306], [-71.7013026597825, 18.785416978424053], [-71.94511206733556, 18.61690013272026], [-71.68773759630588, 18.31666006110447], [-71.70830481635805, 18.044997056546094], [-72.37247616238935, 18.21496084235406], [-72.84441118029488, 18.145611070218365], [-73.45455481636503, 18.2179063989947], [-73.92243323433566, 18.030992743395004], [-74.45803361682478, 18.342549953682706], [-74.36992529976713, 18.66490753831941], [-73.44954220243272, 18.526052964751145], [-72.69493709989064, 18.445799465401862], [-72.334881557897, 18.668421535715254], [-72.79164954292489, 19.10162506761803], [-72.78410478381028, 19.48359141690341], [-73.41502234566175, 19.639550889560283], [-73.18979061551762, 19.915683905511912]]]}') WHERE iso_a2 = 'HT';
UPDATE public.countries SET boundary = ST_GeomFromGeoJSON('{"type": "Polygon", "coordinates": [[[16.202298211337364, 46.85238597267696], [16.534267612380376, 47.49617096616912], [16.340584344150415, 47.71290192320123], [16.90375410326726, 47.71486562762833], [16.979666782304037, 48.123497015976305], [17.48847293464982, 47.867466132186216], [17.857132602620027, 47.75842886005037], [18.696512892336926, 47.880953681014404], [18.77702477384767, 48.081768296900634], [19.17436486173989, 48.11137889260387], [19.661363559658497, 48.26661489520866], [19.769470656013112, 48.202691148463614], [20.239054396249347, 48.32756724709692], [20.473562045989866, 48.562850043321816], [20.801293979584926, 48.623854071642384], [21.872236362401736, 48.31997081155002], [22.085608351334855, 48.42226430927179], [22.640819939878753, 48.15023956968736], [22.710531447040495, 47.88219391538941], [22.099767693782837, 47.6724392767167], [21.626514926853872, 46.99423777931816], [21.02195234547125, 46.3160879583519], [20.220192498462836, 46.127468980486555], [19.596044549241583, 46.17172984474454], [18.82983808764996, 45.90887767189193], [18.45606245288286, 45.759481106136136], [17.630066359129557, 45.95176911069419], [16.8825150895953, 46.38063182228444], [16.564808383864857, 46.50375092221983], [16.370504998447416, 46.841327216166505], [16.202298211337364, 46.85238597267696]]]}') WHERE iso_a2 = 'HU';
UPDATE public.countries SET boundary = ST_GeomFromGeoJSON('{"type": "MultiPolygon", "coordinates": [[[[120.71560875863045, -10.239581394087864], [120.2950142762069, -10.258649997603527], [118.96780846565471, -9.557969252158031], [119.90030968636162, -9.361340427287516], [120.42575564990543, -9.665921319215798], [120.77550174365675, -9.969675388227458], [120.71560875863045, -10.239581394087864]]], [[[124.43595014861941, -10.140000909061442], [123.57998172413673, -10.359987481327963], [123.45998904835503, -10.239994805546175], [123.55000939340746, -9.90001555749798], [123.98000898650812, -9.290026950724695], [124.96868248911622, -8.892790215697048], [125.07001997284064, -9.089987481322837], [125.0885201356011, -9.393173109579322], [124.43595014861941, -10.140000909061442]]], [[[117.90001834520777, -8.095681247594925], [118.2606164897405, -8.362383314653329], [118.87845991422213, -8.28068287519983], [119.1265067892231, -8.705824883665073], [117.97040164598931, -8.906639499551261], [117.27773074754904, -9.040894870645559], [116.74014082241663, -9.03293670007264], [117.08373742072533, -8.457157891476541], [117.63202436734215, -8.449303073768192], [117.90001834520777, -8.095681247594925]]], [[[122.90353722543611, -8.094234307490737], [122.75698286345633, -8.64980763106064], [121.25449059457011, -8.933666273639943], [119.92439090380961, -8.810417982623875], [119.92092858284613, -8.444858900591072], [120.71509199430758, -8.236964613480865], [121.34166873584658, -8.536739597206022], [122.00736453663043, -8.460620212440162], [122.90353722543611, -8.094234307490737]]], [[[108.62347863162896, -6.777673841990676], [110.53922732955331, -6.877357679881683], [110.75957563684594, -6.465186455921753], [112.61481123255638, -6.946035658397591], [112.97876834518812, -7.59421314863458], [114.47893517462117, -7.776527601760279], [115.70552697150109, -8.370806573116866], [114.56451134649652, -8.751816908404834], [113.4647335144609, -8.348947442257426], [112.55967247930104, -8.376180922075164], [111.52206139531248, -8.302128594600958], [110.58614953007432, -8.122604668819022], [109.4276672709552, -7.740664157749762], [108.69365522668133, -7.641600437046222], [108.27776329959633, -7.766657403192582], [106.45410200401616, -7.354899590690948], [106.28062422081231, -6.924899997590202], [105.36548628135554, -6.85141611087117], [106.05164594932708, -5.8959188777945], [107.2650085795402, -5.954985039904059], [108.0720910990747, -6.345762220895239], [108.48684614464926, -6.421984958525769], [108.62347863162896, -6.777673841990676]]], [[[134.72462446506668, -6.214400730009288], [134.21013390516893, -6.895237725454706], [134.11277550673103, -6.142467136259015], [134.2903357280858, -5.783057549669039], [134.4996252788679, -5.445042006047899], [134.72700158095213, -5.73758228925216], [134.72462446506668, -6.214400730009288]]], [[[127.24921512258894, -3.45906503663889], [126.87492272349888, -3.79098276124958], [126.18380211802733, -3.607376397316557], [125.98903364471929, -3.177273451351326], [127.00065148326499, -3.12931772218441], [127.24921512258894, -3.45906503663889]]], [[[130.4713440288518, -3.09376433676762], [130.8348360535928, -3.858472181822762], [129.99054650280814, -3.446300957862817], [129.15524865124243, -3.362636813982249], [128.59068362845366, -3.428679294451257], [127.89889122936236, -3.393435967628193], [128.1358793478528, -2.843650404474914], [129.37099775606092, -2.802154229344552], [130.4713440288518, -3.09376433676762]]], [[[134.1433679546478, -1.151867364103595], [134.42262739475305, -2.769184665542383], [135.4576029806947, -3.367752780779114], [136.2933142437188, -2.30704233155609], [137.44073774632753, -1.703513278819372], [138.3297274110448, -1.702686455902651], [139.18492068904297, -2.051295668143638], [139.92668419816042, -2.409051608900285], [141.00021040259188, -2.600151055515624], [141.01705691951904, -5.859021905138022], [141.0338517600139, -9.117892754760419], [140.14341515519257, -8.297167657100957], [139.12776655492812, -8.096042982620943], [138.88147667862498, -8.380935153846096], [137.61447391169284, -8.411682631059762], [138.0390991558352, -7.597882175327356], [138.6686214540148, -7.320224704623072], [138.40791385310237, -6.232849216337485], [137.92783979711086, -5.393365573756], [135.98925011611348, -4.546543877789048], [135.16459760959972, -4.462931410340772], [133.6628804871979, -3.538853448097527], [133.3677047059468, -4.024818617370315], [132.98395551974735, -4.112978610860281], [132.756940952689, -3.74628264731713], [132.75378869031923, -3.311787204607072], [131.9898043153162, -2.820551039240456], [133.0668445171435, -2.460417982598443], [133.78003095920351, -2.47984832114021], [133.69621178602617, -2.214541517753688], [132.23237348849423, -2.212526136894326], [131.8362219585447, -1.617161960459597], [130.94283979708283, -1.432522067880797], [130.51955814018007, -0.937720228686075], [131.86753787651364, -0.695461114101818], [132.3801164084168, -0.369537855636977], [133.98554813042844, -0.780210463060442], [134.1433679546478, -1.151867364103595]]], [[[125.24050052297159, 1.419836127117605], [124.43703535369738, 0.427881171058971], [123.68550499887672, 0.235593166500877], [122.7230831238729, 0.431136786293337], [121.05672488818911, 0.381217352699451], [120.18308312386276, 0.23724681233422], [120.04086958219548, -0.519657891444851], [120.93590538949073, -1.408905938323372], [121.47582075407618, -0.955962009285116], [123.34056481332848, -0.615672702643081], [123.2583992859845, -1.076213067228338], [122.82271528533161, -0.930950616055881], [122.38852990121538, -1.516858005381124], [121.50827355355548, -1.904482924002423], [122.4545723816843, -3.186058444840882], [122.27189619353257, -3.529500013852697], [123.17096276254657, -4.683693129091708], [123.16233279835379, -5.340603936385961], [122.62851525277873, -5.634591159694494], [122.23639448454807, -5.282933037948283], [122.71956912647707, -4.46417164471579], [121.73823367725439, -4.8513314754465], [121.48946333220127, -4.574552504091216], [121.61917117725389, -4.188477878438675], [120.89818159391771, -3.602105401222829], [120.97238895068878, -2.62764291749491], [120.30545291552991, -2.931603692235726], [120.39004723519176, -4.097579034037224], [120.43071658740539, -5.528241062037779], [119.79654341031952, -5.673400160345651], [119.36690555224496, -5.379878024927805], [119.65360639860015, -4.459417412944958], [119.49883548388598, -3.49441171632651], [119.07834435432702, -3.487021986508765], [118.7677689962529, -2.801999200047689], [119.18097374885869, -2.147103773612798], [119.32339399625508, -1.353147067880471], [119.82599897672586, 0.154254462073496], [120.03570193896635, 0.566477362465804], [120.8857792501677, 1.309222723796836], [121.666816847827, 1.013943589681077], [122.92756676645186, 0.875192368977466], [124.07752241424285, 0.917101955566139], [125.06598921112183, 1.643259182131558], [125.24050052297159, 1.419836127117605]]], [[[128.68824873262074, 1.132385972494106], [128.63595218314137, 0.258485826006179], [128.1201697124362, 0.356412665199286], [127.96803429576889, -0.252077325037533], [128.37999881399972, -0.780003757331286], [128.10001590384232, -0.899996433112975], [127.69647464407504, -0.266598402511505], [127.39949018769377, 1.011721503092573], [127.60051150930909, 1.810690822757181], [127.93237755748751, 2.174596258956555], [128.00415612194084, 1.628531398928331], [128.59455936087548, 1.540810655112864], [128.68824873262074, 1.132385972494106]]], [[[117.87562706916603, 1.827640692548911], [118.99674726773819, 0.902219143066048], [117.8118583517178, 0.784241848143722], [117.47833865770608, 0.102474676917026], [117.52164350796662, -0.803723239753211], [116.56004845587952, -1.487660821136231], [116.5337968282752, -2.483517347832901], [116.14808393764864, -4.012726332214015], [116.00085778204911, -3.657037448749008], [114.86480309454456, -4.106984144714417], [114.46865156459509, -3.495703627133821], [113.75567182826413, -3.43916961020652], [113.25699425664757, -3.118775729996855], [112.06812625534067, -3.478392022316072], [111.70329064336002, -2.994442233902632], [111.04824018762824, -3.049425957861189], [110.223846063276, -2.934032484553484], [110.07093550012436, -1.592874037282414], [109.57194786991406, -1.314906507984489], [109.09187381392255, -0.459506524257051], [108.95265750532818, 0.415375474444346], [109.06913618371405, 1.341933905437642], [109.66326012577375, 2.006466986494985], [109.83022667850886, 1.338135687664192], [110.51406090702713, 0.773131415200993], [111.15913781132659, 0.976478176269509], [111.79754845586044, 0.904441229654651], [112.38025190638368, 1.410120957846758], [112.8598091980522, 1.497790025229946], [113.80584964401956, 1.217548732911041], [114.6213554220175, 1.430688177898887], [115.13403730678525, 2.821481838386219], [115.51907840379201, 3.169238389494396], [115.86551720587678, 4.306559149590157], [117.01521447150637, 4.306094061699469], [117.88203494677018, 4.137551377779488], [117.31323245653354, 3.234428208830579], [118.04832970588538, 2.287690131027361], [117.87562706916603, 1.827640692548911]]], [[[105.81765506390937, -5.852355645372413], [104.71038414919153, -5.873284600450646], [103.86821333213075, -5.037314955264975], [102.58426069540693, -4.220258884298204], [102.15617313030103, -3.614146009946765], [101.39911339722508, -2.799777113459172], [100.90250288290017, -2.05026213949786], [100.14198082886062, -0.650347588710957], [99.26373986206025, 0.183141587724663], [98.97001102091335, 1.042882391764536], [98.60135135294311, 1.823506577965617], [97.69959760944991, 2.453183905442117], [97.1769421732499, 3.30879059489861], [96.42401655475734, 3.868859768077911], [95.38087609251349, 4.970782172053674], [95.29302615761733, 5.479820868344817], [95.93686282754177, 5.439513251157109], [97.4848820332771, 5.246320909034011], [98.36916914265569, 4.268370266126368], [99.14255862833582, 3.590349636240916], [99.69399783732243, 3.174328518075157], [100.64143354696168, 2.099381211755798], [101.65801232300734, 2.083697414555189], [102.49827111207324, 1.398700466310217], [103.07684044801303, 0.561361395668854], [103.83839603069836, 0.104541734208667], [103.43764529827499, -0.711945896002845], [104.01078860882402, -1.059211521004229], [104.3699914896849, -1.084843031421016], [104.53949018760218, -1.782371514496717], [104.88789269411402, -2.340425306816655], [105.622111444117, -2.42884368246807], [106.10859337771271, -3.06177662517895], [105.85744591677414, -4.305524997579724], [105.81765506390937, -5.852355645372413]]]]}') WHERE iso_a2 = 'ID';
UPDATE public.countries SET boundary = ST_GeomFromGeoJSON('{"type": "Polygon", "coordinates": [[[77.83745079947457, 35.494009507787766], [78.91226891471322, 34.32193634697579], [78.81108646028574, 33.50619802503242], [79.20889163606859, 32.994394639613716], [79.17612877799553, 32.48377981213771], [78.45844648632601, 32.61816437431273], [78.73889448437401, 31.515906073527063], [79.7213668151071, 30.88271474865473], [81.11125613802932, 30.183480943313402], [80.4767212259174, 29.72986522065534], [80.08842451367627, 28.79447011974014], [81.05720258985203, 28.416095282499043], [81.99998742058497, 27.925479234319994], [83.30424889519955, 27.36450572357556], [84.6750179381738, 27.234901231387536], [85.25177859898338, 26.726198431906344], [86.02439293817918, 26.63098460540857], [87.2274719583663, 26.397898057556077], [88.06023766474982, 26.41461538340249], [88.17480431514092, 26.81040517832595], [88.04313276566123, 27.445818589786825], [88.12044070836987, 27.876541652939594], [88.73032596227856, 28.086864732367516], [88.81424848832056, 27.299315904239364], [88.83564253128938, 27.098966376243762], [89.74452762243885, 26.719402981059957], [90.37327477413407, 26.87572418874288], [91.21751264848643, 26.808648179628022], [92.03348351437509, 26.83831045176356], [92.10371178585974, 27.452614040633208], [91.69665652869668, 27.771741848251665], [92.50311893104364, 27.89687632904645], [93.41334760943269, 28.640629380807226], [94.56599043170294, 29.277438055939985], [95.40480228066464, 29.03171662039213], [96.11767866413103, 29.452802028922466], [96.58659061074749, 28.83097951915434], [96.24883344928779, 28.411030992134442], [97.32711388549004, 28.26158274994634], [97.40256147663614, 27.882536119085444], [97.0519885599681, 27.69905894623315], [97.1339990580153, 27.083773505149964], [96.41936567585097, 27.264589341739224], [95.12476769407496, 26.5735720891323], [95.1551534362626, 26.001307277932085], [94.60324913938538, 25.162495428970402], [94.55265791217164, 24.675238348890336], [94.10674197792507, 23.85074087167348], [93.3251876159428, 24.078556423432204], [93.28632693885928, 23.043658352139005], [93.06029422401463, 22.70311066333557], [93.16612755734837, 22.278459580977103], [92.67272098182556, 22.041238918541254], [92.14603478390681, 23.627498684172593], [91.86992760617132, 23.624346421802784], [91.70647505083211, 22.985263983649187], [91.15896325069973, 23.50352692310439], [91.46772993364368, 24.072639471934792], [91.91509280799443, 24.130413723237112], [92.37620161333481, 24.976692816664965], [91.79959598182208, 25.147431748957317], [90.87221072791212, 25.132600612889547], [89.92069258012185, 25.26974986419218], [89.83248091019962, 25.96508209889548], [89.35509402868729, 26.014407253518073], [88.56304935094977, 26.446525580342723], [88.2097892598025, 25.768065700782714], [88.93155398962308, 25.238692328384776], [88.30637251175602, 24.866079413344206], [88.08442223506242, 24.501657212821925], [88.69994022009092, 24.23371491138856], [88.52976972855379, 23.631141872649167], [88.87631188350309, 22.87914642993783], [89.03196129756623, 22.055708319582976], [88.88876590368542, 21.690588487224748], [88.20849734899522, 21.703171698487807], [86.97570438024027, 21.49556163175521], [87.03316857294887, 20.743307806882413], [86.49935102737379, 20.151638495356607], [85.0602657409097, 19.4785788029711], [83.94100589390001, 18.302009792549725], [83.18921715691785, 17.67122142177898], [82.19279218946592, 17.016636053937816], [82.19124189649719, 16.556664130107848], [81.69271935417748, 16.310219224507904], [80.79199913933014, 15.951972357644493], [80.32489586784388, 15.89918488205835], [80.02506920768644, 15.136414903214147], [80.2332735533904, 13.835770778859981], [80.28629357292186, 13.006260687710835], [79.8625468281285, 12.056215318240888], [79.85799930208682, 10.35727509199711], [79.340511509116, 10.30885427493962], [78.88534549348918, 9.546135972527722], [79.1897196796883, 9.216543687370148], [78.2779407083305, 8.933046779816934], [77.94116539908435, 8.252959092639742], [77.53989790233794, 7.965534776232332], [76.59297895702167, 8.89927623131419], [76.13006147655108, 10.299630031775521], [75.7464673196485, 11.308250637248307], [75.39610110870959, 11.781245022015824], [74.86481570831683, 12.741935736537897], [74.61671715688354, 13.99258291264968], [74.44385949086723, 14.617221787977698], [73.5341992532334, 15.99065216721496], [73.11990929554943, 17.928570054592498], [72.82090945830865, 19.208233547436166], [72.8244751321368, 20.419503282141534], [72.6305334817454, 21.356009426351008], [71.17527347197395, 20.757441311114235], [70.4704586119451, 20.877330634031384], [69.16413008003883, 22.0892980005727], [69.6449276060824, 22.450774644454338], [69.34959679553435, 22.84317963306269], [68.1766451353734, 23.69196503345671], [68.84259931831878, 24.35913361256094], [71.04324018746823, 24.3565239527302], [70.84469933460284, 25.21510203704352], [70.2828731627256, 25.72222870533983], [70.16892662952202, 26.491871649678842], [69.51439293811313, 26.940965684511372], [70.61649620960193, 27.989196275335868], [71.77766564320032, 27.913180243434525], [72.8237516620847, 28.961591701772054], [73.45063846221743, 29.97641347911987], [74.42138024282028, 30.979814764931177], [74.40592898956501, 31.69263947196528], [75.25864179881322, 32.2711054550405], [74.45155927927871, 32.7648996038055], [74.10429365427734, 33.44147329358685], [73.74994835805197, 34.31769887952785], [74.24020267120497, 34.748887030571254], [75.75706098826834, 34.50492259372132], [76.87172163280403, 34.65354401299274], [77.83745079947457, 35.494009507787766]]]}') WHERE iso_a2 = 'IN';
UPDATE public.countries SET boundary = ST_GeomFromGeoJSON('{"type": "Polygon", "coordinates": [[[-6.197884894220991, 53.867565009163364], [-6.032985398777611, 53.15316417094435], [-6.788856573910849, 52.260117906292336], [-8.56161658368356, 51.669301255899356], [-9.977085740590269, 51.82045482035308], [-9.166282517930782, 52.86462881124268], [-9.688524542672454, 53.8813626165853], [-8.327987433292009, 54.66451894796863], [-7.572167934591064, 55.13162221945487], [-7.366030646178785, 54.59584096945272], [-7.572167934591064, 54.059956366586], [-6.953730231138067, 54.073702297575636], [-6.197884894220991, 53.867565009163364]]]}') WHERE iso_a2 = 'IE';
UPDATE public.countries SET boundary = ST_GeomFromGeoJSON('{"type": "Polygon", "coordinates": [[[53.92159793479556, 37.19891836196126], [54.800303989486565, 37.392420762678185], [55.51157840355191, 37.96411713312317], [56.18037479027333, 37.93512665460743], [56.61936608259282, 38.121394354803485], [57.330433790928986, 38.02922943781094], [58.436154412678206, 37.5223094752438], [59.23476199731681, 37.41298798273034], [60.37763797388388, 36.52738312432837], [61.123070509694145, 36.491597194966246], [61.210817091725744, 35.650072333309225], [60.80319339380745, 34.40410187431986], [60.52842980331158, 33.676446031218006], [60.963700392506006, 33.52883230237626], [60.536077915290775, 32.98126882581157], [60.863654819588966, 32.18291962333443], [60.94194461451113, 31.548074652628753], [61.69931440618083, 31.379506130492672], [61.781221551363444, 30.735850328081238], [60.87424848820879, 29.829238999952608], [61.36930870956494, 29.303276272085924], [61.77186811711863, 28.6993338078908], [62.72783043808599, 28.25964488373539], [62.75542565292986, 27.378923448184988], [63.2338977395203, 27.21704702403071], [63.31663170761959, 26.756532497661667], [61.87418745305655, 26.239974880472104], [61.49736290878419, 25.0782370061185], [59.616134067630846, 25.380156561783778], [58.525761346272304, 25.60996165618573], [57.39725141788239, 25.73990204518364], [56.970765822177555, 26.966106268821363], [56.492138706290206, 27.143304755150197], [55.723710158110066, 26.964633490501043], [54.71508955263727, 26.480657863871514], [53.49309695823135, 26.81236888275305], [52.48359785340961, 27.580849107365495], [51.52076256694742, 27.865689602158298], [50.85294803243954, 28.814520575469388], [50.115008579311585, 30.147772528599717], [49.576850213423995, 29.985715236932407], [48.94133344909855, 30.317090359004037], [48.567971225789755, 29.926778265903522], [48.0145683123761, 30.452456773392598], [48.004698113808324, 30.985137437457244], [47.68528608581227, 30.984853217079632], [47.8492037290421, 31.70917593029867], [47.33466149271191, 32.46915538179911], [46.10936160663932, 33.017287299119005], [45.41669070819904, 33.967797756479584], [45.64845950702809, 34.748137722303014], [46.15178795755094, 35.09325877536429], [46.0763403664048, 35.67738332777549], [45.42061811705321, 35.977545884742824], [44.77267, 37.17045], [44.22575564960053, 37.97158437758935], [44.421402622257546, 38.28128123631454], [44.10922529478234, 39.4281362981681], [44.79398969908195, 39.71300263117705], [44.95268802265031, 39.33576467544637], [45.45772179543877, 38.87413910578306], [46.14362308124882, 38.74120148371222], [46.50571984231797, 38.770605373686294], [47.685079380083096, 39.50836395930122], [48.06009524922524, 39.58223541926246], [48.35552941263788, 39.28876496027691], [48.01074425638648, 38.79401479751452], [48.63437544128482, 38.27037750910097], [48.88324913920249, 38.32024526626262], [49.19961225769334, 37.582874253889884], [50.14777143738462, 37.37456655532134], [50.84235436381971, 36.8728142359834], [52.264024692601424, 36.7004216578577], [53.82578982932642, 36.965030829408235], [53.92159793479556, 37.19891836196126]]]}') WHERE iso_a2 = 'IR';
UPDATE public.countries SET boundary = ST_GeomFromGeoJSON('{"type": "Polygon", "coordinates": [[[45.42061811705321, 35.977545884742824], [46.0763403664048, 35.67738332777549], [46.15178795755094, 35.09325877536429], [45.64845950702809, 34.748137722303014], [45.41669070819904, 33.967797756479584], [46.10936160663932, 33.017287299119005], [47.33466149271191, 32.46915538179911], [47.8492037290421, 31.70917593029867], [47.68528608581227, 30.984853217079632], [48.004698113808324, 30.985137437457244], [48.0145683123761, 30.452456773392598], [48.567971225789755, 29.926778265903522], [47.974519077349896, 29.975819200148504], [47.30262210469096, 30.059069932570722], [46.568713413281756, 29.09902517345229], [44.70949873228474, 29.178891099559383], [41.889980910007836, 31.19000865327837], [40.399994337736246, 31.889991766887935], [39.19546837744497, 32.16100881604267], [38.792340529136084, 33.378686428352225], [41.006158888519934, 34.41937226006212], [41.383965285005814, 35.628316555314356], [41.289707472505455, 36.35881460219227], [41.83706424334096, 36.605853786763575], [42.34959109881177, 37.2298725449041], [42.77912560402183, 37.385263576805755], [43.9422587420473, 37.25622752537295], [44.29345177590287, 37.0015143906063], [44.772699008977696, 37.170444647768434], [45.42061811705321, 35.977545884742824]]]}') WHERE iso_a2 = 'IQ';
UPDATE public.countries SET boundary = ST_GeomFromGeoJSON('{"type": "Polygon", "coordinates": [[[-14.508695441129234, 66.45589223903143], [-14.739637417041607, 65.8087482774403], [-13.60973222497981, 65.12667104761987], [-14.909833746794902, 64.36408193628868], [-17.794438035543422, 63.678749091233854], [-18.656245896874992, 63.49638296167582], [-19.97275468594276, 63.64363495549153], [-22.762971971110158, 63.960178941495386], [-21.778484259517683, 64.40211579045551], [-23.95504391121911, 64.8911298692335], [-22.184402635170358, 65.0849681667603], [-22.227423265053332, 65.37859365504274], [-24.326184047939336, 65.61118927678847], [-23.65051469572309, 66.26251902939522], [-22.134922451250887, 66.41046865504687], [-20.57628373867955, 65.73211212835143], [-19.05684160000159, 66.27660085719477], [-17.79862382655905, 65.99385325790978], [-16.167818976292125, 66.52679230413587], [-14.508695441129234, 66.45589223903143]]]}') WHERE iso_a2 = 'IS';
UPDATE public.countries SET boundary = ST_GeomFromGeoJSON('{"type": "Polygon", "coordinates": [[[35.71991824722275, 32.709192409794866], [35.54566531753454, 32.393992011030576], [35.183930291491436, 32.53251068778894], [34.97464074070933, 31.866582343059722], [35.22589155451243, 31.754341132121766], [34.970506626125996, 31.61677846936081], [34.92740848159457, 31.353435370401414], [35.397560662586045, 31.489086005167582], [35.420918409981965, 31.100065822874356], [34.92260257339143, 29.501326198844524], [34.26543338393569, 31.219360866820153], [34.55637169773891, 31.548823960896996], [34.48810713068136, 31.60553884533732], [34.75258711115117, 32.07292633720117], [34.95541710789678, 32.82737641044638], [35.098457472480675, 33.080539252244265], [35.126052687324545, 33.09090037691878], [35.460709262846706, 33.08904002535628], [35.55279666519081, 33.26427480725802], [35.82110070165024, 33.2774264592763], [35.836396925608625, 32.86812327730851], [35.70079796727475, 32.71601369885738], [35.71991824722275, 32.709192409794866]]]}') WHERE iso_a2 = 'IL';
UPDATE public.countries SET boundary = ST_GeomFromGeoJSON('{"type": "MultiPolygon", "coordinates": [[[[15.520376010813834, 38.23115509699147], [15.160242954171736, 37.44404551853782], [15.309897902089006, 37.1342194687318], [15.09998823411945, 36.6199872909954], [14.335228712632016, 36.996630967754754], [13.82673261887993, 37.1045313583802], [12.431003859108813, 37.61294993748382], [12.570943637755136, 38.12638113051969], [13.741156447004585, 38.03496552179536], [14.76124922044616, 38.143873602850505], [15.520376010813834, 38.23115509699147]]], [[[9.210011834356266, 41.20999136002422], [9.809975213264977, 40.5000088567661], [9.669518670295673, 39.177376410471794], [9.21481774255949, 39.240473334300134], [8.80693566247973, 38.90661774347848], [8.428302443077115, 39.17184703221662], [8.38825320805094, 40.378310858718805], [8.15999840661766, 40.95000722916379], [8.709990675500109, 40.89998444270523], [9.210011834356266, 41.20999136002422]]], [[[12.376485223040845, 46.76755910906988], [13.806475457421556, 46.50930613869119], [13.698109978905478, 46.016778062517375], [13.937630242578336, 45.591015936864665], [13.141606479554298, 45.73669179949542], [12.328581170306308, 45.381778062514854], [12.383874952858605, 44.88537425391908], [12.261453484759159, 44.600482082694015], [12.589237094786483, 44.091365871754476], [13.526905958722494, 43.58772736263791], [14.029820997787027, 42.76100779883248], [15.142569614327954, 41.955139675456905], [15.926191033601896, 41.96131500911574], [16.169897088290412, 41.740294908203424], [15.889345737377795, 41.5410822617182], [16.785001661860576, 41.179605617836586], [17.519168735431208, 40.87714345963224], [18.376687452882578, 40.35562490494266], [18.480247023195403, 40.168866278639825], [18.2933850440281, 39.81077444107325], [17.738380161213286, 40.2776710068303], [16.869595981522338, 40.44223460546385], [16.448743116937322, 39.79540070246648], [17.1714896989715, 39.42469981542072], [17.052840610429342, 38.902871202137305], [16.635088331781844, 38.8435724960824], [16.100960727613057, 37.98589874933418], [15.684086948314501, 37.90884918878703], [15.68796268073632, 38.214592800441864], [15.891981235424709, 38.750942491199226], [16.109332309644316, 38.96454702407769], [15.718813510814641, 39.544072374014945], [15.413612501698822, 40.04835683853517], [14.998495721098237, 40.17294871679093], [14.70326826341477, 40.604550279292624], [14.060671827865264, 40.78634796809544], [13.627985060285397, 41.188287258461656], [12.88808190273042, 41.25308950455562], [12.10668257004491, 41.70453481705741], [11.191906365614187, 42.35542531998968], [10.511947869517797, 42.931462510747224], [10.200028924204048, 43.920006822274615], [9.702488234097814, 44.03627879493132], [8.88894616052687, 44.36633616797954], [8.428560825238577, 44.23122813575242], [7.850766635783202, 43.76714793555524], [7.435184767291844, 43.69384491634918], [7.549596388386163, 44.12790110938482], [7.007562290076663, 44.25476675066139], [6.749955275101712, 45.02851797136759], [7.096652459347837, 45.333098863295874], [6.802355177445662, 45.70857982032868], [6.843592970414562, 45.99114655210067], [7.273850945676685, 45.77694774025076], [7.755992058959833, 45.82449005795928], [8.31662967289438, 46.163642483090854], [8.489952426801295, 46.00515086525175], [8.966305779667834, 46.036931871111165], [9.182881707403112, 46.44021474871698], [9.922836541390353, 46.31489940040919], [10.363378126678668, 46.483571275409844], [10.442701450246602, 46.893546250997446], [11.048555942436508, 46.7513585475464], [11.164827915093326, 46.94157949481274], [12.153088006243081, 47.11539317482644], [12.376485223040845, 46.76755910906988]]]]}') WHERE iso_a2 = 'IT';
UPDATE public.countries SET boundary = ST_GeomFromGeoJSON('{"type": "Polygon", "coordinates": [[[-77.56960079619921, 18.490525417550487], [-76.89661861846213, 18.400866807524082], [-76.36535905628554, 18.160700588447597], [-76.19965857614164, 17.886867173732966], [-76.9025614081757, 17.868237819891746], [-77.20634131540348, 17.70111623785982], [-77.76602291534061, 17.86159739834224], [-78.33771928578561, 18.225967922432233], [-78.21772661000388, 18.454532782459196], [-77.79736467152563, 18.524218451404778], [-77.56960079619921, 18.490525417550487]]]}') WHERE iso_a2 = 'JM';
UPDATE public.countries SET boundary = ST_GeomFromGeoJSON('{"type": "Polygon", "coordinates": [[[35.54566531753454, 32.393992011030576], [35.71991824722275, 32.709192409794866], [36.834062127435544, 32.312937526980775], [38.792340529136084, 33.378686428352225], [39.19546837744497, 32.16100881604267], [39.00488569515255, 32.01021698661498], [37.00216556168101, 31.508412990844747], [37.998848911294374, 30.508499864213135], [37.66811974462638, 30.3386652694859], [37.503581984209035, 30.003776150018407], [36.74052778498725, 29.86528331147619], [36.50121422704359, 29.505253607698705], [36.06894087092206, 29.197494615184453], [34.95603722508426, 29.356554673778845], [34.92260257339143, 29.501326198844524], [35.420918409981965, 31.100065822874356], [35.397560662586045, 31.489086005167582], [35.5452519060762, 31.78250478772084], [35.54566531753454, 32.393992011030576]]]}') WHERE iso_a2 = 'JO';
UPDATE public.countries SET boundary = ST_GeomFromGeoJSON('{"type": "MultiPolygon", "coordinates": [[[[134.63842817600388, 34.149233710256425], [134.7663790223585, 33.80633474378368], [134.20341596897086, 33.20117788342964], [133.7929500672765, 33.5219851750976], [133.28026818250888, 33.28957042086495], [133.01485802625788, 32.70456736910478], [132.3631148621927, 32.98938202568138], [132.3711763856302, 33.463642483040076], [132.9243725933148, 34.06029857028204], [133.49296837782222, 33.9446208765967], [133.90410607313638, 34.36493113864262], [134.63842817600388, 34.149233710256425]]], [[[140.9763875673053, 37.14207428644016], [140.59976972876214, 36.34398346612454], [140.77407433488267, 35.84287710219024], [140.25327925024513, 35.13811391859366], [138.97552778539622, 34.66760000257611], [137.21759891169123, 34.60628591566186], [135.7929830262689, 33.46480520276663], [135.12098270074543, 33.84907115328906], [135.07943484918272, 34.59654490817482], [133.340316196832, 34.37593821872076], [132.15677086805132, 33.90493337659652], [130.98614464734348, 33.885761420216284], [132.00003624891005, 33.149992377244615], [131.33279015515737, 31.450354519164847], [130.68631798718596, 31.029579169228242], [130.20241987520498, 31.418237616495418], [130.44767622286216, 32.319474595665724], [129.8146916037189, 32.61030955660439], [129.40846316947258, 33.29605581311759], [130.35393517468466, 33.6041507024417], [130.87845096244715, 34.232742824840045], [131.88422936414392, 34.74971385348792], [132.61767296766251, 35.43339305270942], [134.6083008159778, 35.73161774346582], [135.67753787652893, 35.527134100886826], [136.72383060114245, 37.30498423924038], [137.3906116070045, 36.827390651998826], [138.85760216690628, 37.82748464614346], [139.4264046571429, 38.21596222589764], [140.0547900738121, 39.438807481436385], [139.88337934789988, 40.563312486323696], [140.30578250545372, 41.19500519465956], [141.3689734234267, 41.37855988216029], [141.9142631369705, 39.991616115878685], [141.884600864835, 39.180864569651504], [140.9594893739458, 38.17400096287659], [140.9763875673053, 37.14207428644016]]], [[[143.9101619813795, 44.17409983985374], [144.61342654843966, 43.960882880217525], [145.3208252300831, 44.384732977875444], [145.54313724180278, 43.262088324550604], [144.0596618999999, 42.98835826270056], [143.18384972551732, 41.9952147486992], [141.61149092017249, 42.678790595056086], [141.06728641170665, 41.584593817708], [139.95510623592108, 41.569555975911044], [139.81754357315995, 42.5637588567744], [140.31208703019323, 43.33327261003265], [141.38054894426003, 43.388824774746496], [141.67195234595394, 44.772125352551484], [141.967644891528, 45.55148346616136], [143.14287031470982, 44.510358384776964], [143.9101619813795, 44.17409983985374]]]]}') WHERE iso_a2 = 'JP';
UPDATE public.countries SET boundary = ST_GeomFromGeoJSON('{"type": "Polygon", "coordinates": [[[70.96231489449929, 42.26615428320554], [70.3889648782208, 42.081307684897524], [69.07002729683524, 41.38424428971234], [68.63248294462005, 40.66868073176687], [68.25989586779565, 40.6623245305949], [67.98585574735182, 41.135990708982206], [66.7140470722166, 41.168443508461564], [66.51064863471572, 41.987644151368556], [66.02339155463562, 41.99464630794404], [66.0980123228652, 42.99766002051308], [64.90082441595933, 43.728080552742654], [63.185786981056594, 43.650074978198006], [62.01330040878628, 43.50447663021566], [61.058319940032504, 44.40581696225058], [60.23997195825848, 44.784036770194746], [58.68998904809581, 45.50001373959873], [58.50312706892845, 45.586804307632974], [55.92891727074118, 44.99585846615918], [55.968191359283026, 41.30864166926938], [55.45525109235382, 41.25985911718584], [54.75534549339267, 42.04397146256662], [54.07941775901497, 42.32410940202084], [52.94429324729174, 42.11603424739758], [52.502459751196284, 41.78331553808647], [52.44633914572722, 42.027150783855575], [52.692112257707265, 42.44389537207337], [52.50142622255032, 42.7922978785852], [51.342427199108215, 43.132974758469345], [50.89129194520024, 44.03103363705378], [50.339129266161365, 44.284015611338475], [50.30564293803627, 44.609835516938915], [51.278503452363225, 44.51485423438646], [51.31689904155604, 45.2459982366679], [52.16738976421573, 45.40839142514511], [53.0408764992452, 45.25904653582177], [53.220865512917726, 46.234645901059935], [53.042736850807785, 46.85300608986449], [52.04202273947561, 46.80463694923924], [51.191945428274266, 47.048704738953916], [50.03408328634248, 46.60898997658222], [49.10116000000011, 46.399330000000134], [48.5932410011805, 46.56103424741548], [48.694733514201744, 47.07562816017793], [48.05725304544927, 47.74375275327952], [47.31523115417025, 47.715847479841955], [46.46644575377627, 48.39415233010493], [47.04367150247651, 49.152038886097614], [46.75159630716274, 49.35600576435377], [47.54948042174931, 50.454698391311126], [48.57784142435753, 49.87475962991567], [48.70238162618102, 50.60512848571284], [50.76664839051216, 51.6927623561599], [52.32872358583097, 51.718652248738124], [54.532878452376224, 51.02623973245932], [55.716940545479815, 50.62171662047854], [56.777961053296565, 51.04355133727705], [58.36329064314674, 51.06365346943858], [59.642282342370606, 50.545442206415714], [59.93280724471549, 50.842194118851864], [61.337424350840934, 50.79907013610426], [61.58800337102417, 51.272658799843214], [59.967533807215545, 51.9604204372157], [60.92726850774028, 52.44754832621504], [60.73999311711458, 52.71998647725775], [61.699986199800605, 52.97999644633427], [60.978066440683165, 53.66499339457914], [61.43659142440907, 54.00626455343479], [65.17853356309593, 54.35422781027211], [65.666875848254, 54.601266994843456], [68.16910037625883, 54.97039175070432], [69.06816694527288, 55.38525014914353], [70.86526655465514, 55.169733588270105], [71.18013105660941, 54.13328522400826], [72.22415001820218, 54.376655381886735], [73.5085160663844, 54.0356167669766], [73.42567874542044, 53.489810289109755], [74.38484500519007, 53.54686107036008], [76.89110029491343, 54.49052440044193], [76.52517947785475, 54.17700348572714], [77.80091556184425, 53.404414984747575], [80.03555952344169, 50.86475088154725], [80.56844689323549, 51.38833649352847], [81.94598554883993, 50.81219594990637], [83.38300377801238, 51.069182847693924], [83.93511478061885, 50.88924551045358], [84.41637739455308, 50.311399644565824], [85.11555952346203, 50.11730296487764], [85.54126997268247, 49.69285858824816], [86.82935672398963, 49.82667470966817], [87.35997033076268, 49.21498078062916], [86.59877648310339, 48.54918162698061], [85.7682328633083, 48.45575063739699], [85.72048383987072, 47.45296946877312], [85.16429039911338, 47.00095571551611], [83.18048383986047, 47.33003123635086], [82.45892581576913, 45.539649563166506], [81.94707075391813, 45.31702749285324], [79.96610639844141, 44.91751699480466], [80.86620649610137, 43.180362046881044], [80.1801501809943, 42.92006785742694], [80.25999026888536, 42.349999294599115], [79.64364546094015, 42.496682847659656], [79.1421773619798, 42.856092434249604], [77.65839196158322, 42.960685533208334], [76.00035363149857, 42.98802236589063], [75.6369649596221, 42.87789988867678], [74.21286583852259, 43.29833934180351], [73.64530358266092, 43.09127187760987], [73.48975752146237, 42.50089447689129], [71.84463829945065, 42.845395412765185], [71.18628055205227, 42.70429291439223], [70.96231489449929, 42.26615428320554]]]}') WHERE iso_a2 = 'KZ';
UPDATE public.countries SET boundary = ST_GeomFromGeoJSON('{"type": "Polygon", "coordinates": [[[40.993, -0.85829], [41.58513, -1.68325], [40.88477, -2.08255], [40.63785, -2.49979], [40.26304, -2.57309], [40.12119, -3.27768], [39.80006, -3.68116], [39.60489, -4.34653], [39.20222, -4.67677], [37.7669, -3.67712], [37.69869, -3.09699], [34.07262, -1.05982], [33.90371119710453, -0.95], [33.893568969666944, 0.109813537861896], [34.18, 0.515], [34.6721, 1.17694], [35.03599, 1.90584], [34.59607, 3.05374], [34.47913, 3.5556], [34.005, 4.249884947362048], [34.62019626785388, 4.847122742081988], [35.29800711823298, 5.506], [35.817447662353516, 5.338232082790797], [35.817447662353516, 4.77696566346189], [36.159078632855646, 4.447864127672769], [36.85509323800812, 4.447864127672769], [38.120915, 3.598605], [38.43697, 3.58851], [38.67114, 3.61607], [38.89251, 3.50074], [39.55938425876585, 3.42206], [39.85494, 3.83879], [40.76848, 4.25702], [41.1718, 3.91909], [41.85508309264397, 3.918911920483727], [40.98105, 2.78452], [40.993, -0.85829]]]}') WHERE iso_a2 = 'KE';
UPDATE public.countries SET boundary = ST_GeomFromGeoJSON('{"type": "Polygon", "coordinates": [[[70.96231489449914, 42.266154283205495], [71.18628055205212, 42.70429291439214], [71.8446382994506, 42.8453954127651], [73.48975752146237, 42.50089447689132], [73.64530358266092, 43.09127187760983], [74.21286583852256, 43.29833934180337], [75.63696495962202, 42.87789988867668], [76.00035363149846, 42.98802236589067], [77.65839196158322, 42.96068553320826], [79.14217736197978, 42.85609243424952], [79.64364546094012, 42.49668284765953], [80.2599902688853, 42.34999929459906], [80.11943037305139, 42.12394074153825], [78.54366092317531, 41.58224254003869], [78.18719689322597, 41.18531586360481], [76.90448449087708, 41.06648590754965], [76.52636803579745, 40.42794607193512], [75.4678279967307, 40.56207225194867], [74.77686242055606, 40.36642527929163], [73.8222436868283, 39.893973497063186], [73.96001305531843, 39.660008449861735], [73.6753792662548, 39.4312368841056], [71.784693637992, 39.27946320246437], [70.54916181832562, 39.6041979029865], [69.46488691597753, 39.5266832545487], [69.55960981636852, 40.10321137141298], [70.64801883329997, 39.93575389257117], [71.01419803252017, 40.24436554621823], [71.77487511585656, 40.14584442805378], [73.05541710804917, 40.866033026689465], [71.87011478057047, 41.392900092121266], [71.1578585142916, 41.14358714452912], [70.42002241402821, 41.51999827734314], [71.25924767444823, 42.16771067968946], [70.96231489449914, 42.266154283205495]]]}') WHERE iso_a2 = 'KG';
UPDATE public.countries SET boundary = ST_GeomFromGeoJSON('{"type": "Polygon", "coordinates": [[[103.4972799011397, 10.632555446815928], [103.09068973186726, 11.153660590047165], [102.5849324890267, 12.186594956913282], [102.34809939983302, 13.394247341358223], [102.98842207236163, 14.225721136934467], [104.28141808473661, 14.416743068901367], [105.21877689007889, 14.273211778210694], [106.04394616091552, 13.881091009979956], [106.49637332563088, 14.570583807834282], [107.38272749230109, 14.202440904186972], [107.61454796756243, 13.535530707244206], [107.49140302941089, 12.337205918827948], [105.81052371625313, 11.567614650921229], [106.24967003786946, 10.961811835163587], [105.19991499229235, 10.889309800658097], [104.33433475140347, 10.48654368737523], [103.4972799011397, 10.632555446815928]]]}') WHERE iso_a2 = 'KH';
UPDATE public.countries SET boundary = ST_GeomFromGeoJSON('{"type": "Polygon", "coordinates": [[[128.34971642467661, 38.61224294692785], [129.21291954968007, 37.43239248305595], [129.46044966035817, 36.78418915460283], [129.4683044780665, 35.63214061130395], [129.0913765809296, 35.082484239231434], [128.1858504578791, 34.89037710218639], [127.3865194031884, 34.47567373304412], [126.48574751190876, 34.39004588473648], [126.37391971242914, 34.934560451795946], [126.55923139862779, 35.6845405136479], [126.11739790253229, 36.72548472751926], [126.86014326386339, 36.893924058574626], [126.17475874237624, 37.74968577732804], [126.23733890188176, 37.84037791600028], [126.68371992401893, 37.80477285415118], [127.07330854706737, 38.2561148137884], [127.78003543509101, 38.30453563084589], [128.20574588431145, 38.37039724380189], [128.34971642467661, 38.61224294692785]]]}') WHERE iso_a2 = 'KR';
UPDATE public.countries SET boundary = ST_GeomFromGeoJSON('{"type": "Polygon", "coordinates": [[[47.974519077349896, 29.975819200148504], [48.18318851094449, 29.534476630159762], [48.09394331237642, 29.306299343375002], [48.416094191283946, 28.55200429942667], [47.708850538937384, 28.526062730416143], [47.45982181172283, 29.002519436147224], [46.568713413281756, 29.09902517345229], [47.30262210469096, 30.059069932570722], [47.974519077349896, 29.975819200148504]]]}') WHERE iso_a2 = 'KW';
UPDATE public.countries SET boundary = ST_GeomFromGeoJSON('{"type": "Polygon", "coordinates": [[[105.21877689007889, 14.273211778210694], [105.54433841351769, 14.723933620660418], [105.58903852745016, 15.570316066952858], [104.7793205098688, 16.44186493577145], [104.7169470560925, 17.42885895433008], [103.9564766784853, 18.24095408779688], [103.20019209189374, 18.309632066312773], [102.99870568238771, 17.9616946476916], [102.41300499879162, 17.932781683824288], [102.11359175009248, 18.109101670804165], [101.05954756063517, 17.51249725999449], [101.03593143107777, 18.408928330961615], [101.2820146016517, 19.462584947176765], [100.60629357300316, 19.508344427971224], [100.54888105672688, 20.109237982661128], [100.11598758341785, 20.417849636308187], [100.32910119018953, 20.786121731036232], [101.18000532430754, 21.436572984294028], [101.27002566935997, 21.201651923095184], [101.80311974488293, 21.17436676684507], [101.65201785686152, 22.318198757409547], [102.17043582561358, 22.464753119389304], [102.75489627483466, 21.675137233969465], [103.20386111858645, 20.76656220141375], [104.43500044150805, 20.75873322192153], [104.8225736836971, 19.886641750563882], [104.18338789267894, 19.62466807706022], [103.89653201702671, 19.265180975821806], [105.09459842328152, 18.66697459561108], [105.92576216026403, 17.48531545660896], [106.55600792849569, 16.604283962464805], [107.3127059265456, 15.90853831630318], [107.5645251811039, 15.20217316330556], [107.38272749230109, 14.202440904186972], [106.49637332563088, 14.570583807834282], [106.04394616091552, 13.881091009979956], [105.21877689007889, 14.273211778210694]]]}') WHERE iso_a2 = 'LA';
UPDATE public.countries SET boundary = ST_GeomFromGeoJSON('{"type": "Polygon", "coordinates": [[[35.82110070165024, 33.2774264592763], [35.55279666519081, 33.26427480725802], [35.460709262846706, 33.08904002535628], [35.126052687324545, 33.09090037691878], [35.48220665868013, 33.90545014091944], [35.9795923194894, 34.61005829521913], [35.99840254084364, 34.644914048800004], [36.4481942075121, 34.59393524834407], [36.61175011571589, 34.20178864189718], [36.066460402172055, 33.82491242119255], [35.82110070165024, 33.2774264592763]]]}') WHERE iso_a2 = 'LB';
UPDATE public.countries SET boundary = ST_GeomFromGeoJSON('{"type": "Polygon", "coordinates": [[[-7.71215938966975, 4.364565944837722], [-7.974107224957251, 4.355755113131963], [-9.004793667018674, 4.8324185245922], [-9.913420376006684, 5.593560695819207], [-10.765383876986645, 6.140710760925558], [-11.438779466182055, 6.785916856305747], [-11.19980180504828, 7.105845648624737], [-11.146704270868383, 7.396706447779536], [-10.69559485517648, 7.939464016141088], [-10.23009355309128, 8.406205552601293], [-10.016566534861255, 8.428503933135232], [-9.755342169625834, 8.541055202666925], [-9.337279832384581, 7.928534450711354], [-9.40334815106975, 7.526905218938907], [-9.208786383490846, 7.313920803247953], [-8.926064622422004, 7.309037380396376], [-8.722123582382125, 7.71167430259851], [-8.439298468448698, 7.686042792181738], [-8.48544552248535, 7.39520783124307], [-8.385451626000574, 6.911800645368743], [-8.60288021486862, 6.46756419517166], [-8.311347622094019, 6.193033148621083], [-7.993692592795881, 6.126189683451543], [-7.570152553731688, 5.707352199725904], [-7.539715135111763, 5.313345241716519], [-7.635368211284031, 5.188159084489456], [-7.71215938966975, 4.364565944837722]]]}') WHERE iso_a2 = 'LR';
UPDATE public.countries SET boundary = ST_GeomFromGeoJSON('{"type": "Polygon", "coordinates": [[[14.8513, 22.862950000000126], [14.143870883855243, 22.491288967371133], [13.581424594790462, 23.04050608976928], [11.9995056494717, 23.471668402596435], [11.560669386449035, 24.097909247325617], [10.771363559622955, 24.562532050061748], [10.303846876678449, 24.379313259370974], [9.948261346078027, 24.936953640232616], [9.910692579801776, 25.365454616796796], [9.31941084151822, 26.094324856057483], [9.716285841519664, 26.512206325785655], [9.629056023811074, 27.140953477481048], [9.756128370816782, 27.688258571884205], [9.683884718472882, 28.144173895779318], [9.859997999723475, 28.95998973237107], [9.805634392952356, 29.424638373323376], [9.482139926805417, 30.307556057246188], [9.970017124072967, 30.539324856075382], [10.056575148161699, 30.961831366493527], [9.950225050505196, 31.376069647745283], [10.636901482799487, 31.761420803345686], [10.944789666394513, 32.081814683555365], [11.432253452203781, 32.36890310315283], [11.488787469131012, 33.13699575452324], [12.66331, 32.79278], [13.08326, 32.87882], [13.91868, 32.71196], [15.24563, 32.26508], [15.71394, 31.37626], [16.61162, 31.18218], [18.02109, 30.76357], [19.08641, 30.26639], [19.57404, 30.52582], [20.05335, 30.98576], [19.82033, 31.751790000000142], [20.13397, 32.2382], [20.85452, 32.7068], [21.54298, 32.8432], [22.89576, 32.63858], [23.2368, 32.19149], [23.609130000000107, 32.18726], [23.9275, 32.01667], [24.92114, 31.89936], [25.16482, 31.56915], [24.80287, 31.08929], [24.95762, 30.6616], [24.70007, 30.04419], [25.000000000000114, 29.238654529533562], [25.000000000000114, 25.682499996361003], [25.000000000000114, 22], [25.000000000000114, 20.00304], [23.850000000000136, 20], [23.83766000000014, 19.580470000000105], [19.84926, 21.49509], [15.86085, 23.40972], [14.8513, 22.862950000000126]]]}') WHERE iso_a2 = 'LY';
UPDATE public.countries SET boundary = ST_GeomFromGeoJSON('{"type": "Polygon", "coordinates": [[[81.7879590188914, 7.523055324733164], [81.63732221876059, 6.481775214051922], [81.21801964714433, 6.197141424988288], [80.34835696810441, 5.968369859232155], [79.87246870312853, 6.76346344647493], [79.69516686393513, 8.200843410673386], [80.14780073437964, 9.824077663609557], [80.83881798698656, 9.268426825391188], [81.30431928907177, 8.56420624433369], [81.7879590188914, 7.523055324733164]]]}') WHERE iso_a2 = 'LK';
UPDATE public.countries SET boundary = ST_GeomFromGeoJSON('{"type": "Polygon", "coordinates": [[[28.978262566857243, -28.95559661226171], [29.32516645683259, -29.257386976846256], [29.018415154748027, -29.74376555757737], [28.84839969250774, -30.070050551068256], [28.29106937023991, -30.2262167294543], [28.107204624145425, -30.54573211031495], [27.749397006956485, -30.645105889612225], [26.999261915807637, -29.875953871379984], [27.532511020627478, -29.24271087007536], [28.074338413207784, -28.851468601193588], [28.541700066855498, -28.64750172293757], [28.978262566857243, -28.95559661226171]]]}') WHERE iso_a2 = 'LS';
UPDATE public.countries SET boundary = ST_GeomFromGeoJSON('{"type": "Polygon", "coordinates": [[[22.731098667092652, 54.327536932993326], [22.65105187347254, 54.582740993866736], [22.75776370615526, 54.85657440858138], [22.315723504330577, 55.015298570365864], [21.268448927503467, 55.190481675835315], [21.055800408622417, 56.031076361711065], [22.201156853939494, 56.33780182557949], [23.878263787539964, 56.27367137310527], [24.86068444184076, 56.37252838807963], [25.000934279080894, 56.16453074810484], [25.533046502390334, 56.100296942766036], [26.494331495883756, 55.615106919977634], [26.58827924979039, 55.16717560487167], [25.7684326514798, 54.84696259217509], [25.536353794056993, 54.28242340760253], [24.450683628037037, 53.905702216194754], [23.48412763844985, 53.91249766704114], [23.24398725758951, 54.22056671814914], [22.731098667092652, 54.327536932993326]]]}') WHERE iso_a2 = 'LT';
UPDATE public.countries SET boundary = ST_GeomFromGeoJSON('{"type": "Polygon", "coordinates": [[[6.043073357781111, 50.128051662794235], [6.242751092156993, 49.90222565367873], [6.186320428094177, 49.463802802114515], [5.897759230176405, 49.44266714130703], [5.674051954784829, 49.529483547557504], [5.782417433300907, 50.09032786722122], [6.043073357781111, 50.128051662794235]]]}') WHERE iso_a2 = 'LU';
UPDATE public.countries SET boundary = ST_GeomFromGeoJSON('{"type": "Polygon", "coordinates": [[[21.055800408622417, 56.031076361711065], [21.090423618257972, 56.78387278912294], [21.581866489353672, 57.411870632549935], [22.52434126149288, 57.75337433535076], [23.318452996522097, 57.00623647727487], [24.12072960785343, 57.02569265403277], [24.312862583114622, 57.79342357037697], [25.16459354014927, 57.97015696881519], [25.60280968598437, 57.84752879498657], [26.463532342237787, 57.47638865826633], [27.288184848751513, 57.47452830670383], [27.77001590344093, 57.24425812441123], [27.855282016722526, 56.75932648378429], [28.176709425577997, 56.169129950578814], [27.10245975109453, 55.783313707087686], [26.494331495883756, 55.615106919977634], [25.533046502390334, 56.100296942766036], [25.000934279080894, 56.16453074810484], [24.86068444184076, 56.37252838807963], [23.878263787539964, 56.27367137310527], [22.201156853939494, 56.33780182557949], [21.055800408622417, 56.031076361711065]]]}') WHERE iso_a2 = 'LV';
UPDATE public.countries SET boundary = ST_GeomFromGeoJSON('{"type": "Polygon", "coordinates": [[[-5.193863491222032, 35.75518219659085], [-4.591006232105144, 35.33071198174565], [-3.640056525070008, 35.39985504815198], [-2.604305792644112, 35.17909332940113], [-2.169913702798624, 35.16839630791671], [-1.792985805661658, 34.527918606091305], [-1.73345455566141, 33.91971283623212], [-1.388049282222596, 32.86401500094138], [-1.124551153966195, 32.6515215113572], [-1.30789913573787, 32.26288890230603], [-2.616604783529567, 32.094346218386164], [-3.068980271812649, 31.72449799247329], [-3.647497931320146, 31.637294012980817], [-3.690441046554668, 30.896951605751156], [-4.859646165374443, 30.501187649043885], [-5.242129278982787, 30.000443020135577], [-6.060632290053746, 29.731699734001808], [-7.059227667661901, 29.579228420524657], [-8.674116176782832, 28.84128896739665], [-8.665589565454837, 27.65642588959247], [-8.817809007940525, 27.65642588959247], [-8.817828334986643, 27.65642588959247], [-8.794883999049034, 27.12069631602256], [-9.413037482124508, 27.088476060488546], [-9.735343390328751, 26.860944729107416], [-10.189424200877454, 26.860944729107416], [-10.55126257978526, 26.990807603456886], [-11.39255489749695, 26.883423977154393], [-11.718219773800342, 26.104091701760808], [-12.030758836301658, 26.030866197203125], [-12.50096269372537, 24.770116278578143], [-13.891110398809047, 23.691009019459386], [-14.221167771857154, 22.310163072188345], [-14.630832688850944, 21.860939846274874], [-14.750954555713406, 21.500600083903805], [-17.002961798561074, 21.420734157796687], [-17.02042843267577, 21.422310288981635], [-16.973247849993186, 21.885744533774954], [-16.58913692876763, 22.158234361250095], [-16.261921759495664, 22.679339504481277], [-16.3264139469959, 23.017768459560898], [-15.982610642958065, 23.723358466074103], [-15.426003790742186, 24.35913361256104], [-15.089331834360735, 24.52026072844697], [-14.824645148161693, 25.103532619725314], [-14.800925665739669, 25.63626496022229], [-14.439939947964831, 26.254418443297652], [-13.773804897506466, 26.618892320252286], [-13.139941779014293, 27.640147813420498], [-13.121613369914712, 27.654147671719812], [-12.618836635783111, 28.038185533148663], [-11.688919236690765, 28.148643907172584], [-10.900956997104402, 28.83214223888092], [-10.399592251008642, 29.09858592377779], [-9.564811163765626, 29.933573716749862], [-9.814718390329176, 31.17773550060906], [-9.434793260119363, 32.038096421836485], [-9.300692918321829, 32.564679266890636], [-8.65747636558504, 33.2402452662424], [-7.654178432638219, 33.69706492770251], [-6.91254411460136, 34.11047638603745], [-6.244342006851411, 35.145865383437524], [-5.929994269219833, 35.75998810479399], [-5.193863491222032, 35.75518219659085]]]}') WHERE iso_a2 = 'MA';
UPDATE public.countries SET boundary = ST_GeomFromGeoJSON('{"type": "Polygon", "coordinates": [[[26.619336785597795, 48.22072622333347], [26.857823520624805, 48.368210761094495], [27.522537469195157, 48.467119452501116], [28.259546746541844, 48.15556224221342], [28.670891147585166, 48.1181485052341], [29.12269819511303, 47.849095160506465], [29.05086795422733, 47.5102269557525], [29.415135125452736, 47.34664520933258], [29.559674106573112, 46.928582872091326], [29.908851759569302, 46.67436066343146], [29.838210076626297, 46.52532583270169], [30.024658644335375, 46.42393667254504], [29.759971958136394, 46.34998769793536], [29.170653924279886, 46.3792623968287], [29.07210696789929, 46.517677720722496], [28.862972446414062, 46.43788930926383], [28.933717482221624, 46.2588304713725], [28.65998742037158, 45.93998688413164], [28.485269402792767, 45.5969070501459], [28.233553501099042, 45.488283189468376], [28.0544429867754, 45.944586086605625], [28.160017937947714, 46.37156260841722], [28.128030226359044, 46.810476386088254], [27.551166212684848, 47.40511709247083], [27.233872918412743, 47.82677094175638], [26.924176059687568, 48.123264472030996], [26.619336785597795, 48.22072622333347]]]}') WHERE iso_a2 = 'MD';
UPDATE public.countries SET boundary = ST_GeomFromGeoJSON('{"type": "Polygon", "coordinates": [[[49.54351891459575, -12.469832858940554], [49.808980747279094, -12.895284925999555], [50.056510857957164, -13.555761407121985], [50.21743126811407, -14.758788750876796], [50.47653689962553, -15.226512139550543], [50.377111443895956, -15.706069431219127], [50.20027469259318, -16.000263360256767], [49.86060550313868, -15.414252618066918], [49.67260664246086, -15.710203545802479], [49.863344354050156, -16.451036879138776], [49.77456424337271, -16.8750420060936], [49.49861209493412, -17.106035658438273], [49.435618523970305, -17.953064060134366], [49.041792433473944, -19.118781019774445], [48.54854088724801, -20.496888116134127], [47.93074913919867, -22.391501153251085], [47.54772342305131, -23.781958916928517], [47.095761346226595, -24.941629733990453], [46.282477654817086, -25.178462823184105], [45.40950768411045, -25.60143442149309], [44.833573846217554, -25.34610116953894], [44.03972049334976, -24.988345228782308], [43.76376834491117, -24.46067717864999], [43.697777540874455, -23.574116306250602], [43.345654331237625, -22.776903985283873], [43.254187046081, -22.057413018484123], [43.43329756040464, -21.33647511158019], [43.893682895692926, -21.16330738697013], [43.896370070172104, -20.830459486578174], [44.37432539243966, -20.07236622485639], [44.46439741392439, -19.435454196859048], [44.23242190936617, -18.961994724200906], [44.042976108584156, -18.33138722094317], [43.96308434426091, -17.409944756746782], [44.31246870298628, -16.850495700754955], [44.4465173683514, -16.216219170804507], [44.94493655780653, -16.1793738745804], [45.50273196796499, -15.97437346767854], [45.87299360533626, -15.793454278224687], [46.31224327981721, -15.780018405828798], [46.882182651564285, -15.210182386946315], [47.70512983581236, -14.594302666891764], [48.005214878131255, -14.091232598530375], [47.869047479042166, -13.663868503476586], [48.29382775248138, -13.784067884987486], [48.84506025573879, -13.089174899958664], [48.86350874206698, -12.48786793381042], [49.194651320193316, -12.04055673589197], [49.54351891459575, -12.469832858940554]]]}') WHERE iso_a2 = 'MG';
UPDATE public.countries SET boundary = ST_GeomFromGeoJSON('{"type": "Polygon", "coordinates": [[[-97.14000830767071, 25.8699974634784], [-97.52807247596655, 24.9921440699203], [-97.70294552284224, 24.272343044526735], [-97.77604183631905, 22.93257986092766], [-97.87236670611111, 22.44421173755336], [-97.69904395220419, 21.898689480064263], [-97.38895952023677, 21.411018988525825], [-97.18933346229329, 20.635433254473128], [-96.52557552772032, 19.890930894444068], [-96.29212724484177, 19.320371405509547], [-95.90088497595997, 18.82802419684873], [-94.83906348344271, 18.562717393462208], [-94.42572953975622, 18.144370835843347], [-93.5486512926824, 18.423836981677937], [-92.7861138577835, 18.52483856859226], [-92.0373481920904, 18.704569200103435], [-91.40790340855926, 18.87608327888023], [-90.77186987991087, 19.28412038825678], [-90.53358985061305, 19.8674181177513], [-90.45147599970124, 20.707521877520435], [-90.2786183336849, 20.999855454995554], [-89.60132117385149, 21.26172577563449], [-88.54386633986286, 21.49367544197662], [-87.65841651075772, 21.45884552661198], [-87.05189022494807, 21.5435431991383], [-86.81198238803296, 21.331514797444754], [-86.84590796583262, 20.849864610268355], [-87.38329118523586, 20.25540477139873], [-87.62105445021075, 19.64655304613592], [-87.43675045444178, 19.47240346931227], [-87.58656043165593, 19.04013011319074], [-87.83719112827151, 18.25981598558343], [-88.09066402866318, 18.51664785407405], [-88.30003109409364, 18.49998220466], [-88.4901228502793, 18.48683055264172], [-88.84834387892658, 17.883198147040332], [-89.02985734735176, 18.00151133877256], [-89.15090938999549, 17.955467637600407], [-89.14308041050333, 17.808318996649405], [-90.0679335192309, 17.81932607672752], [-91.00151994501596, 17.817594916245696], [-91.00226925328417, 17.25465770107428], [-91.45392127151513, 17.252177232324186], [-91.0816700915006, 16.91847667079952], [-90.71182186558764, 16.68748301845477], [-90.60084672724093, 16.47077789963879], [-90.438866950222, 16.41010976812811], [-90.46447262242265, 16.069562079324726], [-91.74796017125595, 16.066564846251765], [-92.2292486234063, 15.251446641495875], [-92.08721594925203, 15.064584662328514], [-92.20322953974727, 14.83010285080411], [-92.22775000686983, 14.538828640190957], [-93.35946387406176, 15.615429592343673], [-93.87516883011853, 15.940164292865916], [-94.69165646033014, 16.200975246642884], [-95.25022701697304, 16.128318182840644], [-96.05338212765332, 15.752087917539598], [-96.55743404822829, 15.653515122942792], [-97.26359249549665, 15.917064927631316], [-98.01302995480961, 16.107311713113916], [-98.94767574745651, 16.566043402568766], [-99.69739742714705, 16.70616404872817], [-100.82949886758132, 17.17107107184205], [-101.66608862995446, 17.649026394109626], [-101.91852800170022, 17.916090196193977], [-102.47813208698892, 17.975750637275098], [-103.50098954955808, 18.29229462327885], [-103.91752743204682, 18.74857168220001], [-104.9920096504755, 19.316133938061682], [-105.49303849976144, 19.946767279535436], [-105.73139604370766, 20.434101874264115], [-105.39777299683135, 20.531718654863425], [-105.50066077352443, 20.81689504646613], [-105.27075232625793, 21.07628489835514], [-105.26581722697404, 21.42210358325235], [-105.6031609769754, 21.87114594165257], [-105.69341386597313, 22.269080308516152], [-106.02871639689897, 22.773752346278627], [-106.90998043498837, 23.767774359628902], [-107.91544877809139, 24.54891531015295], [-108.40190487347098, 25.172313951105934], [-109.26019873740665, 25.58060944264406], [-109.44408932171734, 25.82488393808768], [-109.29164384645628, 26.442934068298428], [-109.80145768923182, 26.676175645447927], [-110.3917317370857, 27.16211497650454], [-110.64101884646163, 27.859876003525528], [-111.17891883018785, 27.94124054616907], [-111.75960689985163, 28.46795258230395], [-112.2282346260904, 28.95440867768349], [-112.27182369672869, 29.266844387320077], [-112.80959448937398, 30.02111359305235], [-113.16381059451868, 30.786880804969428], [-113.14866939985717, 31.170965887978923], [-113.87188106978186, 31.567608344035193], [-114.20573666060352, 31.524045111613134], [-114.77645117883503, 31.79953217216115], [-114.93669979537214, 31.393484605427602], [-114.7712318591735, 30.913617255165263], [-114.67389929895177, 30.162681179315996], [-114.33097449426293, 29.750432440707414], [-113.58887508833544, 29.061611436473015], [-113.42405310754054, 28.82617361095123], [-113.27196936730553, 28.7547826197399], [-113.14003943566439, 28.41128937429596], [-112.9622983467965, 28.42519033458251], [-112.76158708377488, 27.780216783147523], [-112.45791052941166, 27.52581370697476], [-112.2449519519368, 27.17172679291076], [-111.61648902061921, 26.662817287700477], [-111.28467464887302, 25.732589830014433], [-110.9878193835724, 25.294606228124564], [-110.71000688357134, 24.82600434010186], [-110.65504899782889, 24.298594672131117], [-110.17285620811344, 24.265547593680424], [-109.77184709352855, 23.811182562754198], [-109.40910437705571, 23.36467234953625], [-109.43339230023292, 23.1855876734287], [-109.85421932660171, 22.818271592698068], [-110.03139197471444, 22.823077500901206], [-110.29507097048366, 23.43097321216669], [-110.94950130902805, 24.000964260345995], [-111.6705684070127, 24.484423122652515], [-112.18203589562148, 24.738412787367167], [-112.14898881717085, 25.47012523040405], [-112.3007108223797, 26.012004299416617], [-112.77729671919155, 26.32195954030317], [-113.46467078332194, 26.768185533143424], [-113.59672990604383, 26.639459540304472], [-113.84893673384425, 26.90006378835244], [-114.46574662968004, 27.142090358991368], [-115.05514217818501, 27.72272675222291], [-114.98225257043742, 27.798200181585116], [-114.57036556685495, 27.74148529714489], [-114.19932878299926, 28.115002549750557], [-114.16201839888464, 28.566111965442303], [-114.93184221073665, 29.27947927501549], [-115.518653937627, 29.5563615992354], [-115.88736528202958, 30.180793768834178], [-116.25835038945291, 30.836464341753583], [-116.72152625208497, 31.635743720012044], [-117.12775999999985, 32.53534], [-115.99135, 32.61239000000012], [-114.72139, 32.72083], [-114.815, 32.52528], [-113.30498, 32.03914], [-111.02361, 31.33472], [-109.035, 31.341940000000136], [-108.24194, 31.34222], [-108.24, 31.754853718166373], [-106.50759, 31.75452], [-106.1429, 31.39995], [-105.63159, 31.08383], [-105.03737, 30.64402], [-104.70575, 30.12173], [-104.4569699999999, 29.57196], [-103.94, 29.27], [-103.11, 28.97], [-102.48, 29.76], [-101.6624, 29.7793], [-100.9576, 29.380710000000136], [-100.45584, 28.69612000000012], [-100.11, 28.110000000000127], [-99.52, 27.54], [-99.3, 26.84], [-99.02, 26.37], [-98.24, 26.06], [-97.53, 25.84], [-97.14000830767071, 25.8699974634784]]]}') WHERE iso_a2 = 'MX';
UPDATE public.countries SET boundary = ST_GeomFromGeoJSON('{"type": "Polygon", "coordinates": [[[20.59023, 41.85541], [20.71731000000011, 41.84711], [20.76216, 42.05186], [21.35270000000014, 42.2068], [21.57663598940212, 42.24522439706186], [21.917080000000112, 42.30364], [22.38052575042468, 42.32025950781508], [22.881373732197346, 41.999297186850356], [22.952377150166512, 41.33799388281119], [22.76177, 41.3048], [22.597308383889015, 41.130487168943205], [22.05537763844427, 41.14986583105269], [21.674160597426976, 40.931274522457954], [21.0200403174764, 40.84272695572588], [20.60518, 41.08622], [20.46315, 41.5150900000001], [20.59023, 41.85541]]]}') WHERE iso_a2 = 'MK';
UPDATE public.countries SET boundary = ST_GeomFromGeoJSON('{"type": "Polygon", "coordinates": [[[-12.170750291380301, 14.616834214735505], [-11.834207526079467, 14.79909699142894], [-11.666078253617854, 15.388208319556298], [-11.349095017939504, 15.411256008358478], [-10.650791388379417, 15.132745876521426], [-10.086846482778213, 15.330485744686271], [-9.700255092802706, 15.264107367407362], [-9.55023840985939, 15.486496893775438], [-5.537744309908447, 15.501689764869257], [-5.315277268891933, 16.20185374599184], [-5.488522508150439, 16.325102037007966], [-5.971128709324248, 20.64083344164763], [-6.453786586930335, 24.956590684503425], [-4.923337368174231, 24.974574082941], [-1.550054897457613, 22.792665920497384], [1.823227573259032, 20.610809434486043], [2.06099083823392, 20.142233384679486], [2.683588494486429, 19.856230170160117], [3.1466610042539, 19.693578599521445], [3.158133172222705, 19.057364203360038], [4.267419467800039, 19.155265204337], [4.270209995143802, 16.852227484601215], [3.723421665063483, 16.184283759012615], [3.638258904646477, 15.568119818580456], [2.749992709981484, 15.409524847876696], [1.385528191746858, 15.323561102759172], [1.01578331869851, 14.968182277887948], [0.374892205414682, 14.92890818934613], [-0.26625729003058, 14.924308986872148], [-0.515854458000348, 15.116157741755728], [-1.066363491205664, 14.973815009007765], [-2.001035122068771, 14.559008287000893], [-2.191824510090385, 14.246417548067356], [-2.967694464520577, 13.79815033615151], [-3.10370683431276, 13.541266791228594], [-3.522802700199861, 13.337661647998615], [-4.006390753587226, 13.472485459848116], [-4.28040503581488, 13.228443508349741], [-4.427166103523803, 12.542645575404295], [-5.220941941743121, 11.713858954307227], [-5.197842576508648, 11.37514577885014], [-5.470564947929006, 10.951269842976048], [-5.404341599946974, 10.370736802609146], [-5.816926235365287, 10.222554633012194], [-6.050452032892267, 10.096360785355444], [-6.205222947606431, 10.524060777219134], [-6.493965013037268, 10.411302801958271], [-6.666460944027548, 10.430810655148449], [-6.850506557635057, 10.138993841996239], [-7.622759161804809, 10.147236232946796], [-7.899589809592372, 10.297382106970828], [-8.029943610048619, 10.206534939001713], [-8.33537716310974, 10.494811916541934], [-8.282357143578281, 10.792597357623846], [-8.407310756860028, 10.909256903522762], [-8.620321010767128, 10.810890814655183], [-8.581305304386774, 11.136245632364805], [-8.376304897484914, 11.393645941610629], [-8.786099005559464, 11.812560939984706], [-8.90526485842453, 12.088358059126437], [-9.127473517279583, 12.308060411015333], [-9.327616339546012, 12.334286200403454], [-9.567911749703214, 12.194243068892476], [-9.890992804392013, 12.060478623904972], [-10.165213792348837, 11.844083563682744], [-10.593223842806282, 11.92397532800598], [-10.870829637078215, 12.17788747807211], [-11.03655595543826, 12.211244615116515], [-11.297573614944511, 12.077971096235771], [-11.456168585648271, 12.076834214725338], [-11.51394283695059, 12.442987575729418], [-11.467899135778524, 12.754518947800975], [-11.55339779300543, 13.141213690641067], [-11.927716030311615, 13.422075100147396], [-12.12488745772126, 13.994727484589788], [-12.170750291380301, 14.616834214735505]]]}') WHERE iso_a2 = 'ML';
UPDATE public.countries SET boundary = ST_GeomFromGeoJSON('{"type": "Polygon", "coordinates": [[[99.54330936075931, 20.186597601802063], [98.95967573445488, 19.752980658440947], [98.25372399291561, 19.708203029860044], [97.79778283080441, 18.627080389881755], [97.37589643757354, 18.445437730375815], [97.85912275593486, 17.567946071843664], [98.49376102091135, 16.83783559820793], [98.90334842325676, 16.17782420497612], [98.53737592976572, 15.308497422746084], [98.1920740091914, 15.123702500870351], [98.43081912637987, 14.622027696180837], [99.09775516153876, 13.827502549693278], [99.21201175333609, 13.269293728076464], [99.19635379435167, 12.80474843998867], [99.58728600463972, 11.892762762901697], [99.03812055867398, 10.960545762572437], [98.55355065307305, 9.932959906448545], [98.45717410684873, 10.67526601810515], [98.76454552612078, 11.441291612183749], [98.42833865762985, 12.032986761925685], [98.50957400919268, 13.122377631070677], [98.1036039571077, 13.640459703012851], [97.77773237507517, 14.837285874892642], [97.59707156778276, 16.10056793869977], [97.1645398294998, 16.92873444260934], [96.505768670643, 16.42724050543285], [95.3693522481124, 15.7143899601826], [94.80840457558412, 15.80345429123764], [94.18880415240454, 16.037936102762018], [94.53348595579135, 17.277240301985728], [94.32481652219676, 18.2135139022499], [93.54098839719364, 19.366492621330025], [93.66325483599621, 19.726961574781996], [93.07827762245219, 19.855144965081976], [92.36855350135562, 20.670883287025347], [92.30323449093868, 21.47548533780982], [92.65225711463799, 21.324047552978485], [92.67272098182556, 22.041238918541254], [93.16612755734837, 22.278459580977103], [93.06029422401463, 22.70311066333557], [93.28632693885928, 23.043658352139005], [93.3251876159428, 24.078556423432204], [94.10674197792507, 23.85074087167348], [94.55265791217164, 24.675238348890336], [94.60324913938538, 25.162495428970402], [95.1551534362626, 26.001307277932085], [95.12476769407496, 26.5735720891323], [96.41936567585097, 27.264589341739224], [97.1339990580153, 27.083773505149964], [97.0519885599681, 27.69905894623315], [97.40256147663614, 27.882536119085444], [97.32711388549004, 28.26158274994634], [97.91198774616944, 28.335945136014345], [98.2462309102333, 27.74722138112918], [98.68269005737046, 27.50881216075062], [98.71209394734451, 26.743535874940267], [98.67183800658916, 25.918702500913525], [97.72460900267914, 25.083637193293], [97.60471967976198, 23.897404690033042], [98.66026248575577, 24.063286037689966], [98.89874922078278, 23.14272207284253], [99.5319922220874, 22.94903880461258], [99.24089887898725, 22.11831431730458], [99.98348921102149, 21.7429367131364], [100.41653771362738, 21.558839423096614], [101.15003299357825, 21.849984442629022], [101.18000532430754, 21.436572984294028], [100.32910119018953, 20.786121731036232], [100.11598758341785, 20.417849636308187], [99.54330936075931, 20.186597601802063]]]}') WHERE iso_a2 = 'MM';
UPDATE public.countries SET boundary = ST_GeomFromGeoJSON('{"type": "Polygon", "coordinates": [[[19.801613396898688, 42.50009349219084], [19.73805138517963, 42.68824738216557], [19.3044900000001, 42.19574], [19.37177000000014, 41.87755], [19.16246, 41.95502], [18.88214, 42.28151], [18.45, 42.48], [18.56, 42.65], [18.70648, 43.20011], [19.03165, 43.43253], [19.21852, 43.52384], [19.48389, 43.35229], [19.63, 43.21377997027054], [19.95857, 43.10604], [20.3398, 42.89852], [20.25758, 42.81275000000011], [20.0707, 42.58863], [19.801613396898688, 42.50009349219084]]]}') WHERE iso_a2 = 'ME';
UPDATE public.countries SET boundary = ST_GeomFromGeoJSON('{"type": "Polygon", "coordinates": [[[87.75126427607671, 49.297197984405486], [88.80556684769552, 49.47052073831242], [90.71366743364068, 50.33181183532109], [92.23471154171968, 50.80217072204172], [93.10421919146269, 50.49529022887643], [94.14756635943563, 50.48053660745709], [94.81594933469873, 50.01343333597085], [95.81402794798399, 49.977466539095715], [97.25972781778141, 49.72606069599574], [98.23176150919156, 50.422400621128745], [97.82573978067431, 51.01099518493318], [98.86149051310034, 52.04736603454669], [99.98173221232354, 51.63400625264399], [100.88948042196262, 51.51685578063832], [102.06522260946733, 51.259920559283124], [102.25590864462433, 50.51056061461868], [103.67654544476022, 50.089966132195116], [104.6215523620817, 50.275329494826074], [105.88659142458675, 50.406019192092224], [106.88880415245535, 50.27429596618023], [107.86817589725095, 49.793705145865815], [108.47516727095129, 49.28254771585074], [109.40244917199666, 49.29296051695755], [110.66201053267878, 49.13012807880587], [111.58123091028662, 49.37796824807769], [112.89773969935439, 49.54356537535699], [114.36245649623527, 50.24830272073741], [114.96210981655018, 50.140247300815126], [115.48569542853141, 49.805177313834605], [116.67880089728618, 49.88853139912139], [116.19180219936757, 49.134598090199106], [115.48528201707306, 48.13538259540344], [115.74283735561579, 47.72654450132629], [116.30895267137323, 47.85341014260284], [117.29550744025741, 47.69770905210743], [118.06414269416672, 48.06673045510369], [118.86657433479495, 47.74706004494617], [119.7728239278975, 47.04805878355013], [119.66326989143876, 46.69267995867892], [118.87432579963873, 46.80541209572365], [117.42170128791419, 46.67273285581426], [116.71786828009886, 46.38820241961521], [115.98509647020009, 45.727235012386004], [114.46033165899607, 45.339816799493825], [113.46390669154417, 44.80889313412712], [112.43606245325881, 45.01164561622429], [111.8733061056003, 45.10207937273506], [111.34837690637946, 44.45744171811009], [111.66773725794323, 44.07317576758771], [111.82958784388137, 43.74311839453952], [111.12968224492023, 43.40683401140015], [110.41210330611528, 42.87123362891103], [109.24359581913146, 42.5194463160841], [107.74477257693795, 42.48151581478187], [106.12931562706169, 42.13432770442891], [104.96499393109347, 41.59740957291635], [104.52228193564899, 41.908346666016556], [103.31227827353482, 41.9074681666676], [101.83304039917994, 42.51487295182628], [100.84586551310827, 42.66380442969145], [99.51581749878004, 42.524691473961724], [97.45175744017801, 42.74888967546002], [96.34939578652781, 42.725635280928685], [95.76245486855669, 43.319449164394605], [95.30687544147153, 44.24133087826547], [94.68892866412533, 44.35233185482842], [93.4807336771413, 44.975472113619965], [92.13389082231822, 45.11507599545646], [90.9455395853343, 45.28607330991028], [90.58576826371828, 45.71971609148753], [90.97080936072501, 46.88814606382293], [90.28082563676392, 47.69354909930793], [88.85429772334676, 48.069081732772965], [88.01383222855173, 48.599462795600616], [87.75126427607671, 49.297197984405486]]]}') WHERE iso_a2 = 'MN';
UPDATE public.countries SET boundary = ST_GeomFromGeoJSON('{"type": "Polygon", "coordinates": [[[34.55998904799935, -11.520020033415925], [35.31239790216904, -11.439146416879147], [36.51408165868426, -11.720938002166735], [36.775150994622805, -11.594537448780805], [37.47128421402661, -11.56875090906716], [37.82764489111139, -11.268769219612835], [38.42755659358775, -11.285202325081656], [39.521029900883775, -10.896853936408228], [40.31658857601719, -10.317096042525698], [40.47838748552303, -10.765440769089993], [40.437253045418686, -11.761710707245015], [40.56081139502857, -12.639176527561027], [40.59962039567975, -14.201975192931862], [40.775475294768995, -14.691764418194241], [40.4772506040126, -15.406294447493972], [40.08926395036522, -16.10077402106446], [39.45255862809705, -16.72089120856694], [38.53835086442152, -17.101023044505958], [37.41113284683888, -17.586368096591237], [36.28127933120936, -18.65968759529345], [35.89649661636406, -18.842260430580637], [35.198399692533144, -19.552811374593894], [34.78638349787005, -19.784011732667736], [34.70189253107284, -20.49704314543101], [35.176127150215365, -21.25436126066841], [35.37342776870574, -21.840837090748877], [35.385848253705404, -22.14], [35.562545536369086, -22.09], [35.533934767404304, -23.070787855727758], [35.37177412287238, -23.5353589820317], [35.60747033055563, -23.706563002214683], [35.45874555841962, -24.12260995859655], [35.04073489761066, -24.478350518493805], [34.21582400893547, -24.81631438568266], [33.01321007663901, -25.357573337507738], [32.574632195777866, -25.727318210556092], [32.66036339695009, -26.148584486599447], [32.91595503106569, -26.215867201443466], [32.830120477028885, -26.742191664336197], [32.07166548028107, -26.73382008230491], [31.98577924981197, -26.291779880480227], [31.83777794772806, -25.84333180105135], [31.75240848158188, -25.484283949487413], [31.930588820124253, -24.36941659922254], [31.670397983534656, -23.658969008073864], [31.19140913262129, -22.2515096981724], [32.244988234188014, -21.116488539313693], [32.50869306817344, -20.395292250248307], [32.65974327976258, -20.304290052982317], [32.772707960752626, -19.715592136313298], [32.61199425632489, -19.419382826416275], [32.65488569512715, -18.672089939043495], [32.84986087416439, -17.97905730557718], [32.847638787575846, -16.713398125884616], [32.32823896661023, -16.392074069893752], [31.8520406430406, -16.319417006091378], [31.636498243951195, -16.071990248277885], [31.17306399915768, -15.860943698797874], [30.338954705534544, -15.880839125230246], [30.27425581230511, -15.507786960515213], [30.17948123548183, -14.796099134991529], [33.214024692525214, -13.971860039936153], [33.789700148256685, -14.45183074306307], [34.064825473778626, -14.35995004644812], [34.45963341648854, -14.613009535381423], [34.51766604995231, -15.013708591372612], [34.307291294092096, -15.478641452702597], [34.38129194513405, -16.183559665596043], [35.033810255683534, -16.801299737213093], [35.339062941231646, -16.10744028083011], [35.77190473810836, -15.896858819240727], [35.68684533055594, -14.611045830954332], [35.26795617039801, -13.887834161029566], [34.907151320136165, -13.565424899960568], [34.55998904799935, -13.579997653866876], [34.28000613784198, -12.280025323132506], [34.55998904799935, -11.520020033415925]]]}') WHERE iso_a2 = 'MZ';
UPDATE public.countries SET boundary = ST_GeomFromGeoJSON('{"type": "Polygon", "coordinates": [[[-12.170750291380301, 14.616834214735505], [-12.830658331747516, 15.303691514542948], [-13.435737677453062, 16.03938304286619], [-14.099521450242179, 16.304302273010492], [-14.577347581428981, 16.59826365810281], [-15.135737270558819, 16.587282416240782], [-15.623666144258692, 16.369337063049812], [-16.12069007004193, 16.455662543193384], [-16.463098110407884, 16.13503611903846], [-16.549707810929064, 16.673892116761962], [-16.270551723688357, 17.166962795474873], [-16.14634741867485, 18.108481553616656], [-16.256883307347167, 19.096715806550307], [-16.37765112961327, 19.593817246981985], [-16.277838100641517, 20.0925206568147], [-16.536323614965468, 20.567866319251493], [-17.06342322434257, 20.999752102130827], [-16.845193650773993, 21.33332347257488], [-12.929101935263532, 21.327070624267563], [-13.118754441774712, 22.771220201096256], [-12.874221564169575, 23.284832261645178], [-11.937224493853321, 23.374594224536168], [-11.96941891117116, 25.933352769468268], [-8.6872936670174, 25.881056219988906], [-8.684399786809053, 27.395744126896005], [-4.923337368174231, 24.974574082941], [-6.453786586930335, 24.956590684503425], [-5.971128709324248, 20.64083344164763], [-5.488522508150439, 16.325102037007966], [-5.315277268891933, 16.20185374599184], [-5.537744309908447, 15.501689764869257], [-9.55023840985939, 15.486496893775438], [-9.700255092802706, 15.264107367407362], [-10.086846482778213, 15.330485744686271], [-10.650791388379417, 15.132745876521426], [-11.349095017939504, 15.411256008358478], [-11.666078253617854, 15.388208319556298], [-11.834207526079467, 14.79909699142894], [-12.170750291380301, 14.616834214735505]]]}') WHERE iso_a2 = 'MR';
UPDATE public.countries SET boundary = ST_GeomFromGeoJSON('{"type": "Polygon", "coordinates": [[[34.55998904799935, -11.520020033415925], [34.28000613784198, -12.280025323132506], [34.55998904799935, -13.579997653866876], [34.907151320136165, -13.565424899960568], [35.26795617039801, -13.887834161029566], [35.68684533055594, -14.611045830954332], [35.77190473810836, -15.896858819240727], [35.339062941231646, -16.10744028083011], [35.033810255683534, -16.801299737213093], [34.38129194513405, -16.183559665596043], [34.307291294092096, -15.478641452702597], [34.51766604995231, -15.013708591372612], [34.45963341648854, -14.613009535381423], [34.064825473778626, -14.35995004644812], [33.789700148256685, -14.45183074306307], [33.214024692525214, -13.971860039936153], [32.68816531752313, -13.712857761289277], [32.991764357237884, -12.783870537978274], [33.306422153463075, -12.435778090060218], [33.114289178201915, -11.607198174692314], [33.315310499817286, -10.796549981329697], [33.48568769708359, -10.525558770391115], [33.2313879737753, -9.6767216935648], [32.75937544122132, -9.23059905358906], [33.73972903823045, -9.417150974162723], [33.94083772409654, -9.693673841980294], [34.28000613784198, -10.159999688358404], [34.55998904799935, -11.520020033415925]]]}') WHERE iso_a2 = 'MW';
UPDATE public.countries SET boundary = ST_GeomFromGeoJSON('{"type": "MultiPolygon", "coordinates": [[[[101.07551557821333, 6.204867051615892], [101.15421878459384, 5.691384182147715], [101.81428185425804, 5.810808417174229], [102.14118696493645, 6.221636053894656], [102.37114708863524, 6.128205064310961], [102.9617053568667, 5.524495144061078], [103.38121463421217, 4.855001125503748], [103.4385754740562, 4.181605536308382], [103.33212202353488, 3.726697902842972], [103.42942874554055, 3.38286876058902], [103.50244754436889, 2.791018581550205], [103.85467410687036, 2.515454006353764], [104.24793175661151, 1.631141058759056], [104.22881147666354, 1.293048000489534], [103.51970747275445, 1.226333726400682], [102.5736153503548, 1.967115383304744], [101.39063846232918, 2.760813706875624], [101.27353966675585, 3.270291652841181], [100.6954354187067, 3.93913971599487], [100.5574076680551, 4.76728038168828], [100.19670617065773, 5.31249258058368], [100.30626020711654, 6.040561835143876], [100.08575687052709, 6.464489447450291], [100.25959638875693, 6.642824815289572], [101.07551557821333, 6.204867051615892]]], [[[118.61832075406485, 4.478202419447541], [117.88203494677018, 4.137551377779488], [117.01521447150637, 4.306094061699469], [115.86551720587678, 4.306559149590157], [115.51907840379201, 3.169238389494396], [115.13403730678525, 2.821481838386219], [114.6213554220175, 1.430688177898887], [113.80584964401956, 1.217548732911041], [112.8598091980522, 1.497790025229946], [112.38025190638368, 1.410120957846758], [111.79754845586044, 0.904441229654651], [111.15913781132659, 0.976478176269509], [110.51406090702713, 0.773131415200993], [109.83022667850886, 1.338135687664192], [109.66326012577375, 2.006466986494985], [110.39613528853707, 1.663774725751395], [111.1688529805975, 1.850636704918784], [111.3700810079421, 2.697303371588873], [111.79692833867287, 2.885896511238073], [112.99561486211527, 3.102394924324869], [113.71293541875875, 3.893509426281128], [114.20401655482843, 4.52587392823682], [114.65959598191355, 4.00763682699781], [114.8695573263154, 4.348313706881953], [115.34746097215069, 4.316636053887009], [115.40570031134362, 4.955227565933825], [115.45071048386981, 5.447729803891562], [116.22074100145099, 6.143191229675622], [116.72510298061977, 6.924771429873999], [117.12962609260049, 6.928052883324568], [117.64339318244632, 6.422166449403306], [117.68907514859237, 5.987490139180181], [118.34769127815221, 5.708695786965464], [119.18190392463995, 5.407835598162251], [119.11069380094173, 5.016128241389865], [118.43972700406411, 4.96651886638962], [118.61832075406485, 4.478202419447541]]]]}') WHERE iso_a2 = 'MY';
UPDATE public.countries SET boundary = ST_GeomFromGeoJSON('{"type": "Polygon", "coordinates": [[[16.344976840895242, -28.5767050106977], [15.601818068105816, -27.821247247022804], [15.21047244635946, -27.090955905874047], [14.989710727608553, -26.117371921495156], [14.743214145576331, -25.39292001719538], [14.408144158595833, -23.853014011329847], [14.385716586981149, -22.65665292734069], [14.257714064194175, -22.111208184499958], [13.86864220546866, -21.699036960539978], [13.35249799973744, -20.872834161057504], [12.826845330464494, -19.673165785401665], [12.608564080463621, -19.0453488094877], [11.794918654028066, -18.069129327061916], [11.734198846085121, -17.301889336824473], [12.215461460019355, -17.111668389558083], [12.814081251688407, -16.94134286872407], [13.462362094789967, -16.971211846588773], [14.05850141770901, -17.423380629142663], [14.209706658595024, -17.35310068122572], [18.263309360434164, -17.309950860262006], [18.956186964603603, -17.789094740472258], [21.377176141045567, -17.930636488519696], [23.215048455506064, -17.523116143465984], [24.033861525170778, -17.295843194246324], [24.682349074001507, -17.353410739819473], [25.07695031098226, -17.57882333747662], [25.08444339366457, -17.661815687737374], [24.520705193792537, -17.887124932529936], [24.217364536239213, -17.88934701911849], [23.579005568137717, -18.28126108162006], [23.1968583513393, -17.869038181227786], [21.655040317478978, -18.219146010005225], [20.910641310314535, -18.252218926672022], [20.88113406747587, -21.814327080983148], [19.89545779794068, -21.84915699634787], [19.895767856534434, -24.76779021576059], [19.894734327888614, -28.461104831660776], [19.002127312911085, -28.972443129188868], [18.464899122804752, -29.04546192801728], [17.83615197110953, -28.85637786226132], [17.387497185951503, -28.78351409272978], [17.218928663815404, -28.35594329194681], [16.824017368240902, -28.08216155366447], [16.344976840895242, -28.5767050106977]]]}') WHERE iso_a2 = 'NA';
UPDATE public.countries SET boundary = ST_GeomFromGeoJSON('{"type": "Polygon", "coordinates": [[[165.77998986232637, -21.08000497811563], [166.59999148993384, -21.700018812753527], [167.1200114280869, -22.15999073658349], [166.7400346214448, -22.39997608814695], [166.18973229396866, -22.129708347260454], [165.47437544175222, -21.679606621998232], [164.82981530177568, -21.14981983814195], [164.16799523341365, -20.444746595951628], [164.029605747736, -20.105645847252354], [164.45996707586272, -20.1200118954295], [165.02003624904205, -20.45999114347773], [165.46000939357512, -20.80002206795826], [165.77998986232637, -21.08000497811563]]]}') WHERE iso_a2 = 'NC';
UPDATE public.countries SET boundary = ST_GeomFromGeoJSON('{"type": "Polygon", "coordinates": [[[2.15447350424995, 11.940150051313424], [2.177107781593918, 12.625017808477537], [1.024103224297619, 12.851825669806601], [0.993045688490156, 13.335749620003867], [0.429927605805517, 13.988733018443895], [0.295646396495215, 14.444234930880668], [0.374892205414767, 14.928908189346146], [1.015783318698482, 14.96818227788799], [1.385528191746971, 15.323561102759243], [2.749992709981541, 15.409524847876753], [3.638258904646591, 15.568119818580442], [3.723421665063597, 16.184283759012658], [4.270209995143887, 16.852227484601315], [4.267419467800096, 19.155265204337127], [5.677565952180714, 19.6012069767998], [8.57289310062987, 21.56566071215923], [11.9995056494717, 23.471668402596435], [13.581424594790462, 23.04050608976928], [14.143870883855243, 22.491288967371133], [14.8513, 22.862950000000126], [15.096887648181848, 21.30851878507491], [15.471076694407316, 21.048457139565983], [15.487148064850146, 20.730414537025638], [15.903246697664315, 20.387618923417506], [15.685740594147774, 19.957180080642388], [15.30044111497972, 17.927949937405003], [15.247731154041844, 16.627305813050782], [13.972201775781684, 15.684365953021143], [13.540393507550789, 14.367133693901224], [13.956698846094127, 13.996691189016929], [13.95447675950561, 13.353448798063766], [14.595781284247607, 13.33042694747786], [14.495787387762903, 12.859396267137356], [14.21353071458475, 12.802035427293333], [14.18133629726691, 12.483656927943173], [13.995352817448293, 12.461565253138303], [13.318701613018561, 13.556356309457954], [13.083987257548813, 13.596147162322495], [12.30207116054055, 13.037189032437539], [11.527803175511508, 13.32898000737356], [10.989593133191534, 13.387322699431195], [10.701031935273818, 13.246917832894042], [10.11481448735475, 13.277251898649467], [9.52492801274309, 12.851102199754564], [9.014933302454438, 12.826659247280418], [7.804671258178871, 13.343526923063735], [7.330746697630047, 13.098038031461215], [6.820441928747812, 13.115091254117601], [6.445426059605722, 13.492768459522722], [5.443058302440136, 13.865923977102227], [4.368343540066007, 13.747481594289411], [4.107945997747379, 13.531215725147945], [3.967282749048934, 12.956108710171577], [3.680633579125924, 12.55290334721417], [3.611180454125588, 11.660167141155966], [2.848643019226586, 12.23563589115821], [2.490163608418015, 12.23305206954359], [2.15447350424995, 11.940150051313424]]]}') WHERE iso_a2 = 'NE';
UPDATE public.countries SET boundary = ST_GeomFromGeoJSON('{"type": "Polygon", "coordinates": [[[8.500287713259695, 4.771982937026849], [7.462108188515941, 4.412108262546241], [7.082596469764439, 4.464689032403228], [6.6980721370806, 4.240594183769517], [5.898172641634687, 4.262453314628985], [5.362804803090881, 4.887970689305959], [5.033574252959369, 5.611802476418234], [4.325607130560684, 6.270651149923467], [3.574180128604553, 6.258300482605719], [2.691701694356254, 6.258817246928629], [2.74906253420022, 7.870734361192888], [2.723792758809509, 8.50684540448971], [2.912308383810256, 9.137607937044322], [3.220351596702101, 9.444152533399702], [3.705438266625919, 10.063210354040208], [3.600070021182802, 10.332186184119408], [3.797112257511714, 10.734745591673105], [3.572216424177469, 11.32793935795152], [3.611180454125559, 11.660167141155968], [3.680633579125811, 12.552903347214226], [3.967282749048849, 12.956108710171575], [4.107945997747322, 13.531215725147831], [4.368343540066064, 13.747481594289326], [5.443058302440164, 13.865923977102298], [6.445426059605637, 13.492768459522678], [6.820441928747754, 13.115091254117518], [7.330746697630019, 13.0980380314612], [7.804671258178786, 13.343526923063747], [9.014933302454466, 12.82665924728043], [9.524928012742947, 12.851102199754479], [10.114814487354693, 13.27725189864941], [10.701031935273706, 13.246917832894084], [10.989593133191535, 13.38732269943111], [11.527803175511394, 13.328980007373588], [12.302071160540523, 13.037189032437524], [13.08398725754887, 13.596147162322566], [13.318701613018561, 13.556356309457826], [13.99535281744835, 12.461565253138346], [14.181336297266794, 12.483656927943116], [14.577177768622533, 12.085360826053503], [14.468192172918975, 11.904751695193411], [14.415378859116684, 11.572368882692075], [13.572949659894562, 10.798565985553566], [13.308676385153918, 10.160362046748928], [13.167599724997103, 9.640626328973411], [12.955467970438974, 9.417771714714704], [12.753671502339216, 8.717762762888995], [12.218872104550599, 8.305824082874324], [12.063946160539558, 7.799808457872302], [11.839308709366803, 7.397042344589437], [11.74577436691851, 6.981382961449754], [11.058787876030351, 6.644426784690594], [10.497375115611419, 7.055357774275564], [10.118276808318257, 7.03876963950988], [9.522705926154401, 6.453482367372117], [9.233162876023044, 6.444490668153335], [8.757532993208628, 5.479665839047911], [8.500287713259695, 4.771982937026849]]]}') WHERE iso_a2 = 'NG';
UPDATE public.countries SET boundary = ST_GeomFromGeoJSON('{"type": "Polygon", "coordinates": [[[-85.7125404528073, 11.088444932494824], [-86.05848832878526, 11.403438625529944], [-86.52584998243296, 11.806876532432597], [-86.74599158399633, 12.143961900272487], [-87.16751624220116, 12.458257961471658], [-87.66849341505471, 12.909909979702633], [-87.55746660027562, 13.064551703336065], [-87.39238623731923, 12.914018256069838], [-87.31665442579549, 12.984685777228975], [-87.00576900912758, 13.025794379117158], [-86.88055701368437, 13.254204209847245], [-86.7338217841916, 13.263092556201443], [-86.75508663607971, 13.754845485890913], [-86.5207081774199, 13.77848745366444], [-86.31214209668993, 13.77135610600817], [-86.0962638007906, 14.038187364147248], [-85.80129472526859, 13.83605499923759], [-85.69866533073693, 13.960078436738087], [-85.51441301140025, 14.079011745657837], [-85.1653645494848, 14.35436961512508], [-85.14875057650296, 14.560196844943617], [-85.05278744173694, 14.551541042534723], [-84.9245006985724, 14.79049286545235], [-84.82003679069436, 14.81958669683267], [-84.64958207877962, 14.666805324761754], [-84.4493359036486, 14.621614284722497], [-84.22834164095241, 14.748764146376658], [-83.97572140169359, 14.749435939996461], [-83.62858496777292, 14.880073960830302], [-83.48998877636612, 15.016267198135537], [-83.14721900097413, 14.99582916916411], [-83.23323442252394, 14.899866034398102], [-83.2841615465476, 14.6766238468972], [-83.18212643098728, 14.31070302983845], [-83.41249996614445, 13.970077826386557], [-83.51983191601468, 13.567699286345883], [-83.55220720084554, 13.127054348193086], [-83.49851538769427, 12.869292303921227], [-83.47332312695198, 12.419087225794428], [-83.62610449902292, 12.320850328007566], [-83.71961300325506, 11.893124497927728], [-83.65085751009072, 11.62903209070012], [-83.8554703437504, 11.373311265503787], [-83.80893571647155, 11.103043524617275], [-83.65561174186158, 10.938764146361422], [-83.89505449088595, 10.726839097532446], [-84.19017859570485, 10.793450018756674], [-84.35593075228104, 10.999225572142905], [-84.67306901725627, 11.082657172078143], [-84.90300330273895, 10.952303371621896], [-85.5618519762442, 11.217119248901597], [-85.7125404528073, 11.088444932494824]]]}') WHERE iso_a2 = 'NI';
UPDATE public.countries SET boundary = ST_GeomFromGeoJSON('{"type": "Polygon", "coordinates": [[[6.074182570020923, 53.510403347378144], [6.905139601274129, 53.48216217713065], [7.092053256873896, 53.144043280644894], [6.842869500362383, 52.22844025329755], [6.589396599970826, 51.852029120483394], [5.988658074577813, 51.851615709025054], [6.15665815595878, 50.80372101501058], [5.606975945670001, 51.03729848896978], [4.973991326526914, 51.47502370869813], [4.047071160507528, 51.26725861266857], [3.314971144228537, 51.34575511331991], [3.830288527043137, 51.62054454203195], [4.705997348661185, 53.091798407597764], [6.074182570020923, 53.510403347378144]]]}') WHERE iso_a2 = 'NL';
UPDATE public.countries SET boundary = ST_GeomFromGeoJSON('{"type": "MultiPolygon", "coordinates": [[[[28.165547316202918, 71.18547435168051], [31.293418409965483, 70.45378774685992], [30.005435011522792, 70.1862588568849], [31.101078728975125, 69.55808014594487], [29.399580519332886, 69.15691600206307], [28.591929559043194, 69.0647769232867], [29.015572950971972, 69.76649119737797], [27.73229210786789, 70.1641930202963], [26.1796220232263, 69.82529897732616], [25.689212680776393, 69.09211375596902], [24.73567915212672, 68.64955678982145], [23.662049594830762, 68.89124746365053], [22.356237827247412, 68.84174144151496], [21.24493615081073, 69.37044302029312], [20.645592889089585, 69.10624726020086], [20.025268995857914, 69.06513865831272], [19.878559604581255, 68.40719432237262], [17.99386844246439, 68.56739126247734], [17.729181756265348, 68.01055186631623], [16.76887861498554, 68.01393667263139], [16.108712192456835, 67.3024555528369], [15.108411492583059, 66.19386688909543], [13.55568973150909, 64.78702769638147], [13.919905226302205, 64.44542064071612], [13.57191613124877, 64.04911408146967], [12.579935336973932, 64.06621898055835], [11.930569288794231, 63.12831757267699], [11.992064243221535, 61.800362453856565], [12.631146681375242, 61.2935716823701], [12.3003658382749, 60.11793284773006], [11.468271925511175, 59.432393296946], [11.027368605196926, 58.8561494004594], [10.356556837616097, 59.46980703392538], [8.382000359743643, 58.31328847923328], [7.048748406613299, 58.078884182357285], [5.665835402050419, 58.58815542259367], [5.308234490590735, 59.66323191999382], [4.992078077829007, 61.970998033284275], [5.912900424837886, 62.614472968182696], [8.553411085655767, 63.45400828719647], [10.527709181366788, 64.48603831649748], [12.358346795306375, 65.87972585719316], [14.761145867581604, 67.81064158799515], [16.43592736172897, 68.56320547146169], [19.184028354578516, 69.81744415961782], [21.378416375420613, 70.25516937934606], [23.023742303161583, 70.20207184516627], [24.546543409938522, 71.03049673123724], [26.37004967622181, 70.98626170519537], [28.165547316202918, 71.18547435168051]]], [[[24.72412, 77.85385], [22.49032, 77.44493], [20.72601, 77.67704], [21.41611, 77.93504], [20.8119, 78.25463], [22.88426, 78.45494], [23.28134, 78.07954], [24.72412, 77.85385]]], [[[18.25183, 79.70175], [21.54383, 78.95611], [19.02737, 78.5626], [18.47172, 77.82669], [17.59441, 77.63796], [17.1182, 76.80941], [15.91315, 76.77045], [13.76259, 77.38035], [14.66956, 77.73565], [13.1706, 78.02493], [11.22231, 78.8693], [10.44453, 79.65239], [13.17077, 80.01046], [13.71852, 79.66039], [15.14282, 79.67431], [15.52255, 80.01608], [16.99085, 80.05086], [18.25183, 79.70175]]], [[[25.447625359811894, 80.40734039989451], [27.4075057309135, 80.05640574820046], [25.92465050629818, 79.51783397085455], [23.02446577321362, 79.4000117052291], [20.075188429451885, 79.56682322866726], [19.897266473070914, 79.84236196564751], [18.462263624757924, 79.85988027619442], [17.368015170977458, 80.31889618602702], [20.455992059010697, 80.59815562613224], [21.907944777115404, 80.35767934846209], [22.919252557067438, 80.6571442735935], [25.447625359811894, 80.40734039989451]]]]}') WHERE iso_a2 = 'NO';
UPDATE public.countries SET boundary = ST_GeomFromGeoJSON('{"type": "Polygon", "coordinates": [[[88.12044070836987, 27.876541652939594], [88.04313276566123, 27.445818589786825], [88.17480431514092, 26.81040517832595], [88.06023766474982, 26.41461538340249], [87.2274719583663, 26.397898057556077], [86.02439293817918, 26.63098460540857], [85.25177859898338, 26.726198431906344], [84.6750179381738, 27.234901231387536], [83.30424889519955, 27.36450572357556], [81.99998742058497, 27.925479234319994], [81.05720258985203, 28.416095282499043], [80.08842451367627, 28.79447011974014], [80.4767212259174, 29.72986522065534], [81.11125613802932, 30.183480943313402], [81.52580447787474, 30.42271698660863], [82.32751264845088, 30.115268052688137], [83.33711510613719, 29.463731594352197], [83.89899295444673, 29.320226141877658], [84.23457970575015, 28.839893703724698], [85.01163821812304, 28.642773952747344], [85.82331994013151, 28.203575954698707], [86.9545170430006, 27.974261786403517], [88.12044070836987, 27.876541652939594]]]}') WHERE iso_a2 = 'NP';
UPDATE public.countries SET boundary = ST_GeomFromGeoJSON('{"type": "MultiPolygon", "coordinates": [[[[173.02037479074076, -40.919052422856424], [173.24723432850206, -41.331998793300784], [173.9584053897029, -40.92670053483562], [174.24758670480813, -41.34915536882167], [174.2485168805895, -41.770008233406756], [173.8764465680879, -42.233184096038826], [173.22273969959568, -42.970038344088564], [172.71124637277077, -43.372287693048506], [173.08011274647023, -43.853343601253584], [172.30858361235252, -43.865694268571346], [171.45292524646365, -44.24251881284373], [171.18513797432726, -44.89710418068489], [170.61669721911662, -45.90892872495971], [169.8314221540093, -46.3557748349876], [169.33233117093428, -46.641235446967855], [168.41135379462858, -46.61994475686359], [167.76374474514685, -46.29019744240921], [166.67688602118423, -46.21991749449225], [166.50914432196473, -45.85270476662622], [167.04642418850327, -45.11094125750867], [168.3037634625969, -44.12397307716613], [168.94940880765157, -43.93581918719143], [169.66781456937318, -43.55532561622634], [170.52491987536618, -43.03168832781283], [171.12508996000403, -42.51275359473779], [171.56971398344322, -41.767424411792135], [171.94870893787194, -41.51441659929115], [172.09722700427878, -40.95610442480968], [172.798579543344, -40.49396209082347], [173.02037479074076, -40.919052422856424]]], [[[174.61200890533055, -36.156397393540544], [175.3366158389272, -37.20909799575827], [175.35759647043753, -36.52619394302113], [175.8088867536425, -36.79894215265769], [175.95849002512753, -37.55538176854607], [176.76319542877658, -37.8812533505787], [177.43881310456052, -37.961248467766495], [178.0103544457087, -37.57982472102013], [178.51709354076283, -37.6953732236248], [178.27473107331386, -38.5828125953731], [177.97046023997936, -39.166342868812976], [177.20699262929915, -39.145775648760846], [176.93998050364704, -39.44973642350158], [177.03294640534014, -39.87994272233148], [176.88582360260526, -40.065977878582174], [176.50801720611938, -40.60480803808959], [176.0124402204403, -41.28962411882151], [175.239567499083, -41.68830779395324], [175.06789839100944, -41.42589487077508], [174.65097293527847, -41.28182097754545], [175.22763024322367, -40.459235528323404], [174.90015669179, -39.90893320084723], [173.82404666574402, -39.50885426204351], [173.85226199777534, -39.14660247167747], [174.5748018740804, -38.797683200842755], [174.74347374908106, -38.027807712558385], [174.69701663645063, -37.38112883885796], [174.29202843657922, -36.71109221776145], [174.31900353423558, -36.53482390721389], [173.84099653553582, -36.121980889634116], [173.0541711774596, -35.23712533950034], [172.63600548735374, -34.52910654066939], [173.00704227120949, -34.45066171645034], [173.5512984561075, -35.006183363587965], [174.3293904971263, -35.26549570082862], [174.61200890533055, -36.156397393540544]]]]}') WHERE iso_a2 = 'NZ';
UPDATE public.countries SET boundary = ST_GeomFromGeoJSON('{"type": "MultiPolygon", "coordinates": [[[[58.86114139184659, 21.114034532144302], [58.48798587426697, 20.42898590746711], [58.034318475176605, 20.48143748624335], [57.826372511634105, 20.243002427648634], [57.665762160070955, 19.736004950433113], [57.78870039249338, 19.06757029873765], [57.694390903560674, 18.944709580963803], [57.234263950433814, 18.947991034414258], [56.609650913321985, 18.57426707607948], [56.512189162019496, 18.087113348863937], [56.28352094912802, 17.87606679938395], [55.6614917336307, 17.88412832282154], [55.2699394061552, 17.632309068263197], [55.274900343655105, 17.228354397037663], [54.79100223167413, 16.950696926333364], [54.239252964093765, 17.044980577049984], [53.570508253804604, 16.707662665264678], [53.10857262554751, 16.65105113368898], [52.78218427919208, 17.349742336491232], [52.00000980002224, 19.000003363516072], [54.99998172386242, 19.99999400479612], [55.66665937685988, 22.00000112557231], [55.2083410988632, 22.708329982997014], [55.234489373602884, 23.110992743415352], [55.525841098864504, 23.524869289640918], [55.528631626208295, 23.933604030853502], [55.98121382022052, 24.130542914317857], [55.804118686756254, 24.269604193615294], [55.886232537668064, 24.920830593357493], [56.396847365144, 24.924732163995515], [56.84514041527606, 24.241673081961494], [57.40345258975745, 23.87859446867884], [58.13694786970834, 23.74793060962884], [58.72921146020545, 23.565667832935418], [59.18050174341036, 22.99239533130546], [59.45009769067704, 22.6602709009656], [59.80806033716286, 22.533611965418203], [59.806148309168094, 22.310524807214193], [59.44219119653641, 21.714540513592084], [59.282407667889885, 21.433885809814882], [58.86114139184659, 21.114034532144302]]], [[[56.39142133975341, 25.89599070892126], [56.26104170108093, 25.714606431576755], [56.07082075381456, 26.05546417897395], [56.36201744977936, 26.39593435312895], [56.48567915225382, 26.309117946878672], [56.39142133975341, 25.89599070892126]]]]}') WHERE iso_a2 = 'OM';
UPDATE public.countries SET boundary = ST_GeomFromGeoJSON('{"type": "Polygon", "coordinates": [[[75.15802778514092, 37.13303091078912], [75.89689741405013, 36.666806138651836], [76.19284834178569, 35.89840342868783], [77.83745079947457, 35.494009507787766], [76.87172163280403, 34.65354401299274], [75.75706098826834, 34.50492259372132], [74.24020267120497, 34.748887030571254], [73.74994835805197, 34.31769887952785], [74.10429365427734, 33.44147329358685], [74.45155927927871, 32.7648996038055], [75.25864179881322, 32.2711054550405], [74.40592898956501, 31.69263947196528], [74.42138024282028, 30.979814764931177], [73.45063846221743, 29.97641347911987], [72.8237516620847, 28.961591701772054], [71.77766564320032, 27.913180243434525], [70.61649620960193, 27.989196275335868], [69.51439293811313, 26.940965684511372], [70.16892662952202, 26.491871649678842], [70.2828731627256, 25.72222870533983], [70.84469933460284, 25.21510203704352], [71.04324018746823, 24.3565239527302], [68.84259931831878, 24.35913361256094], [68.1766451353734, 23.69196503345671], [67.44366661974547, 23.94484365487699], [67.14544192898907, 24.663611151624647], [66.37282758979327, 25.42514089609385], [64.53040774929113, 25.23703868255143], [62.90570071803461, 25.21840932871021], [61.49736290878419, 25.0782370061185], [61.87418745305655, 26.239974880472104], [63.31663170761959, 26.756532497661667], [63.2338977395203, 27.21704702403071], [62.75542565292986, 27.378923448184988], [62.72783043808599, 28.25964488373539], [61.77186811711863, 28.6993338078908], [61.36930870956494, 29.303276272085924], [60.87424848820879, 29.829238999952608], [62.54985680527278, 29.31857249604431], [63.55026085801117, 29.468330796826166], [64.14800215033125, 29.340819200145972], [64.35041873561852, 29.560030625928093], [65.0468620136161, 29.472180691031905], [66.34647260932442, 29.887943427036177], [66.38145755398602, 30.738899237586452], [66.93889122911847, 31.304911200479353], [67.68339358914747, 31.30315420178142], [67.79268924344478, 31.58293040620963], [68.55693200060932, 31.713310044882018], [68.92667687365767, 31.620189113892067], [69.31776411324256, 31.901412258424443], [69.26252200712256, 32.5019440780883], [69.68714725126486, 33.105498969041236], [70.3235941913716, 33.35853261975839], [69.9305432473596, 34.02012014417511], [70.8818030129884, 33.98885590263852], [71.15677330921346, 34.34891144463215], [71.11501875192164, 34.733125718722235], [71.61307620635071, 35.153203436822864], [71.49876793812109, 35.650563259416], [71.26234826038575, 36.074387518857804], [71.84629194528392, 36.50994232842986], [72.92002485544447, 36.72000702569632], [74.06755171091783, 36.83617564548845], [74.57589277537298, 37.02084137628346], [75.15802778514092, 37.13303091078912]]]}') WHERE iso_a2 = 'PK';
UPDATE public.countries SET boundary = ST_GeomFromGeoJSON('{"type": "Polygon", "coordinates": [[[-77.88157141794525, 7.223771267114785], [-78.21493608266012, 7.512254950384161], [-78.42916073272607, 8.052041123888927], [-78.18209570993864, 8.319182440621773], [-78.4354652574657, 8.38770538984079], [-78.62212053090394, 8.718124497915028], [-79.12030717641375, 8.996092027213024], [-79.55787736684519, 8.932374986197146], [-79.76057817251005, 8.5845150822244], [-80.16448116730334, 8.333315944853595], [-80.38265906443962, 8.298408514840432], [-80.4806892564973, 8.09030752200107], [-80.00368994822716, 7.547524115423372], [-80.276670701809, 7.419754136581716], [-80.42115800649708, 7.271571966984765], [-80.8864009264208, 7.220541490096537], [-81.05954281281473, 7.817921047390597], [-81.18971574575795, 7.64790558515034], [-81.51951473664468, 7.706610012233909], [-81.72131120474447, 8.108962714058435], [-82.13144120962892, 8.175392767769637], [-82.39093441438257, 8.29236237226229], [-82.82008134635042, 8.290863755725823], [-82.85095801464482, 8.073822740099956], [-82.96578304719736, 8.225027980985985], [-82.91317643912421, 8.42351715741907], [-82.82977067740516, 8.62629547773237], [-82.86865719270477, 8.807266343618522], [-82.71918311230053, 8.925708726431495], [-82.92715491405916, 9.074330145702916], [-82.93289099804358, 9.476812038608173], [-82.54619625520348, 9.566134751824677], [-82.18712256542341, 9.20744863528678], [-82.20758643261097, 8.9955752628901], [-81.80856686066929, 8.950616766796173], [-81.71415401887204, 9.031955471223583], [-81.43928707551154, 8.786234035675719], [-80.94730160187676, 8.858503526235907], [-80.52190121125008, 9.111072089062432], [-79.91459977895599, 9.31276520429762], [-79.57330278188431, 9.611610012241528], [-79.02119177927793, 9.552931423374105], [-79.05845048696037, 9.454565334506526], [-78.50088762074719, 9.420458889193881], [-78.05592770049802, 9.2477304142583], [-77.72951351592641, 8.946844387238869], [-77.35336076527386, 8.67050466555807], [-77.47472286651133, 8.524286200388218], [-77.24256649444008, 7.935278225125444], [-77.43110795765699, 7.638061224798734], [-77.7534138658614, 7.709839789252143], [-77.88157141794525, 7.223771267114785]]]}') WHERE iso_a2 = 'PA';
UPDATE public.countries SET boundary = ST_GeomFromGeoJSON('{"type": "Polygon", "coordinates": [[[-69.59042375352405, -17.580011895419332], [-69.85844356960587, -18.092693780187012], [-70.37257239447771, -18.34797535570887], [-71.37525021023693, -17.773798516513857], [-71.46204077827113, -17.363487644116383], [-73.44452958850042, -16.359362888252996], [-75.23788265654144, -15.265682875227782], [-76.00920508492995, -14.649286390850321], [-76.42346920439775, -13.823186944232432], [-76.25924150257417, -13.535039157772943], [-77.10619238962184, -12.22271615972082], [-78.09215287953464, -10.377712497604065], [-79.03695309112695, -8.386567884965892], [-79.44592037628485, -7.93083342858386], [-79.76057817251005, -7.194340915560084], [-80.53748165558608, -6.541667575713717], [-81.24999630402642, -6.136834405139183], [-80.92634680858244, -5.690556735866565], [-81.41094255239946, -4.736764825055459], [-81.09966956248937, -4.036394138203697], [-80.30256059438722, -3.404856459164713], [-80.18401485870967, -3.821161797708044], [-80.46929460317695, -4.059286797708999], [-80.44224199087216, -4.425724379090674], [-80.02890804718561, -4.346090996928893], [-79.62497921417618, -4.454198093283495], [-79.20528906931773, -4.959128513207389], [-78.63989722361234, -4.547784112164074], [-78.45068396677564, -3.873096612161376], [-77.83790483265861, -3.003020521663103], [-76.63539425322672, -2.608677666843818], [-75.54499569365204, -1.56160979574588], [-75.23372270374195, -0.911416924649529], [-75.37322323271385, -0.15203175212045], [-75.10662451852008, -0.05720549886486], [-74.44160051135597, -0.530820000819887], [-74.12239518908906, -1.002832533373848], [-73.6595035468346, -1.260491224781134], [-73.07039221870724, -2.308954359550953], [-72.32578650581365, -2.434218031426454], [-71.7747607082854, -2.169789727388938], [-71.41364579942979, -2.342802422702128], [-70.81347571479196, -2.256864515800743], [-70.04770850287485, -2.725156345229699], [-70.69268205430971, -3.742872002785859], [-70.39404395209499, -3.766591485207825], [-69.89363521999663, -4.298186944194327], [-70.7947688463023, -4.251264743673303], [-70.92884334988358, -4.401591485210368], [-71.74840572781655, -4.593982842633011], [-72.89192765978726, -5.274561455916981], [-72.9645072089412, -5.741251315944893], [-73.21971126981461, -6.089188734566078], [-73.1200274319236, -6.629930922068239], [-73.72448666044164, -6.91859547285064], [-73.7234014553635, -7.340998630404414], [-73.98723548042966, -7.523829847853065], [-73.57105933296707, -8.424446709835834], [-73.01538265653255, -9.032833347208062], [-73.22671342639016, -9.462212823121234], [-72.56303300646564, -9.520193780152717], [-72.18489071316985, -10.053597914269432], [-71.30241227892154, -10.079436130415374], [-70.48189388699117, -9.490118096558845], [-70.54868567572841, -11.009146823778465], [-70.0937522040469, -11.123971856331012], [-69.52967810736496, -10.951734307502194], [-68.66507971868963, -12.561300144097173], [-68.88007951523997, -12.899729099176653], [-68.92922380234954, -13.602683607643009], [-68.9488866848366, -14.453639418193283], [-69.33953467474701, -14.953195489158832], [-69.16034664577495, -15.323973890853019], [-69.38976416693471, -15.660129082911652], [-68.9596353827533, -16.50069793057127], [-69.59042375352405, -17.580011895419332]]]}') WHERE iso_a2 = 'PE';
UPDATE public.countries SET boundary = ST_GeomFromGeoJSON('{"type": "MultiPolygon", "coordinates": [[[[126.37681359263749, 8.414706325713354], [126.4785128113879, 7.750354112168978], [126.53742394420064, 7.189380601424574], [126.19677290253256, 6.27429433840004], [125.8314205262291, 7.293715318221857], [125.3638521668523, 6.786485297060992], [125.68316084198372, 6.049656887227258], [125.39651167206065, 5.58100332277229], [124.21978763234236, 6.161355495626182], [123.93871951710693, 6.885135606306122], [124.24366214406135, 7.360610459823661], [123.61021243702757, 7.833527329942754], [123.29607140512522, 7.418875637232787], [122.8255058126754, 7.457374579290217], [122.08549930225578, 6.899424139834849], [121.91992801319262, 7.192119452336073], [122.31235884001714, 8.034962063016508], [122.94239790251967, 8.316236883981176], [123.48768761606354, 8.693009751821194], [123.84115441293986, 8.240324204944386], [124.60146976125023, 8.514157619659017], [124.76461225799565, 8.96040945071546], [125.47139082245158, 8.986996975129642], [125.4121179546128, 9.760334784377548], [126.22271447154318, 9.286074327018852], [126.30663699758512, 8.782487494334575], [126.37681359263749, 8.414706325713354]]], [[[123.98243777882581, 10.278778591345812], [123.6231832215328, 9.950090643753299], [123.30992068897936, 9.318268744336677], [122.99588300994165, 9.0221886255204], [122.38005496631948, 9.713360907424203], [122.5860889018671, 9.981044826696106], [122.83708133350873, 10.261156927934238], [122.94741051645192, 10.88186839440803], [123.49884972543848, 10.940624497923949], [123.33777428598475, 10.267383938025446], [124.07793582570125, 11.23272553145371], [123.98243777882581, 10.278778591345812]]], [[[118.50458092659036, 9.31638255455809], [117.17427453010069, 8.367499904814665], [117.6644771668214, 9.066888739452935], [118.38691369026176, 9.684499619989225], [118.98734215706108, 10.376292019080509], [119.51149620979757, 11.369668077027214], [119.68967654833992, 10.554291490109875], [119.029458449379, 10.003653265823871], [118.50458092659036, 9.31638255455809]]], [[[121.88354780485915, 11.89175507247198], [122.48382124236147, 11.582187404827508], [123.12021650603597, 11.58366018314787], [123.10083784392648, 11.16593374271649], [122.63771365772672, 10.741308498574227], [122.00261030485959, 10.441016750526089], [121.96736697803655, 10.905691229694625], [122.03837039600555, 11.41584096928004], [121.88354780485915, 11.89175507247198]]], [[[125.50255171112352, 12.162694606978349], [125.78346479706218, 11.046121934447768], [125.01188398651229, 11.31145457605038], [125.03276126515814, 10.975816148314706], [125.27744917206027, 10.358722032101312], [124.80181928924574, 10.134678859899893], [124.7601680848185, 10.837995103392302], [124.45910119028608, 10.889929917845635], [124.30252160044174, 11.49537099857723], [124.89101281138161, 11.415582587118593], [124.87799035044398, 11.794189968304991], [124.26676150929572, 12.557760931849685], [125.22711632700785, 12.535720933477194], [125.50255171112352, 12.162694606978349]]], [[[121.52739383350351, 13.06959015548452], [121.26219038298157, 12.205560207564403], [120.83389611214656, 12.70449616134242], [120.3234363139675, 13.46641347905387], [121.18012820850217, 13.429697373910443], [121.52739383350351, 13.06959015548452]]], [[[121.3213082215236, 18.504064642811016], [121.9376013530364, 18.218552354398383], [122.24600630095429, 18.478949896717097], [122.336956821788, 18.224882717354177], [122.1742794129332, 17.810282701076375], [122.51565392465338, 17.093504746971973], [122.25231082569391, 16.262444362854126], [121.6627860861083, 15.931017564350128], [121.50506961475341, 15.124813544164624], [121.72882856657728, 14.328376369682246], [122.25892540902734, 14.218202216035976], [122.70127566944566, 14.33654124598442], [123.95029503794026, 13.78213064214107], [123.85510704965864, 13.237771104378467], [124.1812886902849, 12.997527370653472], [124.07741906137827, 12.536676947474575], [123.29803510955227, 13.027525539598983], [122.92865197152994, 13.552919826710408], [122.67135501514869, 13.185836289925135], [122.03464969288055, 13.784481919810347], [121.12638471891862, 13.636687323455561], [120.62863732308332, 13.857655747935652], [120.67938357959386, 14.271015529838323], [120.99181928923056, 14.525392767795083], [120.6933362163127, 14.756670640517285], [120.564145135583, 14.396279201713824], [120.07042850146641, 14.970869452367097], [119.92092858284613, 15.40634674729074], [119.88377322802828, 16.363704331929966], [120.28648766487882, 16.03462881109533], [120.39004723519176, 17.59908112229951], [120.71586714079191, 18.50522736253754], [121.3213082215236, 18.504064642811016]]]]}') WHERE iso_a2 = 'PH';
UPDATE public.countries SET boundary = ST_GeomFromGeoJSON('{"type": "MultiPolygon", "coordinates": [[[[155.88002566957843, -6.81999684003776], [155.5999910829888, -6.919990736522493], [155.16699425681512, -6.535931491729301], [154.72919152243836, -5.900828138862209], [154.51411421123967, -5.139117526880014], [154.65250369691736, -5.04243092206184], [154.7599906760844, -5.339983819198494], [155.06291792217937, -5.566791680527487], [155.54774620994172, -6.200654799019659], [156.01996544822478, -6.540013929880388], [155.88002566957843, -6.81999684003776]]], [[[151.9827958518545, -5.478063246282346], [151.4591068870087, -5.560280450058741], [151.3013904156539, -5.840728448106702], [150.7544470562767, -6.083762709175389], [150.24119673075384, -6.317753594592986], [149.70996300679334, -6.316513360218053], [148.8900647320505, -6.026040134305433], [148.31893680236075, -5.74714242922613], [148.4018257997569, -5.437755629094724], [149.29841190002085, -5.583741550319218], [149.84556196512725, -5.505503431829339], [149.9962504416903, -5.026101169457675], [150.13975589416495, -5.001348158389789], [150.2369075868735, -5.532220147324281], [150.8074670758081, -5.455842380396888], [151.089672072554, -5.113692722192368], [151.64788089417087, -4.757073662946169], [151.53786176982155, -4.16780730552189], [152.13679162008438, -4.14879037843852], [152.33874311748102, -4.312966403829762], [152.31869266175178, -4.86766122805075], [151.9827958518545, -5.478063246282346]]], [[[147.19187381407497, -7.38802418378998], [148.0846358583494, -8.044108168167611], [148.7341052593936, -9.104663588093757], [149.30683515848446, -9.07143564213007], [149.26663089416135, -9.514406019736029], [150.03872846903434, -9.684318129111702], [149.7387984560123, -9.872937106977005], [150.80162763895916, -10.293686618697421], [150.69057498596388, -10.582712904505868], [150.02839318257585, -10.652476088099931], [149.782310012002, -10.393267103723943], [148.92313764871724, -10.280922539921363], [147.91301842670802, -10.130440769087471], [147.13544315001226, -9.492443536012019], [146.56788089415065, -8.942554619994155], [146.04848107318494, -8.06741423913131], [144.74416792213802, -7.630128269077474], [143.8970878440097, -7.915330498896282], [143.2863757671843, -8.245491224809058], [143.4139132020807, -8.983068942910947], [142.62843143124425, -9.326820570516503], [142.06825890520022, -9.159595635620036], [141.0338517600139, -9.117892754760419], [141.01705691951904, -5.859021905138022], [141.00021040259188, -2.600151055515624], [142.7352466167915, -3.289152927263217], [144.58397098203326, -3.861417738463402], [145.27317955951, -4.373737888205028], [145.82978641172568, -4.876497897972683], [145.98192182839298, -5.465609226100014], [147.6480733583476, -6.083659356310804], [147.8911076194162, -6.614014580922316], [146.9709053895949, -6.721656589386257], [147.19187381407497, -7.38802418378998]]], [[[153.14003787659877, -4.499983412294114], [152.8272921083683, -4.766427097190999], [152.638673130503, -4.176127211120928], [152.40602583232496, -3.789742526874562], [151.95323693258356, -3.462062269711822], [151.38427941305005, -3.035421644710112], [150.66204959533886, -2.741486097833956], [150.93996544820456, -2.500002129734028], [151.47998416565454, -2.779985039891386], [151.82001509013512, -2.999971612157907], [152.2399894553711, -3.240008640153661], [152.64001671774255, -3.659983005389648], [153.01999352438466, -3.980015150573294], [153.14003787659877, -4.499983412294114]]]]}') WHERE iso_a2 = 'PG';
UPDATE public.countries SET boundary = ST_GeomFromGeoJSON('{"type": "Polygon", "coordinates": [[[15.01699588385867, 51.10667409932158], [14.607098422919535, 51.74518809671997], [14.685026482815687, 52.0899474147552], [14.437599725002201, 52.62485016540839], [14.074521111719491, 52.98126251892543], [14.353315463934138, 53.24817129171297], [14.119686313542587, 53.75702912049104], [14.802900424873458, 54.05070628520575], [16.36347700365573, 54.513158677785725], [17.622831658608675, 54.85153595643291], [18.62085859546164, 54.68260569927078], [18.696254510175464, 54.43871877706929], [19.660640089606403, 54.42608388937393], [20.892244500418627, 54.31252492941253], [22.731098667092652, 54.327536932993326], [23.24398725758951, 54.22056671814914], [23.48412763844985, 53.91249766704114], [23.527535841575002, 53.470121568406555], [23.80493493011778, 53.089731350306074], [23.79919884613338, 52.69109935160657], [23.199493849386187, 52.48697744405367], [23.508002150168693, 52.02364655212473], [23.527070753684374, 51.57845408793024], [24.029985792748903, 50.70540660257518], [23.922757195743262, 50.42488108987875], [23.426508416444392, 50.308505764357456], [22.518450148211603, 49.47677358661974], [22.776418898212626, 49.02739533140962], [22.558137648211755, 49.085738023467144], [21.607808058364213, 49.47010732685409], [20.887955356538413, 49.32877228453583], [20.415839471119853, 49.43145335549977], [19.825022820726872, 49.21712535256923], [19.320712517990472, 49.571574001659194], [18.90957482267632, 49.435845852244576], [18.853144158613617, 49.49622976337764], [18.392913852622172, 49.98862864847075], [17.64944502123899, 50.049038397819956], [17.55456709155112, 50.36214590107642], [16.86876915860566, 50.47397370055603], [16.719475945714436, 50.21574656839354], [16.176253289462267, 50.42260732685791], [16.23862674323857, 50.69773265237984], [15.490972120839729, 50.78472992614321], [15.01699588385867, 51.10667409932158]]]}') WHERE iso_a2 = 'PL';
UPDATE public.countries SET boundary = ST_GeomFromGeoJSON('{"type": "Polygon", "coordinates": [[[-66.28243445500821, 18.514761664295364], [-65.7713028632093, 18.426679185453878], [-65.59100379094295, 18.228034979723915], [-65.84716386581377, 17.97590566657186], [-66.59993445500949, 17.981822618069273], [-67.18416236028527, 17.946553453030077], [-67.24242753769435, 18.374460150622937], [-67.10067908391774, 18.52060110114435], [-66.28243445500821, 18.514761664295364]]]}') WHERE iso_a2 = 'PR';
UPDATE public.countries SET boundary = ST_GeomFromGeoJSON('{"type": "Polygon", "coordinates": [[[130.64001590385243, 42.39500946712528], [130.78000735893113, 42.22000722916885], [130.40003055228902, 42.28000356705971], [129.96594852103726, 41.94136790625106], [129.66736209525482, 41.60110443782523], [129.70518924369247, 40.88282786718433], [129.18811486218, 40.66180776627199], [129.01039961152821, 40.485436102859815], [128.63336836152672, 40.18984691015031], [127.96741417858135, 40.02541250259756], [127.53343550019417, 39.7568500839767], [127.5021195822253, 39.32393077245153], [127.38543419811027, 39.213472398427655], [127.78334272675772, 39.05089834243742], [128.34971642467661, 38.61224294692785], [128.20574588431145, 38.37039724380189], [127.78003543509101, 38.30453563084589], [127.07330854706737, 38.2561148137884], [126.68371992401893, 37.80477285415118], [126.23733890188176, 37.84037791600028], [126.17475874237624, 37.74968577732804], [125.68910363169721, 37.94001007745902], [125.5684391622957, 37.75208873142962], [125.2753304383362, 37.669070542952724], [125.24008711151316, 37.85722443292744], [124.98103315643397, 37.94882090916478], [124.71216067921938, 38.10834605564979], [124.98599409393398, 38.54847422947968], [125.2219486837787, 38.66585724543067], [125.13285851450752, 38.84855927179859], [125.3865897970606, 39.387957872061165], [125.32111575734682, 39.55138458918421], [124.7374821310424, 39.66034434667162], [124.26562462778531, 39.928493353834156], [125.07994184784064, 40.56982371679245], [126.18204511932943, 41.10733612727637], [126.86908328664987, 41.81656932226619], [127.34378299368302, 41.50315176041597], [128.20843305879066, 41.46677155208249], [128.0522152039723, 41.99428457291795], [129.59666873587952, 42.42498179785456], [129.99426720593323, 42.985386867843786], [130.64001590385243, 42.39500946712528]]]}') WHERE iso_a2 = 'KP';
UPDATE public.countries SET boundary = ST_GeomFromGeoJSON('{"type": "Polygon", "coordinates": [[[-9.034817674180246, 41.880570583659676], [-8.67194576662672, 42.13468943945496], [-8.263856980817792, 42.28046865495034], [-8.013174607769912, 41.790886135417125], [-7.422512986673795, 41.79207469335984], [-7.251308966490824, 41.91834605566505], [-6.668605515967656, 41.883386949219584], [-6.389087693700915, 41.381815497394655], [-6.851126674822552, 41.11108266861753], [-6.864019944679385, 40.33087189387483], [-7.026413133156595, 40.184524237624245], [-7.066591559263529, 39.711891587882775], [-7.498632371439726, 39.62957103124181], [-7.098036668313128, 39.03007274022379], [-7.374092169616318, 38.37305858006492], [-7.029281175148796, 38.07576406508977], [-7.166507941099865, 37.803894354802225], [-7.537105475281024, 37.42890432387624], [-7.453725551778092, 37.09778758396607], [-7.855613165711986, 36.83826854099627], [-8.382816127953689, 36.97888011326246], [-8.898856980820327, 36.86880931248078], [-8.746101446965554, 37.65134552667661], [-8.83999752443988, 38.266243394517616], [-9.287463751655224, 38.3584858261586], [-9.526570603869715, 38.73742910415491], [-9.446988898140233, 39.39206614842837], [-9.048305223008427, 39.75509308527877], [-8.977353481471681, 40.15930613866581], [-8.768684047877102, 40.76063894303019], [-8.79085323733031, 41.18433401139126], [-8.99078935386757, 41.54345937760364], [-9.034817674180246, 41.880570583659676]]]}') WHERE iso_a2 = 'PT';
UPDATE public.countries SET boundary = ST_GeomFromGeoJSON('{"type": "Polygon", "coordinates": [[[-62.685057135657885, -22.249029229422387], [-62.291179368729225, -21.051634616787393], [-62.2659612697708, -20.513734633061276], [-61.78632646345377, -19.633736667562964], [-60.04356462262649, -19.342746677327426], [-59.11504248720611, -19.3569060197754], [-58.183471442280506, -19.868399346600363], [-58.166392381408045, -20.176700941653678], [-57.8706739976178, -20.73268767668195], [-57.937155727761294, -22.090175876557172], [-56.8815095689029, -22.28215382252148], [-56.47331743022939, -22.086300144135283], [-55.79795813660691, -22.356929620047822], [-55.610682745981144, -22.655619398694846], [-55.517639329639636, -23.571997572526637], [-55.40074723979542, -23.956935316668805], [-55.02790178080955, -24.00127369557523], [-54.65283423523513, -23.83957813893396], [-54.29295956075452, -24.02101409271073], [-54.29347632507745, -24.570799655863965], [-54.42894609233059, -25.162184747012166], [-54.625290696823576, -25.739255466415514], [-54.78879492859505, -26.621785577096134], [-55.69584550639816, -27.387837009390864], [-56.486701626192996, -27.548499037386293], [-57.60975969097614, -27.395898532828387], [-58.61817359071975, -27.123718763947096], [-57.63366004091113, -25.60365650808164], [-57.77721716981794, -25.16233977630904], [-58.80712846539498, -24.77145924245331], [-60.02896603050403, -24.032796319273274], [-60.846564704009914, -23.880712579038292], [-62.685057135657885, -22.249029229422387]]]}') WHERE iso_a2 = 'PY';
UPDATE public.countries SET boundary = ST_GeomFromGeoJSON('{"type": "Polygon", "coordinates": [[[35.54566531753454, 32.393992011030576], [35.5452519060762, 31.78250478772084], [35.397560662586045, 31.489086005167582], [34.92740848159457, 31.353435370401414], [34.970506626125996, 31.61677846936081], [35.22589155451243, 31.754341132121766], [34.97464074070933, 31.866582343059722], [35.183930291491436, 32.53251068778894], [35.54566531753454, 32.393992011030576]]]}') WHERE iso_a2 = 'PS';
UPDATE public.countries SET boundary = ST_GeomFromGeoJSON('{"type": "Polygon", "coordinates": [[[50.81010827006958, 24.754742539971378], [50.74391076030369, 25.482424221289396], [51.013351678273494, 26.006991685484195], [51.28646162293606, 26.11458201751587], [51.58907881043726, 25.80111277923338], [51.60670047384881, 25.21567047779874], [51.38960778179063, 24.62738597258806], [51.11241539897702, 24.556330878186724], [50.81010827006958, 24.754742539971378]]]}') WHERE iso_a2 = 'QA';
UPDATE public.countries SET boundary = ST_GeomFromGeoJSON('{"type": "Polygon", "coordinates": [[[22.710531447040495, 47.88219391538941], [23.142236362406805, 48.09634105080695], [23.76095828623741, 47.985598456405455], [24.40205610525038, 47.98187775328043], [24.866317172960578, 47.737525743188314], [25.20774336111299, 47.89105642352747], [25.9459411964024, 47.987148749374214], [26.19745039236693, 48.22088125263035], [26.619336785597795, 48.22072622333347], [26.924176059687568, 48.123264472030996], [27.233872918412743, 47.82677094175638], [27.551166212684848, 47.40511709247083], [28.128030226359044, 46.810476386088254], [28.160017937947714, 46.37156260841722], [28.0544429867754, 45.944586086605625], [28.233553501099042, 45.488283189468376], [28.67977949393938, 45.304030870131704], [29.149724969201653, 45.464925442072456], [29.603289015427436, 45.293308010431126], [29.62654340995877, 45.0353909368624], [29.141611769331835, 44.820210272799045], [28.8378577003202, 44.913873806328056], [28.558081495891997, 43.70746165625813], [27.970107049275075, 43.81246816667522], [27.242399529740908, 44.175986029632405], [26.065158725699746, 43.94349376075127], [25.569271681426926, 43.68844472917472], [24.100679152124172, 43.74105133724785], [23.332302280376325, 43.897010809904714], [22.944832391051847, 43.82378530534713], [22.65714969248299, 44.23492300066128], [22.4740084164406, 44.40922760678177], [22.705725538837356, 44.57800283464702], [22.459022251075936, 44.7025171982543], [22.14508792490281, 44.47842234962059], [21.56202273935361, 44.7689472519655], [21.483526238702236, 45.18117015235778], [20.874312778413355, 45.416375433934235], [20.762174920339987, 45.73457306577144], [20.220192498462836, 46.127468980486555], [21.02195234547125, 46.3160879583519], [21.626514926853872, 46.99423777931816], [22.099767693782837, 47.6724392767167], [22.710531447040495, 47.88219391538941]]]}') WHERE iso_a2 = 'RO';
UPDATE public.countries SET boundary = ST_GeomFromGeoJSON('{"type": "MultiPolygon", "coordinates": [[[[143.64800744036287, 50.74760040954152], [144.65414757708564, 48.976390692737596], [143.17392785051723, 49.30655141865037], [142.5586682476501, 47.861575018904915], [143.53349246640406, 46.83672801369249], [143.50527713437262, 46.13790761980948], [142.74770063697392, 46.74076487892657], [142.0920300640545, 45.96675527605879], [141.90692508358504, 46.80592886004655], [142.0184428244709, 47.780132961612935], [141.90444461483506, 48.85918854429957], [142.13580000220568, 49.61516307229746], [142.1799833518153, 50.95234243428192], [141.59407596249005, 51.93543488220254], [141.68254601457366, 53.30196645772878], [142.60693403541077, 53.762145087287905], [142.2097489768154, 54.22547597921687], [142.654786411713, 54.36588084575388], [142.91461551327657, 53.70457754171474], [143.26084760963207, 52.74076040303905], [143.23526777564766, 51.75666026468875], [143.64800744036287, 50.74760040954152]]], [[[22.731098667092652, 54.327536932993326], [20.892244500418656, 54.312524929412575], [19.660640089606403, 54.426083889373984], [19.888481479581344, 54.8661603867715], [21.2684489275035, 55.19048167583529], [22.315723504330606, 55.0152985703659], [22.757763706155288, 54.85657440858142], [22.651051873472568, 54.58274099386671], [22.731098667092652, 54.327536932993326]]], [[[-175.01425, 66.58435], [-174.33983, 66.33556], [-174.57182, 67.06219], [-171.85731, 66.91308], [-169.89958, 65.97724], [-170.89107, 65.54139], [-172.53025, 65.43791], [-172.555, 64.46079], [-172.95533, 64.25269], [-173.89184, 64.2826], [-174.65392, 64.63125], [-175.98353, 64.92288], [-176.20716, 65.35667], [-177.22266, 65.52024], [-178.35993, 65.39052], [-178.90332, 65.74044], [-178.68611, 66.11211], [-179.88377, 65.87456], [-179.43268, 65.40411], [-180, 64.97970870219837], [-180, 68.96363636363637], [-177.55, 68.2], [-174.92825, 67.20589], [-175.01425, 66.58435]]], [[[180.00000000000014, 70.83219920854668], [178.9034250000001, 70.78114], [178.7253, 71.0988], [180.00000000000014, 71.51571433642826], [180.00000000000014, 70.83219920854668]]], [[[-178.69378, 70.89302], [-180, 70.83219920854668], [-180, 71.51571433642826], [-179.87187, 71.55762], [-179.02433, 71.55553], [-177.577945, 71.26948], [-177.663575, 71.13277], [-178.69378, 70.89302]]], [[[143.60385, 73.21244], [142.08763, 73.20544], [140.038155, 73.31692], [139.86312, 73.36983], [140.81171, 73.76506], [142.06207, 73.85758], [143.48283, 73.47525], [143.60385, 73.21244]]], [[[150.73167, 75.08406], [149.575925, 74.68892], [147.97746, 74.778355], [146.11919, 75.17298], [146.358485, 75.49682], [148.22223, 75.345845], [150.73167, 75.08406]]], [[[145.086285, 75.56262], [144.3, 74.82], [140.61381, 74.84768], [138.95544, 74.61148], [136.97439, 75.26167], [137.51176, 75.94917], [138.831075, 76.13676], [141.47161, 76.09289], [145.086285, 75.56262]]], [[[57.5356925799924, 70.72046397570216], [56.94497928246395, 70.63274323188668], [53.6773751157842, 70.76265778266847], [53.41201663596539, 71.2066616889202], [51.60189456564572, 71.47475901965049], [51.45575361512422, 72.01488108996514], [52.47827518088357, 72.22944163684096], [52.444168735570855, 72.77473135038485], [54.42761355979766, 73.62754751249759], [53.50828982932515, 73.74981395130015], [55.90245893740766, 74.62748647734534], [55.631932814359715, 75.08141225859717], [57.86864383324885, 75.60939036732321], [61.170044386647504, 76.25188345000814], [64.49836836127022, 76.43905548776928], [66.2109770038551, 76.80978221303124], [68.15705976753483, 76.93969676381292], [68.85221113472514, 76.54481130645462], [68.18057254422766, 76.23364166940911], [64.63732628770302, 75.73775462513623], [61.58350752141476, 75.2608845079468], [58.47708214705338, 74.30905630156283], [56.98678551618801, 73.33304352486624], [55.419335971910954, 72.37126760526598], [55.622837762276305, 71.54059479439033], [57.5356925799924, 70.72046397570216]]], [[[106.97013000000013, 76.97419], [107.24000000000015, 76.48], [108.1538, 76.72335000000015], [111.07726000000017, 76.71], [113.33151, 76.22224], [114.13417, 75.84764], [113.88539, 75.32779000000014], [112.77918, 75.03186], [110.1512500000002, 74.47673], [109.4, 74.18], [110.64, 74.04], [112.11919, 73.78774000000013], [113.01954000000026, 73.97693000000015], [113.52958000000032, 73.33505000000011], [113.96881, 73.5948800000001], [115.56782, 73.75285], [118.77633000000023, 73.58772], [119.02, 73.12], [123.20066000000011, 72.97122], [123.25777000000019, 73.73503000000011], [125.3800000000002, 73.56], [126.97644, 73.56549], [128.59126, 73.03871], [129.05157, 72.39872], [128.46000000000012, 71.98], [129.71599000000023, 71.19304], [131.28858000000028, 70.78699000000012], [132.25350000000017, 71.83630000000011], [133.85766000000032, 71.38642000000016], [135.56193, 71.65525000000014], [137.49755, 71.34763], [138.23409000000018, 71.62803], [139.86983000000012, 71.48783000000014], [139.14791, 72.41619000000011], [140.46817, 72.84941000000015], [149.5, 72.2], [150.3511800000002, 71.60643], [152.96890000000022, 70.84222], [157.00688, 71.03141], [158.99779, 70.86672], [159.83031000000025, 70.45324], [159.70866, 69.72198], [160.94053000000034, 69.4372800000001], [162.27907000000013, 69.64204], [164.05248000000014, 69.66823], [165.94037000000023, 69.47199], [167.83567, 69.58269], [169.5776300000002, 68.6938], [170.81688000000028, 69.01363], [170.0082000000002, 69.65276], [170.4534500000003, 70.09703], [173.64391000000026, 69.81743], [175.72403000000023, 69.87725000000023], [178.6, 69.4], [180.00000000000014, 68.96363636363657], [180.00000000000014, 64.97970870219848], [179.99281, 64.97433], [178.70720000000026, 64.53493], [177.41128000000018, 64.60821], [178.31300000000024, 64.07593], [178.9082500000002, 63.25197000000014], [179.37034, 62.98262000000011], [179.48636, 62.56894], [179.22825000000014, 62.30410000000015], [177.3643, 62.5219], [174.56929000000022, 61.76915], [173.68013, 61.65261], [172.15, 60.95], [170.6985000000001, 60.33618], [170.3308500000003, 59.88177], [168.90046, 60.57355], [166.29498000000032, 59.788550000000214], [165.84000000000023, 60.16], [164.87674, 59.7316], [163.53929000000014, 59.86871], [163.21711000000025, 59.21101], [162.0173300000001, 58.24328], [162.05297, 57.83912], [163.19191, 57.615030000000104], [163.05794000000017, 56.159240000000125], [162.12958000000023, 56.12219], [161.70146, 55.285680000000156], [162.11749000000017, 54.85514], [160.36877000000035, 54.34433], [160.02173000000025, 53.20257], [158.5309400000002, 52.95868000000024], [158.23118, 51.94269], [156.7897900000003, 51.01105], [156.42000000000016, 51.7], [155.99182, 53.15895], [155.43366000000012, 55.38103000000012], [155.91442000000032, 56.767920000000146], [156.75815, 57.3647], [156.8103500000001, 57.83204], [158.3643300000002, 58.05575], [160.15064000000015, 59.314770000000124], [161.87204, 60.34300000000013], [163.66969, 61.1409000000001], [164.47355000000013, 62.55061], [163.2584200000002, 62.46627], [162.65791, 61.6425], [160.1214800000001, 60.54423], [159.30232, 61.7739600000001], [156.7206800000001, 61.43442], [154.21806000000035, 59.758180000000124], [155.04375, 59.14495], [152.81185, 58.88385], [151.26573000000027, 58.78089], [151.33815000000013, 59.50396], [149.78371, 59.65573000000015], [148.54481, 59.16448], [145.48722, 59.33637], [142.19782000000018, 59.03998], [138.95848000000032, 57.08805], [135.12619, 54.72959], [136.70171, 54.603550000000126], [137.19342, 53.97732], [138.1647, 53.755010000000254], [138.80463, 54.25455000000011], [139.90151, 54.18968000000018], [141.34531, 53.08957000000012], [141.37923, 52.23877], [140.5974200000002, 51.2396700000001], [140.51308, 50.04553000000013], [140.06193000000022, 48.44671000000017], [138.55472000000023, 46.99965], [138.21971, 46.30795], [136.86232, 45.14350000000019], [135.5153500000002, 43.989], [134.86939000000027, 43.39821], [133.53687000000028, 42.81147], [132.90627000000015, 42.7984900000001], [132.27807000000027, 43.28456000000011], [130.93587000000016, 42.55274], [130.78, 42.2200000000002], [130.64000000000019, 42.395], [130.63386640840983, 42.90301463477056], [131.144687941615, 42.92998973242695], [131.28855512911562, 44.111519680348266], [131.02519000000026, 44.96796], [131.8834542176596, 45.32116160743652], [133.09712000000022, 45.14409], [133.7696439963132, 46.116926988299156], [134.1123500000002, 47.21248000000014], [134.50081, 47.578450000000146], [135.0263114767868, 48.47822988544391], [133.37359581922803, 48.18344167743484], [132.50669000000013, 47.78896], [130.98726000000013, 47.79013], [130.58229332898267, 48.729687404976204], [129.3978178244205, 49.440600084015614], [127.65740000000037, 49.76027], [127.28745568248493, 50.73979726826545], [126.93915652883786, 51.35389415140591], [126.564399041857, 51.7842554795327], [125.94634891164648, 52.79279857035695], [125.06821129771046, 53.16104482686893], [123.57147, 53.4588], [122.24574791879306, 53.431725979213695], [121.00308475147037, 53.25140106873124], [120.1770886577169, 52.75388621684121], [120.725789015792, 52.51622630473091], [120.7382, 51.96411], [120.18208000000018, 51.64355], [119.27939, 50.58292], [119.28846072802585, 50.14288279886196], [117.8792444194265, 49.51098338479704], [116.67880089728621, 49.888531399121405], [115.48569542853144, 49.80517731383475], [114.9621098165504, 50.14024730081513], [114.36245649623535, 50.248302720737485], [112.89773969935439, 49.54356537535699], [111.58123091028668, 49.37796824807768], [110.66201053267886, 49.13012807880585], [109.40244917199672, 49.29296051695769], [108.47516727095129, 49.28254771585071], [107.86817589725112, 49.793705145865886], [106.88880415245532, 50.27429596618029], [105.8865914245869, 50.406019192092174], [104.62158, 50.275320000000164], [103.67654544476036, 50.089966132195144], [102.25589000000011, 50.51056000000011], [102.06521, 51.259910000000104], [100.88948042196265, 51.51685578063842], [99.98173221232358, 51.63400625264396], [98.8614905131005, 52.04736603454671], [97.82573978067452, 51.01099518493325], [98.23176150919173, 50.42240062112873], [97.25976000000023, 49.72605], [95.81402000000017, 49.97746000000012], [94.81594933469879, 50.01343333597089], [94.14756635943561, 50.48053660745717], [93.10421, 50.49529], [92.23471154171969, 50.80217072204175], [90.71366743364078, 50.331811835321105], [88.80556684769559, 49.47052073831247], [87.75126427607685, 49.29719798440556], [87.3599703307627, 49.21498078062916], [86.82935672398966, 49.82667470966814], [85.5412699726825, 49.69285858824816], [85.11555952346211, 50.11730296487764], [84.41637739455305, 50.311399644565824], [83.93511478061893, 50.88924551045358], [83.38300377801247, 51.069182847693895], [81.94598554883996, 50.81219594990634], [80.56844689323546, 51.38833649352844], [80.03555952344172, 50.864750881547224], [77.80091556184433, 53.40441498474755], [76.52517947785478, 54.17700348572714], [76.89110029491346, 54.49052440044193], [74.38482000000013, 53.54685000000012], [73.42567874542053, 53.489810289109755], [73.50851606638437, 54.0356167669766], [72.22415001820221, 54.37665538188679], [71.1801310566095, 54.13328522400826], [70.86526655465516, 55.169733588270105], [69.0681669452729, 55.3852501491435], [68.16910037625891, 54.97039175070438], [65.6668700000001, 54.601250000000164], [65.17853356309595, 54.35422781027208], [61.43660000000014, 54.00625], [60.97806644068325, 53.66499339457914], [61.699986199800634, 52.97999644633427], [60.73999311711455, 52.71998647725775], [60.92726850774025, 52.44754832621501], [59.967533807215574, 51.960420437215674], [61.58800337102414, 51.272658799843185], [61.33742435084102, 50.79907013610426], [59.932807244715576, 50.842194118851836], [59.64228234237058, 50.545442206415714], [58.36332000000013, 51.06364], [56.77798, 51.04355], [55.71694000000011, 50.62171000000015], [54.532878452376195, 51.02623973245937], [52.32872358583106, 51.718652248738096], [50.76664839051219, 51.692762356159875], [48.70238162618105, 50.60512848571284], [48.577841424357615, 49.874759629915644], [47.549480421749394, 50.454698391311126], [46.75159630716277, 49.35600576435374], [47.0436715024766, 49.152038886097586], [46.4664457537763, 48.39415233010493], [47.31524000000016, 47.71585], [48.05725, 47.74377], [48.694733514201886, 47.0756281601779], [48.593250000000154, 46.561040000000105], [49.101160000000135, 46.399330000000106], [48.64541000000011, 45.80629], [47.67591, 45.64149000000012], [46.68201, 44.6092000000001], [47.59094, 43.66016000000013], [47.49252, 42.98658], [48.58437000000018, 41.80888], [47.98728315612604, 41.4058192001944], [47.81566572448466, 41.15141612402135], [47.373315464066394, 41.21973236751114], [46.686070591016716, 41.827137152669906], [46.40495079934894, 41.86067515722743], [45.7764, 42.09244000000024], [45.470279168485916, 42.50278066667005], [44.53762291848207, 42.711992702803684], [43.93121000000011, 42.55496000000011], [43.755990000000196, 42.74083], [42.39440000000016, 43.2203], [40.92219000000014, 43.38215000000014], [40.07696495947985, 43.553104153002494], [39.955008579271095, 43.434997666999294], [38.68, 44.28], [37.53912000000011, 44.65721], [36.67546000000013, 45.24469], [37.40317, 45.4045100000001], [38.23295, 46.24087], [37.67372, 46.63657], [39.14767, 47.044750000000136], [39.12120000000013, 47.26336], [38.22353803889948, 47.10218984637598], [38.25511233902981, 47.54640045835697], [38.77057, 47.82562000000024], [39.738277622238996, 47.89893707945208], [39.89562000000015, 48.23241], [39.67465, 48.783820000000134], [40.08078901546949, 49.30742991799937], [40.069040000000115, 49.60105], [38.59498823421356, 49.92646190042373], [38.010631137857075, 49.91566152607473], [37.39345950699524, 50.38395335550368], [36.626167840325394, 50.225590928745135], [35.35611616388812, 50.57719737405915], [35.37791, 50.77394], [35.02218305841794, 51.2075723333715], [34.22481570815441, 51.255993150428935], [34.14197838719062, 51.566413479206204], [34.391730584457235, 51.768881740925906], [33.75269982273588, 52.33507457133166], [32.71576053236717, 52.238465481162166], [32.412058139787774, 52.28869497334978], [32.15944000000022, 52.061250000000115], [31.78597, 52.10168], [31.54001834486226, 52.74205231384644], [31.305200636527985, 53.07399587667331], [31.49764, 53.16743000000014], [32.304519484188376, 53.13272614197285], [32.693643019346126, 53.35142080343215], [32.405598585751164, 53.618045355842014], [31.731272820774592, 53.79402944601202], [31.791424187962406, 53.974638576872195], [31.384472283663825, 54.15705638286238], [30.75753380709878, 54.8117709417844], [30.97183597181325, 55.081547756564134], [30.87390913262007, 55.55097646750352], [29.89629438652244, 55.7894632025305], [29.37157189303079, 55.67009064393628], [29.229513380660393, 55.91834422466641], [28.17670942557794, 56.16912995057879], [27.855282016722526, 56.75932648378438], [27.770015903440992, 57.2442581244112], [27.288184848751655, 57.47452830670392], [27.71668582531578, 57.79189911562446], [27.420150000000206, 58.72457000000014], [28.131699253051863, 59.300825100331], [27.98112, 59.47537], [29.1177, 60.02805000000012], [28.07, 60.50352000000015], [30.211107212044652, 61.780027777749694], [31.139991082491036, 62.35769277612445], [31.516092156711267, 62.867687486412905], [30.035872430142803, 63.552813625738565], [30.44468468600374, 64.20445343693908], [29.544429559047018, 64.94867157659056], [30.21765, 65.80598], [29.054588657352383, 66.94428620062203], [29.977426385220696, 67.69829702419275], [28.445943637818772, 68.364612942164], [28.591929559043365, 69.0647769232867], [29.39955, 69.15692000000018], [31.10108000000011, 69.55811], [32.13272000000026, 69.90595000000025], [33.77547, 69.30142000000012], [36.51396, 69.06342], [40.292340000000166, 67.9324], [41.05987000000013, 67.45713000000012], [41.12595000000019, 66.79158000000012], [40.01583, 66.26618000000013], [38.38295, 65.9995300000001], [33.918710000000175, 66.75961], [33.18444, 66.63253], [34.81477, 65.90015000000014], [34.87857425307877, 65.4362128770482], [34.94391000000016, 64.41437000000016], [36.23129, 64.10945], [37.01273000000012, 63.84983000000011], [37.14197000000016, 64.33471], [36.539579035089815, 64.76446], [37.17604000000014, 65.14322000000013], [39.59345, 64.52079000000018], [40.43560000000011, 64.76446], [39.76260000000016, 65.49682], [42.0930900000001, 66.47623], [43.01604000000012, 66.4185800000001], [43.94975000000014, 66.06908], [44.53226, 66.75634000000014], [43.69839, 67.35245], [44.18795000000014, 67.95051], [43.45282, 68.57079], [46.25000000000014, 68.25], [46.82134000000016, 67.68997], [45.55517, 67.56652], [45.5620200000001, 67.0100500000002], [46.34915000000015, 66.6676700000001], [47.894160000000255, 66.88455000000016], [48.13876, 67.52238], [50.22766000000016, 67.99867000000015], [53.71743000000018, 68.85738000000012], [54.47171, 68.80815], [53.48582000000013, 68.20131], [54.72628, 68.09702], [55.44268000000014, 68.43866], [57.317020000000156, 68.46628], [58.80200000000022, 68.88082], [59.94142000000019, 68.2784400000001], [61.07784000000018, 68.94069], [60.03, 69.52], [60.55, 69.85], [63.50400000000016, 69.54739], [64.888115, 69.23483500000015], [68.51216000000014, 68.09233000000017], [69.18068, 68.61563000000012], [68.16444, 69.14436], [68.13522, 69.35649], [66.93008000000012, 69.45461000000012], [67.25976, 69.92873], [66.72492000000014, 70.70889000000014], [66.69466, 71.02897000000024], [68.54006000000012, 71.93450000000024], [69.19636000000011, 72.84336000000016], [69.94, 73.04000000000013], [72.58754, 72.7762900000001], [72.79603, 72.22006], [71.8481100000001, 71.40898], [72.47011, 71.09019], [72.79188, 70.39114], [72.56470000000022, 69.02085], [73.66787, 68.4079], [73.2387, 67.7404], [71.28000000000011, 66.32000000000016], [72.42301000000018, 66.17267000000018], [72.82077, 66.53267], [73.92099000000016, 66.78946000000013], [74.1865100000002, 67.28429], [75.052, 67.76047000000017], [74.46926000000016, 68.32899], [74.93584000000013, 68.98918], [73.84236, 69.07146], [73.60187000000022, 69.62763], [74.3998, 70.63175], [73.1011, 71.44717000000026], [74.89082000000022, 72.12119], [74.65926, 72.83227], [75.15801000000019, 72.85497000000012], [75.68351, 72.30056000000013], [75.28898000000012, 71.33556], [76.35911, 71.15287000000015], [75.90313000000017, 71.87401], [77.57665000000011, 72.26717], [79.65202000000014, 72.32011], [81.5, 71.75], [80.61071000000013, 72.58285000000012], [80.51109, 73.6482], [82.25, 73.85000000000011], [84.65526, 73.80591000000018], [86.82230000000024, 73.93688], [86.00956, 74.45967000000016], [87.16682000000017, 75.11643], [88.31571000000011, 75.14393], [90.26, 75.64], [92.90058, 75.77333], [93.23421000000016, 76.0472], [95.86000000000016, 76.1400000000001], [96.67821, 75.91548], [98.92254000000023, 76.44689], [100.75967000000023, 76.43028], [101.03532, 76.86189], [101.99084000000013, 77.2875400000002], [104.3516000000001, 77.69792], [106.06664000000015, 77.37389], [104.70500000000024, 77.1274], [106.97013000000013, 76.97419]]], [[[105.07547, 78.30689], [99.43814, 77.921], [101.2649, 79.23399], [102.08635, 79.34641], [102.837815, 79.28129], [105.37243, 78.71334], [105.07547, 78.30689]]], [[[51.13618655783128, 80.54728017854094], [49.79368452332071, 80.41542776154822], [48.89441124857754, 80.3395667589437], [48.754936557821765, 80.17546824820084], [47.586119012244154, 80.01018117951534], [46.502825962109654, 80.24724681265437], [47.07245527526291, 80.55942414012947], [44.846958042181114, 80.58980988231718], [46.79913862487123, 80.77191762971364], [48.318477410684665, 80.78400991486996], [48.522806023966695, 80.51456899690015], [49.09718956889091, 80.75398590770843], [50.03976769389462, 80.91888540315182], [51.52293297710369, 80.69972565380192], [51.13618655783128, 80.54728017854094]]], [[[99.93976, 78.88094], [97.75794, 78.7562], [94.97259, 79.044745], [93.31288, 79.4265], [92.5454, 80.14379], [91.18107, 80.34146], [93.77766, 81.0246], [95.940895, 81.2504], [97.88385, 80.746975], [100.186655, 79.780135], [99.93976, 78.88094]]]]}') WHERE iso_a2 = 'RU';
UPDATE public.countries SET boundary = ST_GeomFromGeoJSON('{"type": "Polygon", "coordinates": [[[30.419104852019245, -1.134659112150416], [30.816134881317712, -1.698914076345389], [30.75830895358311, -2.287250257988369], [30.46969607923299, -2.413857517103459], [29.93835900240794, -2.348486830254238], [29.632176141078588, -2.917857761246097], [29.024926385216787, -2.839257907730158], [29.117478875451553, -2.292211195488385], [29.254834832483343, -2.215109958508911], [29.291886834436614, -1.620055840667987], [29.579466180140884, -1.341313164885626], [29.821518588996014, -1.443322442229785], [30.419104852019245, -1.134659112150416]]]}') WHERE iso_a2 = 'RW';
UPDATE public.countries SET boundary = ST_GeomFromGeoJSON('{"type": "Polygon", "coordinates": [[[-8.794883999049077, 27.120696316022507], [-8.817828334986672, 27.656425889592356], [-8.665589565454809, 27.656425889592356], [-8.665124477564191, 27.589479071558227], [-8.684399786809053, 27.395744126896005], [-8.6872936670174, 25.881056219988906], [-11.96941891117116, 25.933352769468268], [-11.937224493853321, 23.374594224536168], [-12.874221564169575, 23.284832261645178], [-13.118754441774712, 22.771220201096256], [-12.929101935263532, 21.327070624267563], [-16.845193650773993, 21.33332347257488], [-17.06342322434257, 20.999752102130827], [-17.020428432675743, 21.42231028898148], [-17.00296179856109, 21.420734157796577], [-14.750954555713534, 21.500600083903663], [-14.630832688851072, 21.860939846274903], [-14.221167771857253, 22.31016307218816], [-13.891110398809047, 23.691009019459305], [-12.50096269372537, 24.7701162785782], [-12.030758836301615, 26.030866197203043], [-11.718219773800357, 26.104091701760623], [-11.392554897496979, 26.883423977154365], [-10.551262579785273, 26.990807603456886], [-10.189424200877582, 26.860944729107405], [-9.735343390328879, 26.860944729107405], [-9.413037482124466, 27.088476060488517], [-8.794883999049077, 27.120696316022507]]]}') WHERE iso_a2 = 'EH';
UPDATE public.countries SET boundary = ST_GeomFromGeoJSON('{"type": "Polygon", "coordinates": [[[42.77933230975097, 16.347891343648683], [42.649572788266084, 16.774635321514964], [42.34798912941071, 17.075805568912003], [42.270887892431226, 17.474721787989125], [41.75438195167396, 17.833046169500975], [41.22139122901558, 18.67159963630121], [40.93934126156654, 19.486485297111756], [40.247652215339826, 20.17463450772649], [39.80168460466095, 20.338862209550058], [39.139399448408284, 21.291904812092934], [39.023695916506796, 21.986875311770195], [39.06632897314759, 22.57965566659027], [38.49277225114008, 23.688451036060854], [38.02386030452362, 24.078685614512935], [37.483634881344386, 24.285494696545015], [37.154817742671185, 24.85848297779731], [37.209491408036, 25.084541530858107], [36.93162723160259, 25.60295949961018], [36.639603712721225, 25.826227525327223], [36.249136590323815, 26.57013560638488], [35.64018151219639, 27.376520494083422], [35.13018680190788, 28.06335195567472], [34.63233605320798, 28.058546047471566], [34.787778761541944, 28.6074272730597], [34.832220493312946, 28.957483425404845], [34.95603722508426, 29.356554673778845], [36.06894087092206, 29.197494615184453], [36.50121422704359, 29.505253607698705], [36.74052778498725, 29.86528331147619], [37.503581984209035, 30.003776150018407], [37.66811974462638, 30.3386652694859], [37.998848911294374, 30.508499864213135], [37.00216556168101, 31.508412990844747], [39.00488569515255, 32.01021698661498], [39.19546837744497, 32.16100881604267], [40.399994337736246, 31.889991766887935], [41.889980910007836, 31.19000865327837], [44.70949873228474, 29.178891099559383], [46.568713413281756, 29.09902517345229], [47.45982181172283, 29.002519436147224], [47.708850538937384, 28.526062730416143], [48.416094191283946, 28.55200429942667], [48.80759484232718, 27.689627997339883], [49.29955447774583, 27.46121816660981], [49.47091352722566, 27.109999294538085], [50.15242231629088, 26.689663194275997], [50.212935418504685, 26.277026882425375], [50.11330325704594, 25.94397227630425], [50.239858839728754, 25.608049628190926], [50.527386509000735, 25.327808335872103], [50.66055667501689, 24.999895534764022], [50.81010827006958, 24.754742539971378], [51.11241539897702, 24.556330878186724], [51.38960778179063, 24.62738597258806], [51.57951867046327, 24.245497137951105], [51.61770755392698, 24.01421926522883], [52.000733270074335, 23.00115448657894], [55.006803012924905, 22.496947536707136], [55.208341098863194, 22.708329982997046], [55.666659376859826, 22.00000112557234], [54.99998172386236, 19.999994004796108], [52.00000980002224, 19.000003363516058], [49.11667158386487, 18.616667588774945], [48.18334354024134, 18.166669216377315], [47.46669477721763, 17.116681626854884], [47.000004917189756, 16.949999294497445], [46.74999433776165, 17.283338120996177], [46.366658563020536, 17.233315334537636], [45.39999922056876, 17.333335069238558], [45.21665123879719, 17.433328965723334], [44.06261315285508, 17.410358791569593], [43.79151858905192, 17.31997671149111], [43.380794305196105, 17.57998668056767], [43.11579756040336, 17.088440456607373], [43.21837527850275, 16.66688996018641], [42.77933230975097, 16.347891343648683]]]}') WHERE iso_a2 = 'SA';
UPDATE public.countries SET boundary = ST_GeomFromGeoJSON('{"type": "Polygon", "coordinates": [[[33.963392794971185, 9.464285229420625], [33.82496348090751, 9.484060845715362], [33.84213085302815, 9.981914637215993], [33.72195924818311, 10.325262079630193], [33.206938084561784, 10.720111638406593], [33.086766479716744, 11.441141267476496], [33.206938084561784, 12.179338268667095], [32.743419037302544, 12.248007757149992], [32.67474954881965, 12.02483191958072], [32.073891524594785, 11.973329803218519], [32.31423473428475, 11.68148447716652], [32.400071594888345, 11.080626452941488], [31.850715687025513, 10.531270545078826], [31.35286189552488, 9.810240916008695], [30.837840731903384, 9.70723668328452], [29.996639497988554, 10.290927335388687], [29.61895731133285, 10.084918869940225], [29.515953078608618, 9.793073543888056], [29.000931914987177, 9.60423245056029], [28.966597170745786, 9.398223985111656], [27.970889587744352, 9.398223985111656], [27.833550610778786, 9.60423245056029], [27.112520981708883, 9.638567194801624], [26.752006167173818, 9.466893473594496], [26.477328213242515, 9.552730334198088], [25.962307049621018, 10.136420986302426], [25.790633328413946, 10.411098940233728], [25.069603699343986, 10.273759963267992], [24.794925745412684, 9.810240916008695], [24.53741516360202, 8.91753756573172], [24.19406772118765, 8.728696472403897], [23.886979580860668, 8.619729712933065], [23.805813429466752, 8.666318874542526], [23.459012892355986, 8.95428579348902], [23.394779087017298, 9.265067857292252], [23.55724979014292, 9.68121816653877], [23.554304233502194, 10.08925527591532], [22.977543572692753, 10.71446259199854], [22.864165480244253, 11.142395127807617], [22.87622, 11.384610000000123], [22.50869, 11.67936], [22.49762, 12.26024], [22.28801, 12.64605], [21.93681, 12.588180000000136], [22.03759, 12.95546], [22.29658, 13.37232], [22.18329, 13.78648], [22.51202, 14.09318], [22.30351, 14.32682], [22.56795000000011, 14.944290000000137], [23.024590000000103, 15.68072], [23.886890000000108, 15.61084], [23.83766000000014, 19.580470000000105], [23.850000000000136, 20], [25.000000000000114, 20.00304], [25.000000000000114, 22], [29.02, 22], [32.9, 22], [36.86623, 22], [37.1887200000001, 21.01885], [36.96941, 20.83744000000013], [37.11470000000014, 19.80796], [37.4817900000001, 18.61409], [37.86276, 18.36786], [38.410089959473225, 17.998307399970315], [37.90400000000011, 17.42754], [37.16747, 17.263140000000135], [36.852530000000115, 16.95655], [36.75389, 16.29186], [36.32322, 14.82249], [36.42951, 14.42211], [36.27022, 13.563330000000121], [35.86363, 12.57828], [35.26049, 12.08286], [34.83163000000013, 11.318960000000118], [34.73115000000013, 10.910170000000107], [34.25745, 10.63009], [33.96162, 9.58358], [33.963392794971185, 9.464285229420625]]]}') WHERE iso_a2 = 'SD';
UPDATE public.countries SET boundary = ST_GeomFromGeoJSON('{"type": "Polygon", "coordinates": [[[33.963392794971185, 9.464285229420625], [33.97498, 8.68456], [33.82550000000015, 8.37916], [33.29480000000012, 8.35458], [32.95418, 7.784970000000101], [33.568290000000104, 7.71334], [34.0751, 7.22595], [34.25032, 6.82607], [34.70702, 6.594220000000121], [35.2980071182331, 5.506], [34.62019626785394, 4.847122742082036], [34.005, 4.249884947362148], [33.3900000000001, 3.79], [32.68642, 3.79232], [31.881450000000143, 3.55827], [31.24556, 3.7819], [30.83385, 3.50917], [29.95349, 4.1737], [29.71599531425602, 4.600804755060153], [29.159078403446642, 4.389267279473245], [28.696677687298802, 4.455077215996994], [28.428993768027, 4.287154649264608], [27.979977247842953, 4.408413397637389], [27.374226108517632, 5.233944403500175], [27.213409051225256, 5.550953477394614], [26.465909458123292, 5.946717434101856], [26.21341840994512, 6.546603298362129], [25.796647983511264, 6.97931590415817], [25.124130893664812, 7.500085150579423], [25.114932488716875, 7.825104071479245], [24.5673690121522, 8.229187933785454], [23.886979580860668, 8.619729712933065], [24.19406772118765, 8.728696472403897], [24.53741516360202, 8.91753756573172], [24.794925745412684, 9.810240916008695], [25.069603699343986, 10.273759963267992], [25.790633328413946, 10.411098940233728], [25.962307049621018, 10.136420986302426], [26.477328213242515, 9.552730334198088], [26.752006167173818, 9.466893473594496], [27.112520981708883, 9.638567194801624], [27.833550610778786, 9.60423245056029], [27.970889587744352, 9.398223985111656], [28.966597170745786, 9.398223985111656], [29.000931914987177, 9.60423245056029], [29.515953078608618, 9.793073543888056], [29.61895731133285, 10.084918869940225], [29.996639497988554, 10.290927335388687], [30.837840731903384, 9.70723668328452], [31.35286189552488, 9.810240916008695], [31.850715687025513, 10.531270545078826], [32.400071594888345, 11.080626452941488], [32.31423473428475, 11.68148447716652], [32.073891524594785, 11.973329803218519], [32.67474954881965, 12.02483191958072], [32.743419037302544, 12.248007757149992], [33.206938084561784, 12.179338268667095], [33.086766479716744, 11.441141267476496], [33.206938084561784, 10.720111638406593], [33.72195924818311, 10.325262079630193], [33.84213085302815, 9.981914637215993], [33.82496348090751, 9.484060845715362], [33.963392794971185, 9.464285229420625]]]}') WHERE iso_a2 = 'SS';
UPDATE public.countries SET boundary = ST_GeomFromGeoJSON('{"type": "Polygon", "coordinates": [[[-16.71372880702347, 13.594958604379855], [-17.126106736712615, 14.373515733289224], [-17.62504269049066, 14.729540513564073], [-17.18517289882223, 14.919477240452862], [-16.700706346085923, 15.621527411354108], [-16.463098110407884, 16.13503611903846], [-16.12069007004193, 16.455662543193384], [-15.623666144258692, 16.369337063049812], [-15.135737270558819, 16.587282416240782], [-14.577347581428981, 16.59826365810281], [-14.099521450242179, 16.304302273010492], [-13.435737677453062, 16.03938304286619], [-12.830658331747516, 15.303691514542948], [-12.170750291380301, 14.616834214735505], [-12.12488745772126, 13.994727484589788], [-11.927716030311615, 13.422075100147396], [-11.55339779300543, 13.141213690641067], [-11.467899135778524, 12.754518947800975], [-11.51394283695059, 12.442987575729418], [-11.658300950557932, 12.386582749882836], [-12.203564825885634, 12.465647691289405], [-12.27859900557344, 12.354440008997287], [-12.499050665730564, 12.332089952031057], [-13.217818162478238, 12.575873521367967], [-13.700476040084325, 12.586182969610194], [-15.54847693527401, 12.628170070847347], [-15.816574266004254, 12.515567124883347], [-16.147716844130585, 12.547761542201187], [-16.677451951554573, 12.384851589401052], [-16.841524624081273, 13.15139394780256], [-15.931295945692211, 13.130284125211332], [-15.691000535534995, 13.270353094938457], [-15.511812506562933, 13.278569647672867], [-15.141163295949468, 13.509511623585238], [-14.712197231494628, 13.298206691943777], [-14.277701788784555, 13.280585028532244], [-13.844963344772408, 13.505041612192002], [-14.046992356817482, 13.79406789800045], [-14.376713833055788, 13.625680243377374], [-14.687030808968487, 13.630356960499784], [-15.08173539881382, 13.876491807505985], [-15.39877031092446, 13.86036876063092], [-15.624596320039942, 13.62358734786956], [-16.71372880702347, 13.594958604379855]]]}') WHERE iso_a2 = 'SN';
UPDATE public.countries SET boundary = ST_GeomFromGeoJSON('{"type": "MultiPolygon", "coordinates": [[[[162.11902469304087, -10.482719008021135], [162.39864586817222, -10.82636728276212], [161.70003218001838, -10.820011081590224], [161.31979699121476, -10.204751478723125], [161.917383254238, -10.446700534713656], [162.11902469304087, -10.482719008021135]]], [[[160.85222863183796, -9.872937106977005], [160.46258833235729, -9.895209649294841], [159.8494474632142, -9.794027194867368], [159.64000288313517, -9.63997975020527], [159.70294477766666, -9.242949720906779], [160.36295617089846, -9.400304457235535], [160.6885176943372, -9.610162448772812], [160.85222863183796, -9.872937106977005]]], [[[161.67998172428915, -9.599982191611375], [161.52939660059056, -9.784312025596435], [160.78825320866056, -8.91754322676492], [160.57999718652437, -8.320008640173967], [160.92002811100494, -8.320008640173967], [161.28000613835, -9.120011488484451], [161.67998172428915, -9.599982191611375]]], [[[159.8750272971986, -8.337320244991716], [159.917401971678, -8.538289890174866], [159.1336771995394, -8.1141814103554], [158.58611372297472, -7.754823500197716], [158.21114953026486, -7.421872246941149], [158.35997765526545, -7.320017998893917], [158.82000125552773, -7.560003350457393], [159.64000288313517, -8.020026950719569], [159.8750272971986, -8.337320244991716]]], [[[157.5384257346893, -7.347819919466929], [157.33941979393327, -7.404767347852555], [156.9020304710148, -7.176874281445393], [156.49135786359133, -6.765943291860395], [156.54282759015396, -6.59933847415148], [157.1400004417189, -7.021638278840655], [157.5384257346893, -7.347819919466929]]]]}') WHERE iso_a2 = 'SB';
UPDATE public.countries SET boundary = ST_GeomFromGeoJSON('{"type": "Polygon", "coordinates": [[[-11.438779466182055, 6.785916856305747], [-11.70819454593574, 6.860098374860726], [-12.428098924193819, 7.26294200279203], [-12.949049038128194, 7.798645738145738], [-13.124025437868482, 8.163946438016978], [-13.246550258832515, 8.903048610871508], [-12.71195756677308, 9.342711696810767], [-12.59671912276221, 9.62018830000197], [-12.425928514037565, 9.835834051955956], [-12.150338100625005, 9.858571682164381], [-11.917277390988659, 10.046983954300558], [-11.11748124840733, 10.045872911006285], [-10.839151984083301, 9.688246161330369], [-10.622395188835041, 9.267910061068278], [-10.654770473665891, 8.977178452994195], [-10.494315151399633, 8.715540676300435], [-10.505477260774668, 8.348896389189605], [-10.23009355309128, 8.406205552601293], [-10.69559485517648, 7.939464016141088], [-11.146704270868383, 7.396706447779536], [-11.19980180504828, 7.105845648624737], [-11.438779466182055, 6.785916856305747]]]}') WHERE iso_a2 = 'SL';
UPDATE public.countries SET boundary = ST_GeomFromGeoJSON('{"type": "Polygon", "coordinates": [[[-87.79311113152657, 13.384480495655055], [-87.90411210808952, 13.149016831917137], [-88.48330156121682, 13.163951320849492], [-88.84322791212972, 13.259733588102478], [-89.2567427233293, 13.458532823129303], [-89.81239356154767, 13.520622056527998], [-90.09555457229098, 13.735337632700734], [-90.0646779039966, 13.881969509328925], [-89.72193396682073, 14.134228013561696], [-89.53421932652051, 14.244815578666305], [-89.58734269891656, 14.36258616785949], [-89.3533259752828, 14.424132798719114], [-89.05851192905766, 14.340029405164087], [-88.84307288283284, 14.14050670008517], [-88.541230841816, 13.980154730683479], [-88.50399797234971, 13.845485948130857], [-88.06534257684014, 13.964625962779778], [-87.8595153470216, 13.893312486216983], [-87.7235029772294, 13.785050360565506], [-87.79311113152657, 13.384480495655055]]]}') WHERE iso_a2 = 'SV';
UPDATE public.countries SET boundary = ST_GeomFromGeoJSON('{"type": "Polygon", "coordinates": [[[49.72862, 11.5789], [50.25878, 11.67957], [50.73202, 12.0219], [51.1112, 12.02464], [51.13387, 11.74815], [51.04153, 11.16651], [51.04531, 10.6409], [50.83418, 10.27972], [50.55239, 9.19874], [50.07092, 8.08173], [49.4527, 6.80466], [48.59455, 5.33911], [47.74079, 4.2194], [46.56476, 2.85529], [45.56399, 2.04576], [44.06815, 1.05283], [43.13597, 0.2922], [42.04157, -0.91916], [41.81095, -1.44647], [41.58513, -1.68325], [40.993, -0.85829], [40.98105, 2.78452], [41.85508309264397, 3.918911920483727], [42.12861, 4.23413], [42.76967, 4.25259], [43.66087, 4.95755], [44.9636, 5.00162], [47.78942, 8.003], [48.48673587422695, 8.837626247589995], [48.93812951029645, 9.451748968946617], [48.93823286316103, 9.973500067581512], [48.938491245322496, 10.982327378783467], [48.94200524271835, 11.394266058798138], [48.94820475850974, 11.410617281697963], [49.26776, 11.43033], [49.72862, 11.5789]]]}') WHERE iso_a2 = 'SO';
UPDATE public.countries SET boundary = ST_GeomFromGeoJSON('{"type": "Polygon", "coordinates": [[[20.87431277841341, 45.41637543393432], [21.48352623870221, 45.18117015235788], [21.562022739353722, 44.76894725196564], [22.145087924902896, 44.47842234962059], [22.459022251075965, 44.70251719825444], [22.70572553883744, 44.57800283464701], [22.474008416440654, 44.40922760678177], [22.657149692483074, 44.234923000661354], [22.410446404721597, 44.008063462900054], [22.500156691180223, 43.642814439461006], [22.986018507588483, 43.2111612005271], [22.60480146657136, 42.898518785161116], [22.436594679461393, 42.58032115332395], [22.54501183440965, 42.46136200618804], [22.38052575042468, 42.32025950781508], [21.917080000000112, 42.30364], [21.57663598940212, 42.24522439706186], [21.54332, 42.3202500000001], [21.66292, 42.43922], [21.77505, 42.6827], [21.63302, 42.67717], [21.43866, 42.86255], [21.27421, 42.90959], [21.143395, 43.06868500000013], [20.95651, 43.13094], [20.81448, 43.27205], [20.63508, 43.21671], [20.49679, 42.88469], [20.25758, 42.81275000000011], [20.3398, 42.89852], [19.95857, 43.10604], [19.63, 43.21377997027054], [19.48389, 43.35229], [19.21852, 43.52384], [19.454, 43.56810000000013], [19.59976, 44.03847], [19.11761, 44.42307000000011], [19.36803, 44.863], [19.00548, 44.86023], [19.39047570158459, 45.236515611342384], [19.072768995854176, 45.52151113543209], [18.82982, 45.90888], [19.59604454924164, 46.17172984474456], [20.220192498462893, 46.12746898048658], [20.762174920339987, 45.734573065771485], [20.87431277841341, 45.41637543393432]]]}') WHERE iso_a2 = 'RS';
UPDATE public.countries SET boundary = ST_GeomFromGeoJSON('{"type": "Polygon", "coordinates": [[[-57.14743648947689, 5.973149929219161], [-55.9493184067898, 5.772877915872002], [-55.841779751190415, 5.95312531170606], [-55.033250291551774, 6.025291449401664], [-53.9580446030709, 5.756548163267765], [-54.47863298197923, 4.896755682795586], [-54.399542202356514, 4.212611395683467], [-54.00693050801901, 3.620037746592558], [-54.181726040246275, 3.189779771330421], [-54.2697051662232, 2.732391669115046], [-54.524754197799716, 2.311848863123785], [-55.09758744975514, 2.523748073736613], [-55.569755011606, 2.421506252447131], [-55.973322109589375, 2.510363877773017], [-56.0733418442903, 2.220794989425499], [-55.905600145070885, 2.02199575439866], [-55.995698004771754, 1.817667141116601], [-56.539385748914555, 1.899522609866921], [-57.15009782573991, 2.768926906745406], [-57.28143347840971, 3.333491929534119], [-57.60156897645787, 3.334654649260685], [-58.04469438336068, 4.060863552258382], [-57.8602095200787, 4.57680105226045], [-57.91428890647214, 4.812626451024414], [-57.307245856339506, 5.073566595882227], [-57.14743648947689, 5.973149929219161]]]}') WHERE iso_a2 = 'SR';
UPDATE public.countries SET boundary = ST_GeomFromGeoJSON('{"type": "Polygon", "coordinates": [[[18.853144158613617, 49.49622976337764], [18.90957482267632, 49.435845852244576], [19.320712517990472, 49.571574001659194], [19.825022820726872, 49.21712535256923], [20.415839471119853, 49.43145335549977], [20.887955356538413, 49.32877228453583], [21.607808058364213, 49.47010732685409], [22.558137648211755, 49.085738023467144], [22.28084191253356, 48.82539215758067], [22.085608351334855, 48.42226430927179], [21.872236362401736, 48.31997081155002], [20.801293979584926, 48.623854071642384], [20.473562045989866, 48.562850043321816], [20.239054396249347, 48.32756724709692], [19.769470656013112, 48.202691148463614], [19.661363559658497, 48.26661489520866], [19.17436486173989, 48.11137889260387], [18.77702477384767, 48.081768296900634], [18.696512892336926, 47.880953681014404], [17.857132602620027, 47.75842886005037], [17.48847293464982, 47.867466132186216], [16.979666782304037, 48.123497015976305], [16.879982944413, 48.47001333270947], [16.960288120194576, 48.5969823268506], [17.101984897538898, 48.816968899117114], [17.545006951577108, 48.80001902932537], [17.88648481616181, 48.90347524677371], [17.913511590250465, 48.996492824899086], [18.104972771891852, 49.04398346617531], [18.170498488037964, 49.271514797556435], [18.399993523846177, 49.31500051533004], [18.554971144289482, 49.495015367218784], [18.853144158613617, 49.49622976337764]]]}') WHERE iso_a2 = 'SK';
UPDATE public.countries SET boundary = ST_GeomFromGeoJSON('{"type": "Polygon", "coordinates": [[[13.806475457421527, 46.509306138691215], [14.63247155117483, 46.43181732846955], [15.137091912504985, 46.65870270444703], [16.011663852612656, 46.6836107448117], [16.202298211337364, 46.85238597267696], [16.370504998447416, 46.841327216166505], [16.564808383864857, 46.50375092221983], [15.768732944408553, 46.23810822202345], [15.671529575267556, 45.83415355079788], [15.323953891672405, 45.73178253842768], [15.327674594797429, 45.45231639259323], [14.935243767972935, 45.471695054702685], [14.595109490627806, 45.634940904312714], [14.411968214585414, 45.46616567644746], [13.715059848697223, 45.500323798192376], [13.937630242578308, 45.59101593686462], [13.698109978905478, 46.01677806251735], [13.806475457421527, 46.509306138691215]]]}') WHERE iso_a2 = 'SI';
UPDATE public.countries SET boundary = ST_GeomFromGeoJSON('{"type": "Polygon", "coordinates": [[[22.18317345550193, 65.72374054632017], [21.21351687997722, 65.02600535751527], [21.369631381930958, 64.41358795842429], [19.77887576669022, 63.60955434839504], [17.84777916837521, 62.74940013289681], [17.119554884518124, 61.34116567651097], [17.83134606290639, 60.63658336042741], [18.78772179533209, 60.081914374422595], [17.86922488777634, 58.9537661810587], [16.829185011470088, 58.71982697207339], [16.447709588291474, 57.041118069071885], [15.879785597403783, 56.10430186626866], [14.666681349352075, 56.200885118222175], [14.100721062891465, 55.40778107362265], [12.942910597392057, 55.36173737245058], [12.625100538797028, 56.30708018658197], [11.787942335668674, 57.44181712506307], [11.027368605196868, 58.85614940045936], [11.468271925511146, 59.43239329694604], [12.3003658382749, 60.11793284773003], [12.631146681375185, 61.293571682370136], [11.992064243221563, 61.80036245385655], [11.930569288794231, 63.12831757267698], [12.579935336973934, 64.06621898055833], [13.571916131248713, 64.04911408146971], [13.919905226302204, 64.44542064071608], [13.55568973150909, 64.78702769638151], [15.108411492583002, 66.19386688909547], [16.108712192456778, 67.30245555283689], [16.768878614985482, 68.0139366726314], [17.729181756265348, 68.01055186631628], [17.993868442464333, 68.56739126247736], [19.878559604581255, 68.40719432237258], [20.025268995857886, 69.0651386583127], [20.645592889089528, 69.10624726020087], [21.978534783626117, 68.6168456081807], [23.53947309743444, 67.93600861273525], [23.565879754335583, 66.39605093043743], [23.903378533633802, 66.00692739527962], [22.18317345550193, 65.72374054632017]]]}') WHERE iso_a2 = 'SE';
UPDATE public.countries SET boundary = ST_GeomFromGeoJSON('{"type": "Polygon", "coordinates": [[[32.07166548028107, -26.73382008230491], [31.86806033705108, -27.177927341421277], [31.28277306491333, -27.285879408478998], [30.68596194837448, -26.743845310169533], [30.67660851412964, -26.398078301704608], [30.949666782359913, -26.02264902110415], [31.04407962415715, -25.731452325139443], [31.333157586397903, -25.66019052500895], [31.83777794772806, -25.84333180105135], [31.98577924981197, -26.291779880480227], [32.07166548028107, -26.73382008230491]]]}') WHERE iso_a2 = 'SZ';
UPDATE public.countries SET boundary = ST_GeomFromGeoJSON('{"type": "Polygon", "coordinates": [[[38.792340529136084, 33.378686428352225], [36.834062127435544, 32.312937526980775], [35.71991824722275, 32.709192409794866], [35.70079796727475, 32.71601369885738], [35.836396925608625, 32.86812327730851], [35.82110070165024, 33.2774264592763], [36.066460402172055, 33.82491242119255], [36.61175011571589, 34.20178864189718], [36.4481942075121, 34.59393524834407], [35.99840254084364, 34.644914048800004], [35.905023227692226, 35.410009467097325], [36.149762811026534, 35.82153473565367], [36.417550083163036, 36.04061697035506], [36.6853890317318, 36.259699205056464], [36.7394942563414, 36.81752045343109], [37.06676110204583, 36.62303620050062], [38.1677274920242, 36.90121043552777], [38.6998913917659, 36.71292735447234], [39.52258019385255, 36.71605377862599], [40.67325931169569, 37.09127635349729], [41.21208947120305, 37.074352321921694], [42.34959109881177, 37.2298725449041], [41.83706424334096, 36.605853786763575], [41.289707472505455, 36.35881460219227], [41.383965285005814, 35.628316555314356], [41.006158888519934, 34.41937226006212], [38.792340529136084, 33.378686428352225]]]}') WHERE iso_a2 = 'SY';
UPDATE public.countries SET boundary = ST_GeomFromGeoJSON('{"type": "Polygon", "coordinates": [[[14.495787387762903, 12.859396267137356], [14.595781284247607, 13.33042694747786], [13.95447675950561, 13.353448798063766], [13.956698846094127, 13.996691189016929], [13.540393507550789, 14.367133693901224], [13.97217, 15.68437], [15.247731154041844, 16.627305813050782], [15.30044111497972, 17.927949937405003], [15.685740594147774, 19.957180080642388], [15.903246697664315, 20.387618923417506], [15.487148064850146, 20.730414537025638], [15.47106, 21.04845], [15.096887648181848, 21.30851878507491], [14.8513, 22.862950000000126], [15.86085, 23.40972], [19.84926, 21.49509], [23.83766000000014, 19.580470000000105], [23.886890000000108, 15.61084], [23.024590000000103, 15.68072], [22.56795000000011, 14.944290000000137], [22.30351, 14.32682], [22.51202, 14.09318], [22.18329, 13.78648], [22.29658, 13.37232], [22.03759, 12.95546], [21.93681, 12.588180000000136], [22.28801, 12.64605], [22.49762, 12.26024], [22.50869, 11.67936], [22.87622, 11.384610000000123], [22.864165480244253, 11.142395127807617], [22.23112918466876, 10.97188873946061], [21.72382164885954, 10.567055568885962], [21.00086836109631, 9.47598521569148], [20.05968549976427, 9.01270600019484], [19.09400800952608, 9.07484691002577], [18.812009718509273, 8.982914536978626], [18.911021762780592, 8.630894680206438], [18.389554884523307, 8.281303615751881], [17.964929640380888, 7.890914008002994], [16.70598839688637, 7.508327541529979], [16.456184523187403, 7.73477366783294], [16.290561557691888, 7.754307359239419], [16.106231723706742, 7.497087917506462], [15.279460483469165, 7.421924546738012], [15.436091749745742, 7.692812404811889], [15.120865512765306, 8.382150173369439], [14.979995558337691, 8.796104234243444], [14.544466586981855, 8.96586131432224], [13.954218377344091, 9.549494940626687], [14.171466098699113, 10.021378282100045], [14.62720055508106, 9.920919297724595], [14.9093538753948, 9.99212942142276], [15.467872755605242, 9.982336737503545], [14.923564894275046, 10.891325181517516], [14.960151808337685, 11.555574042197236], [14.89336, 12.21905], [14.495787387762903, 12.859396267137356]]]}') WHERE iso_a2 = 'TD';
UPDATE public.countries SET boundary = ST_GeomFromGeoJSON('{"type": "Polygon", "coordinates": [[[1.865240512712319, 6.142157701029731], [1.060121697604927, 5.928837388528876], [0.836931186536333, 6.279978745952149], [0.570384148774849, 6.914358628767189], [0.490957472342245, 7.411744289576475], [0.712029249686879, 8.31246450442383], [0.461191847342121, 8.677222601756014], [0.365900506195885, 9.465003973829482], [0.367579990245389, 10.19121287682718], [-0.049784715159944, 10.706917832883931], [0.023802524423701, 11.018681748900804], [0.899563022474069, 10.99733938236426], [0.772335646171484, 10.470808213742359], [1.077795037448738, 10.175606594275024], [1.425060662450136, 9.825395412633], [1.46304284018467, 9.334624335157088], [1.664477573258381, 9.12859039960938], [1.618950636409238, 6.832038072126238], [1.865240512712319, 6.142157701029731]]]}') WHERE iso_a2 = 'TG';
UPDATE public.countries SET boundary = ST_GeomFromGeoJSON('{"type": "Polygon", "coordinates": [[[102.5849324890267, 12.186594956913282], [101.68715783081996, 12.645740057826572], [100.83180952352487, 12.627084865769206], [100.9784672383692, 13.412721665902566], [100.09779747925111, 13.406856390837433], [100.01873253784456, 12.307001044153354], [99.47892052612363, 10.846366685423547], [99.15377241414316, 9.963061428258555], [99.22239871622676, 9.239255479362427], [99.87383182169813, 9.20786204674512], [100.27964684448622, 8.295152899606052], [100.45927412313276, 7.429572658717177], [101.01732791545273, 6.856868597842478], [101.62307905477806, 6.74062246340192], [102.14118696493638, 6.221636053894628], [101.81428185425798, 5.810808417174242], [101.15421878459387, 5.691384182147715], [101.07551557821336, 6.204867051615921], [100.25959638875696, 6.642824815289543], [100.0857568705271, 6.464489447450291], [99.69069054565576, 6.848212795433597], [99.51964155476963, 7.34345388430276], [98.9882528015123, 7.907993068875328], [98.503786248776, 8.382305202666288], [98.339661899817, 7.794511623562386], [98.15000939330582, 8.350007432483878], [98.25915001830626, 8.973922837759801], [98.55355065307305, 9.932959906448545], [99.03812055867398, 10.960545762572437], [99.58728600463972, 11.892762762901697], [99.19635379435167, 12.80474843998867], [99.21201175333609, 13.269293728076464], [99.09775516153876, 13.827502549693278], [98.43081912637987, 14.622027696180837], [98.1920740091914, 15.123702500870351], [98.53737592976572, 15.308497422746084], [98.90334842325676, 16.17782420497612], [98.49376102091135, 16.83783559820793], [97.85912275593486, 17.567946071843664], [97.37589643757354, 18.445437730375815], [97.79778283080441, 18.627080389881755], [98.25372399291561, 19.708203029860044], [98.95967573445488, 19.752980658440947], [99.54330936075931, 20.186597601802063], [100.11598758341785, 20.417849636308187], [100.54888105672688, 20.109237982661128], [100.60629357300316, 19.508344427971224], [101.2820146016517, 19.462584947176765], [101.03593143107777, 18.408928330961615], [101.05954756063517, 17.51249725999449], [102.11359175009248, 18.109101670804165], [102.41300499879162, 17.932781683824288], [102.99870568238771, 17.9616946476916], [103.20019209189374, 18.309632066312773], [103.9564766784853, 18.24095408779688], [104.7169470560925, 17.42885895433008], [104.7793205098688, 16.44186493577145], [105.58903852745016, 15.570316066952858], [105.54433841351769, 14.723933620660418], [105.21877689007889, 14.273211778210694], [104.28141808473661, 14.416743068901367], [102.98842207236163, 14.225721136934467], [102.34809939983302, 13.394247341358223], [102.5849324890267, 12.186594956913282]]]}') WHERE iso_a2 = 'TH';
UPDATE public.countries SET boundary = ST_GeomFromGeoJSON('{"type": "Polygon", "coordinates": [[[71.01419803252017, 40.24436554621823], [70.64801883329997, 39.93575389257117], [69.55960981636852, 40.10321137141298], [69.46488691597753, 39.5266832545487], [70.54916181832562, 39.6041979029865], [71.784693637992, 39.27946320246437], [73.6753792662548, 39.4312368841056], [73.92885216664644, 38.50581533462274], [74.25751427602273, 38.60650686294345], [74.86481570831683, 38.3788463404816], [74.8299857929521, 37.9900070257014], [74.98000247589542, 37.419990139305895], [73.9486959166465, 37.4215662704908], [73.26005577992501, 37.495256862939], [72.63688968291729, 37.047558091778356], [72.1930408059624, 36.948287665345674], [71.8446382994506, 36.73817129164692], [71.44869347523024, 37.06564484308052], [71.54191775908478, 37.905774441065645], [71.23940392444817, 37.953265082341886], [71.34813113799026, 38.25890534113216], [70.80682050973289, 38.486281643216415], [70.3763041523093, 38.13839590102752], [70.27057417184014, 37.735164699854025], [70.11657840361033, 37.58822276463209], [69.51878543485796, 37.60899669041342], [69.19627282092438, 37.15114350030743], [68.85944583524594, 37.344335842430596], [68.13556237170138, 37.02311513930431], [67.82999962755952, 37.144994004864685], [68.39203250516596, 38.15702525486874], [68.17602501818592, 38.901553453113905], [67.44221967964131, 39.140143541005486], [67.70142866401736, 39.58047842056453], [68.53641645698943, 39.53345286717894], [69.0116329283455, 40.08615814875667], [69.32949466337283, 40.72782440852485], [70.66662234892505, 40.960213324541414], [70.45815962105962, 40.49649485937029], [70.60140669137269, 40.21852733007229], [71.01419803252017, 40.24436554621823]]]}') WHERE iso_a2 = 'TJ';
UPDATE public.countries SET boundary = ST_GeomFromGeoJSON('{"type": "Polygon", "coordinates": [[[61.210817091725744, 35.650072333309225], [61.123070509694145, 36.491597194966246], [60.37763797388388, 36.52738312432837], [59.23476199731681, 37.41298798273034], [58.436154412678206, 37.5223094752438], [57.330433790928986, 38.02922943781094], [56.61936608259282, 38.121394354803485], [56.18037479027333, 37.93512665460743], [55.51157840355191, 37.96411713312317], [54.800303989486565, 37.392420762678185], [53.92159793479556, 37.19891836196126], [53.73551110211252, 37.90613617609169], [53.880928582581845, 38.95209300389536], [53.1010278664329, 39.29057363540713], [53.35780805849123, 39.97528636327445], [52.69397260926982, 40.03362905533197], [52.915251092343624, 40.87652334244473], [53.858139275941134, 40.63103445084218], [54.73684533063215, 40.95101491959346], [54.008310988181314, 41.55121084244742], [53.72171349469059, 42.12319143327003], [52.916749708880076, 41.86811656347733], [52.81468875510362, 41.13537059179471], [52.50245975119615, 41.78331553808637], [52.944293247291654, 42.11603424739759], [54.07941775901495, 42.32410940202083], [54.75534549339264, 42.043971462566574], [55.45525109235377, 41.25985911718584], [55.96819135928291, 41.30864166926936], [57.0963912290791, 41.32231008561057], [56.932215203687804, 41.826026109375604], [57.78652998233708, 42.17055288346552], [58.62901085799146, 42.75155101172305], [59.976422153569786, 42.22308197689021], [60.083340691981675, 41.425146185871405], [60.465952996670694, 41.22032664648255], [61.54717898951356, 41.266370347654615], [61.88271406438469, 41.084856879229406], [62.374260288345006, 40.05388621679039], [63.51801476426103, 39.36325653742564], [64.17022301621677, 38.892406724598246], [65.2159989765074, 38.4026950139843], [66.54615034370022, 37.97468496352687], [66.51860680528867, 37.36278432875879], [66.21738488145934, 37.39379018813392], [65.74563073106683, 37.66116404881207], [65.58894778835784, 37.30521678318564], [64.7461051776774, 37.111817735333304], [64.5464791197339, 36.31207326918427], [63.98289594915871, 36.0079574651466], [63.19353844590035, 35.857165635718914], [62.98466230657661, 35.40404083916762], [62.230651483005886, 35.270663967422294], [61.210817091725744, 35.650072333309225]]]}') WHERE iso_a2 = 'TM';
UPDATE public.countries SET boundary = ST_GeomFromGeoJSON('{"type": "Polygon", "coordinates": [[[124.96868248911623, -8.892790215697083], [125.08624637258026, -8.65688730228468], [125.94707238169826, -8.432094821815035], [126.64470421763855, -8.398246758663852], [126.95724328013983, -8.273344821814398], [127.33592817597463, -8.397316582882603], [126.96799197805655, -8.668256117388893], [125.9258850444586, -9.106007175333353], [125.08852013560109, -9.393173109579294], [125.07001997284061, -9.089987481322872], [124.96868248911623, -8.892790215697083]]]}') WHERE iso_a2 = 'TL';
UPDATE public.countries SET boundary = ST_GeomFromGeoJSON('{"type": "Polygon", "coordinates": [[[-61.68, 10.76], [-61.105, 10.89], [-60.895, 10.855], [-60.935, 10.11], [-61.77, 10], [-61.95, 10.09], [-61.66, 10.365], [-61.68, 10.76]]]}') WHERE iso_a2 = 'TT';
UPDATE public.countries SET boundary = ST_GeomFromGeoJSON('{"type": "Polygon", "coordinates": [[[9.482139926805274, 30.307556057246188], [9.05560265466815, 32.10269196220129], [8.439102817426118, 32.50628489840082], [8.430472853233368, 32.74833730725595], [7.612641635782182, 33.34411489514896], [7.524481642292244, 34.09737641045146], [8.140981479534304, 34.65514598239379], [8.376367628623768, 35.479876003555944], [8.217824334352315, 36.433176988260286], [8.420964389691676, 36.94642731378316], [9.509993523810607, 37.349994411766545], [10.210002475636317, 37.230001735984814], [10.180650262094531, 36.724037787415085], [11.02886722173335, 37.09210317641396], [11.100025668999251, 36.899996039368915], [10.600004510143094, 36.410000108377375], [10.593286573945138, 35.94744436293281], [10.939518670300687, 35.698984076473494], [10.807847120821009, 34.83350718844919], [10.149592726287125, 34.33077301689771], [10.339658644256616, 33.78574168551532], [10.856836378633687, 33.76874013929128], [11.108500603895122, 33.293342800422195], [11.488787469131012, 33.13699575452314], [11.432253452203696, 32.368903103152874], [10.944789666394456, 32.081814683555365], [10.636901482799487, 31.761420803345757], [9.950225050505082, 31.376069647745258], [10.056575148161755, 30.9618313664936], [9.970017124072854, 30.53932485607524], [9.482139926805274, 30.307556057246188]]]}') WHERE iso_a2 = 'TN';
UPDATE public.countries SET boundary = ST_GeomFromGeoJSON('{"type": "MultiPolygon", "coordinates": [[[[36.91312706884216, 41.335358384764305], [38.34766482926452, 40.94858612727572], [39.51260664242025, 41.102762763018575], [40.37343265153825, 41.013672593747344], [41.554084100110714, 41.53565623632761], [42.619548781104555, 41.58317271581993], [43.58274580259271, 41.09214325618257], [43.7526579119685, 40.74020091405882], [43.65643639504097, 40.25356395116617], [44.400008579288766, 40.00500031184231], [44.793989699082005, 39.713002631177034], [44.10922529478236, 39.428136298168056], [44.4214026222576, 38.28128123631453], [44.22575564960053, 37.97158437758935], [44.77269900897775, 37.17044464776845], [44.29345177590287, 37.00151439060636], [43.94225874204736, 37.256227525372935], [42.77912560402186, 37.38526357680581], [42.34959109881177, 37.22987254490411], [41.21208947120303, 37.07435232192174], [40.673259311695716, 37.09127635349736], [39.52258019385252, 36.71605377862602], [38.69989139176593, 36.71292735447233], [38.16772749202417, 36.90121043552779], [37.06676110204583, 36.62303620050062], [36.739494256341374, 36.817520453431115], [36.68538903173183, 36.259699205056506], [36.41755008316309, 36.0406169703551], [36.14976281102659, 35.82153473565367], [35.782084995269855, 36.27499542901492], [36.160821567537056, 36.650605577128374], [35.55093631362834, 36.56544281671134], [34.714553256984374, 36.795532131490916], [34.02689497247647, 36.21996002862397], [32.5091581560641, 36.1075637883892], [31.699595167779563, 36.64427521417261], [30.62162479017107, 36.677864895162315], [30.39109622571712, 36.26298065850699], [29.699975620245567, 36.14435740818101], [28.732902866335394, 36.67683136651644], [27.64118655773737, 36.658822129862756], [27.048767937943296, 37.65336090753601], [26.31821821463305, 38.208133246405396], [26.804700148228733, 38.98576019953356], [26.17078535330438, 39.463612168936464], [27.280019972449395, 40.42001373957831], [28.81997765474722, 40.46001129817222], [29.240003696415584, 41.21999074967269], [31.145933872204438, 41.087621568357065], [32.34797936374579, 41.73626414648464], [33.51328291192752, 42.01896006933731], [35.16770389175187, 42.040224921225445], [36.91312706884216, 41.335358384764305]]], [[[27.19237674328241, 40.690565700842455], [26.35800906749779, 40.15199392349649], [26.04335127127254, 40.61775360774317], [26.056942172965336, 40.82412344010075], [26.294602085075695, 40.93626129817417], [26.604195590936285, 41.56211456966102], [26.11704186372083, 41.82690460872456], [27.13573937349051, 42.141484890301314], [27.996720411905414, 42.007358710287775], [28.115524529744448, 41.622886054036286], [28.98844282401879, 41.29993419042819], [28.806438429486747, 41.05496206314854], [27.61901736828412, 40.99982330989312], [27.19237674328241, 40.690565700842455]]]]}') WHERE iso_a2 = 'TR';
UPDATE public.countries SET boundary = ST_GeomFromGeoJSON('{"type": "Polygon", "coordinates": [[[121.77781782438993, 24.3942735865194], [121.17563235889274, 22.790857245367167], [120.74707970589623, 21.970571397382113], [120.22008344938368, 22.81486094816674], [120.1061885926124, 23.556262722258236], [120.69467980355225, 24.538450832613737], [121.49504438688878, 25.295458889257386], [121.95124393116146, 24.997595933527037], [121.77781782438993, 24.3942735865194]]]}') WHERE iso_a2 = 'TW';
UPDATE public.countries SET boundary = ST_GeomFromGeoJSON('{"type": "Polygon", "coordinates": [[[33.9037111971046, -0.95], [34.07262, -1.05982], [37.69869, -3.09699], [37.7669, -3.67712], [39.20222, -4.67677], [38.74054, -5.90895], [38.79977, -6.47566], [39.44, -6.839999999999861], [39.47000000000014, -7.1], [39.19469, -7.7039], [39.25203, -8.00781], [39.18652, -8.48551], [39.53574, -9.112369999999885], [39.9496, -10.0984], [40.31659, -10.317099999999868], [39.521, -10.89688], [38.42755659358778, -11.285202325081627], [37.82764, -11.26879], [37.47129, -11.56876], [36.77515099462289, -11.594537448780784], [36.514081658684404, -11.720938002166747], [35.31239790216915, -11.439146416879169], [34.559989047999466, -11.520020033415847], [34.28, -10.16], [33.940837724096525, -9.693673841980285], [33.73972, -9.41715], [32.75937544122138, -9.230599053589003], [32.19186486179194, -8.930358981973257], [31.55634809746664, -8.762048841998649], [31.15775133695007, -8.594578747317314], [30.74, -8.34], [30.2, -7.08], [29.62, -6.52], [29.41999271008831, -5.939998874539299], [29.51998660657307, -5.419978936386258], [29.339997592900374, -4.499983412294114], [29.753512404099865, -4.452389418153302], [30.11632, -4.09012], [30.50554, -3.56858], [30.75224, -3.35931], [30.74301, -3.03431], [30.52766, -2.80762], [30.46967, -2.41383], [30.75830895358314, -2.287250257988376], [30.81613488131785, -1.698914076345375], [30.419104852019302, -1.134659112150416], [30.769860000000108, -1.01455], [31.86617, -1.02736], [33.9037111971046, -0.95]]]}') WHERE iso_a2 = 'TZ';
UPDATE public.countries SET boundary = ST_GeomFromGeoJSON('{"type": "Polygon", "coordinates": [[[31.86617, -1.02736], [30.769860000000108, -1.01455], [30.419104852019302, -1.134659112150416], [29.821518588996128, -1.443322442229771], [29.579466180141026, -1.341313164885605], [29.58783776217217, -0.587405694179381], [29.8195, -0.2053], [29.875778842902434, 0.597379868976361], [30.08615359876279, 1.062312730306417], [30.46850752129029, 1.583805446779706], [30.85267011894814, 1.849396470543752], [31.17414920423596, 2.204465236821306], [30.77332, 2.339890000000139], [30.83385, 3.50917], [31.24556, 3.7819], [31.88145, 3.55827], [32.68642, 3.79232], [33.3900000000001, 3.79], [34.005, 4.249884947362148], [34.47913, 3.5556], [34.59607, 3.053740000000118], [35.03599, 1.90584], [34.6721, 1.17694], [34.18, 0.515], [33.893568969667, 0.109813537861839], [33.9037111971046, -0.95], [31.86617, -1.02736]]]}') WHERE iso_a2 = 'UG';
UPDATE public.countries SET boundary = ST_GeomFromGeoJSON('{"type": "Polygon", "coordinates": [[[31.785998162571587, 52.101677964885454], [32.15941206231267, 52.06126699483322], [32.41205813978763, 52.28869497334975], [32.71576053236697, 52.23846548116205], [33.75269982273571, 52.335074571331695], [34.39173058445701, 51.76888174092579], [34.14197838719039, 51.56641347920623], [34.22481570815427, 51.25599315042896], [35.02218305841788, 51.20757233337146], [35.37792361831512, 50.77395539001035], [35.35611616388795, 50.57719737405906], [36.62616784032534, 50.225590928745135], [37.39345950699507, 50.38395335550359], [38.010631137856905, 49.91566152607463], [38.59498823421342, 49.92646190042363], [40.06905846533911, 49.6010554062817], [40.08078901546935, 49.307429917999286], [39.67466393408753, 48.78381846780188], [39.89563235856758, 48.23240509703143], [39.738277622238826, 47.89893707945199], [38.7705847511412, 47.825608222029814], [38.25511233902975, 47.546400458356814], [38.22353803889942, 47.102189846375886], [37.42513715998999, 47.022220567404204], [36.75985477066439, 46.698700263040934], [35.82368452326483, 46.64596446388707], [34.96234174982388, 46.27319651954964], [35.020787794745985, 45.65121898048466], [35.51000857925317, 45.40999339454619], [36.52999799983016, 45.46998973243706], [36.33471276219916, 45.113215643893966], [35.23999922052812, 44.939996242851606], [33.882511020652885, 44.36147858334407], [33.326420932760044, 44.56487702084489], [33.54692426934946, 45.03477081967489], [32.4541744321055, 45.32746613217608], [32.630804477679135, 45.51918569597891], [33.58816206231839, 45.85156850848024], [33.29856733575471, 46.080598456397844], [31.74414025241518, 46.333347886737386], [31.675307244602408, 46.70624502215554], [30.7487488136091, 46.583100084004], [30.377608676888883, 46.03241018328567], [29.603289015427436, 45.293308010431126], [29.149724969201653, 45.464925442072456], [28.67977949393938, 45.304030870131704], [28.233553501099042, 45.488283189468376], [28.485269402792767, 45.5969070501459], [28.65998742037158, 45.93998688413164], [28.933717482221624, 46.2588304713725], [28.862972446414062, 46.43788930926383], [29.07210696789929, 46.517677720722496], [29.170653924279886, 46.3792623968287], [29.759971958136394, 46.34998769793536], [30.024658644335375, 46.42393667254504], [29.838210076626297, 46.52532583270169], [29.908851759569302, 46.67436066343146], [29.559674106573112, 46.928582872091326], [29.415135125452736, 47.34664520933258], [29.05086795422733, 47.5102269557525], [29.12269819511303, 47.849095160506465], [28.670891147585166, 48.1181485052341], [28.259546746541844, 48.15556224221342], [27.522537469195157, 48.467119452501116], [26.857823520624805, 48.368210761094495], [26.619336785597795, 48.22072622333347], [26.19745039236693, 48.22088125263035], [25.9459411964024, 47.987148749374214], [25.20774336111299, 47.89105642352747], [24.866317172960578, 47.737525743188314], [24.40205610525038, 47.98187775328043], [23.76095828623741, 47.985598456405455], [23.142236362406805, 48.09634105080695], [22.710531447040495, 47.88219391538941], [22.640819939878753, 48.15023956968736], [22.085608351334855, 48.42226430927179], [22.28084191253356, 48.82539215758067], [22.558137648211755, 49.085738023467144], [22.776418898212626, 49.02739533140962], [22.518450148211603, 49.47677358661974], [23.426508416444392, 50.308505764357456], [23.922757195743262, 50.42488108987875], [24.029985792748903, 50.70540660257518], [23.527070753684374, 51.57845408793024], [24.00507775238421, 51.61744395609446], [24.553106316839518, 51.888461005249184], [25.32778771332701, 51.91065603291855], [26.337958611768556, 51.83228872334793], [27.454066196408434, 51.59230337178447], [28.24161502453657, 51.57222707783907], [28.61761274589225, 51.42771393493484], [28.992835320763533, 51.602044379271476], [29.254938185347925, 51.368234361366895], [30.157363722460897, 51.41613841410147], [30.555117221811457, 51.31950348571566], [30.619454380014844, 51.822806098022376], [30.927549269338982, 52.04235342061439], [31.785998162571587, 52.101677964885454]]]}') WHERE iso_a2 = 'UA';
UPDATE public.countries SET boundary = ST_GeomFromGeoJSON('{"type": "Polygon", "coordinates": [[[-57.62513342958296, -30.21629485445426], [-56.976025763564735, -30.109686374636127], [-55.97324459494094, -30.883075860316303], [-55.601510179249345, -30.853878676071393], [-54.57245154480512, -31.494511407193748], [-53.78795162618219, -32.047242526987624], [-53.209588995971544, -32.727666110974724], [-53.6505439927181, -33.20200408298183], [-53.373661668498244, -33.768377780900764], [-53.806425950726535, -34.39681487400223], [-54.93586605489773, -34.952646579733624], [-55.67408972840329, -34.75265878676407], [-56.21529700379607, -34.85983570733742], [-57.1396850246331, -34.430456231424245], [-57.81786068381551, -34.4625472958775], [-58.42707414410439, -33.909454441057576], [-58.349611172098875, -33.26318897881541], [-58.13264767112145, -33.040566908502015], [-58.14244035504076, -32.044503676076154], [-57.87493730328188, -31.016556084926208], [-57.62513342958296, -30.21629485445426]]]}') WHERE iso_a2 = 'UY';
UPDATE public.countries SET boundary = ST_GeomFromGeoJSON('{"type": "MultiPolygon", "coordinates": [[[[-155.54211, 19.08348], [-155.68817, 18.91619], [-155.93665, 19.05939], [-155.90806, 19.33888], [-156.07347, 19.70294], [-156.02368, 19.81422], [-155.85008, 19.97729], [-155.91907, 20.17395], [-155.86108, 20.26721], [-155.78505, 20.2487], [-155.40214, 20.07975], [-155.22452, 19.99302], [-155.06226, 19.8591], [-154.80741, 19.50871], [-154.83147, 19.45328], [-155.22217, 19.23972], [-155.54211, 19.08348]]], [[[-156.07926, 20.64397], [-156.41445, 20.57241], [-156.58673, 20.783], [-156.70167, 20.8643], [-156.71055, 20.92676], [-156.61258, 21.01249], [-156.25711, 20.91745], [-155.99566, 20.76404], [-156.07926, 20.64397]]], [[[-156.75824, 21.17684], [-156.78933, 21.06873], [-157.32521, 21.09777], [-157.25027, 21.21958], [-156.75824, 21.17684]]], [[[-157.65283, 21.32217], [-157.70703, 21.26442], [-157.7786, 21.27729], [-158.12667, 21.31244], [-158.2538, 21.53919], [-158.29265, 21.57912], [-158.0252, 21.71696], [-157.94161, 21.65272], [-157.65283, 21.32217]]], [[[-159.34512, 21.982], [-159.46372, 21.88299], [-159.80051, 22.06533], [-159.74877, 22.1382], [-159.5962, 22.23618], [-159.36569, 22.21494], [-159.34512, 21.982]]], [[[-94.81758, 49.38905], [-94.63999999999987, 48.84000000000012], [-94.32914, 48.67074000000011], [-93.63087, 48.60926], [-92.61, 48.45], [-91.64, 48.14], [-90.83, 48.27], [-89.6, 48.010000000000105], [-89.27291744663668, 48.01980825458284], [-88.37811418328653, 48.30291758889382], [-87.43979262330024, 47.94], [-86.46199083122815, 47.553338019392044], [-85.65236324740323, 47.22021881773051], [-84.87607988151487, 46.90008331968238], [-84.77923824739983, 46.63710195574913], [-84.54374874544567, 46.53868419044923], [-84.6049, 46.4396], [-84.3367, 46.40877000000012], [-84.1421195136733, 46.51222585711574], [-84.09185126416148, 46.27541860613826], [-83.89076534700567, 46.116926988299156], [-83.6161309475905, 46.116926988299156], [-83.46955074739463, 45.99468638771259], [-83.59285071484308, 45.81689362241255], [-82.55092464875818, 45.34751658790546], [-82.33776312543108, 44.44], [-82.13764238150398, 43.57108755144], [-82.43, 42.9800000000001], [-82.89999999999989, 42.43000000000015], [-83.11999999999989, 42.08], [-83.14199968131257, 41.975681057293], [-83.02981014680694, 41.83279572200601], [-82.69008928092018, 41.675105088867326], [-82.43927771679162, 41.675105088867326], [-81.27774654816707, 42.20902598730686], [-80.24744767934786, 42.36619985612268], [-78.9393621487437, 42.86361135514812], [-78.92, 42.965], [-79.00999999999988, 43.27], [-79.17167355011188, 43.46633942318431], [-78.72027991404238, 43.62508942318496], [-77.73788509795762, 43.62905558936339], [-76.82003414580558, 43.628784288093755], [-76.5, 44.018458893758606], [-76.375, 44.09631], [-75.31821, 44.816450000000174], [-74.867, 45.000480000000124], [-73.34783, 45.00738], [-71.50505999999987, 45.0082000000001], [-71.405, 45.25500000000014], [-71.08482, 45.30524000000017], [-70.6599999999998, 45.46], [-70.305, 45.915], [-69.99997, 46.69307], [-69.23722, 47.447781], [-68.905, 47.185], [-68.23444, 47.35486], [-67.79046, 47.06636], [-67.79134, 45.70281000000014], [-67.13741, 45.13753], [-66.96466, 44.80970000000016], [-68.03252, 44.3252], [-69.05999999999989, 43.98], [-70.11617, 43.684050000000155], [-70.645475633411, 43.09023834896405], [-70.81489, 42.8653], [-70.825, 42.335], [-70.495, 41.805], [-70.08, 41.78], [-70.185, 42.145], [-69.88497, 41.92283000000012], [-69.96503, 41.63717000000017], [-70.64, 41.475], [-71.12039, 41.49445000000017], [-71.85999999999984, 41.32], [-72.295, 41.27], [-72.87643, 41.22065], [-73.71, 40.93110235165449], [-72.24126, 41.11948000000015], [-71.94499999999982, 40.93], [-73.345, 40.63], [-73.982, 40.628], [-73.95232, 40.75075], [-74.25671, 40.47351], [-73.96244, 40.42763], [-74.17838, 39.70926], [-74.90604, 38.93954], [-74.98041, 39.1964], [-75.20002, 39.248450000000105], [-75.52805, 39.4985], [-75.32, 38.96], [-75.0718347647898, 38.78203223017928], [-75.05673, 38.40412000000012], [-75.37747, 38.01551], [-75.94023, 37.21689], [-76.03127, 37.2566], [-75.7220499999998, 37.93705000000011], [-76.23287, 38.319215], [-76.35, 39.15], [-76.54272, 38.71761500000011], [-76.32933, 38.08326], [-76.98999793161354, 38.23999176691339], [-76.30162, 37.91794], [-76.25874, 36.96640000000011], [-75.9718, 36.89726], [-75.86803999999984, 36.55125], [-75.72749, 35.55074000000013], [-76.36318, 34.808540000000136], [-77.3976349999999, 34.51201], [-78.05496, 33.92547], [-78.55434999999983, 33.86133000000012], [-79.06067, 33.49395], [-79.20357, 33.15839], [-80.30132, 32.509355], [-80.86498, 32.0333], [-81.33629, 31.44049], [-81.49042, 30.72999000000013], [-81.31371, 30.035520000000105], [-80.98, 29.18000000000012], [-80.53558499999988, 28.47213], [-80.5299999999998, 28.040000000000106], [-80.05653928497756, 26.880000000000138], [-80.08801, 26.205765], [-80.13155999999987, 25.816775], [-80.38103, 25.20616], [-80.6799999999999, 25.08], [-81.17213, 25.201260000000133], [-81.33, 25.64], [-81.70999999999981, 25.87], [-82.24, 26.730000000000132], [-82.70515, 27.49504], [-82.85526, 27.88624], [-82.65, 28.550000000000153], [-82.9299999999999, 29.100000000000136], [-83.70959, 29.93656], [-84.1, 30.090000000000117], [-85.10882, 29.63615], [-85.28784, 29.68612000000013], [-85.7731, 30.152610000000124], [-86.39999999999989, 30.40000000000012], [-87.53036, 30.27433], [-88.41782, 30.3849], [-89.18049, 30.31598], [-89.59383117841978, 30.159994004836847], [-89.41373, 29.89419], [-89.43, 29.48864], [-89.21767, 29.29108], [-89.40823, 29.15961], [-89.77928, 29.307140000000146], [-90.15463, 29.11743], [-90.88022, 29.148535000000123], [-91.62678499999987, 29.677000000000135], [-92.49906, 29.5523], [-93.22637, 29.78375], [-93.84842, 29.71363], [-94.69, 29.480000000000132], [-95.60026, 28.73863], [-96.59404, 28.30748], [-97.13999999999982, 27.83], [-97.37, 27.38], [-97.37999999999988, 26.69], [-97.33, 26.21000000000012], [-97.13999999999982, 25.87], [-97.52999999999989, 25.84], [-98.24, 26.060000000000116], [-99.01999999999988, 26.37], [-99.3, 26.84], [-99.51999999999987, 27.54], [-100.11, 28.110000000000127], [-100.45584, 28.69612000000012], [-100.9576, 29.380710000000136], [-101.6624, 29.77930000000012], [-102.48, 29.76], [-103.11, 28.97], [-103.94, 29.27], [-104.45696999999984, 29.57196], [-104.70575, 30.12173], [-105.03737, 30.64402], [-105.63159, 31.08383000000012], [-106.1429, 31.39995], [-106.50758999999982, 31.75452], [-108.24, 31.7548537181664], [-108.24194, 31.34222], [-109.035, 31.341940000000164], [-111.02361, 31.33472], [-113.30498, 32.03914], [-114.815, 32.52528], [-114.72138999999987, 32.72083], [-115.99135, 32.61239000000015], [-117.1277599999998, 32.53534], [-117.29593769127389, 33.0462246152039], [-117.944, 33.621236431201396], [-118.4106022758975, 33.740909223124504], [-118.51989482279971, 34.02778157757575], [-119.081, 34.078], [-119.43884064201669, 34.3484771782843], [-120.36778, 34.44711], [-120.62286, 34.60855], [-120.74433, 35.15686000000011], [-121.71456999999988, 36.16153], [-122.54747, 37.551760000000115], [-122.51201, 37.78339000000014], [-122.95319, 38.11371000000011], [-123.7272, 38.95166000000012], [-123.86517, 39.766990000000135], [-124.39807, 40.3132], [-124.17886, 41.142020000000116], [-124.2137, 41.99964000000014], [-124.53284, 42.7659900000001], [-124.14214, 43.70838], [-124.020535, 44.615895], [-123.89893, 45.52341], [-124.079635, 46.86475], [-124.39567, 47.72017000000011], [-124.68721008300783, 48.18443298339855], [-124.56610107421876, 48.3797149658204], [-123.12, 48.04], [-122.58736, 47.096], [-122.34, 47.36], [-122.5, 48.18], [-122.84, 49.000000000000114], [-120, 49.000000000000114], [-117.03121, 49.000000000000114], [-116.04818, 49.000000000000114], [-113, 49.000000000000114], [-110.04999999999984, 49.000000000000114], [-107.05, 49.000000000000114], [-104.04826, 48.99986], [-100.65, 49.000000000000114], [-97.22872000000473, 49.00070000000011], [-95.15906950917196, 49.000000000000114], [-95.15609, 49.38425], [-94.81758, 49.38905]]], [[[-153.0063140533369, 57.11584219016589], [-154.00509029845813, 56.73467682558106], [-154.5164027577701, 56.9927489284467], [-154.67099280497115, 57.4611957871725], [-153.76277950744148, 57.81657461204378], [-153.2287294179211, 57.968968410872435], [-152.56479061583514, 57.901427313866975], [-152.14114722390633, 57.591058661522], [-153.0063140533369, 57.11584219016589]]], [[[-165.57916419173358, 59.90998688418756], [-166.19277014876727, 59.75444082298898], [-166.848337368822, 59.94140615502096], [-167.45527706609008, 60.21306915957939], [-166.46779212142462, 60.38416982689779], [-165.67442969466367, 60.29360687930625], [-165.57916419173358, 59.90998688418756]]], [[[-171.7316568675394, 63.78251536727592], [-171.11443356024523, 63.592191067144995], [-170.4911124339407, 63.69497549097352], [-169.68250545965358, 63.431115627691156], [-168.6894394603007, 63.2975062120006], [-168.7719408844546, 63.18859813094545], [-169.52943986720504, 62.9769314642779], [-170.29055620021597, 63.194437567794466], [-170.67138566799088, 63.37582184513897], [-171.55306311753867, 63.31778921167509], [-171.7911106028912, 63.4058458523005], [-171.7316568675394, 63.78251536727592]]], [[[-155.06779029032424, 71.1477763943237], [-154.34416520894123, 70.6964085964702], [-153.90000627339262, 70.8899885118357], [-152.2100060699353, 70.82999217394485], [-152.27000240782615, 70.60000621202985], [-150.73999243874454, 70.43001658800571], [-149.72000301816752, 70.53001048449045], [-147.61336157935708, 70.2140349392418], [-145.6899898002253, 70.12000967068676], [-144.92001095907642, 69.9899917670405], [-143.5894461804252, 70.15251414659832], [-142.07251034871342, 69.85193817817265], [-140.98598752156073, 69.71199839952638], [-140.9859883290049, 69.71199839952638], [-140.9924987520294, 66.00002859156868], [-140.99776974812315, 60.3063967962986], [-140.0129978161531, 60.27683787702759], [-139.03900042031586, 60.000007229240026], [-138.34089, 59.56211000000016], [-137.4525, 58.905000000000115], [-136.4797200000001, 59.46389], [-135.47583, 59.78778], [-134.945, 59.27056000000013], [-134.27111, 58.86111], [-133.35554888220722, 58.410285142645165], [-132.73042, 57.69289000000012], [-131.70780999999988, 56.55212], [-130.00778, 55.91583], [-129.9799942633583, 55.28499787049722], [-130.53611018946725, 54.8027534043494], [-131.08581823797215, 55.17890615500204], [-131.9672114671423, 55.49777558045906], [-132.25001074285947, 56.36999624289746], [-133.53918108435641, 57.17888743756214], [-134.07806292029605, 58.12306753196691], [-135.03821103227907, 58.18771474876394], [-136.62806230995466, 58.21220937767046], [-137.80000627968604, 58.49999542910379], [-139.867787041413, 59.53776154238915], [-140.82527381713305, 59.727517401765084], [-142.57444353556446, 60.084446519604995], [-143.9588809948799, 59.999180406323404], [-145.92555681682785, 60.45860972761429], [-147.11437394914668, 60.884656073644635], [-148.22430620012767, 60.672989406977166], [-148.01806555885076, 59.97832896589364], [-148.5708225168609, 59.914172675203304], [-149.72785783587588, 59.70565827090556], [-150.60824337461645, 59.368211168039494], [-151.71639278868332, 59.15582103131999], [-151.85943315326716, 59.74498403587961], [-151.4097190012472, 60.7258027207794], [-150.34694149473253, 61.03358755150987], [-150.62111080625698, 61.284424953854455], [-151.89583919981686, 60.727197984451294], [-152.5783298410956, 60.06165721296429], [-154.01917212625762, 59.35027944603428], [-153.2875113596532, 58.8647276882198], [-154.2324924387585, 58.14637360293054], [-155.30749142151024, 57.72779450136633], [-156.3083347239231, 57.42277435976365], [-156.55609737854633, 56.97998484967064], [-158.11721655986776, 56.46360809999419], [-158.43332129619716, 55.99415355083855], [-159.60332739971744, 55.56668610292013], [-160.2897196116342, 55.643580634170576], [-161.2230476552578, 55.364734605523495], [-162.23776607974108, 55.02418691672011], [-163.0694465810464, 54.68973704692718], [-164.7855692210272, 54.40417308208217], [-164.94222632552004, 54.57222483989534], [-163.84833960676568, 55.03943146424612], [-162.87000139061593, 55.34804311789321], [-161.80417497459604, 55.894986477270436], [-160.56360470278116, 56.00805451112504], [-160.0705598622845, 56.41805532492876], [-158.68444291891944, 57.01667511659787], [-158.46109737855397, 57.21692129172888], [-157.7227703521839, 57.57000051536306], [-157.5502744211936, 58.32832632103023], [-157.041674974577, 58.91888458926172], [-158.19473120830548, 58.615802313869835], [-158.5172179840231, 58.78778148053732], [-159.05860612692874, 58.424186102931685], [-159.71166704001735, 58.93139028587635], [-159.9812888255002, 58.572549140041644], [-160.35527116599653, 59.07112335879364], [-161.35500342511506, 58.670837714260756], [-161.96889360252635, 58.67166453717738], [-162.05498653872468, 59.26692536074745], [-161.87417070213536, 59.6336213242906], [-162.5180590484921, 59.98972361921392], [-163.81834143782015, 59.79805573184339], [-164.66221757714646, 60.26748444278266], [-165.34638770247483, 60.50749563256241], [-165.35083187565186, 61.073895168697504], [-166.12137915755596, 61.50001902937623], [-165.73445187077053, 62.07499685327181], [-164.91917863671785, 62.63307648380794], [-164.56250790103937, 63.14637848576305], [-163.75333248599702, 63.21944896102377], [-163.0672244944579, 63.05945872664802], [-162.26055538638172, 63.54193573674118], [-161.5344498362486, 63.455816962326764], [-160.77250668032113, 63.766108100023274], [-160.95833513084256, 64.22279857040277], [-161.5180684072122, 64.40278758407533], [-160.77777767641476, 64.78860382756642], [-161.39192623598763, 64.77723501246234], [-162.45305009666885, 64.55944468856822], [-162.7577860178941, 64.33860545516882], [-163.5463942128843, 64.5591604681905], [-164.96082984114517, 64.44694509546886], [-166.4252882558645, 64.68667206487072], [-166.84500423893905, 65.08889557561454], [-168.11056006576717, 65.66999705673675], [-166.70527116602196, 66.0883177761394], [-164.4747096425755, 66.5766600612975], [-163.65251176659567, 66.5766600612975], [-163.78860165103617, 66.07720734319668], [-161.67777442121016, 66.11611969671242], [-162.48971452538, 66.73556509059512], [-163.7197169667911, 67.1163945583701], [-164.43099138085654, 67.6163382025778], [-165.39028683170676, 68.04277212185025], [-166.76444068099602, 68.35887685817968], [-166.20470740462662, 68.88303091091618], [-164.4308105133435, 68.91553538682774], [-163.16861365461452, 69.3711148139129], [-162.93056616926202, 69.85806183539927], [-161.90889726463553, 70.33332998318764], [-160.9347965159337, 70.44768992784958], [-159.03917578838715, 70.89164215766894], [-158.11972286683397, 70.82472117785105], [-156.58082455139805, 71.35776357694175], [-155.06779029032424, 71.1477763943237]]]]}') WHERE iso_a2 = 'US';
UPDATE public.countries SET boundary = ST_GeomFromGeoJSON('{"type": "Polygon", "coordinates": [[[66.51860680528867, 37.36278432875879], [66.54615034370022, 37.97468496352687], [65.2159989765074, 38.4026950139843], [64.17022301621677, 38.892406724598246], [63.51801476426103, 39.36325653742564], [62.374260288345006, 40.05388621679039], [61.88271406438469, 41.084856879229406], [61.54717898951356, 41.266370347654615], [60.465952996670694, 41.22032664648255], [60.083340691981675, 41.425146185871405], [59.976422153569786, 42.22308197689021], [58.62901085799146, 42.75155101172305], [57.78652998233708, 42.17055288346552], [56.932215203687804, 41.826026109375604], [57.0963912290791, 41.32231008561057], [55.96819135928291, 41.30864166926936], [55.928917270741096, 44.99585846615911], [58.50312706892847, 45.58680430763283], [58.689989048095896, 45.50001373959863], [60.23997195825834, 44.78403677019473], [61.05831994003245, 44.40581696225051], [62.01330040878625, 43.50447663021565], [63.18578698105657, 43.650074978198006], [64.90082441595928, 43.72808055274258], [66.09801232286509, 42.997660020513095], [66.02339155463562, 41.99464630794398], [66.51064863471572, 41.98764415136844], [66.71404707221652, 41.1684435084615], [67.98585574735182, 41.13599070898222], [68.25989586779562, 40.6623245305949], [68.63248294462002, 40.66868073176681], [69.07002729683532, 41.38424428971237], [70.3889648782208, 42.08130768489745], [70.96231489449914, 42.266154283205495], [71.25924767444823, 42.16771067968946], [70.42002241402821, 41.51999827734314], [71.1578585142916, 41.14358714452912], [71.87011478057047, 41.392900092121266], [73.05541710804917, 40.866033026689465], [71.77487511585656, 40.14584442805378], [71.01419803252017, 40.24436554621823], [70.60140669137269, 40.21852733007229], [70.45815962105962, 40.49649485937029], [70.66662234892505, 40.960213324541414], [69.32949466337283, 40.72782440852485], [69.0116329283455, 40.08615814875667], [68.53641645698943, 39.53345286717894], [67.70142866401736, 39.58047842056453], [67.44221967964131, 39.140143541005486], [68.17602501818592, 38.901553453113905], [68.39203250516596, 38.15702525486874], [67.82999962755952, 37.144994004864685], [67.07578209825962, 37.35614390720929], [66.51860680528867, 37.36278432875879]]]}') WHERE iso_a2 = 'UZ';
UPDATE public.countries SET boundary = ST_GeomFromGeoJSON('{"type": "Polygon", "coordinates": [[[-71.3315836249503, 11.776284084515808], [-71.36000566271082, 11.539993597861212], [-71.94704993354651, 11.423282375530022], [-71.62086829292019, 10.969459947142795], [-71.63306393094109, 10.446494452349029], [-72.07417395698451, 9.865651353388373], [-71.69564409044654, 9.072263088411248], [-71.26455929226773, 9.137194525585983], [-71.03999935574339, 9.859992784052409], [-71.35008378771079, 10.211935126176215], [-71.40062333849224, 10.968969021036015], [-70.15529883490652, 11.37548167566004], [-70.29384334988103, 11.846822414594214], [-69.94324459499683, 12.162307033736099], [-69.58430009629747, 11.459610907431212], [-68.88299923366445, 11.443384507691563], [-68.23327145045873, 10.885744126829946], [-68.19412655299763, 10.554653225135922], [-67.29624854192633, 10.54586823164631], [-66.227864142508, 10.648626817258688], [-65.65523759628175, 10.200798855017323], [-64.89045223657817, 10.0772146671913], [-64.32947872583374, 10.38959870039568], [-64.31800655786495, 10.64141795495398], [-63.07932247582873, 10.7017243514386], [-61.880946010980196, 10.715625311725104], [-62.73011898461641, 10.420268662960906], [-62.388511928950976, 9.94820445397464], [-61.58876746280194, 9.873066921422264], [-60.83059668643172, 9.381339829948942], [-60.67125240745973, 8.580174261911878], [-60.15009558779618, 8.602756862823426], [-59.758284878159195, 8.367034816924047], [-60.5505879380582, 7.779602972846178], [-60.637972785063766, 7.414999904810855], [-60.2956680975624, 7.043911444522919], [-60.54399919294099, 6.856584377464883], [-61.15933631045648, 6.696077378766319], [-61.13941504580795, 6.234296779806144], [-61.410302903881956, 5.959068101419618], [-60.73357418480372, 5.200277207861901], [-60.601179165271944, 4.91809804933213], [-60.96689327660154, 4.536467596856639], [-62.08542965355913, 4.162123521334308], [-62.804533047116706, 4.006965033377952], [-63.093197597899106, 3.770571193858785], [-63.88834286157416, 4.020530096854571], [-64.62865943058755, 4.14848094320925], [-64.81606401229402, 4.056445217297423], [-64.3684944322141, 3.797210394705246], [-64.40882788761792, 3.126786200366624], [-64.2699991522658, 2.497005520025567], [-63.42286739770512, 2.411067613124175], [-63.368788011311665, 2.200899562993129], [-64.08308549666609, 1.91636912679408], [-64.19930579289051, 1.49285492594602], [-64.61101192895987, 1.328730576987042], [-65.35471330428837, 1.0952822941085], [-65.54826738143757, 0.78925446207603], [-66.32576514348496, 0.724452215982012], [-66.87632585312258, 1.253360500489336], [-67.18129431829307, 2.250638129074062], [-67.44709204778631, 2.600280869960869], [-67.8099381171237, 2.820655015469569], [-67.30317318385345, 3.31845408773718], [-67.33756384954368, 3.542342230641722], [-67.62183590358129, 3.839481716319995], [-67.82301225449355, 4.503937282728899], [-67.74469662135522, 5.221128648291668], [-67.52153194850275, 5.556870428891969], [-67.34143958196557, 6.095468044454023], [-67.69508724635502, 6.267318020040647], [-68.26505245631823, 6.153268133972475], [-68.98531856960236, 6.206804917826858], [-69.38947994655712, 6.099860541198836], [-70.09331295437242, 6.96037649172311], [-70.67423356798152, 7.087784735538719], [-71.96017574734864, 6.991614895043539], [-72.19835242378188, 7.340430813013683], [-72.44448727078807, 7.423784898300482], [-72.47967892117885, 7.632506008327354], [-72.36090064155597, 8.002638454617895], [-72.43986223009796, 8.405275376820029], [-72.6604947577681, 8.625287787302682], [-72.7887298245004, 9.085027167187334], [-73.30495154488005, 9.151999823437606], [-73.02760413276957, 9.736770331252444], [-72.9052860175347, 10.450344346554772], [-72.61465776232521, 10.821975409381778], [-72.22757544624294, 11.10870209395324], [-71.97392167833829, 11.60867157637712], [-71.3315836249503, 11.776284084515808]]]}') WHERE iso_a2 = 'VE';
UPDATE public.countries SET boundary = ST_GeomFromGeoJSON('{"type": "Polygon", "coordinates": [[[108.05018029178294, 21.55237986906012], [106.7150679870901, 20.69685069425202], [105.88168216351903, 19.752050482659698], [105.66200564984631, 19.05816518806057], [106.42681684776602, 18.004120998603227], [107.36195356651974, 16.697456569887052], [108.26949507042963, 16.07974233648615], [108.87710656131748, 15.27669057867044], [109.33526981001722, 13.426028347217724], [109.20013593957398, 11.666859239137764], [108.36612999881545, 11.008320624226272], [107.22092858279524, 10.364483954301832], [106.40511274620343, 9.53083974856932], [105.15826378786511, 8.599759629750494], [104.79518517458239, 9.241038316276502], [105.07620161338562, 9.918490505406808], [104.33433475140347, 10.48654368737523], [105.19991499229235, 10.889309800658097], [106.24967003786946, 10.961811835163587], [105.81052371625313, 11.567614650921229], [107.49140302941089, 12.337205918827948], [107.61454796756243, 13.535530707244206], [107.38272749230109, 14.202440904186972], [107.5645251811039, 15.20217316330556], [107.3127059265456, 15.90853831630318], [106.55600792849569, 16.604283962464805], [105.92576216026403, 17.48531545660896], [105.09459842328152, 18.66697459561108], [103.89653201702671, 19.265180975821806], [104.18338789267894, 19.62466807706022], [104.8225736836971, 19.886641750563882], [104.43500044150805, 20.75873322192153], [103.20386111858645, 20.76656220141375], [102.75489627483466, 21.675137233969465], [102.17043582561358, 22.464753119389304], [102.7069922221001, 22.708795070887675], [103.50451460166056, 22.70375661873921], [104.47685835166448, 22.819150092046968], [105.32920942588663, 23.352063300056912], [105.81124718630522, 22.976892401617903], [106.72540327354847, 22.79426788989842], [106.56727339073532, 22.21820486092477], [107.04342003787264, 21.811898912029914], [108.05018029178294, 21.55237986906012]]]}') WHERE iso_a2 = 'VN';
UPDATE public.countries SET boundary = ST_GeomFromGeoJSON('{"type": "MultiPolygon", "coordinates": [[[[167.8448767438451, -16.466333103097156], [167.5151811058229, -16.59784962327997], [167.18000776597782, -16.15999521247096], [167.21680138576963, -15.891846205308454], [167.8448767438451, -16.466333103097156]]], [[[167.1077124372015, -14.933920179913954], [167.27002811103026, -15.740020847234874], [167.00120731024796, -15.614602146062495], [166.79315799384088, -15.668810723536723], [166.64985924709558, -15.392703545801197], [166.62913699774649, -14.626497084209603], [167.1077124372015, -14.933920179913954]]]]}') WHERE iso_a2 = 'VU';
UPDATE public.countries SET boundary = ST_GeomFromGeoJSON('{"type": "Polygon", "coordinates": [[[53.10857262554751, 16.651051133688952], [52.38520592632588, 16.382411200419654], [52.19172936382509, 15.93843313238402], [52.1681649107, 15.597420355689948], [51.172515089732485, 15.175249742081492], [49.57457645040315, 14.708766587782748], [48.67923058451416, 14.00320241948566], [48.23894738138742, 13.948089504446372], [47.938914015500785, 14.007233181204427], [47.354453566279716, 13.592219753468383], [46.717076450391744, 13.39969920496502], [45.87759280781027, 13.347764390511685], [45.62505008319988, 13.290946153206763], [45.406458774605255, 13.026905422411433], [45.14435591002086, 12.95393830001531], [44.989533318874415, 12.69958690027471], [44.49457645038285, 12.721652736863348], [44.17511274595449, 12.585950425664876], [43.48295861183713, 12.636800035040084], [43.22287112811213, 13.220950425667425], [43.25144819516953, 13.767583726450852], [43.08794396339806, 14.06263031662131], [42.892245314308724, 14.802249253798749], [42.60487267433362, 15.213335272680595], [42.80501549660005, 15.261962795467255], [42.70243777850066, 15.718885809791999], [42.823670688657415, 15.911742255105267], [42.77933230975097, 16.347891343648683], [43.21837527850275, 16.66688996018641], [43.11579756040336, 17.088440456607373], [43.380794305196105, 17.57998668056767], [43.79151858905192, 17.31997671149111], [44.06261315285508, 17.410358791569593], [45.21665123879719, 17.433328965723334], [45.39999922056876, 17.333335069238558], [46.366658563020536, 17.233315334537636], [46.74999433776165, 17.283338120996177], [47.000004917189756, 16.949999294497445], [47.46669477721763, 17.116681626854884], [48.18334354024134, 18.166669216377315], [49.11667158386487, 18.616667588774945], [52.00000980002224, 19.000003363516058], [52.78218427919205, 17.349742336491232], [53.10857262554751, 16.651051133688952]]]}') WHERE iso_a2 = 'YE';
UPDATE public.countries SET boundary = ST_GeomFromGeoJSON('{"type": "Polygon", "coordinates": [[[31.521001417778876, -29.257386976846256], [31.325561150851, -29.401977634398914], [30.901762729625347, -29.909956963828037], [30.62281334811382, -30.42377573010613], [30.05571618014278, -31.140269463832958], [28.92555260591954, -32.1720411109725], [28.2197558936771, -32.771952813448856], [27.464608188595975, -33.2269637997788], [26.419452345492825, -33.61495045342619], [25.90966434093349, -33.6670402971764], [25.780628289500697, -33.94464609144834], [25.172861769315972, -33.796851495093584], [24.677853224392123, -33.98717579522455], [23.594043409934642, -33.794474379208154], [22.988188917744736, -33.91643075941698], [22.574157342222236, -33.86408253350531], [21.542799106541025, -34.258838799782936], [20.689052768647002, -34.417175388325234], [20.071261020597632, -34.79513681410799], [19.61640506356457, -34.81916635512371], [19.193278435958717, -34.46259897230979], [18.85531456876987, -34.444305515278465], [18.42464318204938, -33.99787281670897], [18.377410922934615, -34.13652068454807], [18.24449913907992, -33.86775156019803], [18.250080193767445, -33.28143075941444], [17.92519046394844, -32.61129078545343], [18.247909783611192, -32.42913136162457], [18.22176150887148, -31.66163298922567], [17.56691775886887, -30.725721123987547], [17.064416131262703, -29.878641045859162], [17.062917514726223, -29.875953871379984], [16.344976840895242, -28.5767050106977], [16.824017368240902, -28.08216155366447], [17.218928663815404, -28.35594329194681], [17.387497185951503, -28.78351409272978], [17.83615197110953, -28.85637786226132], [18.464899122804752, -29.04546192801728], [19.002127312911085, -28.972443129188868], [19.894734327888614, -28.461104831660776], [19.895767856534434, -24.76779021576059], [20.16572553882719, -24.91796192800077], [20.75860924651184, -25.86813648855145], [20.66647016773544, -26.477453301704923], [20.88960900237174, -26.828542982695915], [21.605896030369394, -26.726533705351756], [22.105968865657868, -26.280256036079138], [22.57953169118059, -25.979447523708146], [22.8242712745149, -25.50045867279477], [23.312096795350186, -25.26868987396572], [23.73356977712271, -25.390129489851617], [24.211266717228796, -25.670215752873574], [25.025170525825786, -25.7196700985769], [25.66466637543772, -25.486816094669713], [25.76584882986521, -25.17484547292368], [25.94165205252216, -24.69637338633322], [26.4857532081233, -24.616326592713104], [26.786406691197413, -24.240690606383485], [27.119409620886245, -23.574323011979775], [28.01723595552525, -22.82775359465908], [29.43218834810904, -22.091312758067588], [29.839036899542972, -22.102216485281176], [30.322883335091774, -22.271611830333935], [30.65986535006709, -22.151567478119915], [31.19140913262129, -22.2515096981724], [31.670397983534656, -23.658969008073864], [31.930588820124253, -24.36941659922254], [31.75240848158188, -25.484283949487413], [31.83777794772806, -25.84333180105135], [31.333157586397903, -25.66019052500895], [31.04407962415715, -25.731452325139443], [30.949666782359913, -26.02264902110415], [30.67660851412964, -26.398078301704608], [30.68596194837448, -26.743845310169533], [31.28277306491333, -27.285879408478998], [31.86806033705108, -27.177927341421277], [32.07166548028107, -26.73382008230491], [32.830120477028885, -26.742191664336197], [32.580264926897684, -27.470157566031816], [32.46213260267845, -28.301011244420557], [32.20338870619304, -28.75240488049007], [31.521001417778876, -29.257386976846256]], [[28.978262566857243, -28.95559661226171], [28.541700066855498, -28.64750172293757], [28.074338413207784, -28.851468601193588], [27.532511020627478, -29.24271087007536], [26.999261915807637, -29.875953871379984], [27.749397006956485, -30.645105889612225], [28.107204624145425, -30.54573211031495], [28.29106937023991, -30.2262167294543], [28.84839969250774, -30.070050551068256], [29.018415154748027, -29.74376555757737], [29.32516645683259, -29.257386976846256], [28.978262566857243, -28.95559661226171]]]}') WHERE iso_a2 = 'ZA';
UPDATE public.countries SET boundary = ST_GeomFromGeoJSON('{"type": "Polygon", "coordinates": [[[32.75937544122132, -9.23059905358906], [33.2313879737753, -9.6767216935648], [33.48568769708359, -10.525558770391115], [33.315310499817286, -10.796549981329697], [33.114289178201915, -11.607198174692314], [33.306422153463075, -12.435778090060218], [32.991764357237884, -12.783870537978274], [32.68816531752313, -13.712857761289277], [33.214024692525214, -13.971860039936153], [30.17948123548183, -14.796099134991529], [30.27425581230511, -15.507786960515213], [29.516834344203147, -15.644677829656388], [28.947463413211267, -16.04305144619444], [28.8258687680285, -16.389748630440614], [28.467906121542683, -16.468400160388846], [27.59824344250276, -17.290830580314008], [27.044427117630732, -17.938026218337434], [26.70677330903564, -17.961228936436484], [26.381935255648926, -17.8460421688579], [25.264225701608012, -17.736539808831417], [25.08444339366457, -17.661815687737374], [25.07695031098226, -17.57882333747662], [24.682349074001507, -17.353410739819473], [24.033861525170778, -17.295843194246324], [23.215048455506064, -17.523116143465984], [22.56247846852426, -16.898451429921813], [21.887842644953874, -16.08031015387688], [21.933886346125917, -12.898437188369359], [24.016136508894675, -12.911046237848574], [23.930922072045377, -12.565847670138856], [24.079905226342845, -12.191296888887365], [23.904153680118185, -11.722281589406322], [24.01789350759259, -11.23729827234709], [23.912215203555718, -10.926826267137514], [24.25715538910399, -10.951992689663657], [24.31451622894795, -11.26282642989927], [24.78316979340295, -11.238693536018964], [25.418118116973204, -11.330935967659961], [25.752309604604733, -11.784965101776358], [26.553087599399618, -11.924439792532127], [27.164419793412463, -11.608748467661075], [27.388798862423783, -12.132747491100666], [28.155108676879987, -12.272480564017897], [28.523561639121027, -12.698604424696683], [28.934285922976837, -13.248958428605135], [29.69961388521949, -13.257226657771831], [29.61600141777123, -12.178894545137311], [29.34154788586909, -12.360743910372413], [28.642417433392353, -11.971568698782315], [28.372253045370428, -11.793646742401393], [28.49606977714177, -10.789883721564046], [28.67368167492893, -9.605924981324932], [28.449871046672826, -9.164918308146085], [28.734866570762502, -8.526559340044578], [29.00291222506047, -8.407031752153472], [30.346086053190817, -8.238256524288218], [30.74001549655179, -8.340007419470915], [31.15775133695005, -8.594578747317366], [31.556348097466497, -8.762048841998642], [32.19186486179197, -8.930358981973278], [32.75937544122132, -9.23059905358906]]]}') WHERE iso_a2 = 'ZM';
UPDATE public.countries SET boundary = ST_GeomFromGeoJSON('{"type": "Polygon", "coordinates": [[[31.19140913262129, -22.2515096981724], [30.65986535006709, -22.151567478119915], [30.322883335091774, -22.271611830333935], [29.839036899542972, -22.102216485281176], [29.43218834810904, -22.091312758067588], [28.794656202924216, -21.63945403410745], [28.021370070108617, -21.485975030200585], [27.72722781750326, -20.851801853114715], [27.724747348753255, -20.49905852629039], [27.296504754350508, -20.391519870691], [26.164790887158485, -19.29308562589494], [25.85039147309473, -18.714412937090536], [25.649163445750162, -18.53602589281899], [25.264225701608012, -17.736539808831417], [26.381935255648926, -17.8460421688579], [26.70677330903564, -17.961228936436484], [27.044427117630732, -17.938026218337434], [27.59824344250276, -17.290830580314008], [28.467906121542683, -16.468400160388846], [28.8258687680285, -16.389748630440614], [28.947463413211267, -16.04305144619444], [29.516834344203147, -15.644677829656388], [30.27425581230511, -15.507786960515213], [30.338954705534544, -15.880839125230246], [31.17306399915768, -15.860943698797874], [31.636498243951195, -16.071990248277885], [31.8520406430406, -16.319417006091378], [32.32823896661023, -16.392074069893752], [32.847638787575846, -16.713398125884616], [32.84986087416439, -17.97905730557718], [32.65488569512715, -18.672089939043495], [32.61199425632489, -19.419382826416275], [32.772707960752626, -19.715592136313298], [32.65974327976258, -20.304290052982317], [32.50869306817344, -20.395292250248307], [32.244988234188014, -21.116488539313693], [31.19140913262129, -22.2515096981724]]]}') WHERE iso_a2 = 'ZW';

-- Migration: 20260316000002_fix_get_upload_context.sql

-- Migration: Fix get_upload_context RPC for full atlas hierarchy
-- Date: 2026-03-16
-- Purpose: Return complete hierarchy (Country, Admin Region, UN Region, Continent) via ST_Covers

CREATE OR REPLACE FUNCTION public.get_upload_context(search_lat double precision, search_lng double precision)
RETURNS JSON AS $$
DECLARE
    result JSON;
BEGIN
    SELECT json_build_object(
        'continent', (
            SELECT json_build_object(
                'name', u.continent_name
            )
            FROM countries c
            JOIN regions r ON c.region_id = r.id
            JOIN un_regions u ON r.un_region_name = u.name
            WHERE ST_Covers(c.boundary, ST_SetSRID(ST_Point(search_lng, search_lat), 4326))
            LIMIT 1
        ),
        'un_region', (
            SELECT json_build_object(
                'name', r.un_region_name,
                'continent_name', u.continent_name
            )
            FROM countries c
            JOIN regions r ON c.region_id = r.id
            JOIN un_regions u ON r.un_region_name = u.name
            WHERE ST_Covers(c.boundary, ST_SetSRID(ST_Point(search_lng, search_lat), 4326))
            LIMIT 1
        ),
        'region', (
            SELECT json_build_object(
                'name', r.name,
                'country_code', c.iso_a2
            )
            FROM countries c
            JOIN regions r ON c.region_id = r.id
            WHERE ST_Covers(c.boundary, ST_SetSRID(ST_Point(search_lng, search_lat), 4326))
            LIMIT 1
        ),
        'country', (
            SELECT json_build_object(
                'id', id,
                'name', name,
                'iso_a2', iso_a2
            )
            FROM countries 
            WHERE ST_Covers(boundary, ST_SetSRID(ST_Point(search_lng, search_lat), 4326))
            LIMIT 1
        ),
        'crag', (
            SELECT json_build_object(
                'id', id,
                'name', name,
                'distance_meters', ST_Distance(location, ST_MakePoint(search_lng, search_lat)::geography)
            )
            FROM crags 
            WHERE ST_DWithin(location, ST_MakePoint(search_lng, search_lat)::geography, 150)
            ORDER BY location <-> ST_MakePoint(search_lng, search_lat)::geography ASC
            LIMIT 1
        )
    ) INTO result;
    
    RETURN result;
END;
$$ LANGUAGE plpgsql STABLE;

-- Migration: 20260316000003_enable_image_country_backfill.sql

-- Migration: Enable image country backfill with spatial join
-- Date: 2026-03-16
-- Purpose: Populate atlas metadata for all existing images using ST_Covers

UPDATE public.images i
SET
  country_id = c.id,
  country_code = c.iso_a2,
  country_name = c.name,
  admin_region_name = r.name,
  un_region_name = r.un_region_name,
  continent_name = u.continent_name
FROM public.countries c
JOIN public.regions r ON c.region_id = r.id
JOIN public.un_regions u ON r.un_region_name = u.name
WHERE i.latitude IS NOT NULL
  AND i.longitude IS NOT NULL
  AND i.country_id IS NULL
  AND ST_Covers(c.boundary, ST_SetSRID(ST_Point(i.longitude, i.latitude), 4326));

-- Migration: 20260316000004_restore_postgis_and_boundaries.sql

-- Migration: Restore PostGIS and add boundary column to countries
-- Date: 2026-03-16
-- Purpose: Re-enable PostGIS for Zero-Click GPS resolution

-- Enable PostGIS extension
CREATE EXTENSION IF NOT EXISTS postgis;

-- Add boundary column to countries table
ALTER TABLE public.countries 
ADD COLUMN IF NOT EXISTS boundary geometry(Geometry, 4326);

-- Create spatial index for fast lookups (GiST index on geometry)
CREATE INDEX IF NOT EXISTS idx_countries_boundary 
ON public.countries USING GIST(boundary);

-- Migration: 20260316010000_add_profile_submission_credit.sql

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS contribution_credit_platform TEXT,
  ADD COLUMN IF NOT EXISTS contribution_credit_handle TEXT;

CREATE OR REPLACE FUNCTION public.update_own_profile_submission_credit(
  p_platform TEXT,
  p_handle TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  current_user_id UUID := auth.uid();
  normalized_platform TEXT;
  normalized_handle TEXT;
BEGIN
  IF current_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  normalized_handle := NULLIF(btrim(COALESCE(p_handle, '')), '');

  IF normalized_handle IS NULL THEN
    normalized_platform := NULL;
  ELSE
    normalized_handle := regexp_replace(normalized_handle, '^@+', '');

    IF char_length(normalized_handle) > 50 THEN
      RAISE EXCEPTION 'Handle must be 50 characters or less';
    END IF;

    IF normalized_handle !~ '^[A-Za-z0-9._-]+$' THEN
      RAISE EXCEPTION 'Handle can only include letters, numbers, periods, underscores, and hyphens';
    END IF;

    normalized_platform := lower(NULLIF(btrim(COALESCE(p_platform, '')), ''));

    IF normalized_platform IS NULL THEN
      RAISE EXCEPTION 'Platform is required when a handle is provided';
    END IF;

    IF normalized_platform NOT IN ('instagram', 'tiktok', 'youtube', 'x', 'other') THEN
      RAISE EXCEPTION 'Invalid platform';
    END IF;
  END IF;

  UPDATE public.profiles
  SET
    contribution_credit_platform = normalized_platform,
    contribution_credit_handle = normalized_handle,
    updated_at = NOW()
  WHERE id = current_user_id;

  IF NOT FOUND THEN
    INSERT INTO public.profiles (id, contribution_credit_platform, contribution_credit_handle)
    VALUES (current_user_id, normalized_platform, normalized_handle);
  END IF;

  RETURN jsonb_build_object(
    'platform', normalized_platform,
    'handle', normalized_handle
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.update_own_profile_submission_credit(TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.update_own_profile_submission_credit(TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_own_profile_submission_credit(TEXT, TEXT) TO service_role;

-- Migration: 20260317000000_harden_rls_and_grants.sql

-- Hardening pass: tighten grants and ownership checks.

DO $$
BEGIN
  IF to_regclass('public.deletion_requests') IS NOT NULL THEN
    ALTER TABLE public.deletion_requests ENABLE ROW LEVEL SECURITY;

    REVOKE ALL ON TABLE public.deletion_requests FROM anon;
    REVOKE ALL ON TABLE public.deletion_requests FROM authenticated;

    GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.deletion_requests TO authenticated;
    GRANT ALL ON TABLE public.deletion_requests TO service_role;

    IF EXISTS (
      SELECT 1
      FROM pg_policies
      WHERE schemaname = 'public'
        AND tablename = 'deletion_requests'
        AND policyname = 'Users manage own deletion requests'
    ) THEN
      DROP POLICY "Users manage own deletion requests" ON public.deletion_requests;
    END IF;

    IF EXISTS (
      SELECT 1
      FROM pg_policies
      WHERE schemaname = 'public'
        AND tablename = 'deletion_requests'
        AND policyname = 'Service role manage deletion requests'
    ) THEN
      DROP POLICY "Service role manage deletion requests" ON public.deletion_requests;
    END IF;

    CREATE POLICY "Users manage own deletion requests"
      ON public.deletion_requests
      FOR ALL
      TO authenticated
      USING (auth.uid() = user_id)
      WITH CHECK (auth.uid() = user_id);

    CREATE POLICY "Service role manage deletion requests"
      ON public.deletion_requests
      FOR ALL
      TO service_role
      USING (true)
      WITH CHECK (true);
  END IF;
END $$;

DO $$
BEGIN
  IF to_regclass('public.climb_verifications') IS NOT NULL THEN
    IF EXISTS (
      SELECT 1
      FROM pg_policies
      WHERE schemaname = 'public'
        AND tablename = 'climb_verifications'
        AND policyname = 'Authenticated create verification'
    ) THEN
      DROP POLICY "Authenticated create verification" ON public.climb_verifications;
    END IF;

    CREATE POLICY "Authenticated create verification"
      ON public.climb_verifications
      FOR INSERT
      WITH CHECK (auth.role() = 'authenticated' AND auth.uid() = user_id);
  END IF;
END $$;

DO $$
BEGIN
  IF to_regclass('public.grade_votes') IS NOT NULL THEN
    IF EXISTS (
      SELECT 1
      FROM pg_policies
      WHERE schemaname = 'public'
        AND tablename = 'grade_votes'
        AND policyname = 'Authenticated create grade vote'
    ) THEN
      DROP POLICY "Authenticated create grade vote" ON public.grade_votes;
    END IF;

    CREATE POLICY "Authenticated create grade vote"
      ON public.grade_votes
      FOR INSERT
      WITH CHECK (auth.role() = 'authenticated' AND auth.uid() = user_id);
  END IF;
END $$;

DO $$
BEGIN
  IF to_regclass('public.climb_corrections') IS NOT NULL THEN
    IF EXISTS (
      SELECT 1
      FROM pg_policies
      WHERE schemaname = 'public'
        AND tablename = 'climb_corrections'
        AND policyname = 'Authenticated create correction'
    ) THEN
      DROP POLICY "Authenticated create correction" ON public.climb_corrections;
    END IF;

    CREATE POLICY "Authenticated create correction"
      ON public.climb_corrections
      FOR INSERT
      WITH CHECK (auth.role() = 'authenticated' AND auth.uid() = user_id);
  END IF;
END $$;

DO $$
BEGIN
  IF to_regclass('public.correction_votes') IS NOT NULL THEN
    IF EXISTS (
      SELECT 1
      FROM pg_policies
      WHERE schemaname = 'public'
        AND tablename = 'correction_votes'
        AND policyname = 'Authenticated create correction vote'
    ) THEN
      DROP POLICY "Authenticated create correction vote" ON public.correction_votes;
    END IF;

    CREATE POLICY "Authenticated create correction vote"
      ON public.correction_votes
      FOR INSERT
      WITH CHECK (auth.role() = 'authenticated' AND auth.uid() = user_id);
  END IF;
END $$;

DO $$
BEGIN
  IF to_regclass('public.route_grades') IS NOT NULL THEN
    IF EXISTS (
      SELECT 1
      FROM pg_policies
      WHERE schemaname = 'public'
        AND tablename = 'route_grades'
        AND policyname = 'Authenticated create route grade'
    ) THEN
      DROP POLICY "Authenticated create route grade" ON public.route_grades;
    END IF;

    CREATE POLICY "Authenticated create route grade"
      ON public.route_grades
      FOR INSERT
      WITH CHECK (auth.role() = 'authenticated' AND auth.uid() = user_id);
  END IF;
END $$;

DO $$
BEGIN
  IF to_regclass('public.climb_flags') IS NOT NULL THEN
    IF EXISTS (
      SELECT 1
      FROM pg_policies
      WHERE schemaname = 'public'
        AND tablename = 'climb_flags'
        AND policyname = 'Authenticated create climb_flags'
    ) THEN
      DROP POLICY "Authenticated create climb_flags" ON public.climb_flags;
    END IF;

    CREATE POLICY "Authenticated create climb_flags"
      ON public.climb_flags
      FOR INSERT
      WITH CHECK (auth.role() = 'authenticated' AND auth.uid() = flagger_id);
  END IF;
END $$;

-- Migration: 20260317000001_restore_crags_region_fk.sql

-- Restore the foreign key relationship between crags and regions
-- This was severed when the regions table was rebuilt for the Atlas hierarchy

-- First, clear orphaned region_ids that reference non-existent regions
UPDATE public.crags 
SET region_id = NULL 
WHERE region_id IS NOT NULL 
AND NOT EXISTS (SELECT 1 FROM public.regions r WHERE r.id = crags.region_id);

-- Add FK from crags to regions
ALTER TABLE public.crags 
ADD CONSTRAINT crags_region_id_fkey 
FOREIGN KEY (region_id) REFERENCES public.regions(id) ON DELETE SET NULL;

-- Add FK from countries to regions (needed for the PostgREST join in crags page)
ALTER TABLE public.countries 
ADD CONSTRAINT countries_region_id_fkey 
FOREIGN KEY (region_id) REFERENCES public.regions(id) ON DELETE SET NULL;

-- Migration: 20260317000005_backfill_crags_country_id.sql

-- Backfill country_id on existing crags using the ISO code
UPDATE public.crags c 
SET country_id = co.id 
FROM public.countries co 
WHERE co.iso_a2 = c.country_code 
AND c.country_id IS NULL;

-- Migration: 20260317000006_backfill_crag_country_id.sql

-- Backfill country_id on crags from existing country_code
-- Fix for 404 errors on map pins after geography migration

UPDATE crags c
SET country_id = (
  SELECT id FROM countries co 
  WHERE co.iso_a2 = c.country_code
)
WHERE c.country_id IS NULL AND c.country_code IS NOT NULL;

-- Migration: 20260317010000_harden_grants_and_security_definer_search_path.sql

-- Hardening pass: reduce broad grants and enforce search_path on SECURITY DEFINER functions.

DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT tablename
    FROM pg_tables
    WHERE schemaname = 'public'
  LOOP
    EXECUTE format('REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON TABLE public.%I FROM anon;', r.tablename);
    EXECUTE format('REVOKE TRUNCATE, REFERENCES, TRIGGER ON TABLE public.%I FROM authenticated;', r.tablename);
  END LOOP;
END $$;

DO $$
DECLARE
  fn record;
BEGIN
  FOR fn IN
    SELECT n.nspname AS schema_name,
           p.proname AS function_name,
           pg_get_function_identity_arguments(p.oid) AS identity_args
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.prosecdef = true
      AND p.proname NOT LIKE 'st\_%'
  LOOP
    EXECUTE format(
      'ALTER FUNCTION %I.%I(%s) SET search_path = public, auth, extensions;',
      fn.schema_name,
      fn.function_name,
      fn.identity_args
    );
  END LOOP;
END $$;

-- Migration: 20260317020000_auto_derive_crag_type_from_climbs.sql

CREATE OR REPLACE FUNCTION public.normalize_climb_route_type(raw_type TEXT)
RETURNS TEXT
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  normalized TEXT;
BEGIN
  IF raw_type IS NULL THEN
    RETURN NULL;
  END IF;

  normalized := lower(trim(replace(raw_type, '_', '-')));

  IF normalized = 'bouldering' THEN
    RETURN 'boulder';
  ELSIF normalized = 'boulder' THEN
    RETURN 'boulder';
  ELSIF normalized = 'sport' THEN
    RETURN 'sport';
  ELSIF normalized = 'trad' THEN
    RETURN 'trad';
  ELSIF normalized = 'mixed' THEN
    RETURN 'mixed';
  ELSIF normalized = 'deep-water-solo' THEN
    RETURN 'deep_water_solo';
  ELSIF normalized = 'top-rope' THEN
    RETURN 'top_rope';
  END IF;

  RETURN NULL;
END;
$$;

CREATE OR REPLACE FUNCTION public.refresh_crag_type_from_climbs(target_crag_id UUID)
RETURNS VOID
LANGUAGE plpgsql
AS $$
DECLARE
  winner_type TEXT;
  winner_count INTEGER;
  has_tie BOOLEAN;
BEGIN
  IF target_crag_id IS NULL THEN
    RETURN;
  END IF;

  WITH normalized_counts AS (
    SELECT
      public.normalize_climb_route_type(c.route_type) AS normalized_type,
      COUNT(*)::INTEGER AS route_count
    FROM public.climbs c
    WHERE c.crag_id = target_crag_id
      AND c.deleted_at IS NULL
      AND COALESCE(c.status, 'approved') = 'approved'
    GROUP BY public.normalize_climb_route_type(c.route_type)
    HAVING public.normalize_climb_route_type(c.route_type) IS NOT NULL
  ), ranked AS (
    SELECT
      normalized_type,
      route_count,
      DENSE_RANK() OVER (ORDER BY route_count DESC) AS count_rank
    FROM normalized_counts
  )
  SELECT
    (SELECT normalized_type FROM ranked WHERE count_rank = 1 LIMIT 1),
    (SELECT route_count FROM ranked WHERE count_rank = 1 LIMIT 1),
    (SELECT COUNT(*) > 1 FROM ranked WHERE count_rank = 1)
  INTO winner_type, winner_count, has_tie;

  IF winner_type IS NULL OR winner_count IS NULL THEN
    RETURN;
  END IF;

  UPDATE public.crags
  SET type = CASE
    WHEN has_tie THEN 'mixed'
    ELSE winner_type
  END
  WHERE id = target_crag_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.sync_crag_type_from_climbs()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    PERFORM public.refresh_crag_type_from_climbs(OLD.crag_id);
    RETURN OLD;
  END IF;

  IF TG_OP = 'UPDATE' AND OLD.crag_id IS DISTINCT FROM NEW.crag_id THEN
    PERFORM public.refresh_crag_type_from_climbs(OLD.crag_id);
  END IF;

  PERFORM public.refresh_crag_type_from_climbs(NEW.crag_id);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS climbs_sync_crag_type_after_write ON public.climbs;

CREATE TRIGGER climbs_sync_crag_type_after_write
AFTER INSERT OR UPDATE OF route_type, crag_id, status, deleted_at OR DELETE
ON public.climbs
FOR EACH ROW
EXECUTE FUNCTION public.sync_crag_type_from_climbs();

DO $$
DECLARE
  rec RECORD;
BEGIN
  FOR rec IN
    SELECT DISTINCT crag_id
    FROM public.climbs
    WHERE crag_id IS NOT NULL
  LOOP
    PERFORM public.refresh_crag_type_from_climbs(rec.crag_id);
  END LOOP;
END;
$$;

-- Migration: 20260318000000_create_gym_owner_applications.sql

CREATE TABLE IF NOT EXISTS public.gym_owner_applications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  gym_name TEXT NOT NULL CHECK (char_length(gym_name) BETWEEN 1 AND 200),
  address TEXT NOT NULL CHECK (char_length(address) BETWEEN 1 AND 300),
  facilities TEXT[] NOT NULL,
  contact_phone TEXT NOT NULL CHECK (char_length(contact_phone) BETWEEN 1 AND 40),
  contact_email TEXT NOT NULL CHECK (char_length(contact_email) BETWEEN 3 AND 160),
  role TEXT NOT NULL CHECK (role IN ('owner', 'manager', 'head_setter')),
  additional_comments TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'reviewing', 'approved', 'rejected')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT gym_owner_applications_facilities_not_empty CHECK (cardinality(facilities) >= 1),
  CONSTRAINT gym_owner_applications_facilities_valid CHECK (facilities <@ ARRAY['sport', 'boulder']::TEXT[])
);

CREATE INDEX IF NOT EXISTS idx_gym_owner_applications_status_created
  ON public.gym_owner_applications(status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_gym_owner_applications_created
  ON public.gym_owner_applications(created_at DESC);

DO $$
BEGIN
  ALTER TABLE public.gym_owner_applications ENABLE ROW LEVEL SECURITY;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

GRANT INSERT ON TABLE public.gym_owner_applications TO anon;
GRANT INSERT ON TABLE public.gym_owner_applications TO authenticated;
GRANT SELECT, UPDATE ON TABLE public.gym_owner_applications TO service_role;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'gym_owner_applications'
      AND policyname = 'Public create gym owner applications'
  ) THEN
    CREATE POLICY "Public create gym owner applications"
      ON public.gym_owner_applications
      FOR INSERT
      WITH CHECK (true);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'gym_owner_applications'
      AND policyname = 'Admin read gym owner applications'
  ) THEN
    CREATE POLICY "Admin read gym owner applications"
      ON public.gym_owner_applications
      FOR SELECT
      USING (
        EXISTS (
          SELECT 1 FROM public.profiles
          WHERE profiles.id = auth.uid()
            AND profiles.is_admin = true
        )
      );
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'gym_owner_applications'
      AND policyname = 'Admin update gym owner applications'
  ) THEN
    CREATE POLICY "Admin update gym owner applications"
      ON public.gym_owner_applications
      FOR UPDATE
      USING (
        EXISTS (
          SELECT 1 FROM public.profiles
          WHERE profiles.id = auth.uid()
            AND profiles.is_admin = true
        )
      )
      WITH CHECK (
        EXISTS (
          SELECT 1 FROM public.profiles
          WHERE profiles.id = auth.uid()
            AND profiles.is_admin = true
        )
      );
  END IF;
END $$;

-- Migration: 20260318010000_add_city_country_postcode_to_gym_owner_applications.sql

ALTER TABLE public.gym_owner_applications
  ADD COLUMN IF NOT EXISTS city TEXT,
  ADD COLUMN IF NOT EXISTS country TEXT,
  ADD COLUMN IF NOT EXISTS postcode_or_zip TEXT;

UPDATE public.gym_owner_applications
SET
  city = COALESCE(NULLIF(city, ''), 'Unknown'),
  country = COALESCE(NULLIF(country, ''), 'Unknown'),
  postcode_or_zip = COALESCE(NULLIF(postcode_or_zip, ''), 'Unknown')
WHERE city IS NULL OR city = '' OR country IS NULL OR country = '' OR postcode_or_zip IS NULL OR postcode_or_zip = '';

ALTER TABLE public.gym_owner_applications
  ALTER COLUMN city SET NOT NULL,
  ALTER COLUMN country SET NOT NULL,
  ALTER COLUMN postcode_or_zip SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'gym_owner_applications_city_length'
      AND conrelid = 'public.gym_owner_applications'::regclass
  ) THEN
    ALTER TABLE public.gym_owner_applications
      ADD CONSTRAINT gym_owner_applications_city_length CHECK (char_length(city) BETWEEN 1 AND 120);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'gym_owner_applications_country_length'
      AND conrelid = 'public.gym_owner_applications'::regclass
  ) THEN
    ALTER TABLE public.gym_owner_applications
      ADD CONSTRAINT gym_owner_applications_country_length CHECK (char_length(country) BETWEEN 1 AND 120);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'gym_owner_applications_postcode_or_zip_length'
      AND conrelid = 'public.gym_owner_applications'::regclass
  ) THEN
    ALTER TABLE public.gym_owner_applications
      ADD CONSTRAINT gym_owner_applications_postcode_or_zip_length CHECK (char_length(postcode_or_zip) BETWEEN 1 AND 32);
  END IF;
END $$;

-- Migration: 20260318020000_create_gym_floor_plans_and_routes.sql

CREATE TABLE IF NOT EXISTS public.gym_floor_plans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  gym_place_id UUID NOT NULL REFERENCES public.places(id) ON DELETE CASCADE,
  name TEXT NOT NULL CHECK (char_length(name) BETWEEN 1 AND 160),
  image_url TEXT NOT NULL,
  image_width INTEGER NOT NULL CHECK (image_width > 0),
  image_height INTEGER NOT NULL CHECK (image_height > 0),
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_gym_floor_plans_one_active_per_gym
  ON public.gym_floor_plans(gym_place_id)
  WHERE is_active = true;

CREATE INDEX IF NOT EXISTS idx_gym_floor_plans_gym ON public.gym_floor_plans(gym_place_id);

CREATE TABLE IF NOT EXISTS public.gym_routes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  gym_place_id UUID NOT NULL REFERENCES public.places(id) ON DELETE CASCADE,
  floor_plan_id UUID NOT NULL REFERENCES public.gym_floor_plans(id) ON DELETE CASCADE,
  name TEXT,
  grade TEXT NOT NULL CHECK (char_length(grade) BETWEEN 1 AND 24),
  discipline TEXT NOT NULL CHECK (discipline IN ('boulder', 'sport', 'top_rope', 'mixed')),
  color TEXT,
  setter_name TEXT,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'retired')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_gym_routes_gym ON public.gym_routes(gym_place_id);
CREATE INDEX IF NOT EXISTS idx_gym_routes_floor_plan ON public.gym_routes(floor_plan_id);
CREATE INDEX IF NOT EXISTS idx_gym_routes_status ON public.gym_routes(status);

CREATE TABLE IF NOT EXISTS public.gym_route_markers (
  route_id UUID PRIMARY KEY REFERENCES public.gym_routes(id) ON DELETE CASCADE,
  x_norm NUMERIC(8,6) NOT NULL CHECK (x_norm >= 0 AND x_norm <= 1),
  y_norm NUMERIC(8,6) NOT NULL CHECK (y_norm >= 0 AND y_norm <= 1),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

DO $$
BEGIN
  ALTER TABLE public.gym_floor_plans ENABLE ROW LEVEL SECURITY;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE public.gym_routes ENABLE ROW LEVEL SECURITY;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE public.gym_route_markers ENABLE ROW LEVEL SECURITY;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'gym_floor_plans' AND policyname = 'Public read gym_floor_plans'
  ) THEN
    CREATE POLICY "Public read gym_floor_plans"
      ON public.gym_floor_plans
      FOR SELECT
      USING (true);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'gym_routes' AND policyname = 'Public read gym_routes'
  ) THEN
    CREATE POLICY "Public read gym_routes"
      ON public.gym_routes
      FOR SELECT
      USING (true);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'gym_route_markers' AND policyname = 'Public read gym_route_markers'
  ) THEN
    CREATE POLICY "Public read gym_route_markers"
      ON public.gym_route_markers
      FOR SELECT
      USING (true);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'gym_floor_plans' AND policyname = 'Admin write gym_floor_plans'
  ) THEN
    CREATE POLICY "Admin write gym_floor_plans"
      ON public.gym_floor_plans
      FOR ALL
      USING (
        EXISTS (
          SELECT 1 FROM public.profiles
          WHERE profiles.id = auth.uid() AND profiles.is_admin = true
        )
      )
      WITH CHECK (
        EXISTS (
          SELECT 1 FROM public.profiles
          WHERE profiles.id = auth.uid() AND profiles.is_admin = true
        )
      );
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'gym_routes' AND policyname = 'Admin write gym_routes'
  ) THEN
    CREATE POLICY "Admin write gym_routes"
      ON public.gym_routes
      FOR ALL
      USING (
        EXISTS (
          SELECT 1 FROM public.profiles
          WHERE profiles.id = auth.uid() AND profiles.is_admin = true
        )
      )
      WITH CHECK (
        EXISTS (
          SELECT 1 FROM public.profiles
          WHERE profiles.id = auth.uid() AND profiles.is_admin = true
        )
      );
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'gym_route_markers' AND policyname = 'Admin write gym_route_markers'
  ) THEN
    CREATE POLICY "Admin write gym_route_markers"
      ON public.gym_route_markers
      FOR ALL
      USING (
        EXISTS (
          SELECT 1 FROM public.profiles
          WHERE profiles.id = auth.uid() AND profiles.is_admin = true
        )
      )
      WITH CHECK (
        EXISTS (
          SELECT 1 FROM public.profiles
          WHERE profiles.id = auth.uid() AND profiles.is_admin = true
        )
      );
  END IF;
END $$;

-- Migration: 20260318030000_add_gym_memberships_and_scoped_route_access.sql

CREATE TABLE IF NOT EXISTS public.gym_memberships (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  gym_place_id UUID NOT NULL REFERENCES public.places(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('owner', 'manager', 'head_setter', 'setter')),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'invited', 'revoked')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_gym_memberships_user_gym
  ON public.gym_memberships(user_id, gym_place_id);

CREATE INDEX IF NOT EXISTS idx_gym_memberships_gym_status
  ON public.gym_memberships(gym_place_id, status);

CREATE INDEX IF NOT EXISTS idx_gym_memberships_user_status
  ON public.gym_memberships(user_id, status);

DO $$
BEGIN
  ALTER TABLE public.gym_memberships ENABLE ROW LEVEL SECURITY;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'gym_memberships' AND policyname = 'Users read own gym memberships'
  ) THEN
    CREATE POLICY "Users read own gym memberships"
      ON public.gym_memberships
      FOR SELECT
      USING (auth.uid() = user_id);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'gym_memberships' AND policyname = 'Admins manage gym memberships'
  ) THEN
    CREATE POLICY "Admins manage gym memberships"
      ON public.gym_memberships
      FOR ALL
      USING (
        EXISTS (
          SELECT 1
          FROM public.profiles
          WHERE profiles.id = auth.uid()
            AND profiles.is_admin = true
        )
      )
      WITH CHECK (
        EXISTS (
          SELECT 1
          FROM public.profiles
          WHERE profiles.id = auth.uid()
            AND profiles.is_admin = true
        )
      );
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'gym_routes' AND policyname = 'Gym members write gym routes'
  ) THEN
    CREATE POLICY "Gym members write gym routes"
      ON public.gym_routes
      FOR ALL
      USING (
        EXISTS (
          SELECT 1
          FROM public.gym_memberships gm
          WHERE gm.user_id = auth.uid()
            AND gm.gym_place_id = gym_routes.gym_place_id
            AND gm.status = 'active'
            AND gm.role IN ('owner', 'manager', 'head_setter', 'setter')
        )
      )
      WITH CHECK (
        EXISTS (
          SELECT 1
          FROM public.gym_memberships gm
          WHERE gm.user_id = auth.uid()
            AND gm.gym_place_id = gym_routes.gym_place_id
            AND gm.status = 'active'
            AND gm.role IN ('owner', 'manager', 'head_setter', 'setter')
        )
      );
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'gym_route_markers' AND policyname = 'Gym members write gym route markers'
  ) THEN
    CREATE POLICY "Gym members write gym route markers"
      ON public.gym_route_markers
      FOR ALL
      USING (
        EXISTS (
          SELECT 1
          FROM public.gym_routes gr
          JOIN public.gym_memberships gm ON gm.gym_place_id = gr.gym_place_id
          WHERE gr.id = gym_route_markers.route_id
            AND gm.user_id = auth.uid()
            AND gm.status = 'active'
            AND gm.role IN ('owner', 'manager', 'head_setter', 'setter')
        )
      )
      WITH CHECK (
        EXISTS (
          SELECT 1
          FROM public.gym_routes gr
          JOIN public.gym_memberships gm ON gm.gym_place_id = gr.gym_place_id
          WHERE gr.id = gym_route_markers.route_id
            AND gm.user_id = auth.uid()
            AND gm.status = 'active'
            AND gm.role IN ('owner', 'manager', 'head_setter', 'setter')
        )
      );
  END IF;
END $$;

-- Migration: 20260319010000_tighten_notifications_insert_policy.sql

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'notifications'
      AND policyname = 'Authenticated create notifications'
  ) THEN
    DROP POLICY "Authenticated create notifications" ON public.notifications;
  END IF;
END $$;

CREATE POLICY "Authenticated create notifications" ON public.notifications
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

-- Migration: 20260320000000_climb_gps_inherit_from_images.sql

-- Climb GPS inherit from images, remove crag boundary polygons
-- All climbs should inherit GPS from their image (image GPS is required on submission)
-- Crag GPS should be calculated from the average of all climbs within the crag

-- 1. Add latitude/longitude columns to climbs
ALTER TABLE public.climbs ADD COLUMN IF NOT EXISTS latitude numeric(10,8);
ALTER TABLE public.climbs ADD COLUMN IF NOT EXISTS longitude numeric(11,8);

-- 2. Function: compute climb GPS from its image (via route_lines) - for use by route_lines trigger
CREATE OR REPLACE FUNCTION public.recompute_climb_location_from_image()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  target_climb_id uuid;
  img_lat numeric(10,8);
  img_lng numeric(11,8);
BEGIN
  IF TG_OP = 'INSERT' THEN
    target_climb_id := NEW.climb_id;
  ELSIF TG_OP = 'UPDATE' THEN
    target_climb_id := NEW.climb_id;
  ELSIF TG_OP = 'DELETE' THEN
    target_climb_id := OLD.climb_id;
  ELSE
    RETURN OLD;
  END IF;

  IF target_climb_id IS NULL THEN
    IF TG_OP = 'DELETE' THEN
      RETURN OLD;
    ELSE
      RETURN NEW;
    END IF;
  END IF;

  SELECT i.latitude, i.longitude
  INTO img_lat, img_lng
  FROM public.route_lines rl
  JOIN public.images i ON i.id = rl.image_id
  WHERE rl.climb_id = target_climb_id
  ORDER BY rl.created_at ASC
  LIMIT 1;

  UPDATE public.climbs c
  SET latitude = img_lat,
      longitude = img_lng
  WHERE c.id = target_climb_id;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;

  RETURN NEW;
END;
$$;

-- 3. Trigger on route_lines to auto-populate climb GPS when route line is added/updated
DROP TRIGGER IF EXISTS route_lines_set_climb_gps ON public.route_lines;
CREATE TRIGGER route_lines_set_climb_gps
AFTER INSERT OR UPDATE OF image_id ON public.route_lines
FOR EACH ROW
EXECUTE FUNCTION public.recompute_climb_location_from_image();

-- 4. Fix sync_crag_to_place function to remove boundary column
CREATE OR REPLACE FUNCTION public.sync_crag_to_place()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  resolved_primary TEXT;
BEGIN
  IF pg_trigger_depth() > 1 THEN
    IF TG_OP = 'DELETE' THEN
      RETURN OLD;
    END IF;
    RETURN NEW;
  END IF;

  IF TG_OP = 'DELETE' THEN
    DELETE FROM public.places WHERE id = OLD.id AND type = 'crag';
    RETURN OLD;
  END IF;

  resolved_primary := CASE
    WHEN NEW.type IN ('boulder', 'sport', 'trad', 'deep_water_solo', 'mixed', 'top_rope') THEN NEW.type
    WHEN NEW.type = 'crag' THEN 'mixed'
    ELSE 'boulder'
  END;

  INSERT INTO public.places (
    id,
    type,
    name,
    latitude,
    longitude,
    region_id,
    description,
    access_notes,
    rock_type,
    region_name,
    country,
    country_code,
    tide_dependency,
    report_count,
    is_flagged,
    slug,
    primary_discipline,
    disciplines,
    created_at,
    updated_at
  )
  VALUES (
    NEW.id,
    'crag',
    NEW.name,
    NEW.latitude,
    NEW.longitude,
    NEW.region_id,
    NEW.description,
    NEW.access_notes,
    NEW.rock_type,
    NEW.region_name,
    NEW.country,
    NEW.country_code,
    NEW.tide_dependency,
    COALESCE(NEW.report_count, 0),
    COALESCE(NEW.is_flagged, false),
    NEW.slug,
    resolved_primary,
    ARRAY[resolved_primary]::TEXT[],
    COALESCE(NEW.created_at, NOW()),
    COALESCE(NEW.updated_at, NOW())
  )
  ON CONFLICT (id) DO UPDATE
  SET
    type = 'crag',
    name = EXCLUDED.name,
    latitude = EXCLUDED.latitude,
    longitude = EXCLUDED.longitude,
    region_id = EXCLUDED.region_id,
    description = EXCLUDED.description,
    access_notes = EXCLUDED.access_notes,
    rock_type = EXCLUDED.rock_type,
    region_name = EXCLUDED.region_name,
    country = EXCLUDED.country,
    country_code = EXCLUDED.country_code,
    tide_dependency = EXCLUDED.tide_dependency,
    report_count = EXCLUDED.report_count,
    is_flagged = EXCLUDED.is_flagged,
    slug = EXCLUDED.slug,
    primary_discipline = EXCLUDED.primary_discipline,
    disciplines = EXCLUDED.disciplines,
    updated_at = NOW();

  RETURN NEW;
END;
$$;

-- 5. New function: recompute crag location from climbs
CREATE OR REPLACE FUNCTION public.recompute_crag_location(target_crag_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  avg_lat numeric;
  avg_lng numeric;
BEGIN
  IF target_crag_id IS NULL THEN
    RETURN;
  END IF;

  SELECT
    avg(c.latitude),
    avg(c.longitude)
  INTO avg_lat, avg_lng
  FROM public.climbs c
  WHERE c.crag_id = target_crag_id
    AND c.latitude IS NOT NULL
    AND c.longitude IS NOT NULL;

  UPDATE public.crags cr
  SET
    latitude = CASE WHEN avg_lat IS NULL THEN NULL ELSE avg_lat::numeric(10,8) END,
    longitude = CASE WHEN avg_lng IS NULL THEN NULL ELSE avg_lng::numeric(11,8) END
  WHERE cr.id = target_crag_id;
END;
$$;

-- 6. Trigger: recompute crag location when climbs change
CREATE OR REPLACE FUNCTION public.climbs_recompute_crag_location_trigger()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.crag_id IS NOT NULL THEN
      PERFORM public.recompute_crag_location(NEW.crag_id);
    END IF;
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    IF OLD.crag_id IS NOT NULL AND OLD.crag_id <> NEW.crag_id THEN
      PERFORM public.recompute_crag_location(OLD.crag_id);
    END IF;
    IF NEW.crag_id IS NOT NULL AND (OLD.latitude IS DISTINCT FROM NEW.latitude OR OLD.longitude IS DISTINCT FROM NEW.longitude OR OLD.crag_id IS DISTINCT FROM NEW.crag_id) THEN
      PERFORM public.recompute_crag_location(NEW.crag_id);
    END IF;
    RETURN NEW;
  END IF;

  IF TG_OP = 'DELETE' THEN
    IF OLD.crag_id IS NOT NULL THEN
      PERFORM public.recompute_crag_location(OLD.crag_id);
    END IF;
    RETURN OLD;
  END IF;

  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS climbs_recompute_crag_location_insert ON public.climbs;
DROP TRIGGER IF EXISTS climbs_recompute_crag_location_update ON public.climbs;
DROP TRIGGER IF EXISTS climbs_recompute_crag_location_delete ON public.climbs;

CREATE TRIGGER climbs_recompute_crag_location_insert
AFTER INSERT ON public.climbs
FOR EACH ROW
EXECUTE FUNCTION public.climbs_recompute_crag_location_trigger();

CREATE TRIGGER climbs_recompute_crag_location_update
AFTER UPDATE OF crag_id, latitude, longitude ON public.climbs
FOR EACH ROW
EXECUTE FUNCTION public.climbs_recompute_crag_location_trigger();

CREATE TRIGGER climbs_recompute_crag_location_delete
AFTER DELETE ON public.climbs
FOR EACH ROW
EXECUTE FUNCTION public.climbs_recompute_crag_location_trigger();

-- 7. Remove old image-based triggers
DROP TRIGGER IF EXISTS images_recompute_crag_location_insert ON public.images;
DROP TRIGGER IF EXISTS images_recompute_crag_location_update ON public.images;
DROP TRIGGER IF EXISTS images_recompute_crag_location_delete ON public.images;

-- 8. Backfill existing climbs from their images (via route_lines)
WITH climb_image_gps AS (
  SELECT
    c.id as climb_id,
    i.latitude::numeric(10,8) as lat,
    i.longitude::numeric(11,8) as lng
  FROM public.climbs c
  JOIN public.route_lines rl ON rl.climb_id = c.id
  JOIN public.images i ON i.id = rl.image_id
  WHERE i.latitude IS NOT NULL AND i.longitude IS NOT NULL
)
UPDATE public.climbs c
SET latitude = cg.lat,
    longitude = cg.lng
FROM climb_image_gps cg
WHERE c.id = cg.climb_id;

-- 9. Backfill crags from climbs
WITH crag_climb_gps AS (
  SELECT
    c.crag_id,
    avg(c.latitude)::numeric(10,8) as avg_lat,
    avg(c.longitude)::numeric(11,8) as avg_lng
  FROM public.climbs c
  WHERE c.crag_id IS NOT NULL
    AND c.latitude IS NOT NULL
    AND c.longitude IS NOT NULL
  GROUP BY c.crag_id
)
UPDATE public.crags cr
SET latitude = ccg.avg_lat,
    longitude = ccg.avg_lng
FROM crag_climb_gps ccg
WHERE cr.id = ccg.crag_id;

-- 10. Remove boundary column from crags
ALTER TABLE public.crags DROP COLUMN IF EXISTS boundary;

-- Migration: 20260325000000_add_grade_mappings_table.sql

-- Grade Mappings Table for Multi-Grade System Support
-- Allows users to view grades in V-Scale, Font, YDS, or French

-- 1.1 Create the mapping table
CREATE TABLE IF NOT EXISTS grade_mappings (
  grade_index INT PRIMARY KEY,
  v_scale VARCHAR(10),
  font_scale VARCHAR(10),
  yds_equivalent VARCHAR(10),
  french_equivalent VARCHAR(10),
  difficulty_group VARCHAR(20)
);

-- 1.2 Insert bouldering data (VB to V16)
-- Explicitly setting grade_index starting at 0 for consistent sorting
INSERT INTO grade_mappings (grade_index, v_scale, font_scale, yds_equivalent, french_equivalent, difficulty_group) VALUES
(0,  'VB',  '3',    '5.6',   '4',   'Beginner'),
(1,  'V0',  '4',    '5.9',   '5',   'Beginner'),
(2,  'V1',  '5',    '5.10a', '6a',  'Intermediate'),
(3,  'V2',  '5+',   '5.10c', '6a+', 'Intermediate'),
(4,  'V3',  '6A',   '5.11a', '6b',  'Intermediate'),
(5,  'V4',  '6B',   '5.11c', '6c',  'Advanced'),
(6,  'V5',  '6C',   '5.12a', '7a',  'Advanced'),
(7,  'V6',  '6C+',  '5.12b', '7a+', 'Advanced'),
(8,  'V7',  '7A',   '5.13a', '7b',  'Expert'),
(9,  'V8',  '7B',   '5.13b', '7c',  'Expert'),
(10, 'V9',  '7B+',  '5.13c', '7c+', 'Expert'),
(11, 'V10', '7C',   '5.14a', '8a',  'Elite'),
(12, 'V11', '8A',   '5.14c', '8a+', 'Elite'),
(13, 'V12', '8A+',  '5.15a', '8b',  'Elite'),
(14, 'V13', '8B',   '5.15b', '8c',  'Elite'),
(15, 'V14', '8B+',  '5.15c', '9a',  'Elite'),
(16, 'V15', '8C',   '5.15d', '9a+', 'Elite'),
(17, 'V16', '8C+',  '5.16a', '9b',  'Elite')
ON CONFLICT (grade_index) DO NOTHING;

-- 1.3 Add columns to climbs table for grade_index support
ALTER TABLE climbs ADD COLUMN IF NOT EXISTS grade_index INT REFERENCES grade_mappings(grade_index);
ALTER TABLE climbs ADD COLUMN IF NOT EXISTS original_grade_string VARCHAR(24);

-- 1.4 Backfill existing climbs with grade_index
-- Uses french_equivalent (lowercase) to match existing French grade data
UPDATE climbs
SET 
  grade_index = gm.grade_index,
  original_grade_string = climbs.grade
FROM grade_mappings gm
WHERE LOWER(climbs.grade) = gm.french_equivalent
  AND climbs.grade IS NOT NULL;

-- 1.5 Add index for performance on grade_index queries
CREATE INDEX IF NOT EXISTS idx_climbs_grade_index ON climbs(grade_index);

-- 1.6 Enable RLS on grade_mappings (public read)
ALTER TABLE grade_mappings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public read grade mappings" ON grade_mappings;
CREATE POLICY "Public read grade mappings" ON grade_mappings FOR SELECT USING (true);

-- Migration: 20260326000000_expand_grade_system_column.sql

-- Increase grade_system column size to accommodate new values
ALTER TABLE profiles ALTER COLUMN grade_system TYPE VARCHAR(20);

-- Migration: 20260326010000_add_type_specific_grade_systems.sql

-- Add type-specific grade system columns to profiles
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS boulder_system VARCHAR(20) DEFAULT 'v_scale';
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS route_system VARCHAR(20) DEFAULT 'yds_equivalent';
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS trad_system VARCHAR(20) DEFAULT 'yds_equivalent';

-- Migrate existing grade_system to boulder_system for backward compatibility
UPDATE profiles 
SET boulder_system = CASE 
  WHEN grade_system = 'v' THEN 'v_scale'
  WHEN grade_system = 'font' THEN 'font_scale'
  ELSE 'v_scale'
END
WHERE boulder_system = 'v_scale';
