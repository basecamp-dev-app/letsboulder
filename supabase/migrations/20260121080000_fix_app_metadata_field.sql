-- =====================================================
-- Fix app_metadata field access in trigger
-- Created: 2026-01-21
-- =====================================================

-- The previous trigger fails during OTP login because NEW.app_metadata
-- may not be accessible. This fix safely handles missing/null metadata.

CREATE OR REPLACE FUNCTION public.handle_user_metadata_update()
RETURNS TRIGGER AS $$
DECLARE
  provider_text text;
BEGIN
  BEGIN
    provider_text := NEW.app_metadata->>'provider';
  EXCEPTION
    WHEN undefined_column THEN
      provider_text := NULL;
  END;

  IF NEW.raw_user_meta_data IS DISTINCT FROM OLD.raw_user_meta_data
     AND COALESCE(provider_text, '') = 'google' THEN
    UPDATE public.profiles SET
      first_name = COALESCE(NEW.raw_user_meta_data->>'given_name', split_part(NEW.raw_user_meta_data->>'full_name', ' ', 1)),
      last_name = COALESCE(NEW.raw_user_meta_data->>'family_name', split_part(NEW.raw_user_meta_data->>'full_name', ' ', 2)),
      avatar_url = COALESCE(NEW.raw_user_meta_data->>'avatar_url', NEW.raw_user_meta_data->>'picture'),
      email = COALESCE(NEW.email, email),
      updated_at = NOW()
    WHERE id = NEW.id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
