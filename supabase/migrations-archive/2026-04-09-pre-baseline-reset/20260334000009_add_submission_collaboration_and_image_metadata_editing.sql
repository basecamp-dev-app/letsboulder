ALTER TABLE public.images
ADD COLUMN IF NOT EXISTS last_edited_by UUID REFERENCES auth.users(id);

CREATE TABLE IF NOT EXISTS public.submission_collaborators (
  image_id UUID NOT NULL REFERENCES public.images(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'editor',
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (image_id, user_id),
  CONSTRAINT submission_collaborators_role_check CHECK (role IN ('editor'))
);

CREATE INDEX IF NOT EXISTS idx_submission_collaborators_user_id
  ON public.submission_collaborators(user_id);

CREATE TABLE IF NOT EXISTS public.submission_collaborator_invites (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  image_id UUID NOT NULL REFERENCES public.images(id) ON DELETE CASCADE,
  token UUID NOT NULL UNIQUE DEFAULT gen_random_uuid(),
  created_by UUID REFERENCES auth.users(id),
  max_uses INTEGER,
  used_count INTEGER NOT NULL DEFAULT 0,
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT submission_collaborator_invites_max_uses_check CHECK (max_uses IS NULL OR max_uses > 0),
  CONSTRAINT submission_collaborator_invites_used_count_check CHECK (used_count >= 0),
  CONSTRAINT submission_collaborator_invites_uses_window_check CHECK (max_uses IS NULL OR used_count <= max_uses)
);

CREATE INDEX IF NOT EXISTS idx_submission_collaborator_invites_image_id
  ON public.submission_collaborator_invites(image_id);

ALTER TABLE public.submission_collaborators ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.submission_collaborator_invites ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.is_submission_collaborator(
  p_image_id UUID,
  p_user_id UUID
)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $function$
  SELECT EXISTS (
    SELECT 1
    FROM public.submission_collaborators sc
    WHERE sc.image_id = p_image_id
      AND sc.user_id = p_user_id
  );
$function$;

REVOKE ALL ON FUNCTION public.is_submission_collaborator(UUID, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_submission_collaborator(UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_submission_collaborator(UUID, UUID) TO service_role;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'images'
      AND policyname = 'Collaborators read shared images'
  ) THEN
    DROP POLICY "Collaborators read shared images" ON public.images;
  END IF;

  CREATE POLICY "Collaborators read shared images"
    ON public.images
    FOR SELECT
    USING (public.is_submission_collaborator(images.id, auth.uid()));
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'submission_collaborators'
      AND policyname = 'Owner or collaborator read collaborators'
  ) THEN
    CREATE POLICY "Owner or collaborator read collaborators"
      ON public.submission_collaborators
      FOR SELECT
      USING (
        user_id = auth.uid()
        OR EXISTS (
          SELECT 1
          FROM public.images i
          WHERE i.id = submission_collaborators.image_id
            AND i.created_by = auth.uid()
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
      AND tablename = 'submission_collaborators'
      AND policyname = 'Owner add collaborators'
  ) THEN
    CREATE POLICY "Owner add collaborators"
      ON public.submission_collaborators
      FOR INSERT
      WITH CHECK (
        EXISTS (
          SELECT 1
          FROM public.images i
          WHERE i.id = submission_collaborators.image_id
            AND i.created_by = auth.uid()
        )
        AND created_by = auth.uid()
      );
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'submission_collaborators'
      AND policyname = 'Owner remove collaborators'
  ) THEN
    CREATE POLICY "Owner remove collaborators"
      ON public.submission_collaborators
      FOR DELETE
      USING (
        EXISTS (
          SELECT 1
          FROM public.images i
          WHERE i.id = submission_collaborators.image_id
            AND i.created_by = auth.uid()
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
      AND tablename = 'submission_collaborator_invites'
      AND policyname = 'Owner read invites'
  ) THEN
    CREATE POLICY "Owner read invites"
      ON public.submission_collaborator_invites
      FOR SELECT
      USING (
        EXISTS (
          SELECT 1
          FROM public.images i
          WHERE i.id = submission_collaborator_invites.image_id
            AND i.created_by = auth.uid()
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
      AND tablename = 'submission_collaborator_invites'
      AND policyname = 'Owner create invites'
  ) THEN
    CREATE POLICY "Owner create invites"
      ON public.submission_collaborator_invites
      FOR INSERT
      WITH CHECK (
        EXISTS (
          SELECT 1
          FROM public.images i
          WHERE i.id = submission_collaborator_invites.image_id
            AND i.created_by = auth.uid()
        )
        AND created_by = auth.uid()
      );
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'submission_collaborator_invites'
      AND policyname = 'Owner revoke invites'
  ) THEN
    CREATE POLICY "Owner revoke invites"
      ON public.submission_collaborator_invites
      FOR DELETE
      USING (
        EXISTS (
          SELECT 1
          FROM public.images i
          WHERE i.id = submission_collaborator_invites.image_id
            AND i.created_by = auth.uid()
        )
      );
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.claim_submission_collaborator_invite(
  p_token UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  current_user_id UUID := auth.uid();
  invite_row public.submission_collaborator_invites%ROWTYPE;
  image_owner_id UUID;
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
  FROM public.submission_collaborator_invites
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

  SELECT i.created_by
  INTO image_owner_id
  FROM public.images i
  WHERE i.id = invite_row.image_id;

  IF image_owner_id IS NULL THEN
    RAISE EXCEPTION 'Submission owner not found';
  END IF;

  IF image_owner_id = current_user_id THEN
    RETURN jsonb_build_object(
      'image_id', invite_row.image_id,
      'already_owner', true,
      'already_collaborator', false,
      'added', false
    );
  END IF;

  INSERT INTO public.submission_collaborators (image_id, user_id, role, created_by)
  VALUES (invite_row.image_id, current_user_id, 'editor', invite_row.created_by)
  ON CONFLICT (image_id, user_id) DO NOTHING;

  GET DIAGNOSTICS inserted_count = ROW_COUNT;

  IF inserted_count > 0 THEN
    UPDATE public.submission_collaborator_invites
    SET used_count = used_count + 1
    WHERE id = invite_row.id;
  END IF;

  RETURN jsonb_build_object(
    'image_id', invite_row.image_id,
    'already_owner', false,
    'already_collaborator', inserted_count = 0,
    'added', inserted_count > 0
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.claim_submission_collaborator_invite(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.claim_submission_collaborator_invite(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.claim_submission_collaborator_invite(UUID) TO service_role;

CREATE OR REPLACE FUNCTION public.update_own_submitted_routes(
  p_image_id UUID,
  p_routes JSONB
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  current_user_id UUID := auth.uid();
  route_item JSONB;
  route_id UUID;
  climb_id UUID;
  route_name TEXT;
  route_description TEXT;
  route_points JSONB;
  updated_count INTEGER := 0;
  has_access BOOLEAN := false;
BEGIN
  IF current_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  IF p_image_id IS NULL THEN
    RAISE EXCEPTION 'Image ID is required';
  END IF;

  IF p_routes IS NULL OR jsonb_typeof(p_routes) <> 'array' OR jsonb_array_length(p_routes) = 0 THEN
    RAISE EXCEPTION 'At least one route is required';
  END IF;

  SELECT true
  INTO has_access
  FROM public.images i
  WHERE i.id = p_image_id
    AND (
      i.created_by = current_user_id
      OR EXISTS (
        SELECT 1
        FROM public.submission_collaborators sc
        WHERE sc.image_id = i.id
          AND sc.user_id = current_user_id
      )
    )
  LIMIT 1;

  IF COALESCE(has_access, false) = false THEN
    RAISE EXCEPTION 'You do not have permission to edit routes for this image';
  END IF;

  FOR route_item IN
    SELECT value FROM jsonb_array_elements(p_routes)
  LOOP
    BEGIN
      route_id := (route_item->>'id')::UUID;
    EXCEPTION WHEN OTHERS THEN
      RAISE EXCEPTION 'Invalid route id provided';
    END;

    route_name := btrim(COALESCE(route_item->>'name', ''));
    route_description := NULLIF(btrim(COALESCE(route_item->>'description', '')), '');
    route_points := route_item->'points';

    IF route_name = '' THEN
      RAISE EXCEPTION 'Route name is required';
    END IF;

    IF char_length(route_name) > 200 THEN
      RAISE EXCEPTION 'Route name must be 200 characters or less';
    END IF;

    IF route_description IS NOT NULL AND char_length(route_description) > 500 THEN
      RAISE EXCEPTION 'Route description must be 500 characters or less';
    END IF;

    IF route_points IS NULL OR jsonb_typeof(route_points) <> 'array' OR jsonb_array_length(route_points) < 2 THEN
      RAISE EXCEPTION 'Route points must contain at least 2 points';
    END IF;

    IF EXISTS (
      SELECT 1
      FROM jsonb_array_elements(route_points) AS pt
      WHERE jsonb_typeof(pt->'x') <> 'number'
        OR jsonb_typeof(pt->'y') <> 'number'
        OR (pt->>'x')::double precision < 0
        OR (pt->>'x')::double precision > 1
        OR (pt->>'y')::double precision < 0
        OR (pt->>'y')::double precision > 1
    ) THEN
      RAISE EXCEPTION 'Route points must be normalized values between 0 and 1';
    END IF;

    SELECT rl.climb_id
    INTO climb_id
    FROM public.route_lines rl
    WHERE rl.id = route_id
      AND rl.image_id = p_image_id;

    IF climb_id IS NULL THEN
      RAISE EXCEPTION 'Route not found or not editable';
    END IF;

    UPDATE public.climbs
    SET
      name = route_name,
      description = route_description,
      updated_at = NOW()
    WHERE id = climb_id;

    UPDATE public.route_lines
    SET points = route_points
    WHERE id = route_id;

    updated_count := updated_count + 1;
  END LOOP;

  UPDATE public.images
  SET last_edited_by = current_user_id
  WHERE id = p_image_id;

  RETURN updated_count;
END;
$function$;

REVOKE ALL ON FUNCTION public.update_own_submitted_routes(UUID, JSONB) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.update_own_submitted_routes(UUID, JSONB) TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_own_submitted_routes(UUID, JSONB) TO service_role;

CREATE OR REPLACE FUNCTION public.update_submission_image_metadata(
  p_image_id UUID,
  p_latitude DOUBLE PRECISION,
  p_longitude DOUBLE PRECISION,
  p_face_directions TEXT[]
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  current_user_id UUID := auth.uid();
  normalized_face_directions TEXT[];
  has_access BOOLEAN := false;
BEGIN
  IF current_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  IF p_image_id IS NULL THEN
    RAISE EXCEPTION 'Image ID is required';
  END IF;

  IF p_latitude IS NOT NULL AND (p_latitude < -90 OR p_latitude > 90) THEN
    RAISE EXCEPTION 'Latitude must be between -90 and 90';
  END IF;

  IF p_longitude IS NOT NULL AND (p_longitude < -180 OR p_longitude > 180) THEN
    RAISE EXCEPTION 'Longitude must be between -180 and 180';
  END IF;

  SELECT true
  INTO has_access
  FROM public.images i
  WHERE i.id = p_image_id
    AND (
      i.created_by = current_user_id
      OR EXISTS (
        SELECT 1
        FROM public.submission_collaborators sc
        WHERE sc.image_id = i.id
          AND sc.user_id = current_user_id
      )
    )
  LIMIT 1;

  IF COALESCE(has_access, false) = false THEN
    RAISE EXCEPTION 'You do not have permission to edit this submission';
  END IF;

  IF p_face_directions IS NULL OR array_length(p_face_directions, 1) IS NULL THEN
    normalized_face_directions := NULL;
  ELSE
    IF EXISTS (
      SELECT 1
      FROM unnest(p_face_directions) AS direction
      WHERE direction IS NULL
        OR btrim(direction) = ''
        OR upper(btrim(direction)) NOT IN ('N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW')
    ) THEN
      RAISE EXCEPTION 'Invalid face direction provided';
    END IF;

    SELECT COALESCE(array_agg(direction ORDER BY min_idx), ARRAY[]::TEXT[])
    INTO normalized_face_directions
    FROM (
      SELECT upper(btrim(direction)) AS direction, MIN(ord) AS min_idx
      FROM unnest(p_face_directions) WITH ORDINALITY AS t(direction, ord)
      GROUP BY upper(btrim(direction))
    ) normalized;

    IF array_length(normalized_face_directions, 1) IS NULL THEN
      normalized_face_directions := NULL;
    END IF;
  END IF;

  UPDATE public.images
  SET
    latitude = p_latitude,
    longitude = p_longitude,
    face_directions = normalized_face_directions,
    face_direction = CASE
      WHEN normalized_face_directions IS NULL OR array_length(normalized_face_directions, 1) IS NULL THEN NULL
      ELSE normalized_face_directions[1]
    END,
    last_edited_by = current_user_id
  WHERE id = p_image_id;

  RETURN jsonb_build_object(
    'latitude', p_latitude,
    'longitude', p_longitude,
    'face_directions', COALESCE(to_jsonb(normalized_face_directions), '[]'::JSONB)
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.update_submission_image_metadata(UUID, DOUBLE PRECISION, DOUBLE PRECISION, TEXT[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.update_submission_image_metadata(UUID, DOUBLE PRECISION, DOUBLE PRECISION, TEXT[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_submission_image_metadata(UUID, DOUBLE PRECISION, DOUBLE PRECISION, TEXT[]) TO service_role;
