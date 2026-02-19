-- =====================================================
-- Community place-centric foundation (posts, rsvps, comments, follows)
-- =====================================================

CREATE TABLE IF NOT EXISTS public.community_posts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  author_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  place_id UUID NOT NULL REFERENCES public.places(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('session', 'update', 'conditions', 'question')),
  title TEXT,
  body TEXT NOT NULL CHECK (char_length(body) BETWEEN 1 AND 2000),
  discipline TEXT CHECK (discipline IN ('boulder', 'sport', 'trad', 'deep_water_solo', 'mixed', 'top_rope')),
  grade_min TEXT,
  grade_max TEXT,
  start_at TIMESTAMPTZ,
  end_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT community_posts_title_length CHECK (title IS NULL OR char_length(title) BETWEEN 1 AND 120),
  CONSTRAINT community_posts_grade_min_length CHECK (grade_min IS NULL OR char_length(grade_min) <= 10),
  CONSTRAINT community_posts_grade_max_length CHECK (grade_max IS NULL OR char_length(grade_max) <= 10),
  CONSTRAINT community_posts_session_start_required CHECK (type <> 'session' OR start_at IS NOT NULL),
  CONSTRAINT community_posts_end_after_start CHECK (end_at IS NULL OR start_at IS NULL OR end_at >= start_at)
);

CREATE TABLE IF NOT EXISTS public.community_post_rsvps (
  post_id UUID NOT NULL REFERENCES public.community_posts(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'going' CHECK (status IN ('going', 'interested')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (post_id, user_id)
);

CREATE TABLE IF NOT EXISTS public.community_post_comments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id UUID NOT NULL REFERENCES public.community_posts(id) ON DELETE CASCADE,
  author_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  body TEXT NOT NULL CHECK (char_length(body) BETWEEN 1 AND 2000),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.community_place_follows (
  place_id UUID NOT NULL REFERENCES public.places(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  notification_level TEXT NOT NULL DEFAULT 'all' CHECK (notification_level IN ('all', 'daily', 'off')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (place_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_community_posts_place_created
  ON public.community_posts(place_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_community_posts_place_type_created
  ON public.community_posts(place_id, type, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_community_posts_session_place_start
  ON public.community_posts(place_id, start_at ASC)
  WHERE type = 'session';

CREATE INDEX IF NOT EXISTS idx_community_posts_author_created
  ON public.community_posts(author_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_community_post_rsvps_user_created
  ON public.community_post_rsvps(user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_community_post_comments_post_created
  ON public.community_post_comments(post_id, created_at ASC);

CREATE INDEX IF NOT EXISTS idx_community_post_comments_author_created
  ON public.community_post_comments(author_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_community_place_follows_user_updated
  ON public.community_place_follows(user_id, updated_at DESC);

DO $$
BEGIN
  ALTER TABLE public.community_posts ENABLE ROW LEVEL SECURITY;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE public.community_post_rsvps ENABLE ROW LEVEL SECURITY;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE public.community_post_comments ENABLE ROW LEVEL SECURITY;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE public.community_place_follows ENABLE ROW LEVEL SECURITY;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'community_posts'
      AND policyname = 'Public read community posts'
  ) THEN
    CREATE POLICY "Public read community posts"
      ON public.community_posts
      FOR SELECT
      USING (true);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'community_posts'
      AND policyname = 'Authenticated create own community posts'
  ) THEN
    CREATE POLICY "Authenticated create own community posts"
      ON public.community_posts
      FOR INSERT
      WITH CHECK (auth.role() = 'authenticated' AND auth.uid() = author_id);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'community_posts'
      AND policyname = 'Owner update community posts'
  ) THEN
    CREATE POLICY "Owner update community posts"
      ON public.community_posts
      FOR UPDATE
      USING (auth.uid() = author_id)
      WITH CHECK (auth.uid() = author_id);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'community_posts'
      AND policyname = 'Owner delete community posts'
  ) THEN
    CREATE POLICY "Owner delete community posts"
      ON public.community_posts
      FOR DELETE
      USING (auth.uid() = author_id);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'community_post_rsvps'
      AND policyname = 'Public read community rsvps'
  ) THEN
    CREATE POLICY "Public read community rsvps"
      ON public.community_post_rsvps
      FOR SELECT
      USING (true);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'community_post_rsvps'
      AND policyname = 'Users manage own community rsvps'
  ) THEN
    CREATE POLICY "Users manage own community rsvps"
      ON public.community_post_rsvps
      FOR ALL
      USING (auth.uid() = user_id)
      WITH CHECK (auth.uid() = user_id);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'community_post_comments'
      AND policyname = 'Public read community comments'
  ) THEN
    CREATE POLICY "Public read community comments"
      ON public.community_post_comments
      FOR SELECT
      USING (true);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'community_post_comments'
      AND policyname = 'Authenticated create own community comments'
  ) THEN
    CREATE POLICY "Authenticated create own community comments"
      ON public.community_post_comments
      FOR INSERT
      WITH CHECK (auth.role() = 'authenticated' AND auth.uid() = author_id);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'community_post_comments'
      AND policyname = 'Owner update community comments'
  ) THEN
    CREATE POLICY "Owner update community comments"
      ON public.community_post_comments
      FOR UPDATE
      USING (auth.uid() = author_id)
      WITH CHECK (auth.uid() = author_id);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'community_post_comments'
      AND policyname = 'Owner delete community comments'
  ) THEN
    CREATE POLICY "Owner delete community comments"
      ON public.community_post_comments
      FOR DELETE
      USING (auth.uid() = author_id);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'community_place_follows'
      AND policyname = 'Users read own place follows'
  ) THEN
    CREATE POLICY "Users read own place follows"
      ON public.community_place_follows
      FOR SELECT
      USING (auth.uid() = user_id);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'community_place_follows'
      AND policyname = 'Users manage own place follows'
  ) THEN
    CREATE POLICY "Users manage own place follows"
      ON public.community_place_follows
      FOR ALL
      USING (auth.uid() = user_id)
      WITH CHECK (auth.uid() = user_id);
  END IF;
END $$;
