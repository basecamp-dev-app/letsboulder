-- Serialize publication and deletion around authoritative rows, and never infer
-- publication identity from an object path.

CREATE OR REPLACE FUNCTION public.image_has_content_references(p_image_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.images i
    WHERE i.id = p_image_id
      AND (i.crag_id IS NOT NULL OR i.place_id IS NOT NULL OR i.submission_id IS NOT NULL)
  ) OR EXISTS (
    SELECT 1 FROM public.route_lines rl WHERE rl.image_id = p_image_id
  ) OR EXISTS (
    SELECT 1 FROM public.crag_images ci
    WHERE ci.linked_image_id = p_image_id OR ci.source_image_id = p_image_id
  ) OR EXISTS (
    SELECT 1
    FROM public.submission_draft_images di
    JOIN public.images target ON target.id = p_image_id
    WHERE di.linked_image_id = p_image_id
      OR (
        di.linked_image_id IS NULL
        AND (
          (target.original_bucket = di.storage_bucket AND target.original_key = di.storage_path)
          OR (target.storage_bucket = di.storage_bucket AND target.storage_path = di.storage_path)
        )
      )
  ) OR EXISTS (
    SELECT 1 FROM public.images child WHERE child.parent_image_id = p_image_id
  ) OR EXISTS (
    SELECT 1 FROM public.climb_flags cf WHERE cf.image_id = p_image_id
  ) OR EXISTS (
    SELECT 1 FROM public.submission_collaborators sc WHERE sc.image_id = p_image_id
  ) OR EXISTS (
    SELECT 1 FROM public.submission_collaborator_invites sci WHERE sci.image_id = p_image_id
  ) OR EXISTS (
    SELECT 1 FROM public.submission_contributors sc WHERE sc.image_id = p_image_id
  ) OR EXISTS (
    SELECT 1 FROM public.submission_edit_history seh WHERE seh.image_id = p_image_id
  ) OR EXISTS (
    SELECT 1 FROM public.contribution_events ce WHERE ce.image_id = p_image_id
  ) OR EXISTS (
    SELECT 1 FROM public.contribution_bounties cb WHERE cb.image_id = p_image_id
  ) OR EXISTS (
    SELECT 1 FROM public.comments c
    WHERE c.target_type = 'image' AND c.target_id = p_image_id
  );
$$;

REVOKE ALL ON FUNCTION public.image_has_content_references(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.image_has_content_references(uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.assert_media_ready_for_publication(p_image_ids uuid[])
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  image_id uuid;
  expected_count integer;
  ready_count integer;
BEGIN
  SELECT count(DISTINCT id)
  INTO expected_count
  FROM unnest(COALESCE(p_image_ids, ARRAY[]::uuid[])) AS ids(id);

  IF expected_count = 0 THEN
    RAISE EXCEPTION USING
      MESSAGE = 'Some photos are still being prepared or reviewed.',
      DETAIL = 'media_not_ready';
  END IF;

  FOR image_id IN
    SELECT DISTINCT ids.id
    FROM unnest(p_image_ids) AS ids(id)
    ORDER BY ids.id
  LOOP
    PERFORM 1 FROM public.images i WHERE i.id = image_id FOR UPDATE;
  END LOOP;

  SELECT count(*)
  INTO ready_count
  FROM public.images i
  WHERE i.id = ANY(p_image_ids)
    AND i.processing_status = 'ready'
    AND i.moderation_status IN ('approved', 'skipped')
    AND i.visibility = 'public'
    AND i.status = 'approved';

  IF ready_count <> expected_count THEN
    RAISE EXCEPTION USING
      MESSAGE = 'Some photos are still being prepared or reviewed.',
      DETAIL = 'media_not_ready';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.assert_media_ready_for_publication(uuid[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.assert_media_ready_for_publication(uuid[]) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.sync_crag_to_place()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  resolved_primary text;
BEGIN
  IF TG_OP = 'DELETE' THEN
    DELETE FROM public.places WHERE id = OLD.id AND type = 'crag';
    RETURN OLD;
  END IF;

  IF pg_trigger_depth() > 1 THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'UPDATE' AND NEW.synced_at IS DISTINCT FROM OLD.synced_at THEN
    RETURN NEW;
  END IF;

  resolved_primary := CASE
    WHEN NEW.type IN ('boulder', 'sport', 'trad', 'deep_water_solo', 'mixed', 'top_rope') THEN NEW.type
    WHEN NEW.type = 'crag' THEN 'mixed'
    ELSE 'boulder'
  END;

  INSERT INTO public.places (
    id, type, name, latitude, longitude, region_id, description, access_notes,
    rock_type, region_name, country, country_code, tide_dependency,
    report_count, is_flagged, slug, primary_discipline, disciplines,
    created_at, updated_at, synced_at
  ) VALUES (
    NEW.id, 'crag', NEW.name, NEW.latitude, NEW.longitude, NEW.region_id,
    NEW.description, NEW.access_notes, NEW.rock_type, NEW.region_name,
    NEW.country, NEW.country_code, NEW.tide_dependency,
    COALESCE(NEW.report_count, 0), COALESCE(NEW.is_flagged, false), NEW.slug,
    resolved_primary, ARRAY[resolved_primary]::text[],
    COALESCE(NEW.created_at, now()), COALESCE(NEW.updated_at, now()), now()
  )
  ON CONFLICT (id) DO UPDATE SET
    type = 'crag', name = EXCLUDED.name, latitude = EXCLUDED.latitude,
    longitude = EXCLUDED.longitude, region_id = EXCLUDED.region_id,
    description = EXCLUDED.description, access_notes = EXCLUDED.access_notes,
    rock_type = EXCLUDED.rock_type, region_name = EXCLUDED.region_name,
    country = EXCLUDED.country, country_code = EXCLUDED.country_code,
    tide_dependency = EXCLUDED.tide_dependency,
    report_count = EXCLUDED.report_count, is_flagged = EXCLUDED.is_flagged,
    slug = EXCLUDED.slug, primary_discipline = EXCLUDED.primary_discipline,
    disciplines = EXCLUDED.disciplines, updated_at = now(), synced_at = now();
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.sync_place_to_crag()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  -- A place is the paired projection. Removing the projection must not remove
  -- its source crag.
  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  IF pg_trigger_depth() > 1 THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'UPDATE' AND NEW.synced_at IS DISTINCT FROM OLD.synced_at THEN
    RETURN NEW;
  END IF;

  IF NEW.type = 'crag' THEN
    INSERT INTO public.crags (
      id, name, latitude, longitude, region_id, description, access_notes,
      rock_type, type, created_at, updated_at, report_count, is_flagged,
      region_name, country, tide_dependency, country_code, slug, synced_at
    ) VALUES (
      NEW.id, NEW.name, NEW.latitude, NEW.longitude, NEW.region_id,
      NEW.description, NEW.access_notes, NEW.rock_type,
      COALESCE(NEW.primary_discipline, 'boulder'),
      COALESCE(NEW.created_at, now()), COALESCE(NEW.updated_at, now()),
      COALESCE(NEW.report_count, 0), COALESCE(NEW.is_flagged, false),
      NEW.region_name, NEW.country, NEW.tide_dependency, NEW.country_code,
      NEW.slug, now()
    )
    ON CONFLICT (id) DO UPDATE SET
      name = EXCLUDED.name, latitude = EXCLUDED.latitude,
      longitude = EXCLUDED.longitude, region_id = EXCLUDED.region_id,
      description = EXCLUDED.description, access_notes = EXCLUDED.access_notes,
      rock_type = EXCLUDED.rock_type, type = EXCLUDED.type, updated_at = now(),
      report_count = EXCLUDED.report_count, is_flagged = EXCLUDED.is_flagged,
      region_name = EXCLUDED.region_name, country = EXCLUDED.country,
      tide_dependency = EXCLUDED.tide_dependency,
      country_code = EXCLUDED.country_code, slug = EXCLUDED.slug,
      synced_at = now();
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.delete_empty_crag(
  target_crag_id uuid,
  grace_period interval DEFAULT interval '1 hour'
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  crag_row public.crags%ROWTYPE;
  deleted_count integer;
BEGIN
  IF target_crag_id IS NULL OR grace_period IS NULL OR grace_period < interval '0 seconds' THEN
    RETURN false;
  END IF;

  SELECT * INTO crag_row
  FROM public.crags c
  WHERE c.id = target_crag_id
  FOR UPDATE;
  IF NOT FOUND OR crag_row.created_at >= now() - grace_period THEN
    RETURN false;
  END IF;

  -- Lock the paired row after the source row so place-side inserts cannot race
  -- the final emptiness decision.
  PERFORM 1 FROM public.places p
  WHERE p.id = target_crag_id AND p.type = 'crag'
  FOR UPDATE;

  -- Comments are polymorphic and have no foreign key to acquire a key-share
  -- lock. Block inserts until the final target check and delete complete.
  LOCK TABLE public.comments IN SHARE ROW EXCLUSIVE MODE;

  IF EXISTS (SELECT 1 FROM public.images i WHERE i.crag_id = target_crag_id)
    OR EXISTS (SELECT 1 FROM public.climbs cl WHERE cl.crag_id = target_crag_id)
    OR EXISTS (SELECT 1 FROM public.submission_drafts sd WHERE sd.crag_id = target_crag_id)
    OR EXISTS (SELECT 1 FROM public.crag_images ci WHERE ci.crag_id = target_crag_id)
    OR EXISTS (SELECT 1 FROM public.sectors s WHERE s.crag_id = target_crag_id)
    OR EXISTS (SELECT 1 FROM public.crag_reports cr WHERE cr.crag_id = target_crag_id)
    OR EXISTS (SELECT 1 FROM public.climb_flags cf WHERE cf.crag_id = target_crag_id)
    OR EXISTS (SELECT 1 FROM public.crag_location_tags clt WHERE clt.crag_id = target_crag_id)
    OR EXISTS (SELECT 1 FROM public.saved_crags sc WHERE sc.crag_id = target_crag_id)
    OR EXISTS (SELECT 1 FROM public.contribution_events ce WHERE ce.crag_id = target_crag_id)
    OR EXISTS (SELECT 1 FROM public.contribution_bounties cb WHERE cb.crag_id = target_crag_id)
    OR EXISTS (
      SELECT 1 FROM public.comments co
      WHERE co.target_type = 'crag' AND co.target_id = target_crag_id
    )
    OR EXISTS (SELECT 1 FROM public.climbs cl WHERE cl.place_id = target_crag_id)
    OR EXISTS (SELECT 1 FROM public.images i WHERE i.place_id = target_crag_id)
    OR EXISTS (SELECT 1 FROM public.community_place_follows cpf WHERE cpf.place_id = target_crag_id)
    OR EXISTS (SELECT 1 FROM public.community_posts cp WHERE cp.place_id = target_crag_id)
    OR EXISTS (SELECT 1 FROM public.gym_floor_plans gfp WHERE gfp.gym_place_id = target_crag_id)
    OR EXISTS (SELECT 1 FROM public.gym_memberships gm WHERE gm.gym_place_id = target_crag_id)
    OR EXISTS (SELECT 1 FROM public.gym_routes gr WHERE gr.gym_place_id = target_crag_id)
    OR EXISTS (SELECT 1 FROM public.contribution_events ce WHERE ce.place_id = target_crag_id)
    OR EXISTS (SELECT 1 FROM public.contribution_bounties cb WHERE cb.place_id = target_crag_id)
    OR EXISTS (
      SELECT 1 FROM public.user_place_contributor_scores upcs
      WHERE upcs.place_id = target_crag_id
    ) THEN
    RETURN false;
  END IF;

  DELETE FROM public.crags c
  WHERE c.id = target_crag_id
    AND c.created_at < now() - grace_period
    AND NOT EXISTS (SELECT 1 FROM public.images i WHERE i.crag_id = c.id)
    AND NOT EXISTS (SELECT 1 FROM public.climbs cl WHERE cl.crag_id = c.id)
    AND NOT EXISTS (SELECT 1 FROM public.submission_drafts sd WHERE sd.crag_id = c.id)
    AND NOT EXISTS (SELECT 1 FROM public.crag_images ci WHERE ci.crag_id = c.id)
    AND NOT EXISTS (SELECT 1 FROM public.sectors s WHERE s.crag_id = c.id)
    AND NOT EXISTS (SELECT 1 FROM public.crag_reports cr WHERE cr.crag_id = c.id)
    AND NOT EXISTS (SELECT 1 FROM public.climb_flags cf WHERE cf.crag_id = c.id)
    AND NOT EXISTS (SELECT 1 FROM public.crag_location_tags clt WHERE clt.crag_id = c.id)
    AND NOT EXISTS (SELECT 1 FROM public.saved_crags sc WHERE sc.crag_id = c.id)
    AND NOT EXISTS (SELECT 1 FROM public.contribution_events ce WHERE ce.crag_id = c.id)
    AND NOT EXISTS (SELECT 1 FROM public.contribution_bounties cb WHERE cb.crag_id = c.id)
    AND NOT EXISTS (
      SELECT 1 FROM public.comments co
      WHERE co.target_type = 'crag' AND co.target_id = c.id
    )
    AND NOT EXISTS (SELECT 1 FROM public.climbs cl WHERE cl.place_id = c.id)
    AND NOT EXISTS (SELECT 1 FROM public.images i WHERE i.place_id = c.id)
    AND NOT EXISTS (SELECT 1 FROM public.community_place_follows cpf WHERE cpf.place_id = c.id)
    AND NOT EXISTS (SELECT 1 FROM public.community_posts cp WHERE cp.place_id = c.id)
    AND NOT EXISTS (SELECT 1 FROM public.gym_floor_plans gfp WHERE gfp.gym_place_id = c.id)
    AND NOT EXISTS (SELECT 1 FROM public.gym_memberships gm WHERE gm.gym_place_id = c.id)
    AND NOT EXISTS (SELECT 1 FROM public.gym_routes gr WHERE gr.gym_place_id = c.id)
    AND NOT EXISTS (SELECT 1 FROM public.contribution_events ce WHERE ce.place_id = c.id)
    AND NOT EXISTS (SELECT 1 FROM public.contribution_bounties cb WHERE cb.place_id = c.id)
    AND NOT EXISTS (SELECT 1 FROM public.user_place_contributor_scores upcs WHERE upcs.place_id = c.id);

  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  IF deleted_count = 1 THEN
    -- The AFTER DELETE trigger normally removes this projection. Keep the
    -- explicit cleanup for nested-trigger calls where recursion is guarded.
    DELETE FROM public.places WHERE id = target_crag_id AND type = 'crag';
    RETURN true;
  END IF;
  RETURN false;
END;
$$;

REVOKE ALL ON FUNCTION public.sync_crag_to_place() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.sync_place_to_crag() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.sync_crag_to_place() TO service_role;
GRANT EXECUTE ON FUNCTION public.sync_place_to_crag() TO service_role;

CREATE OR REPLACE FUNCTION public.delete_empty_crags(
  grace_period interval DEFAULT interval '1 hour'
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  candidate_id uuid;
  deleted_count integer := 0;
BEGIN
  IF grace_period IS NULL OR grace_period < interval '0 seconds' THEN
    RETURN 0;
  END IF;

  FOR candidate_id IN
    SELECT c.id
    FROM public.crags c
    WHERE c.created_at < now() - grace_period
    ORDER BY c.id
  LOOP
    IF public.delete_empty_crag(candidate_id, grace_period) THEN
      deleted_count := deleted_count + 1;
    END IF;
  END LOOP;
  RETURN deleted_count;
END;
$$;

REVOKE ALL ON FUNCTION public.delete_empty_crag(uuid, interval) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.delete_empty_crags(interval) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.delete_empty_crag(uuid, interval) TO service_role;
GRANT EXECUTE ON FUNCTION public.delete_empty_crags(interval) TO service_role;

CREATE OR REPLACE FUNCTION public.images_recompute_crag_location_trigger()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    PERFORM public.recompute_crag_location(NEW.crag_id);
    RETURN NEW;
  END IF;
  IF TG_OP = 'UPDATE' THEN
    IF NEW.crag_id IS DISTINCT FROM OLD.crag_id THEN
      PERFORM public.recompute_crag_location(OLD.crag_id);
      PERFORM public.recompute_crag_location(NEW.crag_id);
      PERFORM public.delete_empty_crag(OLD.crag_id, interval '1 hour');
    ELSIF NEW.latitude IS DISTINCT FROM OLD.latitude
       OR NEW.longitude IS DISTINCT FROM OLD.longitude THEN
      PERFORM public.recompute_crag_location(NEW.crag_id);
    END IF;
    RETURN NEW;
  END IF;
  PERFORM public.recompute_crag_location(OLD.crag_id);
  PERFORM public.delete_empty_crag(OLD.crag_id, interval '1 hour');
  RETURN OLD;
END;
$$;

REVOKE ALL ON FUNCTION public.images_recompute_crag_location_trigger() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.images_recompute_crag_location_trigger() TO service_role;

CREATE OR REPLACE FUNCTION public.promote_draft_to_submission(p_draft_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  draft_row public.submission_drafts%ROWTYPE;
  image_row public.submission_draft_images%ROWTYPE;
  authoritative_row public.images%ROWTYPE;
  route_row public.submission_draft_routes%ROWTYPE;
  crag_row public.crags%ROWTYPE;
  metadata_version integer := 1;
  current_user_id uuid := auth.uid();
  default_draft_image_id uuid;
  default_live_image_id uuid;
  current_live_image_id uuid;
  current_crag_image_id uuid;
  route_name text;
  route_description text;
  route_grade text;
  route_type_default text := 'sport';
  route_type_normalized text;
  route_slug text;
  base_route_slug text;
  created_climb_id uuid;
  created_route_line_id uuid;
  all_live_image_ids uuid[] := ARRAY[]::uuid[];
  all_climb_ids uuid[] := ARRAY[]::uuid[];
  all_route_line_ids uuid[] := ARRAY[]::uuid[];
  orientation_json jsonb := '[]'::jsonb;
  orientation_text text[] := ARRAY[]::text[];
  anonymous_submission boolean := false;
  image_id_map jsonb := '{}'::jsonb;
  created_submission_id uuid := gen_random_uuid();
  image_location_mode text := 'custom';
  image_latitude double precision;
  image_longitude double precision;
  published_at timestamptz := now();
  affected_count integer;
BEGIN
  SELECT * INTO draft_row
  FROM public.submission_drafts
  WHERE id = p_draft_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING MESSAGE = 'Draft not found', DETAIL = 'not_found';
  END IF;
  IF current_user_id IS NULL OR current_user_id IS DISTINCT FROM draft_row.user_id THEN
    RAISE EXCEPTION USING MESSAGE = 'Permission denied', DETAIL = 'permission_denied';
  END IF;

  IF draft_row.status = 'submitted'
    AND draft_row.metadata ? 'publishedImageId'
    AND draft_row.metadata ? 'publishedAt'
    AND draft_row.metadata ? 'publishedClimbIds'
    AND draft_row.metadata ? 'publishedRouteLineIds'
    AND draft_row.metadata ? 'allPublishedImageIds'
    AND draft_row.metadata ? 'submissionId' THEN
    RETURN jsonb_build_object(
      'success', true, 'status', 'submitted', 'draft_id', draft_row.id,
      'image_id', draft_row.metadata->'publishedImageId',
      'default_image_id', draft_row.metadata->'publishedImageId',
      'image_ids', draft_row.metadata->'allPublishedImageIds',
      'climb_ids', draft_row.metadata->'publishedClimbIds',
      'route_line_ids', draft_row.metadata->'publishedRouteLineIds',
      'published_at', draft_row.metadata->'publishedAt',
      'submission_id', draft_row.metadata->'submissionId'
    );
  END IF;
  IF draft_row.status IS DISTINCT FROM 'draft' THEN
    RAISE EXCEPTION USING MESSAGE = 'Draft is not editable', DETAIL = 'draft_not_editable';
  END IF;
  IF draft_row.crag_id IS NULL THEN
    RAISE EXCEPTION 'Draft crag is required before publishing';
  END IF;

  -- Draft attachments are locked before authoritative images. This same order
  -- is used by both deletion RPCs below.
  FOR image_row IN
    SELECT * FROM public.submission_draft_images di
    WHERE di.draft_id = draft_row.id
    ORDER BY di.id
    FOR UPDATE
  LOOP
    IF image_row.linked_image_id IS NULL THEN
      RAISE EXCEPTION USING
        MESSAGE = 'A draft photo is missing its upload record.',
        DETAIL = 'media_not_ready';
    END IF;
  END LOOP;

  IF (
    SELECT count(*) <> count(DISTINCT di.linked_image_id)
    FROM public.submission_draft_images di
    WHERE di.draft_id = draft_row.id
  ) THEN
    RAISE EXCEPTION USING
      MESSAGE = 'Each draft photo must use a distinct upload record.',
      DETAIL = 'media_not_ready';
  END IF;

  PERFORM 1
  FROM public.submission_draft_routes dr
  WHERE dr.draft_id = draft_row.id
  ORDER BY dr.id
  FOR UPDATE;

  FOR current_live_image_id IN
    SELECT DISTINCT di.linked_image_id
    FROM public.submission_draft_images di
    WHERE di.draft_id = draft_row.id
    ORDER BY di.linked_image_id
  LOOP
    PERFORM 1 FROM public.images i
    WHERE i.id = current_live_image_id
    FOR UPDATE;
  END LOOP;

  IF EXISTS (
    SELECT 1
    FROM public.submission_draft_images di
    LEFT JOIN public.images i ON i.id = di.linked_image_id
    WHERE di.draft_id = draft_row.id
      AND (
        i.id IS NULL
        OR NOT (
          i.created_by = draft_row.user_id
          OR EXISTS (
            SELECT 1
            FROM public.submission_draft_collaborators collaborator
            WHERE collaborator.draft_id = draft_row.id
              AND collaborator.user_id = i.created_by
          )
        )
        OR NOT (
          (i.original_bucket = di.storage_bucket AND i.original_key = di.storage_path)
          OR (i.storage_bucket = di.storage_bucket AND i.storage_path = di.storage_path)
        )
      )
  ) THEN
    RAISE EXCEPTION USING
      MESSAGE = 'A draft photo does not match its upload record.',
      DETAIL = 'media_not_ready';
  END IF;

  PERFORM public.assert_media_ready_for_publication(ARRAY(
    SELECT DISTINCT di.linked_image_id
    FROM public.submission_draft_images di
    WHERE di.draft_id = draft_row.id
    ORDER BY di.linked_image_id
  ));

  SELECT * INTO crag_row
  FROM public.crags c
  WHERE c.id = draft_row.crag_id
  FOR UPDATE;
  IF NOT FOUND OR btrim(COALESCE(crag_row.slug, '')) = ''
    OR btrim(COALESCE(crag_row.country_code, '')) = '' THEN
    RAISE EXCEPTION 'Draft crag must have a slug and country code before publishing';
  END IF;

  IF jsonb_typeof(COALESCE(draft_row.metadata, '{}'::jsonb)) = 'object' THEN
    metadata_version := COALESCE((draft_row.metadata->>'version')::integer, 1);
    anonymous_submission := COALESCE((draft_row.metadata->'submission'->>'isAnonymousSubmission')::boolean, false);
    default_draft_image_id := NULLIF(draft_row.metadata->'navigation'->>'defaultImageId', '')::uuid;
    route_type_default := COALESCE(NULLIF(btrim(draft_row.metadata->'submission'->>'routeType'), ''), 'sport');
  END IF;
  IF default_draft_image_id IS NULL THEN
    SELECT id INTO default_draft_image_id
    FROM public.submission_draft_images
    WHERE draft_id = draft_row.id
    ORDER BY display_order, id
    LIMIT 1;
  END IF;
  IF default_draft_image_id IS NULL THEN
    RAISE EXCEPTION 'Draft requires at least one image before publishing';
  END IF;

  FOR image_row IN
    SELECT * FROM public.submission_draft_images di
    WHERE di.draft_id = draft_row.id
    ORDER BY di.display_order, di.id
  LOOP
    IF metadata_version >= 2 THEN
      orientation_json := COALESCE(draft_row.metadata->'images'->(image_row.id::text)->'orientation', '[]'::jsonb);
      image_location_mode := COALESCE(
        NULLIF(btrim(draft_row.metadata->'images'->(image_row.id::text)->>'locationMode'), ''),
        CASE WHEN image_row.latitude IS NOT NULL AND image_row.longitude IS NOT NULL THEN 'custom' ELSE 'shared' END
      );
      IF image_location_mode NOT IN ('shared', 'custom') THEN
        image_location_mode := CASE WHEN image_row.latitude IS NOT NULL AND image_row.longitude IS NOT NULL THEN 'custom' ELSE 'shared' END;
      END IF;
      IF image_location_mode = 'shared' THEN
        image_latitude := NULL;
        image_longitude := NULL;
      ELSE
        image_latitude := image_row.latitude;
        image_longitude := image_row.longitude;
      END IF;
    ELSE
      orientation_json := COALESCE(
        draft_row.metadata->'faceDirectionsByImage'->(image_row.display_order::text),
        draft_row.metadata->'faceDirections', '[]'::jsonb
      );
      image_location_mode := CASE WHEN image_row.latitude IS NOT NULL AND image_row.longitude IS NOT NULL THEN 'custom' ELSE 'shared' END;
      image_latitude := image_row.latitude;
      image_longitude := image_row.longitude;
    END IF;
    orientation_text := ARRAY(
      SELECT jsonb_array_elements_text(
        CASE WHEN jsonb_typeof(orientation_json) = 'array' THEN orientation_json ELSE '[]'::jsonb END
      )
    );

    SELECT * INTO authoritative_row FROM public.images WHERE id = image_row.linked_image_id;
    current_live_image_id := authoritative_row.id;
    UPDATE public.images SET
      crag_id = draft_row.crag_id,
      place_id = draft_row.crag_id,
      submission_id = created_submission_id,
      latitude = image_latitude,
      longitude = image_longitude,
      capture_date = image_row.capture_date,
      width = COALESCE(image_row.width, public.images.width),
      height = COALESCE(image_row.height, public.images.height),
      natural_width = COALESCE(image_row.width, public.images.natural_width),
      natural_height = COALESCE(image_row.height, public.images.natural_height),
      face_direction = CASE WHEN cardinality(orientation_text) = 0 THEN NULL ELSE orientation_text[1] END,
      face_directions = COALESCE(orientation_text, ARRAY[]::text[]),
      is_primary = image_row.id = default_draft_image_id,
      is_anonymous_submission = anonymous_submission,
      face_order = image_row.display_order,
      location_mode = image_location_mode
    WHERE id = current_live_image_id;

    INSERT INTO public.crag_images (
      crag_id, url, width, height, source_image_id, linked_image_id,
      face_directions, latitude, longitude
    ) VALUES (
      draft_row.crag_id, authoritative_row.url,
      COALESCE(image_row.width, authoritative_row.width),
      COALESCE(image_row.height, authoritative_row.height),
      NULL, current_live_image_id, COALESCE(orientation_text, ARRAY[]::text[]),
      image_latitude, image_longitude
    ) RETURNING id INTO current_crag_image_id;

    IF image_row.id = default_draft_image_id THEN
      default_live_image_id := current_live_image_id;
    END IF;
    all_live_image_ids := array_append(all_live_image_ids, current_live_image_id);
    image_id_map := image_id_map || jsonb_build_object(image_row.id::text, current_live_image_id::text);
    UPDATE public.submission_draft_images SET
      linked_crag_image_id = current_crag_image_id,
      submitted_at = published_at,
      updated_at = published_at
    WHERE id = image_row.id;
  END LOOP;

  IF default_live_image_id IS NULL THEN
    RAISE EXCEPTION 'Default live image mapping is missing';
  END IF;

  FOR route_row IN
    SELECT * FROM public.submission_draft_routes dr
    WHERE dr.draft_id = draft_row.id
    ORDER BY dr.draft_image_id, dr.sequence_order, dr.created_at, dr.id
  LOOP
    current_live_image_id := NULLIF(COALESCE(image_id_map->>route_row.draft_image_id::text, ''), '')::uuid;
    IF current_live_image_id IS NULL THEN
      CONTINUE;
    END IF;
    route_name := COALESCE(NULLIF(btrim(route_row.name), ''), 'Unnamed');
    route_grade := COALESCE(NULLIF(btrim(route_row.grade), ''), '6A');
    route_description := NULLIF(btrim(COALESCE(route_row.description, '')), '');
    route_type_normalized := replace(lower(COALESCE(NULLIF(btrim(route_row.climb_type), ''), route_type_default)), '_', '-');
    base_route_slug := COALESCE(NULLIF(public.slugify(route_name), 'unnamed'), 'route');
    route_slug := base_route_slug;
    WHILE EXISTS (SELECT 1 FROM public.climbs WHERE crag_id = draft_row.crag_id AND slug = route_slug) LOOP
      route_slug := base_route_slug || '-' || substring(replace(gen_random_uuid()::text, '-', ''), 1, 6);
    END LOOP;
    created_climb_id := gen_random_uuid();
    INSERT INTO public.climbs (id, name, grade, status, route_type, description, user_id, crag_id, place_id, slug)
    VALUES (created_climb_id, route_name, route_grade, 'approved', route_type_normalized,
      route_description, current_user_id, draft_row.crag_id, draft_row.crag_id, route_slug);
    INSERT INTO public.route_lines (image_id, climb_id, points, color, sequence_order, image_width, image_height)
    VALUES (current_live_image_id, created_climb_id, route_row.points, 'red', route_row.sequence_order,
      COALESCE(route_row.image_width, (
        SELECT di.width FROM public.submission_draft_images di WHERE di.id = route_row.draft_image_id
      ), 1200), COALESCE(route_row.image_height, (
        SELECT di.height FROM public.submission_draft_images di WHERE di.id = route_row.draft_image_id
      ), 1200))
    RETURNING id INTO created_route_line_id;
    all_climb_ids := array_append(all_climb_ids, created_climb_id);
    all_route_line_ids := array_append(all_route_line_ids, created_route_line_id);
  END LOOP;

  UPDATE public.submission_drafts SET
    status = 'submitted',
    metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object(
      'publishedImageId', default_live_image_id,
      'publishedAt', published_at,
      'publishedClimbIds', to_jsonb(all_climb_ids),
      'publishedRouteLineIds', to_jsonb(all_route_line_ids),
      'allPublishedImageIds', to_jsonb(all_live_image_ids),
      'submissionId', created_submission_id
    ),
    updated_at = published_at
  WHERE id = draft_row.id AND status = 'draft';
  GET DIAGNOSTICS affected_count = ROW_COUNT;
  IF affected_count <> 1 THEN
    RAISE EXCEPTION USING MESSAGE = 'Draft changed while publishing', DETAIL = 'draft_conflict';
  END IF;

  RETURN jsonb_build_object(
    'success', true, 'status', 'submitted', 'draft_id', draft_row.id,
    'image_id', default_live_image_id, 'default_image_id', default_live_image_id,
    'image_ids', to_jsonb(all_live_image_ids), 'climb_ids', to_jsonb(all_climb_ids),
    'route_line_ids', to_jsonb(all_route_line_ids), 'published_at', published_at,
    'submission_id', created_submission_id
  );
END;
$$;

REVOKE ALL ON FUNCTION public.promote_draft_to_submission(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.promote_draft_to_submission(uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.delete_unassociated_upload_image(p_image_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  image_row public.images%ROWTYPE;
  current_user_id uuid := auth.uid();
  caller_role text := auth.role();
  result jsonb;
BEGIN
  SELECT * INTO image_row FROM public.images WHERE id = p_image_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING MESSAGE = 'Image not found', DETAIL = 'not_found';
  END IF;
  IF caller_role <> 'service_role'
    AND (current_user_id IS NULL OR current_user_id IS DISTINCT FROM image_row.created_by) THEN
    RAISE EXCEPTION USING MESSAGE = 'Permission denied', DETAIL = 'permission_denied';
  END IF;
  LOCK TABLE public.comments IN SHARE ROW EXCLUSIVE MODE;
  IF public.image_has_content_references(image_row.id) THEN
    RAISE EXCEPTION USING MESSAGE = 'Image is associated with content', DETAIL = 'image_associated';
  END IF;

  result := jsonb_build_object(
    'image_id', image_row.id,
    'storage_provider', image_row.storage_provider,
    'storage_bucket', COALESCE(image_row.original_bucket, image_row.storage_bucket),
    'storage_path', COALESCE(image_row.original_key, image_row.storage_path)
  );
  DELETE FROM public.images i
  WHERE i.id = image_row.id AND NOT public.image_has_content_references(i.id);
  IF NOT FOUND THEN
    RAISE EXCEPTION USING MESSAGE = 'Image is associated with content', DETAIL = 'image_associated';
  END IF;
  RETURN result;
END;
$$;

REVOKE ALL ON FUNCTION public.delete_unassociated_upload_image(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.delete_unassociated_upload_image(uuid) TO authenticated, service_role;
