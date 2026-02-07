-- =====================================================
-- Add status column to images table for moderation workflow
-- Backfill: column exists in prod/dev but was never migrated
-- Created: 2026-02-07
-- =====================================================

DO $$ BEGIN
  ALTER TABLE public.images ADD COLUMN IF NOT EXISTS status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected'));
EXCEPTION WHEN undefined_table THEN
  NULL;
END $$;

-- Create index for efficient filtering
CREATE INDEX IF NOT EXISTS idx_images_status ON public.images(status);
