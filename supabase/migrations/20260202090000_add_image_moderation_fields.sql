-- =====================================================
-- Image moderation fields (AWS Rekognition)
-- Created: 2026-02-02
-- =====================================================

DO $$ BEGIN
  ALTER TABLE images ADD COLUMN IF NOT EXISTS moderation_status TEXT DEFAULT 'pending';
  ALTER TABLE images ADD COLUMN IF NOT EXISTS has_humans BOOLEAN;
  ALTER TABLE images ADD COLUMN IF NOT EXISTS moderation_labels JSONB;
  ALTER TABLE images ADD COLUMN IF NOT EXISTS moderated_at TIMESTAMPTZ;
EXCEPTION WHEN undefined_table THEN
  NULL;
END $$;

CREATE INDEX IF NOT EXISTS idx_images_moderation_status ON images(moderation_status);
