ALTER TABLE public.user_climbs
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

CREATE TABLE public.log_route_mutations (
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  mutation_id uuid NOT NULL,
  request_hash text NOT NULL,
  operation_type text NOT NULL,
  result jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  PRIMARY KEY (user_id, mutation_id)
);

CREATE INDEX log_route_mutations_created_at_idx
  ON public.log_route_mutations (user_id, created_at DESC);

ALTER TABLE public.log_route_mutations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.log_route_mutations FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.log_routes_idempotent(
  p_mutation_id uuid,
  p_climb_ids uuid[],
  p_style text,
  p_notes text,
  p_climbed_on date,
  p_created_at timestamptz
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_request_hash text;
  v_receipt public.log_route_mutations%ROWTYPE;
  v_logged integer;
  v_result jsonb;
BEGIN
  IF auth.role() <> 'authenticated' OR v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
  END IF;
  IF p_mutation_id IS NULL OR p_created_at IS NULL OR p_climb_ids IS NULL OR cardinality(p_climb_ids) = 0 THEN
    RAISE EXCEPTION 'Mutation ID, creation time, and climbs are required' USING ERRCODE = '22023';
  END IF;
  IF p_style NOT IN ('flash', 'top', 'try') THEN
    RAISE EXCEPTION 'Invalid style' USING ERRCODE = '22023';
  END IF;

  v_request_hash := encode(extensions.digest(convert_to(jsonb_build_object(
    'climbIds', p_climb_ids,
    'style', p_style,
    'notes', p_notes,
    'climbedOn', p_climbed_on
  )::text, 'UTF8'), 'sha256'), 'hex');

  INSERT INTO public.log_route_mutations (
    user_id, mutation_id, request_hash, operation_type
  ) VALUES (
    v_user_id, p_mutation_id, v_request_hash, 'LOG_CLIMB'
  ) ON CONFLICT (user_id, mutation_id) DO NOTHING;

  SELECT * INTO v_receipt
  FROM public.log_route_mutations
  WHERE user_id = v_user_id AND mutation_id = p_mutation_id
  FOR UPDATE;

  IF v_receipt.request_hash IS DISTINCT FROM v_request_hash
    OR v_receipt.operation_type IS DISTINCT FROM 'LOG_CLIMB' THEN
    RAISE EXCEPTION 'Client mutation ID was already used for a different request'
      USING ERRCODE = '22023', DETAIL = 'mutation_id_conflict';
  END IF;
  IF v_receipt.result IS NOT NULL THEN
    RETURN v_receipt.result || jsonb_build_object('replayed', true);
  END IF;

  WITH requested_climbs AS (
    SELECT DISTINCT unnest(p_climb_ids) AS climb_id
  ), changed AS (
    INSERT INTO public.user_climbs (
      user_id, climb_id, style, notes, date_climbed, created_at, updated_at
    )
    SELECT v_user_id, climb_id, p_style, NULLIF(btrim(p_notes), ''), p_climbed_on, p_created_at, p_created_at
    FROM requested_climbs
    ON CONFLICT (user_id, climb_id) DO UPDATE
      SET style = EXCLUDED.style,
          notes = EXCLUDED.notes,
          date_climbed = EXCLUDED.date_climbed,
          updated_at = EXCLUDED.updated_at
      WHERE public.user_climbs.updated_at <= EXCLUDED.updated_at
    RETURNING 1
  )
  SELECT count(*)::integer INTO v_logged FROM changed;

  v_result := jsonb_build_object('logged', v_logged, 'style', p_style);
  UPDATE public.log_route_mutations
  SET result = v_result, completed_at = now()
  WHERE user_id = v_user_id AND mutation_id = p_mutation_id;
  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.log_routes_idempotent(uuid, uuid[], text, text, date, timestamptz)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.log_routes_idempotent(uuid, uuid[], text, text, date, timestamptz)
  TO authenticated;
