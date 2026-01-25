-- Logbook Performance Optimizations
-- Indexes for faster logbook queries

-- Composite index for user_climbs user_id + created_at ordering (most common query pattern)
CREATE INDEX IF NOT EXISTS idx_user_climbs_user_created ON user_climbs(user_id, created_at DESC);

-- Index for style filtering combined with user
CREATE INDEX IF NOT EXISTS idx_user_climbs_user_style ON user_climbs(user_id, style);

-- Index for climbing activity lookups
CREATE INDEX IF NOT EXISTS idx_user_climbs_user_climb ON user_climbs(user_id, climb_id);
