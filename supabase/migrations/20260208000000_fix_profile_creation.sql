-- =====================================================
-- Fix profile creation - PRODUCTION SAFE VERSION
-- Created: 2026-01-24
-- =====================================================

-- Update handle_new_user to:
-- 1. Skip profile creation if email is NULL
-- 2. Prevent duplicate profiles for same email
-- 3. Preserve existing admin status (don't auto-set)

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  -- Skip if no email (Mailpit sometimes creates users without email)
  IF NEW.email IS NULL THEN
    RETURN NEW;
  END IF;
  
  -- Check if profile exists for this email
  IF EXISTS (SELECT 1 FROM public.profiles WHERE email = NEW.email) THEN
    -- Update existing profile with new auth user ID (preserve is_admin)
    UPDATE public.profiles 
    SET id = NEW.id, updated_at = NOW()
    WHERE email = NEW.email;
  ELSE
    -- Create new profile (is_admin defaults to false)
    INSERT INTO public.profiles (id, email, is_admin)
    VALUES (NEW.id, NEW.email, false);
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create function to sync profile on login
CREATE OR REPLACE FUNCTION public.sync_profile_on_login()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.email IS NOT NULL THEN
    -- Update existing profile's auth user ID without changing is_admin
    UPDATE public.profiles 
    SET id = NEW.id, updated_at = NOW()
    WHERE email = NEW.email;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Ensure insert trigger is created
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();

-- Create update trigger for profile sync on login
DROP TRIGGER IF EXISTS on_auth_user_login ON auth.users;
CREATE TRIGGER on_auth_user_login
  AFTER UPDATE ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_profile_on_login();

-- Clean up any existing NULL email profiles
DELETE FROM public.profiles WHERE email IS NULL;

-- FOR LOCAL DEVELOPMENT ONLY: Set all existing profiles to admin
-- Remove this line before pushing to production!
-- UPDATE public.profiles SET is_admin = true;

-- FOR PRODUCTION: Manually set admin for specific users
-- Example: UPDATE public.profiles SET is_admin = true WHERE email = 'admin@example.com';
