-- Add CASCADE to user_climbs.climb_id foreign key for hard delete support
-- This ensures user_climbs records are automatically deleted when a climb is removed

ALTER TABLE user_climbs
DROP CONSTRAINT IF EXISTS user_climbs_climb_id_fkey,
ADD CONSTRAINT user_climbs_climb_id_fkey
  FOREIGN KEY (climb_id) REFERENCES climbs(id) ON DELETE CASCADE;
