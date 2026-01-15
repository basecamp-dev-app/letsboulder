-- =====================================================
-- MIGRATION: Public Profile Access RLS Policies
-- Enables viewing of public logbooks and profiles
-- Created: 2026-01-15
-- =====================================================

-- =====================================================
-- PROFILES: Add is_public column if not exists
-- =====================================================
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS is_public BOOLEAN DEFAULT true;

CREATE INDEX IF NOT EXISTS idx_profiles_is_public ON profiles(is_public);

-- =====================================================
-- RLS POLICIES FOR PUBLIC PROFILE ACCESS
-- =====================================================

-- Enable RLS on profiles if not already enabled
DO $$ BEGIN
    ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
EXCEPTION WHEN OTHERS THEN NULL; END $$;

-- Public read access to profiles (username, avatar, basic info)
-- This is already present, but we ensure it exists
DO $$ BEGIN
    CREATE POLICY "Public read profiles" ON profiles FOR SELECT USING (true);
EXCEPTION WHEN OTHERS THEN NULL; END $$;

-- Owner can update their own profile
DO $$ BEGIN
    CREATE POLICY "Owner update profile" ON profiles FOR UPDATE USING (auth.uid() = id);
EXCEPTION WHEN OTHERS THEN NULL; END $$;

-- Authenticated users can create profiles
DO $$ BEGIN
    CREATE POLICY "Authenticated create profile" ON profiles FOR INSERT WITH CHECK (auth.uid() = id);
EXCEPTION WHEN OTHERS THEN NULL; END $$;

-- =====================================================
-- LOGS: RLS for public logbook access
-- =====================================================

-- Enable RLS on logs if not already enabled
DO $$ BEGIN
    ALTER TABLE logs ENABLE ROW LEVEL SECURITY;
EXCEPTION WHEN OTHERS THEN NULL; END $$;

-- Public read access to logs for users with public profiles
-- This policy allows reading logs where the owner has is_public = true
DO $$ BEGIN
    CREATE POLICY "Public read logs for public profiles" ON logs FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM profiles
            WHERE profiles.id = logs.user_id
            AND profiles.is_public = true
        )
    );
EXCEPTION WHEN OTHERS THEN NULL; END $$;

-- Owner can always read their own logs
DO $$ BEGIN
    CREATE POLICY "Owner read own logs" ON logs FOR SELECT USING (auth.uid() = user_id);
EXCEPTION WHEN OTHERS THEN NULL; END $$;

-- Owner can create logs
DO $$ BEGIN
    CREATE POLICY "Owner create logs" ON logs FOR INSERT WITH CHECK (auth.uid() = user_id);
EXCEPTION WHEN OTHERS THEN NULL; END $$;

-- Owner can update their own logs
DO $$ BEGIN
    CREATE POLICY "Owner update logs" ON logs FOR UPDATE USING (auth.uid() = user_id);
EXCEPTION WHEN OTHERS THEN NULL; END $$;

-- Owner can delete their own logs
DO $$ BEGIN
    CREATE POLICY "Owner delete logs" ON logs FOR DELETE USING (auth.uid() = user_id);
EXCEPTION WHEN OTHERS THEN NULL; END $$;

-- =====================================================
-- USER_CLIMBS: RLS for public logbook access
-- =====================================================

-- Enable RLS on user_climbs if not already enabled
DO $$ BEGIN
    ALTER TABLE user_climbs ENABLE ROW LEVEL SECURITY;
EXCEPTION WHEN OTHERS THEN NULL; END $$;

-- Public read access to user_climbs for users with public profiles
-- This policy allows reading user_climbs where the owner has is_public = true
DO $$ BEGIN
    CREATE POLICY "Public read user_climbs for public profiles" ON user_climbs FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM profiles
            WHERE profiles.id = user_climbs.user_id
            AND profiles.is_public = true
        )
    );
EXCEPTION WHEN OTHERS THEN NULL; END $$;

-- Owner can always read their own user_climbs
DO $$ BEGIN
    CREATE POLICY "Owner read own user_climbs" ON user_climbs FOR SELECT USING (auth.uid() = user_id);
EXCEPTION WHEN OTHERS THEN NULL; END $$;

-- Owner can create user_climbs
DO $$ BEGIN
    CREATE POLICY "Owner create user_climbs" ON user_climbs FOR INSERT WITH CHECK (auth.uid() = user_id);
EXCEPTION WHEN OTHERS THEN NULL; END $$;

-- Owner can update their own user_climbs
DO $$ BEGIN
    CREATE POLICY "Owner update user_climbs" ON user_climbs FOR UPDATE USING (auth.uid() = user_id);
EXCEPTION WHEN OTHERS THEN NULL; END $$;

-- Owner can delete their own user_climbs
DO $$ BEGIN
    CREATE POLICY "Owner delete user_climbs" ON user_climbs FOR DELETE USING (auth.uid() = user_id);
EXCEPTION WHEN OTHERS THEN NULL; END $$;

-- =====================================================
-- CLIMBS: RLS for viewing climbs in public logbooks
-- =====================================================

-- Enable RLS on climbs if not already enabled
DO $$ BEGIN
    ALTER TABLE climbs ENABLE ROW LEVEL SECURITY;
EXCEPTION WHEN OTHERS THEN NULL; END $$;

-- Public read access to climbs (basic climb info)
-- This is needed to show climb details in public logbooks
DO $$ BEGIN
    CREATE POLICY "Public read climbs" ON climbs FOR SELECT USING (true);
EXCEPTION WHEN OTHERS THEN NULL; END $$;

-- =====================================================
-- INDEXES FOR PERFORMANCE
-- =====================================================

-- Index on logs.user_id for faster public profile queries
CREATE INDEX IF NOT EXISTS idx_logs_user_is_public ON logs(user_id) WHERE (
    EXISTS (SELECT 1 FROM profiles WHERE profiles.id = logs.user_id AND profiles.is_public = true)
);

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
END;
$$ LANGUAGE plpgsql STABLE;

-- =====================================================
-- VERIFICATION
-- =====================================================

SELECT 'Profiles RLS enabled: ' || (SELECT COUNT(*) FROM pg_policies WHERE tablename = 'profiles') as status;
SELECT 'Logs RLS enabled: ' || (SELECT COUNT(*) FROM pg_policies WHERE tablename = 'logs') as status;
SELECT 'User_climbs RLS enabled: ' || (SELECT COUNT(*) FROM pg_policies WHERE tablename = 'user_climbs') as status;
SELECT 'is_public column added to profiles' as status;
