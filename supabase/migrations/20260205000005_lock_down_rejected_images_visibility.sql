-- =====================================================
-- Lock down rejected image visibility
-- Rejected images must not be readable by anyone (including owner/admin)
-- Public read is restricted to approved images only.
-- Created: 2026-02-05
-- =====================================================

DO $$
BEGIN
  -- Remove any permissive/legacy policy
  IF EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'images'
      AND policyname = 'Public read images'
  ) THEN
    EXECUTE 'DROP POLICY "Public read images" ON public.images';
  END IF;

  -- Remove privileged read policies
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

  -- Ensure public approved-only policy exists
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
END $$;
