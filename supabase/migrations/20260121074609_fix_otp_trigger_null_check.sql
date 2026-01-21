-- =====================================================
-- Fix Email OTP Login - Null-Safe app_metadata Check
-- Created: 2026-01-21
-- =====================================================

-- Fix the handle_user_metadata_update function to handle null app_metadata
-- The original function fails during email OTP because app_metadata is null
-- This fix uses COALESCE to safely handle null values

CREATE OR REPLACE FUNCTION public.handle_user_metadata_update()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.raw_user_meta_data IS DISTINCT FROM OLD.raw_user_meta_data
     AND COALESCE(NEW.app_metadata->>'provider', '') = 'google' THEN
    UPDATE public.profiles
    SET
      first_name = COALESCE(
        NEW.raw_user_meta_data->>'given_name',
        split_part(NEW.raw_user_meta_data->>'full_name', ' ', 1)
      ),
      last_name = COALESCE(
        NEW.raw_user_meta_data->>'family_name',
        split_part(NEW.raw_user_meta_data->>'full_name', ' ', 2)
      ),
      avatar_url = COALESCE(
        NEW.raw_user_meta_data->>'avatar_url',
        NEW.raw_user_meta_data->>'picture'
      ),
      email = COALESCE(NEW.email, email),
      updated_at = NOW()
    WHERE id = NEW.id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
