-- Keep climb identity and user history independent from perspective-specific
-- topo media. Replacements are staged in the existing draft editor and cut
-- over atomically only after every affected climb has been resolved.

ALTER TABLE public.submission_drafts
  ADD COLUMN draft_kind text NOT NULL DEFAULT 'new_submission'
    CHECK (draft_kind IN ('new_submission', 'topo_replacement'));

CREATE TABLE public.topo_replacements (
  id uuid PRIMARY KEY DEFAULT extensions.gen_random_uuid(),
  crag_id uuid NOT NULL REFERENCES public.crags(id) ON DELETE RESTRICT,
  source_image_id uuid NOT NULL REFERENCES public.images(id) ON DELETE RESTRICT,
  replacement_image_id uuid REFERENCES public.images(id) ON DELETE RESTRICT,
  draft_id uuid UNIQUE REFERENCES public.submission_drafts(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'uploading', 'relinking', 'ready', 'published', 'cancelled', 'failed')),
  reason text NOT NULL CHECK (char_length(btrim(reason)) BETWEEN 1 AND 500),
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  published_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  client_mutation_id uuid UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  published_at timestamptz,
  CONSTRAINT topo_replacements_distinct_images CHECK (
    replacement_image_id IS NULL OR replacement_image_id <> source_image_id
  )
);

CREATE UNIQUE INDEX topo_replacements_one_active_per_image
  ON public.topo_replacements (source_image_id)
  WHERE status IN ('draft', 'uploading', 'relinking', 'ready');
CREATE INDEX topo_replacements_crag_created_idx
  ON public.topo_replacements (crag_id, created_at DESC);

CREATE TABLE public.topo_replacement_routes (
  replacement_id uuid NOT NULL REFERENCES public.topo_replacements(id) ON DELETE CASCADE,
  climb_id uuid NOT NULL REFERENCES public.climbs(id) ON DELETE RESTRICT,
  draft_route_id uuid REFERENCES public.submission_draft_routes(id) ON DELETE SET NULL,
  resolution text NOT NULL DEFAULT 'pending'
    CHECK (resolution IN ('pending', 'mapped', 'not_visible')),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (replacement_id, climb_id),
  CONSTRAINT topo_replacement_routes_resolution_check CHECK (
    (resolution = 'mapped' AND draft_route_id IS NOT NULL)
    OR (resolution <> 'mapped' AND draft_route_id IS NULL)
  )
);

CREATE UNIQUE INDEX topo_replacement_routes_draft_route_idx
  ON public.topo_replacement_routes (replacement_id, draft_route_id)
  WHERE draft_route_id IS NOT NULL;

CREATE TABLE public.topo_route_line_tombstones (
  route_line_id uuid PRIMARY KEY,
  image_id uuid NOT NULL REFERENCES public.images(id) ON DELETE RESTRICT,
  climb_id uuid NOT NULL REFERENCES public.climbs(id) ON DELETE RESTRICT,
  replacement_id uuid REFERENCES public.topo_replacements(id) ON DELETE SET NULL,
  snapshot jsonb NOT NULL CHECK (jsonb_typeof(snapshot) = 'object'),
  reason text NOT NULL CHECK (char_length(btrim(reason)) BETWEEN 1 AND 500),
  deleted_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  deleted_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.topo_replacements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.topo_replacement_routes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.topo_route_line_tombstones ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.can_manage_topo_replacement(p_crag_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT auth.uid() IS NOT NULL AND (
    public.is_current_user_admin()
    OR EXISTS (
      SELECT 1 FROM public.crag_maintainers maintainer
      WHERE maintainer.crag_id = p_crag_id
        AND maintainer.user_id = auth.uid()
    )
  );
$$;

CREATE POLICY "Managers read topo replacements"
  ON public.topo_replacements FOR SELECT TO authenticated
  USING (public.can_manage_topo_replacement(crag_id));
CREATE POLICY "Managers read topo replacement routes"
  ON public.topo_replacement_routes FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.topo_replacements replacement
    WHERE replacement.id = replacement_id
      AND public.can_manage_topo_replacement(replacement.crag_id)
  ));
CREATE POLICY "Managers read topo route line tombstones"
  ON public.topo_route_line_tombstones FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.images image
    WHERE image.id = image_id
      AND public.can_manage_topo_replacement(image.crag_id)
  ));

GRANT SELECT ON public.topo_replacements, public.topo_replacement_routes,
  public.topo_route_line_tombstones TO authenticated;

CREATE OR REPLACE FUNCTION public.validate_route_line_crag_scope()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  image_crag_id uuid;
  climb_crag_id uuid;
BEGIN
  SELECT crag_id INTO image_crag_id FROM public.images WHERE id = NEW.image_id;
  SELECT crag_id INTO climb_crag_id FROM public.climbs WHERE id = NEW.climb_id;
  IF image_crag_id IS NOT NULL AND climb_crag_id IS NOT NULL
    AND image_crag_id IS DISTINCT FROM climb_crag_id THEN
    RAISE EXCEPTION 'Topo line image and climb must belong to the same crag'
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER route_lines_validate_crag_scope
BEFORE INSERT OR UPDATE OF image_id, climb_id ON public.route_lines
FOR EACH ROW EXECUTE FUNCTION public.validate_route_line_crag_scope();

CREATE OR REPLACE FUNCTION public.archive_and_delete_topo_lines(
  p_image_id uuid,
  p_reason text,
  p_replacement_id uuid DEFAULT NULL
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  deleted_count integer;
  reason text := btrim(COALESCE(p_reason, ''));
BEGIN
  IF char_length(reason) NOT BETWEEN 1 AND 500 THEN
    RAISE EXCEPTION 'Deletion reason must contain 1 to 500 characters'
      USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.topo_route_line_tombstones (
    route_line_id, image_id, climb_id, replacement_id, snapshot, reason, deleted_by
  )
  SELECT line.id, line.image_id, line.climb_id, p_replacement_id,
    jsonb_build_object(
      'id', line.id,
      'image_id', line.image_id,
      'climb_id', line.climb_id,
      'points', line.points,
      'color', line.color,
      'sequence_order', line.sequence_order,
      'image_width', line.image_width,
      'image_height', line.image_height,
      'created_at', line.created_at
    ), reason, auth.uid()
  FROM public.route_lines line
  WHERE line.image_id = p_image_id
  ON CONFLICT (route_line_id) DO NOTHING;

  DELETE FROM public.route_lines WHERE image_id = p_image_id;
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$$;

CREATE OR REPLACE FUNCTION public.archive_and_delete_climb_topo_lines(
  p_climb_id uuid,
  p_reason text
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  deleted_count integer;
  reason text := btrim(COALESCE(p_reason, ''));
BEGIN
  IF char_length(reason) NOT BETWEEN 1 AND 500 THEN
    RAISE EXCEPTION 'Deletion reason must contain 1 to 500 characters'
      USING ERRCODE = '22023';
  END IF;
  INSERT INTO public.topo_route_line_tombstones (
    route_line_id, image_id, climb_id, snapshot, reason, deleted_by
  )
  SELECT line.id, line.image_id, line.climb_id,
    jsonb_build_object(
      'id', line.id,
      'image_id', line.image_id,
      'climb_id', line.climb_id,
      'points', line.points,
      'color', line.color,
      'sequence_order', line.sequence_order,
      'image_width', line.image_width,
      'image_height', line.image_height,
      'created_at', line.created_at
    ), reason, auth.uid()
  FROM public.route_lines line
  WHERE line.climb_id = p_climb_id
  ON CONFLICT (route_line_id) DO NOTHING;

  DELETE FROM public.route_lines WHERE climb_id = p_climb_id;
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$$;

CREATE OR REPLACE FUNCTION public.start_topo_replacement(
  p_crag_id uuid,
  p_source_image_id uuid,
  p_reason text,
  p_client_mutation_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  source_image public.images%ROWTYPE;
  draft_id uuid;
  replacement_id uuid;
  existing public.topo_replacements%ROWTYPE;
  reason text := btrim(COALESCE(p_reason, ''));
  route_type text;
BEGIN
  IF NOT public.can_manage_topo_replacement(p_crag_id) THEN
    RAISE EXCEPTION 'Crag management access required' USING ERRCODE = '42501';
  END IF;
  IF char_length(reason) NOT BETWEEN 1 AND 500 THEN
    RAISE EXCEPTION 'Replacement reason must contain 1 to 500 characters'
      USING ERRCODE = '22023';
  END IF;

  SELECT * INTO source_image
  FROM public.images
  WHERE id = p_source_image_id
  FOR UPDATE;
  IF NOT FOUND OR source_image.crag_id IS DISTINCT FROM p_crag_id THEN
    RAISE EXCEPTION 'Image does not belong to this crag' USING ERRCODE = '22023';
  END IF;
  IF source_image.status = 'deleted' THEN
    RAISE EXCEPTION 'Deleted images cannot be replaced' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO existing
  FROM public.topo_replacements replacement
  WHERE replacement.source_image_id = p_source_image_id
    AND replacement.status IN ('draft', 'uploading', 'relinking', 'ready')
  ORDER BY replacement.created_at DESC
  LIMIT 1;
  IF FOUND THEN
    IF existing.created_by IS DISTINCT FROM auth.uid()
      AND NOT public.is_submission_draft_collaborator(existing.draft_id, auth.uid()) THEN
      RAISE EXCEPTION 'Another manager already has an active replacement for this topo'
        USING ERRCODE = '55000';
    END IF;
    RETURN jsonb_build_object(
      'replacement_id', existing.id,
      'draft_id', existing.draft_id,
      'status', existing.status,
      'resumed', true
    );
  END IF;

  SELECT COALESCE(min(replace(lower(climb.route_type), '_', '-')), 'boulder')
  INTO route_type
  FROM public.route_lines line
  JOIN public.climbs climb ON climb.id = line.climb_id
  WHERE line.image_id = p_source_image_id
    AND climb.deleted_at IS NULL;
  IF route_type NOT IN ('sport', 'boulder', 'trad', 'deep-water-solo') THEN
    route_type := 'boulder';
  END IF;

  INSERT INTO public.submission_drafts (
    user_id, crag_id, status, draft_kind, last_edited_by, metadata
  ) VALUES (
    auth.uid(), p_crag_id, 'draft', 'topo_replacement', auth.uid(),
    jsonb_build_object(
      'version', 2,
      'navigation', jsonb_build_object('defaultImageId', NULL),
      'images', '{}'::jsonb,
      'submission', jsonb_build_object(
        'routeType', route_type,
        'location', jsonb_build_object(
          'latitude', COALESCE(source_image.latitude, (SELECT latitude FROM public.crags WHERE id = p_crag_id)),
          'longitude', COALESCE(source_image.longitude, (SELECT longitude FROM public.crags WHERE id = p_crag_id))
        ),
        'isAnonymousSubmission', false,
        'contributionCreditPlatform', NULL,
        'contributionCreditHandle', NULL,
        'sectorId', NULL,
        'canvasSource', NULL
      )
    )
  ) RETURNING id INTO draft_id;

  INSERT INTO public.topo_replacements (
    crag_id, source_image_id, draft_id, reason, created_by, client_mutation_id
  ) VALUES (
    p_crag_id, p_source_image_id, draft_id, reason, auth.uid(), p_client_mutation_id
  ) RETURNING id INTO replacement_id;

  UPDATE public.submission_drafts
  SET metadata = metadata || jsonb_build_object('topoReplacementId', replacement_id)
  WHERE id = draft_id;

  INSERT INTO public.topo_replacement_routes (replacement_id, climb_id)
  SELECT replacement_id, line.climb_id
  FROM public.route_lines line
  JOIN public.climbs climb ON climb.id = line.climb_id
  WHERE line.image_id = p_source_image_id
    AND climb.deleted_at IS NULL
  GROUP BY line.climb_id;

  RETURN jsonb_build_object(
    'replacement_id', replacement_id,
    'draft_id', draft_id,
    'status', 'draft',
    'resumed', false
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.set_topo_replacement_route_resolution(
  p_replacement_id uuid,
  p_climb_id uuid,
  p_resolution text,
  p_draft_route_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  replacement public.topo_replacements%ROWTYPE;
BEGIN
  SELECT * INTO replacement
  FROM public.topo_replacements
  WHERE id = p_replacement_id
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Topo replacement not found' USING ERRCODE = 'P0002'; END IF;
  IF NOT public.can_manage_topo_replacement(replacement.crag_id) THEN
    RAISE EXCEPTION 'Crag management access required' USING ERRCODE = '42501';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.submission_drafts draft
    WHERE draft.id = replacement.draft_id
      AND (draft.user_id = auth.uid()
        OR public.is_submission_draft_collaborator(draft.id, auth.uid()))
  ) THEN
    RAISE EXCEPTION 'Replacement draft access required' USING ERRCODE = '42501';
  END IF;
  IF replacement.status NOT IN ('draft', 'uploading', 'relinking', 'ready') THEN
    RAISE EXCEPTION 'Topo replacement is not editable' USING ERRCODE = '22023';
  END IF;
  IF p_resolution NOT IN ('pending', 'mapped', 'not_visible') THEN
    RAISE EXCEPTION 'Invalid route resolution' USING ERRCODE = '22023';
  END IF;
  IF p_resolution = 'mapped' AND (
    p_draft_route_id IS NULL OR NOT EXISTS (
      SELECT 1 FROM public.submission_draft_routes route
      WHERE route.id = p_draft_route_id
        AND route.draft_id = replacement.draft_id
    )
  ) THEN
    RAISE EXCEPTION 'Mapped draft route does not belong to this replacement'
      USING ERRCODE = '22023';
  END IF;

  UPDATE public.topo_replacement_routes target
  SET resolution = p_resolution,
      draft_route_id = CASE WHEN p_resolution = 'mapped' THEN p_draft_route_id ELSE NULL END,
      updated_at = now()
  WHERE target.replacement_id = p_replacement_id
    AND target.climb_id = p_climb_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Replacement route target not found' USING ERRCODE = 'P0002'; END IF;

  UPDATE public.topo_replacements
  SET status = 'relinking', updated_at = now()
  WHERE id = p_replacement_id;

  RETURN jsonb_build_object(
    'replacement_id', p_replacement_id,
    'climb_id', p_climb_id,
    'resolution', p_resolution,
    'draft_route_id', CASE WHEN p_resolution = 'mapped' THEN p_draft_route_id ELSE NULL END
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.publish_topo_replacement(p_replacement_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  replacement public.topo_replacements%ROWTYPE;
  source_image public.images%ROWTYPE;
  replacement_image public.images%ROWTYPE;
  draft_image public.submission_draft_images%ROWTYPE;
  replacement_image_count integer;
  draft_route_count integer;
  mapped_route_count integer;
  removed_line_count integer;
  new_line_ids uuid[] := ARRAY[]::uuid[];
  climb_ids uuid[] := ARRAY[]::uuid[];
BEGIN
  SELECT * INTO replacement
  FROM public.topo_replacements
  WHERE id = p_replacement_id
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Topo replacement not found' USING ERRCODE = 'P0002'; END IF;
  IF NOT public.can_manage_topo_replacement(replacement.crag_id) THEN
    RAISE EXCEPTION 'Crag management access required' USING ERRCODE = '42501';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.submission_drafts draft
    WHERE draft.id = replacement.draft_id
      AND draft.user_id = auth.uid()
  ) THEN
    RAISE EXCEPTION 'Only the replacement draft owner can publish'
      USING ERRCODE = '42501';
  END IF;
  IF replacement.status = 'published' THEN
    RETURN jsonb_build_object(
      'success', true,
      'status', 'published',
      'image_id', replacement.replacement_image_id,
      'default_image_id', replacement.replacement_image_id,
      'image_ids', jsonb_build_array(replacement.replacement_image_id),
      'climb_ids', COALESCE(
        (SELECT metadata->'publishedClimbIds' FROM public.submission_drafts WHERE id = replacement.draft_id),
        '[]'::jsonb
      ),
      'route_line_ids', COALESCE(
        (SELECT metadata->'publishedRouteLineIds' FROM public.submission_drafts WHERE id = replacement.draft_id),
        '[]'::jsonb
      ),
      'published_at', replacement.published_at
    );
  END IF;
  IF replacement.status NOT IN ('draft', 'uploading', 'relinking', 'ready') THEN
    RAISE EXCEPTION 'Topo replacement cannot be published' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO source_image FROM public.images
  WHERE id = replacement.source_image_id FOR UPDATE;
  IF NOT FOUND OR source_image.status = 'deleted' THEN
    RAISE EXCEPTION 'Source topo is no longer active' USING ERRCODE = '22023';
  END IF;
  PERFORM 1 FROM public.route_lines line
  WHERE line.image_id = source_image.id
  ORDER BY line.id
  FOR UPDATE;
  IF EXISTS (
    SELECT 1
    FROM public.route_lines line
    JOIN public.climbs climb ON climb.id = line.climb_id
    WHERE line.image_id = source_image.id
      AND climb.deleted_at IS NULL
      AND NOT EXISTS (
        SELECT 1 FROM public.topo_replacement_routes target
        WHERE target.replacement_id = replacement.id
          AND target.climb_id = line.climb_id
      )
  ) OR EXISTS (
    SELECT 1
    FROM public.topo_replacement_routes target
    WHERE target.replacement_id = replacement.id
      AND NOT EXISTS (
        SELECT 1 FROM public.route_lines line
        WHERE line.image_id = source_image.id
          AND line.climb_id = target.climb_id
      )
  ) THEN
    RAISE EXCEPTION 'Source topo routes changed; restart the replacement'
      USING ERRCODE = '22023';
  END IF;

  SELECT count(*)::integer INTO replacement_image_count
  FROM public.submission_draft_images image
  WHERE image.draft_id = replacement.draft_id;
  IF replacement_image_count <> 1 THEN
    RAISE EXCEPTION 'A topo replacement requires exactly one replacement photo'
      USING ERRCODE = '22023';
  END IF;

  SELECT * INTO draft_image
  FROM public.submission_draft_images image
  WHERE image.draft_id = replacement.draft_id
  FOR UPDATE;
  IF draft_image.linked_image_id IS NULL THEN
    RAISE EXCEPTION 'Replacement photo is not linked to processed media'
      USING ERRCODE = '22023';
  END IF;

  SELECT * INTO replacement_image
  FROM public.images image
  WHERE image.id = draft_image.linked_image_id
  FOR UPDATE;
  IF NOT FOUND OR replacement_image.processing_status <> 'ready'
    OR replacement_image.moderation_status NOT IN ('approved', 'skipped') THEN
    RAISE EXCEPTION 'Replacement photo is not ready' USING ERRCODE = '22023';
  END IF;
  IF replacement_image.id = source_image.id THEN
    RAISE EXCEPTION 'Replacement photo must be different from the source topo'
      USING ERRCODE = '22023';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.submission_drafts draft
    WHERE draft.id = replacement.draft_id
      AND (draft.user_id = replacement_image.created_by
        OR public.is_submission_draft_collaborator(draft.id, replacement_image.created_by))
  ) THEN
    RAISE EXCEPTION 'Replacement photo ownership changed' USING ERRCODE = '42501';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.topo_replacement_routes target
    WHERE target.replacement_id = replacement.id
      AND target.resolution = 'pending'
  ) THEN
    RAISE EXCEPTION 'Resolve every existing route before publishing'
      USING ERRCODE = '22023';
  END IF;

  SELECT count(*)::integer INTO draft_route_count
  FROM public.submission_draft_routes route
  WHERE route.draft_id = replacement.draft_id;
  SELECT count(*)::integer INTO mapped_route_count
  FROM public.topo_replacement_routes target
  WHERE target.replacement_id = replacement.id
    AND target.resolution = 'mapped';
  IF draft_route_count <> mapped_route_count OR EXISTS (
    SELECT 1
    FROM public.submission_draft_routes route
    WHERE route.draft_id = replacement.draft_id
      AND NOT EXISTS (
        SELECT 1 FROM public.topo_replacement_routes target
        WHERE target.replacement_id = replacement.id
          AND target.draft_route_id = route.id
          AND target.resolution = 'mapped'
      )
  ) THEN
    RAISE EXCEPTION 'Every drawn line must map to exactly one existing route'
      USING ERRCODE = '22023';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.topo_replacement_routes target
    JOIN public.climbs climb ON climb.id = target.climb_id
    WHERE target.replacement_id = replacement.id
      AND (climb.deleted_at IS NOT NULL OR climb.crag_id IS DISTINCT FROM replacement.crag_id)
  ) THEN
    RAISE EXCEPTION 'Replacement routes must be active routes at the same crag'
      USING ERRCODE = '22023';
  END IF;

  UPDATE public.images
  SET crag_id = replacement.crag_id,
      status = 'approved',
      visibility = 'public'
  WHERE id = replacement_image.id;

  WITH inserted AS (
    INSERT INTO public.route_lines (
      image_id, climb_id, points, color, sequence_order, image_width, image_height
    )
    SELECT replacement_image.id, target.climb_id, route.points, 'red',
      route.sequence_order, route.image_width, route.image_height
    FROM public.topo_replacement_routes target
    JOIN public.submission_draft_routes route ON route.id = target.draft_route_id
    WHERE target.replacement_id = replacement.id
      AND target.resolution = 'mapped'
    ORDER BY route.sequence_order, route.created_at, route.id
    RETURNING id, climb_id
  )
  SELECT COALESCE(array_agg(id), ARRAY[]::uuid[]),
    COALESCE(array_agg(DISTINCT climb_id), ARRAY[]::uuid[])
  INTO new_line_ids, climb_ids
  FROM inserted;

  removed_line_count := public.archive_and_delete_topo_lines(
    source_image.id,
    left('Replaced topo: ' || replacement.reason, 500),
    replacement.id
  );

  UPDATE public.images
  SET status = 'deleted', visibility = 'private'
  WHERE id = source_image.id;

  UPDATE public.submission_drafts
  SET status = 'submitted', updated_at = now(), last_edited_by = auth.uid(),
      metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object(
        'publishedImageId', replacement_image.id,
        'allPublishedImageIds', to_jsonb(ARRAY[replacement_image.id]),
        'publishedClimbIds', to_jsonb(climb_ids),
        'publishedRouteLineIds', to_jsonb(new_line_ids),
        'publishedAt', now(),
        'topoReplacementId', replacement.id
      )
  WHERE id = replacement.draft_id;

  UPDATE public.topo_replacements
  SET replacement_image_id = replacement_image.id,
      status = 'published',
      published_by = auth.uid(),
      published_at = now(),
      updated_at = now()
  WHERE id = replacement.id
  RETURNING * INTO replacement;

  INSERT INTO public.admin_actions (user_id, action, target_id, target_type, details)
  VALUES (
    auth.uid(), 'replace_topo', source_image.id, 'image',
    jsonb_build_object(
      'reason', replacement.reason,
      'replacement_id', replacement.id,
      'replacement_image_id', replacement_image.id,
      'removed_route_lines', removed_line_count,
      'created_route_lines', cardinality(new_line_ids),
      'preserved_climb_ids', to_jsonb(climb_ids)
    )
  );

  RETURN jsonb_build_object(
    'success', true,
    'status', 'published',
    'image_id', replacement_image.id,
    'default_image_id', replacement_image.id,
    'image_ids', to_jsonb(ARRAY[replacement_image.id]),
    'climb_ids', to_jsonb(climb_ids),
    'route_line_ids', to_jsonb(new_line_ids),
    'published_at', replacement.published_at
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.cancel_topo_replacement_for_deleted_draft()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  UPDATE public.topo_replacement_routes target
  SET resolution = 'pending', draft_route_id = NULL, updated_at = now()
  FROM public.topo_replacements replacement
  WHERE replacement.draft_id = OLD.id
    AND target.replacement_id = replacement.id
    AND target.draft_route_id IS NOT NULL;
  UPDATE public.topo_replacements
  SET status = 'cancelled', draft_id = NULL, updated_at = now()
  WHERE draft_id = OLD.id
    AND status IN ('draft', 'uploading', 'relinking', 'ready');
  RETURN OLD;
END;
$$;

CREATE TRIGGER submission_drafts_cancel_topo_replacement
BEFORE DELETE ON public.submission_drafts
FOR EACH ROW EXECUTE FUNCTION public.cancel_topo_replacement_for_deleted_draft();

CREATE OR REPLACE FUNCTION public.reset_topo_mapping_for_deleted_draft_route()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  UPDATE public.topo_replacement_routes
  SET resolution = 'pending', draft_route_id = NULL, updated_at = now()
  WHERE draft_route_id = OLD.id;
  RETURN OLD;
END;
$$;

CREATE TRIGGER submission_draft_routes_reset_topo_mapping
BEFORE DELETE ON public.submission_draft_routes
FOR EACH ROW EXECUTE FUNCTION public.reset_topo_mapping_for_deleted_draft_route();

-- Images are soft-deleted in production, so the existing ON DELETE CASCADE
-- cannot remove perspective-specific geometry by itself.
CREATE OR REPLACE FUNCTION public.soft_delete_image(p_image_id uuid, p_reason text)
RETURNS public.images
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  target public.images%ROWTYPE;
  reason text := btrim(COALESCE(p_reason, ''));
  removed_line_count integer;
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_current_user_admin() THEN
    RAISE EXCEPTION 'Administrator required' USING ERRCODE = '42501';
  END IF;
  IF char_length(reason) NOT BETWEEN 1 AND 500 THEN
    RAISE EXCEPTION 'Deletion reason must contain 1 to 500 characters';
  END IF;

  SELECT * INTO target FROM public.images WHERE id = p_image_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Image not found'; END IF;
  IF target.status = 'deleted' THEN RAISE EXCEPTION 'Image is already deleted'; END IF;

  removed_line_count := public.archive_and_delete_topo_lines(target.id, reason, NULL);
  UPDATE public.images
  SET status = 'deleted', visibility = 'private'
  WHERE id = target.id
  RETURNING * INTO target;

  INSERT INTO public.admin_actions (user_id, action, target_id, target_type, details)
  VALUES (auth.uid(), 'soft_delete', target.id, 'image',
    jsonb_build_object('reason', reason, 'removed_route_lines', removed_line_count));
  RETURN target;
END;
$$;

-- Submission deletion retires the submitted media and its coordinate data,
-- but never the durable climb identities or their user logs.
CREATE OR REPLACE FUNCTION public.soft_delete_published_submission(
  p_image_ids uuid[],
  p_owner_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  expected_count integer;
  owned_count integer;
  removed_line_count integer := 0;
  image_row record;
BEGIN
  IF auth.role() <> 'service_role' THEN
    RAISE EXCEPTION 'Service role required' USING ERRCODE = '42501';
  END IF;
  SELECT count(DISTINCT id) INTO expected_count
  FROM unnest(COALESCE(p_image_ids, ARRAY[]::uuid[])) requested(id);
  IF expected_count = 0 OR p_owner_id IS NULL THEN
    RAISE EXCEPTION 'Owned submission images are required';
  END IF;

  PERFORM 1 FROM public.images image
  WHERE image.id = ANY(p_image_ids) ORDER BY image.id FOR UPDATE;
  SELECT count(*) INTO owned_count FROM public.images image
  WHERE image.id = ANY(p_image_ids) AND image.created_by = p_owner_id;
  IF owned_count <> expected_count THEN RAISE EXCEPTION 'Submission ownership changed'; END IF;

  FOR image_row IN SELECT id FROM public.images WHERE id = ANY(p_image_ids) LOOP
    removed_line_count := removed_line_count
      + public.archive_and_delete_topo_lines(image_row.id, 'Owner deleted published submission', NULL);
  END LOOP;

  UPDATE public.images SET status = 'deleted', visibility = 'private'
  WHERE id = ANY(p_image_ids);

  RETURN jsonb_build_object(
    'soft_deleted_images', expected_count,
    'deleted_route_lines', removed_line_count,
    'soft_deleted_climbs', 0
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.soft_delete_crag_image(
  p_crag_id uuid,
  p_image_id uuid,
  p_reason text,
  p_delete_routes boolean
)
RETURNS public.images
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  target public.images%ROWTYPE;
  deleted_image public.images%ROWTYPE;
  affected_climb_ids uuid[];
  climb_id uuid;
  deleted_route_count integer := 0;
  reason text := btrim(COALESCE(p_reason, ''));
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_current_user_admin() THEN
    RAISE EXCEPTION 'Administrator required' USING ERRCODE = '42501';
  END IF;
  IF char_length(reason) NOT BETWEEN 1 AND 500 THEN
    RAISE EXCEPTION 'Deletion reason must contain 1 to 500 characters'
      USING ERRCODE = '22023';
  END IF;

  SELECT * INTO target FROM public.images
  WHERE id = p_image_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Image not found' USING ERRCODE = 'P0002'; END IF;
  IF target.crag_id IS DISTINCT FROM p_crag_id THEN
    RAISE EXCEPTION 'Image does not belong to this crag' USING ERRCODE = '22023';
  END IF;
  IF target.status = 'deleted' THEN
    RAISE EXCEPTION 'Image is already deleted' USING ERRCODE = '22023';
  END IF;

  SELECT COALESCE(array_agg(DISTINCT line.climb_id), ARRAY[]::uuid[])
  INTO affected_climb_ids
  FROM public.route_lines line
  JOIN public.climbs climb ON climb.id = line.climb_id
  WHERE line.image_id = target.id
    AND climb.deleted_at IS NULL;

  deleted_image := public.soft_delete_image(target.id, reason);

  IF COALESCE(p_delete_routes, false) THEN
    FOREACH climb_id IN ARRAY affected_climb_ids LOOP
      deleted_route_count := deleted_route_count
        + public.archive_and_delete_climb_topo_lines(
            climb_id,
            left('Associated route removed with topo: ' || reason, 500)
          );
      PERFORM public.soft_delete_climb(
        climb_id,
        left('Removed with topo: ' || reason, 500),
        NULL
      );
    END LOOP;

    INSERT INTO public.admin_actions (user_id, action, target_id, target_type, details)
    VALUES (
      auth.uid(), 'delete_topo_routes', target.id, 'image',
      jsonb_build_object(
        'reason', reason,
        'climb_ids', to_jsonb(affected_climb_ids),
        'soft_deleted_climbs', cardinality(affected_climb_ids),
        'additional_removed_route_lines', deleted_route_count,
        'user_logs_preserved', true
      )
    );
  END IF;

  RETURN deleted_image;
END;
$$;

CREATE OR REPLACE FUNCTION public.soft_delete_crag_image(
  p_crag_id uuid,
  p_image_id uuid,
  p_reason text
)
RETURNS public.images
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT public.soft_delete_crag_image(p_crag_id, p_image_id, p_reason, false);
$$;

REVOKE ALL ON FUNCTION public.can_manage_topo_replacement(uuid),
  public.validate_route_line_crag_scope(),
  public.archive_and_delete_topo_lines(uuid, text, uuid),
  public.archive_and_delete_climb_topo_lines(uuid, text),
  public.cancel_topo_replacement_for_deleted_draft(),
  public.reset_topo_mapping_for_deleted_draft_route()
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.start_topo_replacement(uuid, uuid, text, uuid),
  public.set_topo_replacement_route_resolution(uuid, uuid, text, uuid),
  public.publish_topo_replacement(uuid),
  public.soft_delete_crag_image(uuid, uuid, text, boolean)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.start_topo_replacement(uuid, uuid, text, uuid),
  public.set_topo_replacement_route_resolution(uuid, uuid, text, uuid),
  public.publish_topo_replacement(uuid),
  public.soft_delete_crag_image(uuid, uuid, text, boolean)
  TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_manage_topo_replacement(uuid),
  public.start_topo_replacement(uuid, uuid, text, uuid),
  public.set_topo_replacement_route_resolution(uuid, uuid, text, uuid),
  public.publish_topo_replacement(uuid),
  public.soft_delete_crag_image(uuid, uuid, text, boolean),
  public.archive_and_delete_topo_lines(uuid, text, uuid),
  public.archive_and_delete_climb_topo_lines(uuid, text)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.can_manage_topo_replacement(uuid)
  TO authenticated;

COMMENT ON TABLE public.topo_replacements IS
  'Resumable, audited replacement of one published topo image using a staged submission draft.';
COMMENT ON TABLE public.topo_replacement_routes IS
  'Resolution of every existing climb affected by a topo replacement; mapped lines retain the original climb identity.';
COMMENT ON TABLE public.topo_route_line_tombstones IS
  'Immutable snapshots of perspective-specific route lines removed with a topo image.';
