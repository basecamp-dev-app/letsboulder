-- =====================================================
-- Fix profile creation for development
-- Created: 2026-01-24
-- =====================================================

-- Update handle_new_user to:
-- 1. Prevent duplicate profiles for same email
-- 2. Set ALL profiles to admin (local development only)

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
DECLARE
  existing_profile_id UUID;
BEGIN
  -- Check if this email already has a profile
  SELECT id INTO existing_profile_id 
  FROM public.profiles 
  WHERE email = NEW.email;

  IF existing_profile_id IS NOT NULL THEN
    -- Update existing profile with new auth user ID
    -- Set admin to true for all profiles in development
    UPDATE public.profiles 
    SET id = NEW.id, is_admin = true, updated_at = NOW()
    WHERE email = NEW.email;
  ELSE
    -- Create new profile with admin=true
    INSERT INTO public.profiles (
      id,
      email,
      theme_preference,
      is_admin
    ) VALUES (
      NEW.id,
      NEW.email,
      'system',
      true
    );
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create function to ensure dev users have admin on login
CREATE OR REPLACE FUNCTION public.ensure_dev_admin()
RETURNS TRIGGER AS $$
BEGIN
  -- Set admin for all profiles on any update (login triggers update)
  UPDATE public.profiles 
  SET is_admin = true, updated_at = NOW()
  WHERE email = NEW.email;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Ensure insert trigger is created
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();

-- Create update trigger for admin on login
DROP TRIGGER IF EXISTS on_auth_user_login ON auth.users;
CREATE TRIGGER on_auth_user_login
  AFTER UPDATE ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.ensure_dev_admin();

-- Update ALL existing profiles to be admins (local development)
UPDATE public.profiles SET is_admin = true;
