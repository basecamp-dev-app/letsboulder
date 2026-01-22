-- Make climb_id nullable for image flags
-- Image flags don't require a climb_id, so we need to allow NULL values

ALTER TABLE climb_flags ALTER COLUMN climb_id DROP NOT NULL;
