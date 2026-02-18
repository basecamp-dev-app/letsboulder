-- Community comments for crags and images (public read, authenticated write)

CREATE TABLE IF NOT EXISTS public.comments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  target_type TEXT NOT NULL CHECK (target_type IN ('crag', 'image')),
  target_id UUID NOT NULL,
  author_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  body TEXT NOT NULL CHECK (char_length(body) BETWEEN 1 AND 2000),
  category TEXT NOT NULL DEFAULT 'other' CHECK (category IN ('history', 'broken_hold', 'approach_beta', 'beta', 'conditions', 'other')),
  deleted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_comments_target_created
  ON public.comments(target_type, target_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_comments_author_created
  ON public.comments(author_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_comments_visible_target_created
  ON public.comments(target_type, target_id, created_at DESC)
  WHERE deleted_at IS NULL;

CREATE OR REPLACE FUNCTION public.validate_comment_target()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.target_type = 'crag' THEN
    IF NOT EXISTS (SELECT 1 FROM public.crags c WHERE c.id = NEW.target_id) THEN
      RAISE EXCEPTION 'Target crag does not exist';
    END IF;
  ELSIF NEW.target_type = 'image' THEN
    IF NOT EXISTS (SELECT 1 FROM public.images i WHERE i.id = NEW.target_id) THEN
      RAISE EXCEPTION 'Target image does not exist';
    END IF;
  ELSE
    RAISE EXCEPTION 'Invalid target type';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS comments_validate_target_trigger ON public.comments;
CREATE TRIGGER comments_validate_target_trigger
BEFORE INSERT OR UPDATE OF target_type, target_id ON public.comments
FOR EACH ROW
EXECUTE FUNCTION public.validate_comment_target();

CREATE OR REPLACE FUNCTION public.enforce_comment_soft_delete_only()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF OLD.target_type <> NEW.target_type
     OR OLD.target_id <> NEW.target_id
     OR OLD.author_id IS DISTINCT FROM NEW.author_id
     OR OLD.body <> NEW.body
     OR OLD.category <> NEW.category
     OR OLD.created_at <> NEW.created_at THEN
    RAISE EXCEPTION 'Comments cannot be edited';
  END IF;

  IF OLD.deleted_at IS NOT NULL THEN
    RAISE EXCEPTION 'Comment already deleted';
  END IF;

  IF NEW.deleted_at IS NULL THEN
    RAISE EXCEPTION 'Comments can only be soft-deleted';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS comments_soft_delete_only_trigger ON public.comments;
CREATE TRIGGER comments_soft_delete_only_trigger
BEFORE UPDATE ON public.comments
FOR EACH ROW
EXECUTE FUNCTION public.enforce_comment_soft_delete_only();

DO $$
BEGIN
  ALTER TABLE public.comments ENABLE ROW LEVEL SECURITY;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'comments'
      AND policyname = 'Public read visible comments'
  ) THEN
    CREATE POLICY "Public read visible comments"
      ON public.comments
      FOR SELECT
      USING (deleted_at IS NULL);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'comments'
      AND policyname = 'Authenticated create comments'
  ) THEN
    CREATE POLICY "Authenticated create comments"
      ON public.comments
      FOR INSERT
      WITH CHECK (auth.role() = 'authenticated' AND auth.uid() = author_id AND deleted_at IS NULL);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'comments'
      AND policyname = 'Author soft delete comments'
  ) THEN
    CREATE POLICY "Author soft delete comments"
      ON public.comments
      FOR UPDATE
      USING (auth.uid() = author_id AND deleted_at IS NULL)
      WITH CHECK (auth.uid() = author_id);
  END IF;
END $$;
