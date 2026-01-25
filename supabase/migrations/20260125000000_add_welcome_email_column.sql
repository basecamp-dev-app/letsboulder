-- Migration: Add welcome_email_sent_at column to profiles
-- Purpose: Track when welcome emails are sent to prevent duplicate sends

ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS welcome_email_sent_at TIMESTAMPTZ;

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_profiles_welcome_email_sent_at 
ON public.profiles(welcome_email_sent_at) WHERE welcome_email_sent_at IS NULL;
