-- =====================================================
-- Add image_id to climb_flags
-- Allows flagging images directly (not just climbs)
-- Created: 2026-01-22
-- =====================================================

ALTER TABLE climb_flags ADD COLUMN IF NOT EXISTS image_id UUID REFERENCES images(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_climb_flags_image ON climb_flags(image_id);
