-- =====================================================
-- Add 'deleted' status to images for soft delete
-- Created: 2026-02-25
-- =====================================================

ALTER TABLE public.images 
  DROP CONSTRAINT IF EXISTS images_status_check;

ALTER TABLE public.images 
  ADD CONSTRAINT images_status_check 
  CHECK (status IN ('pending', 'approved', 'rejected', 'deleted'));

-- Index already exists from previous migration
-- idx_images_status ON public.images(status);
