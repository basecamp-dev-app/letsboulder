-- =====================================================
-- Add all missing schema columns for fresh setups
-- =====================================================

-- profiles table
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS first_name TEXT;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS last_name TEXT;

-- images table
ALTER TABLE public.images ADD COLUMN IF NOT EXISTS natural_width INTEGER;
ALTER TABLE public.images ADD COLUMN IF NOT EXISTS natural_height INTEGER;

-- route_lines table
ALTER TABLE public.route_lines ADD COLUMN IF NOT EXISTS image_width INTEGER;
ALTER TABLE public.route_lines ADD COLUMN IF NOT EXISTS image_height INTEGER;
