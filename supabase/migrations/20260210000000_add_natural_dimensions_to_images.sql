-- =====================================================
-- Add natural dimensions columns to images
-- =====================================================

ALTER TABLE public.images ADD COLUMN IF NOT EXISTS natural_width INTEGER;
ALTER TABLE public.images ADD COLUMN IF NOT EXISTS natural_height INTEGER;
