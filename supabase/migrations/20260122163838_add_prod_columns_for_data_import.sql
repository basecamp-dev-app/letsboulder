-- =====================================================
-- Add columns needed for production data import
-- Created: 2026-01-22
-- =====================================================

-- Add crag_id to climbs
ALTER TABLE public.climbs ADD COLUMN IF NOT EXISTS crag_id uuid;

-- Add missing columns to profiles
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS display_name text;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS bio text;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS gender text;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS country varchar(100);
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS country_code varchar(2);
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS preferred_grade_system varchar(10) DEFAULT 'french';
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS preferred_style varchar(20) DEFAULT 'sport';
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS total_climbs integer DEFAULT 0;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS total_points integer DEFAULT 0;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS highest_grade text;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS name text;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS default_location text;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS default_location_name text;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS default_location_lat numeric(10,8);
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS default_location_lng numeric(11,8);
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS default_location_zoom integer;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS grade_system varchar(10) DEFAULT 'font';
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS units varchar(10) DEFAULT 'metric';
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS is_public boolean DEFAULT true;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS theme_preference varchar(20) DEFAULT 'system';
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS email text;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS name_updated_at timestamptz;

-- Add gender constraint
DO $$ BEGIN
    ALTER TABLE public.profiles ADD CONSTRAINT profiles_gender_check CHECK (gender = ANY (ARRAY['male', 'female', 'other', 'prefer_not_to_say']));
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- Add missing columns to crags
ALTER TABLE public.crags ADD COLUMN IF NOT EXISTS tide_dependency varchar(20);

-- Add missing columns to images
ALTER TABLE public.images ADD COLUMN IF NOT EXISTS is_verified boolean DEFAULT false;
ALTER TABLE public.images ADD COLUMN IF NOT EXISTS verification_count integer DEFAULT 0;
