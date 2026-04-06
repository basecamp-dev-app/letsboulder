-- Backfill: tables and functions missing from migrations but present in prod
-- Generated from prod schema dump on 2026-04-02

-- ─────────────────────────────────────────────
-- 1. deletion_requests table
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.deletion_requests (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  scheduled_at timestamptz NOT NULL,
  cancelled_at timestamptz,
  delete_route_uploads boolean NOT NULL DEFAULT false,
  primary_reason text,
  deleted_at timestamptz,
  CONSTRAINT deletion_requests_pkey PRIMARY KEY (id),
  CONSTRAINT deletion_requests_user_id_fkey
    FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_deletion_requests_scheduled
  ON public.deletion_requests (scheduled_at)
  WHERE cancelled_at IS NULL AND deleted_at IS NULL;

ALTER TABLE public.deletion_requests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Service role manage deletion requests" ON public.deletion_requests;
CREATE POLICY "Service role manage deletion requests"
  ON public.deletion_requests TO service_role
  USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Users can create deletion requests for themselves" ON public.deletion_requests;
CREATE POLICY "Users can create deletion requests for themselves"
  ON public.deletion_requests FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can view their own deletion requests" ON public.deletion_requests;
CREATE POLICY "Users can view their own deletion requests"
  ON public.deletion_requests FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update their own deletion requests" ON public.deletion_requests;
CREATE POLICY "Users can update their own deletion requests"
  ON public.deletion_requests FOR UPDATE TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- ─────────────────────────────────────────────
-- 2. product_clicks table
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.product_clicks (
  product_id text NOT NULL,
  click_count bigint DEFAULT 0,
  updated_at timestamptz DEFAULT now(),
  CONSTRAINT product_clicks_pkey PRIMARY KEY (product_id)
);

CREATE INDEX IF NOT EXISTS idx_product_clicks_count
  ON public.product_clicks (click_count DESC);

ALTER TABLE public.product_clicks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public read product clicks" ON public.product_clicks;
CREATE POLICY "Public read product clicks"
  ON public.product_clicks FOR SELECT
  USING (true);

-- ─────────────────────────────────────────────
-- 3. get_climbs_with_consensus()
-- ─────────────────────────────────────────────
-- Conditional: only create get_climbs_with_consensus if consensus_grade column exists
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'climbs' 
    AND column_name = 'consensus_grade'
  ) THEN
    CREATE OR REPLACE FUNCTION public.get_climbs_with_consensus()
    RETURNS TABLE (
      id uuid,
      name text,
      grade text,
      consensus_grade text,
      total_votes bigint,
      grade_tied boolean,
      crag_id uuid,
      place_id uuid
    )
    LANGUAGE sql STABLE
    AS $$
      SELECT
        c.id,
        c.name,
        c.grade,
        c.consensus_grade,
        c.total_votes::bigint,
        c.grade_tied,
        c.crag_id,
        c.place_id
      FROM public.climbs c
      WHERE c.deleted_at IS NULL
        AND c.status = 'approved'
      ORDER BY c.total_votes DESC;
    $$;
  ELSE
    RAISE NOTICE 'Skipping get_climbs_with_consensus function - consensus_grade column does not exist';
  END IF;
END $$;

-- ─────────────────────────────────────────────
-- 4. add_correction_type_value(type, value)
-- ─────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.add_correction_type_value(
  p_type text,
  p_value text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Dynamically add a value to the correction_type CHECK constraint
  -- Note: This requires ALTER TABLE which acquires an AccessExclusiveLock.
  -- Use sparingly in production.
  EXECUTE format(
    'ALTER TABLE public.climb_corrections DROP CONSTRAINT IF EXISTS climb_corrections_correction_type_check'
  );
  EXECUTE format(
    'ALTER TABLE public.climb_corrections ADD CONSTRAINT climb_corrections_correction_type_check
     CHECK (correction_type::text = ANY (ARRAY[%L]::text[]))',
    p_value
  );
END;
$$;

-- ─────────────────────────────────────────────
-- 5. update_climb_consensus_safe()
-- ─────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.update_climb_consensus_safe()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_climb_id uuid;
  v_consensus text;
  v_total integer;
  v_tied boolean;
BEGIN
  IF TG_OP = 'DELETE' THEN
    v_climb_id := OLD.climb_id;
  ELSE
    v_climb_id := NEW.climb_id;
  END IF;

  -- Compute consensus grade from grade_votes
  SELECT grade, COUNT(*)::integer
  INTO v_consensus, v_total
  FROM public.grade_votes
  WHERE climb_id = v_climb_id
  GROUP BY grade
  ORDER BY COUNT(*) DESC
  LIMIT 1;

  -- Check for tie
  SELECT COUNT(*) > 1 INTO v_tied
  FROM (
    SELECT COUNT(*) as cnt
    FROM public.grade_votes
    WHERE climb_id = v_climb_id
    GROUP BY grade
    ORDER BY cnt DESC
    LIMIT 2
  ) sub
  WHERE cnt = (
    SELECT MAX(cnt)
    FROM (
      SELECT COUNT(*) as cnt
      FROM public.grade_votes
      WHERE climb_id = v_climb_id
      GROUP BY grade
    ) inner_sub
  );

  UPDATE public.climbs
  SET
    consensus_grade = v_consensus,
    total_votes = COALESCE(v_total, 0),
    grade_tied = COALESCE(v_tied, false)
  WHERE id = v_climb_id;

  RETURN NULL;
END;
$$;
