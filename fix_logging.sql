-- Fix for route logging - use existing user_climbs table
-- Run these commands in your Supabase SQL editor

-- 1. Add unique constraint for upsert to work correctly
ALTER TABLE user_climbs ADD CONSTRAINT user_climbs_user_climb_unique UNIQUE (user_id, climb_id);

-- 2. Add RLS policies for user_climbs (if not already present)
ALTER TABLE user_climbs ENABLE ROW LEVEL SECURITY;

-- Users can view their own climbs
CREATE POLICY "Users can view own user climbs" ON user_climbs
  FOR SELECT
  USING (auth.uid() = user_id);

-- Users can insert their own climbs
CREATE POLICY "Users can insert own user climbs" ON user_climbs
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Users can update their own climbs
CREATE POLICY "Users can update own user climbs" ON user_climbs
  FOR UPDATE
  USING (auth.uid() = user_id);

-- Users can delete their own climbs
CREATE POLICY "Users can delete own user climbs" ON user_climbs
  FOR DELETE
  USING (auth.uid() = user_id);
