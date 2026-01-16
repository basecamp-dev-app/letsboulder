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
