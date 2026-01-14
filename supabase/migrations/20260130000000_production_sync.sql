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
