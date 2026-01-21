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
