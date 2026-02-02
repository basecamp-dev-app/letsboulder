-- Add ON DELETE CASCADE to user_climbs.climb_id FK
-- This allows crag deletion to cascade properly through climbs → user_climbs

ALTER TABLE user_climbs DROP CONSTRAINT IF EXISTS user_climbs_climb_id_fkey;
ALTER TABLE user_climbs ADD CONSTRAINT user_climbs_climb_id_fkey
  FOREIGN KEY (climb_id) REFERENCES climbs(id) ON DELETE CASCADE;
