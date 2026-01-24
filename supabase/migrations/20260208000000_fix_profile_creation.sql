-- =====================================================
-- Fix profile creation for development
-- Created: 2026-01-24
-- =====================================================

-- Update handle_new_user to:
-- 1. Skip profile creation if email is NULL
-- 2. Prevent duplicate profiles for same email
-- 3. Set is_admin = true for all profiles

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  -- Skip if no email (Mailpit sometimes creates users without email)
  IF NEW.email IS NULL THEN
    RETURN NEW;
  END IF;
  
  -- Check if profile exists for this email
  IF EXISTS (SELECT 1 FROM public.profiles WHERE email = NEW.email) THEN
    -- Update existing profile with new auth user ID and admin=true
    UPDATE public.profiles 
    SET id = NEW.id, is_admin = true, updated_at = NOW()
    WHERE email = NEW.email;
  ELSE
    -- Create new profile with admin=true
    INSERT INTO public.profiles (id, email, is_admin)
    VALUES (NEW.id, NEW.email, true);
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create function to ensure admin on login (UPDATE trigger)
CREATE OR REPLACE FUNCTION public.ensure_dev_admin()
RETURNS TRIGGER AS $$
BEGIN
  -- Set admin for all profiles on login
  IF NEW.email IS NOT NULL THEN
    UPDATE public.profiles 
    SET is_admin = true, updated_at = NOW()
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

-- Create update trigger for admin on login
DROP TRIGGER IF EXISTS on_auth_user_login ON auth.users;
CREATE TRIGGER on_auth_user_login
  AFTER UPDATE ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.ensure_dev_admin();

-- Clean up any existing NULL email profiles
DELETE FROM public.profiles WHERE email IS NULL;

-- Update ALL profiles to be admins (local development only)
UPDATE public.profiles SET is_admin = true;
