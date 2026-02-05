-- =====================================================
-- Reconcile images RLS SELECT policies (idempotent)
-- Ensures public can only read approved images.
-- Ensures owners can read their own images.
-- Ensures admins can read all images.
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
    EXECUTE $$
      CREATE POLICY "Public read approved images" ON public.images
      FOR SELECT
      USING (coalesce(moderation_status, 'pending') = 'approved')
    $$;
  END IF;

  -- Owner: read own images
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'images'
      AND policyname = 'Owner read own images'
  ) THEN
    EXECUTE $$
      CREATE POLICY "Owner read own images" ON public.images
      FOR SELECT
      USING (auth.uid() = created_by)
    $$;
  END IF;

  -- Admin: read all images
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'images'
      AND policyname = 'Admin read images'
  ) THEN
    EXECUTE $$
      CREATE POLICY "Admin read images" ON public.images
      FOR SELECT
      USING (
        EXISTS (
          SELECT 1
          FROM public.profiles
          WHERE profiles.id = auth.uid()
            AND profiles.is_admin = true
        )
      )
    $$;
  END IF;
END $$;
