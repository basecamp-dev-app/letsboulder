-- =====================================================
-- Climb video beta links + profile body metrics
-- =====================================================

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS height_cm INTEGER,
  ADD COLUMN IF NOT EXISTS reach_cm INTEGER;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'profiles_height_cm_check'
      AND conrelid = 'public.profiles'::regclass
  ) THEN
    ALTER TABLE public.profiles
      ADD CONSTRAINT profiles_height_cm_check
      CHECK (height_cm IS NULL OR (height_cm >= 100 AND height_cm <= 250));
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'profiles_reach_cm_check'
      AND conrelid = 'public.profiles'::regclass
  ) THEN
    ALTER TABLE public.profiles
      ADD CONSTRAINT profiles_reach_cm_check
      CHECK (reach_cm IS NULL OR (reach_cm >= 100 AND reach_cm <= 260));
  END IF;
END
$$;

CREATE TABLE IF NOT EXISTS public.climb_video_betas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  climb_id UUID NOT NULL REFERENCES public.climbs(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  url TEXT NOT NULL,
  platform TEXT NOT NULL DEFAULT 'other'
    CHECK (platform IN ('youtube', 'instagram', 'tiktok', 'vimeo', 'other')),
  title TEXT,
  notes TEXT,
  uploader_gender TEXT CHECK (uploader_gender IN ('male', 'female', 'other', 'prefer_not_to_say')),
  uploader_height_cm INTEGER CHECK (uploader_height_cm IS NULL OR (uploader_height_cm >= 100 AND uploader_height_cm <= 250)),
  uploader_reach_cm INTEGER CHECK (uploader_reach_cm IS NULL OR (uploader_reach_cm >= 100 AND uploader_reach_cm <= 260)),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (climb_id, user_id, url)
);

CREATE INDEX IF NOT EXISTS idx_climb_video_betas_climb_created_at
  ON public.climb_video_betas(climb_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_climb_video_betas_climb_platform
  ON public.climb_video_betas(climb_id, platform);

CREATE INDEX IF NOT EXISTS idx_climb_video_betas_user_created_at
  ON public.climb_video_betas(user_id, created_at DESC);

ALTER TABLE public.climb_video_betas ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'climb_video_betas'
      AND policyname = 'Public read climb_video_betas'
  ) THEN
    CREATE POLICY "Public read climb_video_betas"
      ON public.climb_video_betas
      FOR SELECT
      USING (true);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'climb_video_betas'
      AND policyname = 'Owner create climb_video_betas'
  ) THEN
    CREATE POLICY "Owner create climb_video_betas"
      ON public.climb_video_betas
      FOR INSERT
      WITH CHECK (auth.uid() = user_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'climb_video_betas'
      AND policyname = 'Owner update climb_video_betas'
  ) THEN
    CREATE POLICY "Owner update climb_video_betas"
      ON public.climb_video_betas
      FOR UPDATE
      USING (auth.uid() = user_id)
      WITH CHECK (auth.uid() = user_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'climb_video_betas'
      AND policyname = 'Owner delete climb_video_betas'
  ) THEN
    CREATE POLICY "Owner delete climb_video_betas"
      ON public.climb_video_betas
      FOR DELETE
      USING (auth.uid() = user_id);
  END IF;
END
$$;
