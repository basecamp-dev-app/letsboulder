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
