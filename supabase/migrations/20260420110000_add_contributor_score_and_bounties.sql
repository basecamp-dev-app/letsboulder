ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS contributor_score_total integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS accepted_contribution_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS contributor_tier text;

ALTER TABLE public.profiles
  DROP CONSTRAINT IF EXISTS profiles_contributor_tier_check;

ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_contributor_tier_check
  CHECK (
    contributor_tier IS NULL
    OR contributor_tier IN ('new_contributor', 'contributor', 'trusted_contributor', 'local_steward')
  );

CREATE TABLE IF NOT EXISTS public.contribution_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  place_id uuid NULL REFERENCES public.places(id) ON DELETE CASCADE,
  crag_id uuid NULL REFERENCES public.crags(id) ON DELETE SET NULL,
  image_id uuid NULL REFERENCES public.images(id) ON DELETE CASCADE,
  climb_id uuid NULL REFERENCES public.climbs(id) ON DELETE CASCADE,
  event_type text NOT NULL,
  status text NOT NULL DEFAULT 'accepted',
  score_delta integer NOT NULL,
  source_table text NOT NULL,
  source_id uuid NOT NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz NULL,
  CONSTRAINT contribution_events_event_type_check CHECK (
    event_type IN ('submission_published', 'wiki_edit_accepted', 'correction_approved', 'verification_accepted', 'bounty_completed')
  ),
  CONSTRAINT contribution_events_status_check CHECK (
    status IN ('pending', 'accepted', 'rejected', 'reversed')
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_contribution_events_unique_source
  ON public.contribution_events (event_type, user_id, source_table, source_id);

CREATE INDEX IF NOT EXISTS idx_contribution_events_user_created_at
  ON public.contribution_events (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_contribution_events_place_created_at
  ON public.contribution_events (place_id, created_at DESC)
  WHERE place_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.contribution_bounties (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  bounty_type text NOT NULL,
  status text NOT NULL DEFAULT 'open',
  place_id uuid NULL REFERENCES public.places(id) ON DELETE CASCADE,
  crag_id uuid NULL REFERENCES public.crags(id) ON DELETE CASCADE,
  image_id uuid NULL REFERENCES public.images(id) ON DELETE CASCADE,
  created_by_event_id uuid NULL REFERENCES public.contribution_events(id) ON DELETE SET NULL,
  completed_by_user_id uuid NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  completed_event_id uuid NULL REFERENCES public.contribution_events(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  CONSTRAINT contribution_bounties_type_check CHECK (
    bounty_type IN ('missing_topo')
  ),
  CONSTRAINT contribution_bounties_status_check CHECK (
    status IN ('open', 'completed', 'cancelled')
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_contribution_bounties_open_image_type
  ON public.contribution_bounties (image_id, bounty_type)
  WHERE status = 'open';

CREATE TABLE IF NOT EXISTS public.user_place_contributor_scores (
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  place_id uuid NOT NULL REFERENCES public.places(id) ON DELETE CASCADE,
  contributor_score_total integer NOT NULL DEFAULT 0,
  accepted_contribution_count integer NOT NULL DEFAULT 0,
  last_contribution_at timestamptz NULL,
  PRIMARY KEY (user_id, place_id)
);

ALTER TABLE public.contribution_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.contribution_bounties ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_place_contributor_scores ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public read contribution events"
  ON public.contribution_events
  FOR SELECT
  USING (true);

CREATE POLICY "Service manage contribution events"
  ON public.contribution_events
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Public read contribution bounties"
  ON public.contribution_bounties
  FOR SELECT
  USING (true);

CREATE POLICY "Service manage contribution bounties"
  ON public.contribution_bounties
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Public read place contributor scores"
  ON public.user_place_contributor_scores
  FOR SELECT
  USING (true);

CREATE POLICY "Service manage place contributor scores"
  ON public.user_place_contributor_scores
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE OR REPLACE FUNCTION public.compute_contributor_tier(
  p_score integer,
  p_accepted_count integer
)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
AS $$
BEGIN
  IF COALESCE(p_score, 0) >= 250 AND COALESCE(p_accepted_count, 0) >= 25 THEN
    RETURN 'local_steward';
  END IF;

  IF COALESCE(p_score, 0) >= 100 AND COALESCE(p_accepted_count, 0) >= 10 THEN
    RETURN 'trusted_contributor';
  END IF;

  IF COALESCE(p_score, 0) >= 25 THEN
    RETURN 'contributor';
  END IF;

  RETURN 'new_contributor';
END;
$$;

CREATE OR REPLACE FUNCTION public.record_contribution_event(
  p_user_id uuid,
  p_event_type text,
  p_score_delta integer,
  p_source_table text,
  p_source_id uuid,
  p_place_id uuid DEFAULT NULL,
  p_crag_id uuid DEFAULT NULL,
  p_image_id uuid DEFAULT NULL,
  p_climb_id uuid DEFAULT NULL,
  p_metadata jsonb DEFAULT '{}'::jsonb,
  p_status text DEFAULT 'accepted'
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_event_id uuid;
  v_next_score integer;
  v_next_count integer;
BEGIN
  IF p_user_id IS NULL OR p_source_id IS NULL OR btrim(COALESCE(p_source_table, '')) = '' THEN
    RETURN NULL;
  END IF;

  INSERT INTO public.contribution_events (
    user_id,
    place_id,
    crag_id,
    image_id,
    climb_id,
    event_type,
    status,
    score_delta,
    source_table,
    source_id,
    metadata,
    resolved_at
  )
  VALUES (
    p_user_id,
    p_place_id,
    p_crag_id,
    p_image_id,
    p_climb_id,
    p_event_type,
    COALESCE(p_status, 'accepted'),
    p_score_delta,
    p_source_table,
    p_source_id,
    COALESCE(p_metadata, '{}'::jsonb),
    CASE WHEN COALESCE(p_status, 'accepted') = 'accepted' THEN now() ELSE NULL END
  )
  ON CONFLICT (event_type, user_id, source_table, source_id)
  DO NOTHING
  RETURNING id INTO v_event_id;

  IF v_event_id IS NULL THEN
    SELECT id
    INTO v_event_id
    FROM public.contribution_events
    WHERE event_type = p_event_type
      AND user_id = p_user_id
      AND source_table = p_source_table
      AND source_id = p_source_id
    LIMIT 1;

    RETURN v_event_id;
  END IF;

  IF COALESCE(p_status, 'accepted') <> 'accepted' THEN
    RETURN v_event_id;
  END IF;

  UPDATE public.profiles
  SET
    contributor_score_total = contributor_score_total + p_score_delta,
    accepted_contribution_count = accepted_contribution_count + 1
  WHERE id = p_user_id
  RETURNING contributor_score_total, accepted_contribution_count
  INTO v_next_score, v_next_count;

  IF v_next_score IS NOT NULL THEN
    UPDATE public.profiles
    SET contributor_tier = public.compute_contributor_tier(v_next_score, v_next_count)
    WHERE id = p_user_id;
  END IF;

  IF p_place_id IS NOT NULL THEN
    INSERT INTO public.user_place_contributor_scores (
      user_id,
      place_id,
      contributor_score_total,
      accepted_contribution_count,
      last_contribution_at
    )
    VALUES (p_user_id, p_place_id, p_score_delta, 1, now())
    ON CONFLICT (user_id, place_id)
    DO UPDATE SET
      contributor_score_total = public.user_place_contributor_scores.contributor_score_total + EXCLUDED.contributor_score_total,
      accepted_contribution_count = public.user_place_contributor_scores.accepted_contribution_count + EXCLUDED.accepted_contribution_count,
      last_contribution_at = EXCLUDED.last_contribution_at;
  END IF;

  RETURN v_event_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.open_missing_topo_bounty(
  p_image_id uuid,
  p_created_by_event_id uuid DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_image record;
  v_route_count bigint;
  v_bounty_id uuid;
BEGIN
  IF p_image_id IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT i.id, i.crag_id, c.place_id
  INTO v_image
  FROM public.images i
  LEFT JOIN public.crags c ON c.id = i.crag_id
  WHERE i.id = p_image_id
  LIMIT 1;

  IF v_image IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT COUNT(*)
  INTO v_route_count
  FROM public.route_lines
  WHERE image_id = p_image_id;

  IF COALESCE(v_route_count, 0) > 0 THEN
    RETURN NULL;
  END IF;

  INSERT INTO public.contribution_bounties (
    bounty_type,
    status,
    place_id,
    crag_id,
    image_id,
    created_by_event_id,
    metadata
  )
  VALUES (
    'missing_topo',
    'open',
    v_image.place_id,
    v_image.crag_id,
    p_image_id,
    p_created_by_event_id,
    jsonb_build_object('reason', 'image_published_without_topo')
  )
  ON CONFLICT DO NOTHING
  RETURNING id INTO v_bounty_id;

  IF v_bounty_id IS NULL THEN
    SELECT id
    INTO v_bounty_id
    FROM public.contribution_bounties
    WHERE image_id = p_image_id
      AND bounty_type = 'missing_topo'
      AND status = 'open'
    LIMIT 1;
  END IF;

  RETURN v_bounty_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.resolve_missing_topo_bounty(
  p_image_id uuid,
  p_user_id uuid,
  p_source_table text,
  p_source_id uuid,
  p_metadata jsonb DEFAULT '{}'::jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_bounty record;
  v_route_count bigint;
  v_event_id uuid;
BEGIN
  IF p_image_id IS NULL OR p_user_id IS NULL OR p_source_id IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT id, place_id, crag_id, image_id
  INTO v_bounty
  FROM public.contribution_bounties
  WHERE image_id = p_image_id
    AND bounty_type = 'missing_topo'
    AND status = 'open'
  LIMIT 1
  FOR UPDATE;

  IF v_bounty IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT COUNT(*)
  INTO v_route_count
  FROM public.route_lines rl
  INNER JOIN public.climbs c ON c.id = rl.climb_id
  WHERE rl.image_id = p_image_id
    AND rl.points IS NOT NULL
    AND c.id IS NOT NULL;

  IF COALESCE(v_route_count, 0) <= 0 THEN
    RETURN NULL;
  END IF;

  v_event_id := public.record_contribution_event(
    p_user_id,
    'bounty_completed',
    25,
    p_source_table,
    p_source_id,
    v_bounty.place_id,
    v_bounty.crag_id,
    v_bounty.image_id,
    NULL,
    COALESCE(p_metadata, '{}'::jsonb) || jsonb_build_object('bounty_type', 'missing_topo'),
    'accepted'
  );

  IF v_event_id IS NULL THEN
    RETURN NULL;
  END IF;

  UPDATE public.contribution_bounties
  SET
    status = 'completed',
    completed_by_user_id = p_user_id,
    completed_event_id = v_event_id,
    completed_at = now()
  WHERE id = v_bounty.id;

  RETURN v_event_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_place_contributor_leaderboard(
  p_place_id uuid,
  p_page integer DEFAULT 1,
  p_limit integer DEFAULT 20
)
RETURNS TABLE (
  rank bigint,
  user_id uuid,
  username text,
  avatar_url text,
  contributor_score_total integer,
  accepted_contribution_count integer,
  total_users bigint
)
LANGUAGE sql
STABLE
AS $$
  WITH leaderboard_rows AS (
    SELECT
      upcs.user_id,
      p.username,
      p.avatar_url,
      upcs.contributor_score_total,
      upcs.accepted_contribution_count,
      ROW_NUMBER() OVER (
        ORDER BY upcs.contributor_score_total DESC, upcs.accepted_contribution_count DESC, upcs.user_id ASC
      ) AS rank,
      COUNT(*) OVER () AS total_users
    FROM public.user_place_contributor_scores upcs
    INNER JOIN public.profiles p ON p.id = upcs.user_id
    WHERE upcs.place_id = p_place_id
      AND p.is_public = true
  )
  SELECT
    leaderboard_rows.rank,
    leaderboard_rows.user_id,
    leaderboard_rows.username,
    leaderboard_rows.avatar_url,
    leaderboard_rows.contributor_score_total,
    leaderboard_rows.accepted_contribution_count,
    leaderboard_rows.total_users
  FROM leaderboard_rows
  ORDER BY leaderboard_rows.rank
  LIMIT GREATEST(COALESCE(p_limit, 20), 1)
  OFFSET GREATEST(COALESCE(p_page, 1) - 1, 0) * GREATEST(COALESCE(p_limit, 20), 1);
$$;

CREATE OR REPLACE FUNCTION public.get_crag_contributor_leaderboard(
  p_crag_id uuid,
  p_page integer DEFAULT 1,
  p_limit integer DEFAULT 20
)
RETURNS TABLE (
  rank bigint,
  user_id uuid,
  username text,
  avatar_url text,
  contributor_score_total integer,
  accepted_contribution_count integer,
  total_users bigint
)
LANGUAGE sql
STABLE
AS $$
  WITH target_place AS (
    SELECT i.place_id
    FROM public.images i
    WHERE i.crag_id = p_crag_id
      AND i.place_id IS NOT NULL
    LIMIT 1
  )
  SELECT *
  FROM public.get_place_contributor_leaderboard(
    (SELECT place_id FROM target_place),
    p_page,
    p_limit
  );
$$;

GRANT SELECT ON TABLE public.contribution_events TO anon;
GRANT SELECT ON TABLE public.contribution_events TO authenticated;
GRANT ALL ON TABLE public.contribution_events TO service_role;

GRANT SELECT ON TABLE public.contribution_bounties TO anon;
GRANT SELECT ON TABLE public.contribution_bounties TO authenticated;
GRANT ALL ON TABLE public.contribution_bounties TO service_role;

GRANT SELECT ON TABLE public.user_place_contributor_scores TO anon;
GRANT SELECT ON TABLE public.user_place_contributor_scores TO authenticated;
GRANT ALL ON TABLE public.user_place_contributor_scores TO service_role;

GRANT ALL ON FUNCTION public.compute_contributor_tier(integer, integer) TO anon;
GRANT ALL ON FUNCTION public.compute_contributor_tier(integer, integer) TO authenticated;
GRANT ALL ON FUNCTION public.compute_contributor_tier(integer, integer) TO service_role;

GRANT ALL ON FUNCTION public.record_contribution_event(uuid, text, integer, text, uuid, uuid, uuid, uuid, uuid, jsonb, text) TO authenticated;
GRANT ALL ON FUNCTION public.record_contribution_event(uuid, text, integer, text, uuid, uuid, uuid, uuid, uuid, jsonb, text) TO service_role;

GRANT ALL ON FUNCTION public.open_missing_topo_bounty(uuid, uuid) TO authenticated;
GRANT ALL ON FUNCTION public.open_missing_topo_bounty(uuid, uuid) TO service_role;

GRANT ALL ON FUNCTION public.resolve_missing_topo_bounty(uuid, uuid, text, uuid, jsonb) TO authenticated;
GRANT ALL ON FUNCTION public.resolve_missing_topo_bounty(uuid, uuid, text, uuid, jsonb) TO service_role;

GRANT ALL ON FUNCTION public.get_place_contributor_leaderboard(uuid, integer, integer) TO anon;
GRANT ALL ON FUNCTION public.get_place_contributor_leaderboard(uuid, integer, integer) TO authenticated;
GRANT ALL ON FUNCTION public.get_place_contributor_leaderboard(uuid, integer, integer) TO service_role;

GRANT ALL ON FUNCTION public.get_crag_contributor_leaderboard(uuid, integer, integer) TO anon;
GRANT ALL ON FUNCTION public.get_crag_contributor_leaderboard(uuid, integer, integer) TO authenticated;
GRANT ALL ON FUNCTION public.get_crag_contributor_leaderboard(uuid, integer, integer) TO service_role;
