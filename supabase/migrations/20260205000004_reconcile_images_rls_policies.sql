-- =====================================================
-- Reconcile images RLS SELECT policies (idempotent)
-- Ensures public can only read approved images.
-- Rejected images are not readable by anyone (including owner/admin).
-- Created: 2026-02-05
-- =====================================================

DO $$
BEGIN
  -- Remove legacy overly-permissive policy if it exists
  IF EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'images'
      AND policyname = 'Public read images'
  ) THEN
    EXECUTE 'DROP POLICY "Public read images" ON public.images';
  END IF;

  -- Public: approved only
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'images'
      AND policyname = 'Public read approved images'
  ) THEN
    EXECUTE $policy$
      CREATE POLICY "Public read approved images" ON public.images
      FOR SELECT
      USING (coalesce(moderation_status, 'pending') = 'approved')
    $policy$;
  END IF;

  -- Remove privileged SELECT policies (owner/admin). Even admins must not be
  -- able to read rejected images via normal SELECT.
  IF EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'images'
      AND policyname = 'Owner read own images'
  ) THEN
    EXECUTE 'DROP POLICY "Owner read own images" ON public.images';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'images'
      AND policyname = 'Admin read images'
  ) THEN
    EXECUTE 'DROP POLICY "Admin read images" ON public.images';
  END IF;
END $$;
