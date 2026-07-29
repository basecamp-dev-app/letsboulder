ALTER TABLE public.crags
  ADD COLUMN created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL;

DROP POLICY "Authenticated create crags" ON public.crags;
CREATE POLICY "Authenticated create own crags" ON public.crags
  FOR INSERT TO authenticated
  WITH CHECK (created_by = auth.uid());

DROP POLICY "Authenticated create crag location tags" ON public.crag_location_tags;
CREATE POLICY "Creators link initial crag region" ON public.crag_location_tags
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.crags AS crag
      WHERE crag.id = crag_location_tags.crag_id
        AND crag.created_by = auth.uid()
        AND NOT EXISTS (SELECT 1 FROM public.images WHERE crag_id = crag.id)
        AND NOT EXISTS (SELECT 1 FROM public.climbs WHERE crag_id = crag.id)
        AND NOT EXISTS (SELECT 1 FROM public.submission_drafts WHERE crag_id = crag.id)
        AND NOT EXISTS (SELECT 1 FROM public.crag_images WHERE crag_id = crag.id)
        AND NOT EXISTS (SELECT 1 FROM public.wiki_entities WHERE crag_id = crag.id)
    )
  );

CREATE TABLE public.crag_maintainers (
  crag_id uuid NOT NULL REFERENCES public.crags(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  assigned_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (crag_id, user_id)
);

CREATE TABLE public.crag_metadata_proposals (
  id uuid PRIMARY KEY DEFAULT extensions.gen_random_uuid(),
  crag_id uuid NOT NULL REFERENCES public.crags(id) ON DELETE RESTRICT,
  proposer_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  client_mutation_id uuid NOT NULL,
  request_hash text NOT NULL CHECK (request_hash ~ '^[0-9a-f]{64}$'),
  base_revision_id uuid NOT NULL REFERENCES public.wiki_entity_revisions(id) ON DELETE RESTRICT,
  source_image_id uuid REFERENCES public.images(id) ON DELETE SET NULL,
  proposed_name text NOT NULL CHECK (char_length(btrim(proposed_name)) BETWEEN 1 AND 200),
  proposed_region_name text NOT NULL CHECK (char_length(btrim(proposed_region_name)) BETWEEN 1 AND 100),
  proposed_sub_area text CHECK (
    proposed_sub_area IS NULL
    OR (proposed_sub_area = btrim(proposed_sub_area) AND char_length(proposed_sub_area) BETWEEN 1 AND 120)
  ),
  reason text NOT NULL CHECK (
    reason = btrim(reason) AND char_length(reason) BETWEEN 10 AND 1000
  ),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'conflict')),
  reviewer_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  review_note text CHECK (review_note IS NULL OR char_length(btrim(review_note)) BETWEEN 1 AND 1000),
  reviewed_at timestamptz,
  approved_commit_id uuid REFERENCES public.wiki_revision_commits(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT crag_metadata_proposals_review_state CHECK (
    (status = 'pending' AND reviewer_id IS NULL AND reviewed_at IS NULL AND approved_commit_id IS NULL)
    OR (status IN ('rejected', 'conflict') AND reviewed_at IS NOT NULL AND approved_commit_id IS NULL)
    OR (status = 'approved' AND reviewed_at IS NOT NULL AND approved_commit_id IS NOT NULL)
  )
);

CREATE UNIQUE INDEX crag_metadata_proposals_proposer_mutation_idx
  ON public.crag_metadata_proposals (proposer_id, client_mutation_id)
  WHERE proposer_id IS NOT NULL;
CREATE INDEX crag_metadata_proposals_crag_status_created_idx
  ON public.crag_metadata_proposals (crag_id, status, created_at DESC);
CREATE UNIQUE INDEX crag_metadata_proposals_one_pending_per_user_idx
  ON public.crag_metadata_proposals (crag_id, proposer_id)
  WHERE status = 'pending' AND proposer_id IS NOT NULL;

ALTER TABLE public.crag_maintainers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.crag_metadata_proposals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users read own crag maintainer scopes" ON public.crag_maintainers
  FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.is_current_user_admin());

CREATE POLICY "Users read own or reviewable crag metadata proposals"
  ON public.crag_metadata_proposals
  FOR SELECT TO authenticated
  USING (
    proposer_id = auth.uid()
    OR public.is_current_user_admin()
    OR EXISTS (
      SELECT 1
      FROM public.crag_maintainers AS maintainer
      WHERE maintainer.crag_id = crag_metadata_proposals.crag_id
        AND maintainer.user_id = auth.uid()
    )
  );

GRANT SELECT ON public.crag_maintainers, public.crag_metadata_proposals TO authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.crag_maintainers, public.crag_metadata_proposals
  FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.set_crag_maintainer(
  p_crag_id uuid,
  p_user_id uuid,
  p_is_maintainer boolean
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_current_user_admin() THEN
    RAISE EXCEPTION 'Administrator permission required' USING ERRCODE = '42501';
  END IF;
  IF p_crag_id IS NULL OR p_user_id IS NULL OR p_is_maintainer IS NULL THEN
    RAISE EXCEPTION 'Crag, user, and assignment state are required' USING ERRCODE = '22023';
  END IF;
  PERFORM 1 FROM public.crags
  WHERE id = p_crag_id AND deleted_at IS NULL
  FOR KEY SHARE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Active crag not found' USING ERRCODE = 'P0002';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM auth.users WHERE id = p_user_id) THEN
    RAISE EXCEPTION 'User not found' USING ERRCODE = 'P0002';
  END IF;

  IF p_is_maintainer THEN
    INSERT INTO public.crag_maintainers (crag_id, user_id, assigned_by)
    VALUES (p_crag_id, p_user_id, auth.uid())
    ON CONFLICT (crag_id, user_id) DO NOTHING;
    RETURN true;
  END IF;

  DELETE FROM public.crag_maintainers
  WHERE crag_id = p_crag_id AND user_id = p_user_id;
  RETURN false;
END;
$$;

CREATE OR REPLACE FUNCTION public.propose_crag_metadata(
  p_crag_id uuid,
  p_client_mutation_id uuid,
  p_name text,
  p_region_name text,
  p_reason text,
  p_sub_area text DEFAULT NULL,
  p_source_image_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_crag public.crags%ROWTYPE;
  v_name text := btrim(p_name);
  v_region_name text := btrim(p_region_name);
  v_reason text := btrim(p_reason);
  v_sub_area text := NULLIF(btrim(COALESCE(p_sub_area, '')), '');
  v_request_hash text;
  v_entity_id uuid;
  v_base_revision_id uuid;
  v_baseline_commit_id uuid;
  v_proposal public.crag_metadata_proposals%ROWTYPE;
  v_inserted boolean := false;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
  END IF;
  IF p_crag_id IS NULL OR p_client_mutation_id IS NULL THEN
    RAISE EXCEPTION 'Crag and client mutation ID are required' USING ERRCODE = '22023';
  END IF;
  IF v_name IS NULL OR v_name = '' OR char_length(v_name) > 200 THEN
    RAISE EXCEPTION 'Crag name must contain 1 to 200 characters' USING ERRCODE = '22023';
  END IF;
  IF v_region_name IS NULL OR v_region_name = '' OR char_length(v_region_name) > 100 THEN
    RAISE EXCEPTION 'Region name must contain 1 to 100 characters' USING ERRCODE = '22023';
  END IF;
  IF v_sub_area IS NOT NULL AND char_length(v_sub_area) > 120 THEN
    RAISE EXCEPTION 'Sub-area must contain at most 120 characters' USING ERRCODE = '22023';
  END IF;
  IF v_reason IS NULL OR char_length(v_reason) NOT BETWEEN 10 AND 1000 THEN
    RAISE EXCEPTION 'Proposal reason must contain 10 to 1000 characters' USING ERRCODE = '22023';
  END IF;

  v_request_hash := encode(extensions.digest(convert_to(jsonb_build_object(
    'crag_id', p_crag_id,
    'name', v_name,
    'region_name', v_region_name,
    'reason', v_reason,
    'sub_area', v_sub_area,
    'source_image_id', p_source_image_id
  )::text, 'UTF8'), 'sha256'), 'hex');

  SELECT * INTO v_proposal
  FROM public.crag_metadata_proposals
  WHERE proposer_id = v_user_id AND client_mutation_id = p_client_mutation_id
  FOR UPDATE;
  IF FOUND THEN
    IF v_proposal.request_hash <> v_request_hash THEN
      RAISE EXCEPTION 'Client mutation ID was already used with a different proposal'
        USING ERRCODE = '22023', DETAIL = 'idempotency_conflict';
    END IF;
    RETURN jsonb_build_object(
      'proposalId', v_proposal.id,
      'status', v_proposal.status,
      'baseRevisionId', v_proposal.base_revision_id,
      'replayed', true
    );
  END IF;

  SELECT * INTO v_crag FROM public.crags
  WHERE id = p_crag_id AND deleted_at IS NULL
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Active crag not found' USING ERRCODE = 'P0002';
  END IF;
  IF v_crag.name::text = v_name
    AND COALESCE(v_crag.region_name::text, '') = v_region_name
    AND COALESCE(v_crag.sub_area::text, '') = COALESCE(v_sub_area, '') THEN
    RAISE EXCEPTION 'Proposal must change crag metadata' USING ERRCODE = '22023';
  END IF;
  IF p_source_image_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.images
    WHERE id = p_source_image_id
      AND crag_id = p_crag_id
      AND status <> 'deleted'
  ) THEN
    RAISE EXCEPTION 'Related source image is not attached to this crag' USING ERRCODE = '22023';
  END IF;
  IF EXISTS (
    SELECT 1
    FROM public.crag_metadata_proposals
    WHERE crag_id = p_crag_id
      AND proposer_id = v_user_id
      AND status = 'pending'
  ) THEN
    RAISE EXCEPTION 'You already have a pending metadata proposal for this crag'
      USING ERRCODE = '22023', DETAIL = 'pending_proposal_exists';
  END IF;

  SELECT entity.id, head.revision_id
  INTO v_entity_id, v_base_revision_id
  FROM public.wiki_entities AS entity
  JOIN public.wiki_entity_heads AS head ON head.entity_id = entity.id
  WHERE entity.crag_id = p_crag_id
  FOR UPDATE OF head;

  IF v_base_revision_id IS NULL THEN
    INSERT INTO public.wiki_revision_commits (author_kind, revision_kind, summary, metadata)
    VALUES ('system', 'baseline', 'Captured pre-proposal crag state', jsonb_build_object('crag_id', p_crag_id))
    RETURNING id INTO v_baseline_commit_id;
    v_base_revision_id := public.record_wiki_entity_revision('crag', p_crag_id, v_baseline_commit_id);
  END IF;

  INSERT INTO public.crag_metadata_proposals (
    crag_id, proposer_id, client_mutation_id, request_hash, base_revision_id,
    source_image_id, proposed_name, proposed_region_name, proposed_sub_area, reason
  ) VALUES (
    p_crag_id, v_user_id, p_client_mutation_id, v_request_hash, v_base_revision_id,
    p_source_image_id, v_name, v_region_name, v_sub_area, v_reason
  )
  ON CONFLICT (proposer_id, client_mutation_id) WHERE proposer_id IS NOT NULL DO NOTHING
  RETURNING * INTO v_proposal;

  v_inserted := v_proposal.id IS NOT NULL;

  IF v_proposal.id IS NULL THEN
    SELECT * INTO v_proposal
    FROM public.crag_metadata_proposals
    WHERE proposer_id = v_user_id AND client_mutation_id = p_client_mutation_id
    FOR UPDATE;
    IF v_proposal.request_hash <> v_request_hash THEN
      RAISE EXCEPTION 'Client mutation ID was already used with a different proposal'
        USING ERRCODE = '22023', DETAIL = 'idempotency_conflict';
    END IF;
  END IF;

  IF v_inserted THEN
    INSERT INTO public.notifications (user_id, type, title, message, link)
    SELECT recipient.user_id,
      'crag_metadata_review_requested',
      'Crag metadata review requested',
      format('Review proposed metadata changes for %s.', v_crag.name),
      format('/maintain/crags?cragId=%s&proposalId=%s', v_crag.id, v_proposal.id)
    FROM (
      SELECT maintainer.user_id
      FROM public.crag_maintainers AS maintainer
      WHERE maintainer.crag_id = v_crag.id
      UNION
      SELECT profile.id
      FROM public.profiles AS profile
      WHERE profile.is_admin = true
    ) AS recipient
    WHERE recipient.user_id <> v_user_id;
  END IF;

  RETURN jsonb_build_object(
    'proposalId', v_proposal.id,
    'status', v_proposal.status,
    'baseRevisionId', v_proposal.base_revision_id,
    'replayed', NOT v_inserted
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.review_crag_metadata_proposal(
  p_proposal_id uuid,
  p_decision text,
  p_review_note text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_reviewer_id uuid := auth.uid();
  v_decision text := lower(btrim(p_decision));
  v_review_note text := NULLIF(btrim(COALESCE(p_review_note, '')), '');
  v_proposal public.crag_metadata_proposals%ROWTYPE;
  v_crag public.crags%ROWTYPE;
  v_entity_id uuid;
  v_head_revision_id uuid;
  v_tag_id uuid;
  v_tag_slug text;
  v_commit_id uuid;
  v_revision_id uuid;
BEGIN
  IF v_reviewer_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
  END IF;
  IF p_proposal_id IS NULL OR v_decision NOT IN ('approve', 'reject') THEN
    RAISE EXCEPTION 'Proposal and approve/reject decision are required' USING ERRCODE = '22023';
  END IF;
  IF v_review_note IS NOT NULL AND char_length(v_review_note) > 1000 THEN
    RAISE EXCEPTION 'Review note must contain at most 1000 characters' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_proposal
  FROM public.crag_metadata_proposals
  WHERE id = p_proposal_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Proposal not found' USING ERRCODE = 'P0002';
  END IF;
  IF v_proposal.status <> 'pending' THEN
    RAISE EXCEPTION 'Proposal has already been reviewed' USING ERRCODE = '22023';
  END IF;
  IF v_proposal.proposer_id = v_reviewer_id THEN
    RAISE EXCEPTION 'Proposers cannot review their own proposal' USING ERRCODE = '42501';
  END IF;
  IF NOT public.is_current_user_admin() THEN
    PERFORM 1 FROM public.crag_maintainers
    WHERE crag_id = v_proposal.crag_id AND user_id = v_reviewer_id
    FOR KEY SHARE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Crag maintainer or administrator permission required' USING ERRCODE = '42501';
    END IF;
  END IF;

  IF v_decision = 'reject' THEN
    UPDATE public.crag_metadata_proposals
    SET status = 'rejected', reviewer_id = v_reviewer_id,
      review_note = v_review_note, reviewed_at = now()
    WHERE id = v_proposal.id;
    IF v_proposal.proposer_id IS NOT NULL THEN
      INSERT INTO public.notifications (user_id, type, title, message, link)
      VALUES (
        v_proposal.proposer_id,
        'crag_metadata_rejected',
        'Crag metadata proposal rejected',
        'Your proposed crag metadata changes were rejected.',
        format('/maintain/crags?cragId=%s&proposalId=%s', v_proposal.crag_id, v_proposal.id)
      );
    END IF;
    RETURN jsonb_build_object('proposalId', v_proposal.id, 'status', 'rejected');
  END IF;

  SELECT * INTO v_crag FROM public.crags
  WHERE id = v_proposal.crag_id
  FOR UPDATE;
  IF NOT FOUND OR v_crag.deleted_at IS NOT NULL THEN
    UPDATE public.crag_metadata_proposals
    SET status = 'conflict', reviewer_id = v_reviewer_id,
      review_note = COALESCE(v_review_note, 'Crag is no longer active'), reviewed_at = now()
    WHERE id = v_proposal.id;
    IF v_proposal.proposer_id IS NOT NULL THEN
      INSERT INTO public.notifications (user_id, type, title, message, link)
      VALUES (
        v_proposal.proposer_id,
        'crag_metadata_conflict',
        'Crag metadata proposal needs revision',
        'Your proposal conflicts with the current crag revision.',
        format('/maintain/crags?cragId=%s&proposalId=%s', v_proposal.crag_id, v_proposal.id)
      );
    END IF;
    RETURN jsonb_build_object('proposalId', v_proposal.id, 'status', 'conflict');
  END IF;

  SELECT entity.id, head.revision_id
  INTO v_entity_id, v_head_revision_id
  FROM public.wiki_entities AS entity
  JOIN public.wiki_entity_heads AS head ON head.entity_id = entity.id
  WHERE entity.crag_id = v_proposal.crag_id
  FOR UPDATE OF head;
  IF v_head_revision_id IS DISTINCT FROM v_proposal.base_revision_id THEN
    UPDATE public.crag_metadata_proposals
    SET status = 'conflict', reviewer_id = v_reviewer_id,
      review_note = v_review_note, reviewed_at = now()
    WHERE id = v_proposal.id;
    IF v_proposal.proposer_id IS NOT NULL THEN
      INSERT INTO public.notifications (user_id, type, title, message, link)
      VALUES (
        v_proposal.proposer_id,
        'crag_metadata_conflict',
        'Crag metadata proposal needs revision',
        'Your proposal conflicts with the current crag revision.',
        format('/maintain/crags?cragId=%s&proposalId=%s', v_proposal.crag_id, v_proposal.id)
      );
    END IF;
    RETURN jsonb_build_object(
      'proposalId', v_proposal.id,
      'status', 'conflict',
      'currentRevisionId', v_head_revision_id
    );
  END IF;

  v_tag_slug := trim(both '-' FROM regexp_replace(lower(v_proposal.proposed_region_name), '[^a-z0-9]+', '-', 'g'));
  IF v_tag_slug = '' THEN v_tag_slug := 'region'; END IF;
  SELECT id INTO v_tag_id
  FROM public.location_tags
  WHERE kind = 'region'
    AND lower(name::text) = lower(v_proposal.proposed_region_name)
    AND COALESCE(country_code::text, '') = COALESCE(upper(btrim(v_crag.country_code::text)), '')
  FOR UPDATE;
  IF v_tag_id IS NULL THEN
    BEGIN
      INSERT INTO public.location_tags (kind, name, slug, country_code)
      VALUES ('region', v_proposal.proposed_region_name, v_tag_slug,
        NULLIF(upper(btrim(v_crag.country_code::text)), ''))
      RETURNING id INTO v_tag_id;
    EXCEPTION WHEN unique_violation THEN
      v_tag_id := NULL;
    END;
    IF v_tag_id IS NULL THEN
      SELECT id INTO v_tag_id
      FROM public.location_tags
      WHERE kind = 'region'
        AND lower(name::text) = lower(v_proposal.proposed_region_name)
        AND COALESCE(country_code::text, '') = COALESCE(upper(btrim(v_crag.country_code::text)), '')
      FOR UPDATE;
    END IF;
  END IF;

  UPDATE public.crags
  SET name = v_proposal.proposed_name,
    region_name = v_proposal.proposed_region_name,
    sub_area = v_proposal.proposed_sub_area,
    updated_at = now(),
    last_edited_by = v_reviewer_id
  WHERE id = v_crag.id;
  UPDATE public.crag_location_tags
  SET is_primary_region = false
  WHERE crag_id = v_crag.id AND is_primary_region = true AND tag_id <> v_tag_id;
  INSERT INTO public.crag_location_tags (crag_id, tag_id, is_primary_region)
  VALUES (v_crag.id, v_tag_id, true)
  ON CONFLICT (crag_id, tag_id) DO UPDATE SET is_primary_region = true;

  INSERT INTO public.wiki_revision_commits (
    author_user_id, author_kind, revision_kind, summary, metadata
  ) VALUES (
    v_reviewer_id,
    CASE WHEN public.is_current_user_admin() THEN 'admin' ELSE 'user' END,
    'edit',
    'Approved crag metadata proposal',
    jsonb_build_object('proposal_id', v_proposal.id)
  ) RETURNING id INTO v_commit_id;
  v_revision_id := public.record_wiki_entity_revision('crag', v_crag.id, v_commit_id);
  IF v_revision_id IS NULL THEN
    RAISE EXCEPTION 'Approved proposal did not change canonical crag state' USING ERRCODE = '22023';
  END IF;

  UPDATE public.crag_metadata_proposals
  SET status = 'approved', reviewer_id = v_reviewer_id,
    review_note = v_review_note, reviewed_at = now(), approved_commit_id = v_commit_id
  WHERE id = v_proposal.id;

  IF v_proposal.proposer_id IS NOT NULL THEN
    INSERT INTO public.notifications (user_id, type, title, message, link)
    VALUES (
      v_proposal.proposer_id,
      'crag_metadata_approved',
      'Crag metadata proposal approved',
      'Your proposed crag metadata changes were approved.',
      format('/maintain/crags?cragId=%s&proposalId=%s', v_proposal.crag_id, v_proposal.id)
    );
  END IF;

  RETURN jsonb_build_object(
    'proposalId', v_proposal.id,
    'status', 'approved',
    'commitId', v_commit_id,
    'revisionId', v_revision_id
  );
END;
$$;

REVOKE ALL ON FUNCTION public.set_crag_maintainer(uuid, uuid, boolean),
  public.propose_crag_metadata(uuid, uuid, text, text, text, text, uuid),
  public.review_crag_metadata_proposal(uuid, text, text)
  FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.set_crag_maintainer(uuid, uuid, boolean),
  public.propose_crag_metadata(uuid, uuid, text, text, text, text, uuid),
  public.review_crag_metadata_proposal(uuid, text, text)
  TO authenticated;

REVOKE EXECUTE ON FUNCTION public.update_submission_crag_metadata(uuid, text, text, text)
  FROM PUBLIC, anon, authenticated;
