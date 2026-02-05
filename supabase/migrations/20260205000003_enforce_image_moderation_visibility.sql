-- =====================================================
-- Enforce image moderation visibility via RLS
-- Public can only read approved images
-- Rejected images are not readable by anyone (including owner/admin)
-- Created: 2026-02-05
-- =====================================================

DO $$
BEGIN
  -- Replace permissive public read policy
  IF EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'images'
      AND policyname = 'Public read images'
  ) THEN
    EXECUTE 'DROP POLICY "Public read images" ON public.images';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'images'
      AND policyname = 'Public read approved images'
  ) THEN
    EXECUTE $$
      CREATE POLICY "Public read approved images" ON public.images
      FOR SELECT
      USING (coalesce(moderation_status, 'pending') = 'approved')
    $$;
  END IF;

  -- Do not create owner/admin read policies: rejected images must not be visible
  -- even to owners or admins.
END $$;
