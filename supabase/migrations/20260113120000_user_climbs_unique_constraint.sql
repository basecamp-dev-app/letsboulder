-- Add unique constraint to user_climbs for upsert to work correctly

ALTER TABLE user_climbs ADD CONSTRAINT idx_user_climbs_unique UNIQUE (user_id, climb_id);
