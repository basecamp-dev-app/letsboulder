-- =====================================================
-- Fix auth.users metadata trigger for all environments
--
-- Problem:
-- Some Supabase auth schemas do not expose NEW.app_metadata on auth.users.
-- Triggers referencing NEW.app_metadata break OTP/magic-link sign-in.
--
-- Fix:
-- Prefer NEW.raw_app_meta_data (canonical), but safely fall back if needed.
-- =====================================================

CREATE OR REPLACE FUNCTION public.handle_user_metadata_update()
RETURNS TRIGGER AS $$
DECLARE
  provider_text text;
BEGIN
  provider_text := NULL;

  -- Prefer auth.users.raw_app_meta_data; tolerate schemas that also expose app_metadata.
  BEGIN
    provider_text := NEW.app_metadata->>'provider';
  EXCEPTION
    WHEN undefined_column THEN
      BEGIN
        provider_text := NEW.raw_app_meta_data->>'provider';
      EXCEPTION
        WHEN undefined_column THEN
          provider_text := NULL;
      END;
  END;

  IF NEW.raw_user_meta_data IS DISTINCT FROM OLD.raw_user_meta_data
     AND COALESCE(provider_text, '') = 'google' THEN
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

DROP TRIGGER IF EXISTS on_auth_user_updated ON auth.users;
CREATE TRIGGER on_auth_user_updated
  AFTER UPDATE ON auth.users
  FOR EACH ROW
  WHEN (OLD.raw_user_meta_data IS DISTINCT FROM NEW.raw_user_meta_data)
  EXECUTE FUNCTION public.handle_user_metadata_update();
