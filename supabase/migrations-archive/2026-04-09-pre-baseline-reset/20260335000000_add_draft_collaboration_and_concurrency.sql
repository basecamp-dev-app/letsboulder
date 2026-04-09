ALTER TABLE public.submission_drafts
ADD COLUMN IF NOT EXISTS last_edited_by UUID REFERENCES auth.users(id) ON DELETE SET NULL;

CREATE TABLE IF NOT EXISTS public.submission_draft_collaborators (
  draft_id UUID NOT NULL REFERENCES public.submission_drafts(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'editor',
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (draft_id, user_id),
  CONSTRAINT submission_draft_collaborators_role_check CHECK (role IN ('editor'))
);

CREATE INDEX IF NOT EXISTS idx_submission_draft_collaborators_user_id
  ON public.submission_draft_collaborators(user_id);

CREATE TABLE IF NOT EXISTS public.submission_draft_collaborator_invites (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  draft_id UUID NOT NULL REFERENCES public.submission_drafts(id) ON DELETE CASCADE,
  token UUID NOT NULL UNIQUE DEFAULT gen_random_uuid(),
  created_by UUID REFERENCES auth.users(id),
  max_uses INTEGER,
  used_count INTEGER NOT NULL DEFAULT 0,
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT submission_draft_collaborator_invites_max_uses_check CHECK (max_uses IS NULL OR max_uses > 0),
  CONSTRAINT submission_draft_collaborator_invites_used_count_check CHECK (used_count >= 0),
  CONSTRAINT submission_draft_collaborator_invites_uses_window_check CHECK (max_uses IS NULL OR used_count <= max_uses)
);

CREATE INDEX IF NOT EXISTS idx_submission_draft_collaborator_invites_draft_id
  ON public.submission_draft_collaborator_invites(draft_id);

ALTER TABLE public.submission_draft_collaborators ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.submission_draft_collaborator_invites ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.is_submission_draft_collaborator(
  p_draft_id UUID,
  p_user_id UUID
)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $is_submission_draft_collaborator$
  SELECT EXISTS (
    SELECT 1
    FROM public.submission_draft_collaborators sdc
    WHERE sdc.draft_id = p_draft_id
      AND sdc.user_id = p_user_id
  );
$is_submission_draft_collaborator$;

REVOKE ALL ON FUNCTION public.is_submission_draft_collaborator(UUID, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_submission_draft_collaborator(UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_submission_draft_collaborator(UUID, UUID) TO service_role;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'submission_drafts'
      AND policyname = 'Users read own submission_drafts'
  ) THEN
    DROP POLICY "Users read own submission_drafts" ON public.submission_drafts;
  END IF;

  CREATE POLICY "Users read own or shared submission_drafts"
    ON public.submission_drafts
    FOR SELECT
    USING (
      auth.uid() = user_id
      OR public.is_submission_draft_collaborator(submission_drafts.id, auth.uid())
    );
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'submission_drafts'
      AND policyname = 'Users update own submission_drafts'
  ) THEN
    DROP POLICY "Users update own submission_drafts" ON public.submission_drafts;
  END IF;

  CREATE POLICY "Owner or collaborator update draft submission_drafts"
    ON public.submission_drafts
    FOR UPDATE
    USING (
      status = 'draft'
      AND (
        auth.uid() = user_id
        OR public.is_submission_draft_collaborator(submission_drafts.id, auth.uid())
      )
    )
    WITH CHECK (
      status = 'draft'
      AND (
        auth.uid() = user_id
        OR public.is_submission_draft_collaborator(submission_drafts.id, auth.uid())
      )
    );
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'submission_draft_images'
      AND policyname = 'Users read own submission_draft_images'
  ) THEN
    DROP POLICY "Users read own submission_draft_images" ON public.submission_draft_images;
  END IF;

  CREATE POLICY "Users read own or shared submission_draft_images"
    ON public.submission_draft_images
    FOR SELECT
    USING (
      EXISTS (
        SELECT 1
        FROM public.submission_drafts d
        WHERE d.id = submission_draft_images.draft_id
          AND (
            d.user_id = auth.uid()
            OR public.is_submission_draft_collaborator(d.id, auth.uid())
          )
      )
    );
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'submission_draft_images'
      AND policyname = 'Users update own submission_draft_images'
  ) THEN
    DROP POLICY "Users update own submission_draft_images" ON public.submission_draft_images;
  END IF;

  CREATE POLICY "Users update own or shared submission_draft_images"
    ON public.submission_draft_images
    FOR UPDATE
    USING (
      EXISTS (
        SELECT 1
        FROM public.submission_drafts d
        WHERE d.id = submission_draft_images.draft_id
          AND d.status = 'draft'
          AND (
            d.user_id = auth.uid()
            OR public.is_submission_draft_collaborator(d.id, auth.uid())
          )
      )
    )
    WITH CHECK (
      EXISTS (
        SELECT 1
        FROM public.submission_drafts d
        WHERE d.id = submission_draft_images.draft_id
          AND d.status = 'draft'
          AND (
            d.user_id = auth.uid()
            OR public.is_submission_draft_collaborator(d.id, auth.uid())
          )
      )
    );
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'submission_draft_collaborators'
      AND policyname = 'Owner or collaborator read submission_draft_collaborators'
  ) THEN
    CREATE POLICY "Owner or collaborator read submission_draft_collaborators"
      ON public.submission_draft_collaborators
      FOR SELECT
      USING (
        user_id = auth.uid()
        OR EXISTS (
          SELECT 1
          FROM public.submission_drafts d
          WHERE d.id = submission_draft_collaborators.draft_id
            AND d.user_id = auth.uid()
        )
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'submission_draft_collaborators'
      AND policyname = 'Owner add submission_draft_collaborators'
  ) THEN
    CREATE POLICY "Owner add submission_draft_collaborators"
      ON public.submission_draft_collaborators
      FOR INSERT
      WITH CHECK (
        EXISTS (
          SELECT 1
          FROM public.submission_drafts d
          WHERE d.id = submission_draft_collaborators.draft_id
            AND d.user_id = auth.uid()
            AND d.status = 'draft'
        )
        AND created_by = auth.uid()
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'submission_draft_collaborators'
      AND policyname = 'Owner or self remove submission_draft_collaborators'
  ) THEN
    CREATE POLICY "Owner or self remove submission_draft_collaborators"
      ON public.submission_draft_collaborators
      FOR DELETE
      USING (
        user_id = auth.uid()
        OR EXISTS (
          SELECT 1
          FROM public.submission_drafts d
          WHERE d.id = submission_draft_collaborators.draft_id
            AND d.user_id = auth.uid()
        )
      );
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'submission_draft_collaborator_invites'
      AND policyname = 'Owner read submission_draft_collaborator_invites'
  ) THEN
    CREATE POLICY "Owner read submission_draft_collaborator_invites"
      ON public.submission_draft_collaborator_invites
      FOR SELECT
      USING (
        EXISTS (
          SELECT 1
          FROM public.submission_drafts d
          WHERE d.id = submission_draft_collaborator_invites.draft_id
            AND d.user_id = auth.uid()
        )
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'submission_draft_collaborator_invites'
      AND policyname = 'Owner create submission_draft_collaborator_invites'
  ) THEN
    CREATE POLICY "Owner create submission_draft_collaborator_invites"
      ON public.submission_draft_collaborator_invites
      FOR INSERT
      WITH CHECK (
        EXISTS (
          SELECT 1
          FROM public.submission_drafts d
          WHERE d.id = submission_draft_collaborator_invites.draft_id
            AND d.user_id = auth.uid()
            AND d.status = 'draft'
        )
        AND created_by = auth.uid()
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'submission_draft_collaborator_invites'
      AND policyname = 'Owner revoke submission_draft_collaborator_invites'
  ) THEN
    CREATE POLICY "Owner revoke submission_draft_collaborator_invites"
      ON public.submission_draft_collaborator_invites
      FOR DELETE
      USING (
        EXISTS (
          SELECT 1
          FROM public.submission_drafts d
          WHERE d.id = submission_draft_collaborator_invites.draft_id
            AND d.user_id = auth.uid()
        )
      );
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.claim_submission_draft_collaborator_invite(
  p_token UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $claim_submission_draft_collaborator_invite$
DECLARE
  current_user_id UUID := auth.uid();
  invite_row public.submission_draft_collaborator_invites%ROWTYPE;
  draft_owner_id UUID;
  draft_status TEXT;
  inserted_count INTEGER := 0;
BEGIN
  IF current_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  IF p_token IS NULL THEN
    RAISE EXCEPTION 'Invite token is required';
  END IF;

  SELECT *
  INTO invite_row
  FROM public.submission_draft_collaborator_invites
  WHERE token = p_token
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Invite not found';
  END IF;

  IF invite_row.expires_at IS NOT NULL AND invite_row.expires_at <= NOW() THEN
    RAISE EXCEPTION 'Invite has expired';
  END IF;

  IF invite_row.max_uses IS NOT NULL AND invite_row.used_count >= invite_row.max_uses THEN
    RAISE EXCEPTION 'Invite has reached max uses';
  END IF;

  SELECT d.user_id, d.status
  INTO draft_owner_id, draft_status
  FROM public.submission_drafts d
  WHERE d.id = invite_row.draft_id
  FOR UPDATE;

  IF draft_owner_id IS NULL THEN
    RAISE EXCEPTION 'Draft owner not found';
  END IF;

  IF draft_status <> 'draft' THEN
    RAISE EXCEPTION 'Invite is no longer valid';
  END IF;

  IF draft_owner_id = current_user_id THEN
    RETURN jsonb_build_object(
      'draft_id', invite_row.draft_id,
      'already_owner', true,
      'already_collaborator', false,
      'added', false
    );
  END IF;

  INSERT INTO public.submission_draft_collaborators (draft_id, user_id, role, created_by)
  VALUES (invite_row.draft_id, current_user_id, 'editor', invite_row.created_by)
  ON CONFLICT (draft_id, user_id) DO NOTHING;

  GET DIAGNOSTICS inserted_count = ROW_COUNT;

  IF inserted_count > 0 THEN
    UPDATE public.submission_draft_collaborator_invites
    SET used_count = used_count + 1
    WHERE id = invite_row.id;
  END IF;

  RETURN jsonb_build_object(
    'draft_id', invite_row.draft_id,
    'already_owner', false,
    'already_collaborator', inserted_count = 0,
    'added', inserted_count > 0
  );
END;
$claim_submission_draft_collaborator_invite$;

REVOKE ALL ON FUNCTION public.claim_submission_draft_collaborator_invite(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.claim_submission_draft_collaborator_invite(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.claim_submission_draft_collaborator_invite(UUID) TO service_role;
