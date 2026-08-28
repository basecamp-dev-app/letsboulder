-- Add an explicit, auditable publication boundary without deleting or
-- reclassifying any content that is currently public.

ALTER TABLE public.crags
  ADD COLUMN publication_status text NOT NULL DEFAULT 'review'
    CHECK (publication_status IN ('draft', 'review', 'published', 'archived')),
  ADD COLUMN content_origin text NOT NULL DEFAULT 'community'
    CHECK (content_origin IN ('community', 'editorial', 'import', 'fixture')),
  ADD COLUMN published_at timestamptz,
  ADD COLUMN published_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN reviewed_at timestamptz,
  ADD COLUMN reviewed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN publication_notes text
    CHECK (publication_notes IS NULL OR char_length(btrim(publication_notes)) BETWEEN 1 AND 1000),
  ADD COLUMN readiness_version integer NOT NULL DEFAULT 1 CHECK (readiness_version > 0),
  ADD CONSTRAINT crags_publication_state_check CHECK (
    (publication_status = 'published' AND published_at IS NOT NULL)
    OR publication_status <> 'published'
  );

CREATE FUNCTION public.guard_crag_publication_fields()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF current_user <> 'postgres'
      AND (
        NEW.publication_status <> 'review'
        OR NEW.content_origin <> 'community'
        OR NEW.published_at IS NOT NULL OR NEW.published_by IS NOT NULL
        OR NEW.reviewed_at IS NOT NULL OR NEW.reviewed_by IS NOT NULL
        OR NEW.publication_notes IS NOT NULL OR NEW.readiness_version <> 1
      ) THEN
      RAISE EXCEPTION 'Publication fields are managed by the publication workflow'
        USING ERRCODE = '42501';
    END IF;
    RETURN NEW;
  END IF;

  IF current_user <> 'postgres' AND ROW(
    NEW.publication_status, NEW.content_origin, NEW.published_at, NEW.published_by,
    NEW.reviewed_at, NEW.reviewed_by, NEW.publication_notes, NEW.readiness_version
  ) IS DISTINCT FROM ROW(
    OLD.publication_status, OLD.content_origin, OLD.published_at, OLD.published_by,
    OLD.reviewed_at, OLD.reviewed_by, OLD.publication_notes, OLD.readiness_version
  ) THEN
    RAISE EXCEPTION 'Publication fields are managed by the publication workflow'
      USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER crags_guard_publication_fields
BEFORE INSERT OR UPDATE OF publication_status, content_origin, published_at, published_by,
  reviewed_at, reviewed_by, publication_notes, readiness_version
ON public.crags FOR EACH ROW EXECUTE FUNCTION public.guard_crag_publication_fields();

REVOKE ALL ON FUNCTION public.guard_crag_publication_fields()
  FROM PUBLIC, anon, authenticated, service_role;

-- Preserve the existing public surface. Deleted and superseded rows remain
-- retained but are explicitly archived.
UPDATE public.crags
SET publication_status = CASE
      WHEN deleted_at IS NULL AND superseded_by IS NULL THEN 'published'
      ELSE 'archived'
    END,
    published_at = CASE
      WHEN deleted_at IS NULL AND superseded_by IS NULL THEN COALESCE(updated_at, created_at, now())
      ELSE NULL
    END,
    content_origin = 'import',
    publication_notes = 'Backfilled from the public guide during publication-governance rollout';

CREATE INDEX crags_publication_status_idx
  ON public.crags (publication_status, updated_at DESC);

CREATE TABLE public.crag_publication_events (
  id uuid PRIMARY KEY DEFAULT extensions.gen_random_uuid(),
  crag_id uuid NOT NULL REFERENCES public.crags(id) ON DELETE RESTRICT,
  previous_status text NOT NULL CHECK (previous_status IN ('draft', 'review', 'published', 'archived')),
  next_status text NOT NULL CHECK (next_status IN ('draft', 'review', 'published', 'archived')),
  changed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  notes text CHECK (notes IS NULL OR char_length(btrim(notes)) BETWEEN 1 AND 1000),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX crag_publication_events_crag_created_idx
  ON public.crag_publication_events (crag_id, created_at DESC);

INSERT INTO public.crag_publication_events (
  crag_id, previous_status, next_status, changed_by, notes, created_at
)
SELECT id, 'review', publication_status, NULL, publication_notes, now()
FROM public.crags
WHERE publication_notes = 'Backfilled from the public guide during publication-governance rollout';

ALTER TABLE public.crag_publication_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Crag stewards read publication history"
  ON public.crag_publication_events FOR SELECT TO authenticated
  USING (
    public.is_current_user_admin()
    OR EXISTS (
      SELECT 1 FROM public.crag_maintainers maintainer
      WHERE maintainer.crag_id = crag_publication_events.crag_id
        AND maintainer.user_id = auth.uid()
    )
  );

REVOKE ALL ON public.crag_publication_events FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.crag_publication_events TO authenticated;

DROP POLICY IF EXISTS "Public read active crags" ON public.crags;
CREATE POLICY "Public read published crags" ON public.crags
  FOR SELECT TO anon, authenticated
  USING (deleted_at IS NULL AND superseded_by IS NULL AND publication_status = 'published');

CREATE POLICY "Crag stewards read active unpublished crags" ON public.crags
  FOR SELECT TO authenticated
  USING (
    deleted_at IS NULL
    AND (
      created_by = auth.uid()
      OR EXISTS (
        SELECT 1 FROM public.crag_maintainers maintainer
        WHERE maintainer.crag_id = crags.id AND maintainer.user_id = auth.uid()
      )
    )
  );

CREATE OR REPLACE FUNCTION public.set_crag_publication_status(
  p_crag_id uuid,
  p_status text,
  p_notes text DEFAULT NULL
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_crag public.crags%ROWTYPE;
  v_notes text := NULLIF(btrim(p_notes), '');
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
  END IF;
  IF p_status NOT IN ('draft', 'review', 'published', 'archived') THEN
    RAISE EXCEPTION 'Invalid publication status' USING ERRCODE = '22023';
  END IF;
  IF v_notes IS NOT NULL AND char_length(v_notes) > 1000 THEN
    RAISE EXCEPTION 'Publication note is too long' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_crag FROM public.crags WHERE id = p_crag_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Crag not found' USING ERRCODE = 'P0002';
  END IF;
  IF NOT public.is_current_user_admin() AND NOT EXISTS (
    SELECT 1 FROM public.crag_maintainers
    WHERE crag_id = p_crag_id AND user_id = v_actor
  ) THEN
    RAISE EXCEPTION 'Crag maintainer access required' USING ERRCODE = '42501';
  END IF;
  IF p_status = 'published' AND (
    v_crag.deleted_at IS NOT NULL
    OR v_crag.superseded_by IS NOT NULL
    OR v_crag.content_origin = 'fixture'
    OR NULLIF(btrim(v_crag.name), '') IS NULL
    OR NULLIF(btrim(v_crag.slug), '') IS NULL
    OR NULLIF(btrim(v_crag.country_code), '') IS NULL
    OR v_crag.latitude IS NULL
    OR v_crag.longitude IS NULL
  ) THEN
    RAISE EXCEPTION 'Crag is not ready for publication' USING ERRCODE = '22023';
  END IF;
  IF v_crag.publication_status = p_status THEN
    RETURN p_status;
  END IF;

  UPDATE public.crags
  SET publication_status = p_status,
      publication_notes = v_notes,
      reviewed_at = CASE WHEN p_status IN ('review', 'published', 'archived') THEN now() ELSE reviewed_at END,
      reviewed_by = CASE WHEN p_status IN ('review', 'published', 'archived') THEN v_actor ELSE reviewed_by END,
      published_at = CASE WHEN p_status = 'published' THEN now() ELSE NULL END,
      published_by = CASE WHEN p_status = 'published' THEN v_actor ELSE NULL END
  WHERE id = p_crag_id;

  INSERT INTO public.crag_publication_events (
    crag_id, previous_status, next_status, changed_by, notes
  ) VALUES (p_crag_id, v_crag.publication_status, p_status, v_actor, v_notes);

  RETURN p_status;
END;
$$;

REVOKE ALL ON FUNCTION public.set_crag_publication_status(uuid, text, text)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.set_crag_publication_status(uuid, text, text)
  TO authenticated;

CREATE OR REPLACE FUNCTION public.resolve_public_crag_slug(p_country_code text, p_crag_slug text)
RETURNS TABLE (id uuid, name text, country_code text, slug text, superseded_from uuid)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''
AS $$
  WITH RECURSIVE chain AS (
    SELECT c.id, c.name::text, c.country_code::text, c.slug, c.deleted_at,
      c.superseded_by, c.publication_status, c.id AS original_id, ARRAY[c.id] AS path
    FROM public.crags c
    WHERE lower(c.country_code) = lower(btrim(p_country_code)) AND c.slug = btrim(p_crag_slug)
    UNION ALL
    SELECT c.id, c.name::text, c.country_code::text, c.slug, c.deleted_at,
      c.superseded_by, c.publication_status, chain.original_id, chain.path || c.id
    FROM chain JOIN public.crags c ON c.id = chain.superseded_by
    WHERE NOT c.id = ANY(chain.path)
  )
  SELECT chain.id, chain.name, chain.country_code, chain.slug,
    CASE WHEN chain.id = chain.original_id THEN NULL ELSE chain.original_id END
  FROM chain
  WHERE chain.deleted_at IS NULL AND chain.superseded_by IS NULL
    AND chain.publication_status = 'published'
  LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.resolve_public_climb_slug(
  p_country_code text, p_crag_slug text, p_climb_slug text
)
RETURNS TABLE (
  id uuid, crag_id uuid, name text, slug text, grade text, route_type text,
  superseded_from uuid
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''
AS $$
  WITH RECURSIVE chain AS (
    SELECT cl.id, cl.crag_id, cl.name::text, cl.slug, cl.grade::text,
      cl.route_type::text, cl.deleted_at, cl.superseded_by,
      cl.id AS original_id, ARRAY[cl.id] AS path
    FROM public.climbs cl JOIN public.crags cr ON cr.id = cl.crag_id
    WHERE lower(cr.country_code) = lower(btrim(p_country_code))
      AND cr.slug = btrim(p_crag_slug) AND cr.publication_status = 'published'
      AND cl.slug = btrim(p_climb_slug)
    UNION ALL
    SELECT cl.id, cl.crag_id, cl.name::text, cl.slug, cl.grade::text,
      cl.route_type::text, cl.deleted_at, cl.superseded_by,
      chain.original_id, chain.path || cl.id
    FROM chain JOIN public.climbs cl ON cl.id = chain.superseded_by
    WHERE NOT cl.id = ANY(chain.path)
  )
  SELECT chain.id, chain.crag_id, chain.name, chain.slug, chain.grade,
    chain.route_type, CASE WHEN chain.id = chain.original_id THEN NULL ELSE chain.original_id END
  FROM chain JOIN public.crags cr ON cr.id = chain.crag_id
  WHERE chain.deleted_at IS NULL AND chain.superseded_by IS NULL
    AND cr.deleted_at IS NULL AND cr.publication_status = 'published'
  LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.get_public_impact_metrics_v1()
RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''
AS $$
  SELECT jsonb_build_object(
    'definitionVersion', 1,
    'generatedAt', now(),
    'routesDocumented', (
      SELECT count(*) FROM public.climbs climb
      JOIN public.crags crag ON crag.id = climb.crag_id
      WHERE climb.deleted_at IS NULL AND climb.status IN ('active', 'approved')
        AND crag.deleted_at IS NULL AND crag.superseded_by IS NULL
        AND crag.publication_status = 'published'
    ),
    'cragsMapped', (
      SELECT count(*) FROM public.crags crag
      WHERE crag.deleted_at IS NULL AND crag.superseded_by IS NULL
        AND crag.publication_status = 'published'
        AND crag.latitude IS NOT NULL AND crag.longitude IS NOT NULL
    ),
    'sendsLogged', (
      SELECT count(*) FROM public.user_climbs
      WHERE style IN ('top', 'flash', 'onsight')
    ),
    'activeClimbers', (
      SELECT count(DISTINCT user_id) FROM public.user_climbs
      WHERE created_at >= now() - interval '60 days'
        AND style IN ('top', 'flash', 'onsight')
    ),
    'photos', (
      SELECT count(*) FROM public.images image
      JOIN public.crags crag ON crag.id = image.crag_id
      WHERE image.processing_status = 'ready'
        AND image.moderation_status IN ('approved', 'skipped')
        AND image.visibility = 'public' AND image.status = 'approved'
        AND image.parent_image_id IS NULL
        AND crag.deleted_at IS NULL AND crag.superseded_by IS NULL
        AND crag.publication_status = 'published'
    ),
    'contributors', (
      SELECT count(*) FROM (
        SELECT climb.user_id AS contributor_id
        FROM public.climbs climb JOIN public.crags crag ON crag.id = climb.crag_id
        WHERE climb.user_id IS NOT NULL AND climb.deleted_at IS NULL
          AND climb.status IN ('active', 'approved')
          AND crag.deleted_at IS NULL AND crag.superseded_by IS NULL
          AND crag.publication_status = 'published'
        UNION
        SELECT image.created_by
        FROM public.images image JOIN public.crags crag ON crag.id = image.crag_id
        WHERE image.created_by IS NOT NULL AND image.processing_status = 'ready'
          AND image.moderation_status IN ('approved', 'skipped')
          AND image.visibility = 'public' AND image.status = 'approved'
          AND image.parent_image_id IS NULL
          AND crag.deleted_at IS NULL AND crag.superseded_by IS NULL
          AND crag.publication_status = 'published'
      ) contributors
    )
  );
$$;

REVOKE ALL ON FUNCTION public.get_public_impact_metrics_v1()
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_public_impact_metrics_v1()
  TO anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.get_place_pins(include_pending boolean DEFAULT false)
RETURNS TABLE(
  id uuid, name text, type text, latitude numeric, longitude numeric, slug text,
  country_code varchar, image_count bigint, route_count integer
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''
AS $$
  SELECT c.id, c.name::text, 'crag'::text, avg(i.latitude)::numeric(10,8),
    avg(i.longitude)::numeric(11,8), c.slug, c.country_code, count(i.id)::bigint,
    c.route_count
  FROM public.crags c
  JOIN public.images i ON i.crag_id = c.id
    AND i.processing_status = 'ready'
    AND i.moderation_status IN ('approved', 'skipped')
    AND i.visibility = 'public' AND i.status = 'approved'
    AND i.latitude IS NOT NULL AND i.longitude IS NOT NULL
  WHERE c.deleted_at IS NULL AND c.superseded_by IS NULL
    AND c.publication_status = 'published'
  GROUP BY c.id, c.name, c.slug, c.country_code, c.route_count
  HAVING count(i.id) > 0
  UNION ALL
  SELECT p.id, p.name::text, p.type, p.latitude, p.longitude, p.slug,
    p.country_code, NULL::bigint, NULL::integer
  FROM public.places p
  WHERE p.type = 'gym' AND p.latitude IS NOT NULL AND p.longitude IS NOT NULL
    AND p.slug IS NOT NULL;
$$;

CREATE OR REPLACE FUNCTION public.get_nearby_crags(
  p_latitude double precision,
  p_longitude double precision,
  p_radius_meters double precision DEFAULT 10000,
  p_limit integer DEFAULT 30
)
RETURNS TABLE (
  id uuid, name character varying(200), latitude numeric, longitude numeric,
  rock_type character varying(50), type character varying(20),
  country_code character varying(2), region_name character varying(100),
  sub_area character varying(120), distance_meters double precision
)
LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path = ''
AS $$
DECLARE query_point extensions.geography;
BEGIN
  IF p_latitude IS NULL OR p_latitude NOT BETWEEN -90 AND 90
    OR p_longitude IS NULL OR p_longitude NOT BETWEEN -180 AND 180 THEN
    RAISE EXCEPTION 'latitude and longitude are outside valid ranges' USING ERRCODE = '22023';
  END IF;
  IF p_radius_meters IS NULL OR p_radius_meters <= 0 OR p_radius_meters > 100000 THEN
    RAISE EXCEPTION 'radius must be greater than 0 and at most 100000 meters' USING ERRCODE = '22023';
  END IF;
  IF p_limit IS NULL OR p_limit < 1 OR p_limit > 30 THEN
    RAISE EXCEPTION 'limit must be between 1 and 30' USING ERRCODE = '22023';
  END IF;
  query_point := extensions.ST_SetSRID(
    extensions.ST_MakePoint(p_longitude, p_latitude), 4326
  )::extensions.geography;
  RETURN QUERY
  SELECT c.id, c.name, c.latitude, c.longitude, c.rock_type, c.type,
    c.country_code, c.region_name, c.sub_area,
    extensions.ST_Distance(c.location, query_point)
  FROM public.crags c
  WHERE c.deleted_at IS NULL AND c.superseded_by IS NULL
    AND c.publication_status = 'published' AND c.location IS NOT NULL
    AND extensions.ST_DWithin(c.location, query_point, p_radius_meters)
  ORDER BY c.location OPERATOR(extensions.<->) query_point, c.id
  LIMIT p_limit;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_crag_pins(include_pending boolean DEFAULT false)
RETURNS TABLE(id uuid, name text, latitude numeric, longitude numeric, image_count bigint)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''
AS $$
  SELECT c.id, c.name::text, avg(i.latitude)::numeric(10,8),
    avg(i.longitude)::numeric(11,8), count(i.id)::bigint
  FROM public.crags c
  JOIN public.images i ON i.crag_id = c.id
    AND i.processing_status = 'ready'
    AND i.moderation_status IN ('approved', 'skipped')
    AND i.visibility = 'public'
    AND (i.status = 'approved' OR (include_pending AND i.status = 'pending'))
    AND i.latitude IS NOT NULL AND i.longitude IS NOT NULL
  WHERE c.deleted_at IS NULL AND c.superseded_by IS NULL
    AND c.publication_status = 'published'
  GROUP BY c.id, c.name
  HAVING count(i.id) > 0;
$$;

CREATE OR REPLACE FUNCTION public.get_crag_pins()
RETURNS TABLE(id uuid, name text, latitude numeric, longitude numeric, image_count bigint)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''
AS $$ SELECT * FROM public.get_crag_pins(false); $$;

CREATE OR REPLACE FUNCTION public.get_boulders_with_gps_count()
RETURNS bigint
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''
AS $$
  SELECT count(DISTINCT climb.crag_id)
  FROM public.climbs climb
  JOIN public.crags crag ON crag.id = climb.crag_id
  WHERE climb.deleted_at IS NULL AND climb.status IN ('active', 'approved')
    AND crag.deleted_at IS NULL AND crag.superseded_by IS NULL
    AND crag.publication_status = 'published'
    AND crag.latitude IS NOT NULL AND crag.longitude IS NOT NULL;
$$;

CREATE OR REPLACE FUNCTION public.get_community_photos_count()
RETURNS bigint
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''
AS $$
  SELECT count(*)
  FROM public.images image
  JOIN public.crags crag ON crag.id = image.crag_id
  WHERE image.processing_status = 'ready'
    AND image.moderation_status IN ('approved', 'skipped')
    AND image.visibility = 'public' AND image.status = 'approved'
    AND image.parent_image_id IS NULL
    AND crag.deleted_at IS NULL AND crag.superseded_by IS NULL
    AND crag.publication_status = 'published';
$$;

-- This helper is called by SECURITY DEFINER wrappers, so its source query must
-- enforce publication eligibility explicitly instead of relying on crag RLS.
CREATE OR REPLACE FUNCTION public.get_viewport_map_features_internal(
  p_north double precision,
  p_south double precision,
  p_east double precision,
  p_west double precision,
  p_zoom integer,
  p_include_pending boolean
)
RETURNS TABLE (
  id text, name text, type text, latitude double precision, longitude double precision,
  slug text, country_code character varying, image_count bigint, route_count bigint,
  is_cluster boolean, point_count bigint
)
LANGUAGE plpgsql STABLE SET search_path = ''
AS $$
BEGIN
  IF p_north IS NULL OR p_south IS NULL OR p_east IS NULL OR p_west IS NULL
    OR p_north IN ('NaN'::double precision, 'Infinity'::double precision, '-Infinity'::double precision)
    OR p_south IN ('NaN'::double precision, 'Infinity'::double precision, '-Infinity'::double precision)
    OR p_east IN ('NaN'::double precision, 'Infinity'::double precision, '-Infinity'::double precision)
    OR p_west IN ('NaN'::double precision, 'Infinity'::double precision, '-Infinity'::double precision)
    OR p_north NOT BETWEEN -90 AND 90 OR p_south NOT BETWEEN -90 AND 90
    OR p_east NOT BETWEEN -180 AND 180 OR p_west NOT BETWEEN -180 AND 180
    OR p_north <= p_south OR p_east = p_west THEN
    RAISE EXCEPTION 'invalid map bounds' USING ERRCODE = '22023';
  END IF;
  IF p_zoom IS NULL OR p_zoom NOT BETWEEN 0 AND 22 OR p_include_pending IS NULL
    OR (p_zoom >= 12 AND (
      p_north - p_south > 10.0 / power(2.0, p_zoom - 12)
      OR CASE WHEN p_west < p_east THEN p_east - p_west ELSE 360 - p_west + p_east END
        > 10.0 / power(2.0, p_zoom - 12)
    )) THEN
    RAISE EXCEPTION 'zoom must be an integer between 0 and 22' USING ERRCODE = '22023';
  END IF;

  RETURN QUERY
  WITH bounded_crags AS MATERIALIZED (
    SELECT c.id, c.name, c.location, c.slug, c.country_code, c.route_count
    FROM public.crags c
    WHERE c.deleted_at IS NULL AND c.superseded_by IS NULL
      AND (c.publication_status = 'published' OR p_include_pending)
      AND c.location IS NOT NULL
      AND (
        (p_west < p_east AND c.location::extensions.geometry OPERATOR(extensions.&&)
          extensions.ST_MakeEnvelope(p_west, p_south, p_east, p_north, 4326))
        OR (p_west > p_east AND (
          c.location::extensions.geometry OPERATOR(extensions.&&)
            extensions.ST_MakeEnvelope(p_west, p_south, 180, p_north, 4326)
          OR c.location::extensions.geometry OPERATOR(extensions.&&)
            extensions.ST_MakeEnvelope(-180, p_south, p_east, p_north, 4326)
        ))
      )
  ),
  eligible_crags AS (
    SELECT c.id::text AS id, c.name::text AS name, 'crag'::text AS type,
      extensions.ST_Y(c.location::extensions.geometry) AS latitude,
      extensions.ST_X(c.location::extensions.geometry) AS longitude,
      c.slug, c.country_code, count(i.id)::bigint AS image_count,
      c.route_count::bigint AS route_count
    FROM bounded_crags c
    JOIN public.images i ON i.crag_id = c.id
      AND i.processing_status = 'ready'
      AND i.moderation_status IN ('approved', 'skipped')
      AND i.visibility = 'public'
      AND (i.status = 'approved' OR (p_include_pending AND i.status = 'pending'))
      AND i.latitude IS NOT NULL AND i.longitude IS NOT NULL
    GROUP BY c.id, c.name, c.location, c.slug, c.country_code, c.route_count
    HAVING count(i.id) > 0
  ),
  bounded_gyms AS MATERIALIZED (
    SELECT p.id::text AS id, p.name::text AS name, 'gym'::text AS type,
      p.latitude::double precision AS latitude, p.longitude::double precision AS longitude,
      p.slug, p.country_code, NULL::bigint AS image_count, NULL::bigint AS route_count
    FROM public.places p
    WHERE p.type = 'gym' AND p.latitude BETWEEN p_south AND p_north
      AND CASE WHEN p_west < p_east THEN p.longitude BETWEEN p_west AND p_east
        ELSE p.longitude >= p_west OR p.longitude <= p_east END
      AND p.slug IS NOT NULL
  ),
  places AS (
    SELECT * FROM eligible_crags UNION ALL SELECT * FROM bounded_gyms
  ),
  bucketed AS (
    SELECT f.*,
      CASE WHEN p_zoom <= 11 THEN floor(
        ((f.longitude + 180.0) / 360.0) * (512.0 * power(2.0, p_zoom)) / 112.0
      )::bigint ELSE 0 END AS grid_x,
      CASE WHEN p_zoom <= 11 THEN floor(
        ((1.0 - ln(tan(radians(least(85.05112878, greatest(-85.05112878, f.latitude))))
          + 1.0 / cos(radians(least(85.05112878, greatest(-85.05112878, f.latitude))))) / pi()) / 2.0)
          * (512.0 * power(2.0, p_zoom)) / 112.0
      )::bigint ELSE 0 END AS grid_y
    FROM places f
  )
  SELECT CASE WHEN p_zoom <= 11 AND count(*) > 1
      THEN format('cluster:%s:%s:%s', p_zoom, b.grid_x, b.grid_y) ELSE min(b.id) END,
    CASE WHEN p_zoom <= 11 AND count(*) > 1 THEN NULL ELSE min(b.name) END,
    CASE WHEN p_zoom <= 11 AND count(*) > 1 THEN 'cluster' ELSE min(b.type) END,
    avg(b.latitude)::double precision, avg(b.longitude)::double precision,
    CASE WHEN p_zoom <= 11 AND count(*) > 1 THEN NULL ELSE min(b.slug) END,
    CASE WHEN p_zoom <= 11 AND count(*) > 1 THEN NULL ELSE min(b.country_code) END::character varying,
    CASE WHEN p_zoom <= 11 AND count(*) > 1 THEN sum(b.image_count) ELSE min(b.image_count) END::bigint,
    CASE WHEN p_zoom <= 11 AND count(*) > 1 THEN sum(b.route_count) ELSE min(b.route_count) END::bigint,
    p_zoom <= 11 AND count(*) > 1, count(*)::bigint
  FROM bucketed b
  GROUP BY b.grid_x, b.grid_y, CASE WHEN p_zoom <= 11 THEN NULL ELSE b.id END
  ORDER BY 10 DESC, 11 DESC, 1;
END;
$$;

-- Keep the export registry and sanitized views on the same publication boundary.
GRANT SELECT (publication_status) ON public.crags TO public_data_export_owner;

CREATE OR REPLACE FUNCTION public.register_public_data_export_entity()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    UPDATE public.public_data_export_registry
    SET deleted_at = COALESCE(deleted_at, now()), superseded_by = OLD.superseded_by
    WHERE entity_type = CASE TG_TABLE_NAME WHEN 'crags' THEN 'crag' ELSE 'route' END
      AND entity_id = OLD.id;
    RETURN OLD;
  END IF;
  IF NEW.deleted_at IS NOT NULL THEN
    UPDATE public.public_data_export_registry
    SET deleted_at = NEW.deleted_at, superseded_by = NEW.superseded_by
    WHERE entity_type = CASE TG_TABLE_NAME WHEN 'crags' THEN 'crag' ELSE 'route' END
      AND entity_id = NEW.id;
    RETURN NEW;
  END IF;
  IF TG_TABLE_NAME = 'crags' THEN
    IF NEW.publication_status = 'published' AND NEW.superseded_by IS NULL
      AND NULLIF(btrim(NEW.slug), '') IS NOT NULL
      AND NULLIF(btrim(NEW.country_code), '') IS NOT NULL THEN
      INSERT INTO public.public_data_export_registry (entity_type, entity_id)
      VALUES ('crag', NEW.id) ON CONFLICT DO NOTHING;
      INSERT INTO public.public_data_export_registry (entity_type, entity_id)
      SELECT 'route', climb.id FROM public.climbs climb
      WHERE climb.crag_id = NEW.id AND climb.deleted_at IS NULL
        AND climb.status IN ('active', 'approved') ON CONFLICT DO NOTHING;
    END IF;
  ELSIF TG_TABLE_NAME = 'climbs' THEN
    IF NEW.deleted_at IS NULL AND NEW.status IN ('active', 'approved')
      AND EXISTS (
        SELECT 1 FROM public.crags crag
        WHERE crag.id = NEW.crag_id AND crag.deleted_at IS NULL
          AND crag.superseded_by IS NULL AND crag.publication_status = 'published'
          AND NULLIF(btrim(crag.slug), '') IS NOT NULL
          AND NULLIF(btrim(crag.country_code), '') IS NOT NULL
      ) THEN
      INSERT INTO public.public_data_export_registry (entity_type, entity_id)
      VALUES ('route', NEW.id) ON CONFLICT DO NOTHING;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER crags_register_public_data_export ON public.crags;
CREATE TRIGGER crags_register_public_data_export
AFTER INSERT OR UPDATE OF deleted_at, superseded_by, slug, country_code, publication_status
ON public.crags FOR EACH ROW EXECUTE FUNCTION public.register_public_data_export_entity();

-- Replace the views as their least-privilege owner. PostgreSQL 16 records
-- role grants per grantor, so pin both sides of the temporary membership to
-- postgres instead of allowing Supabase to choose supabase_admin implicitly.
GRANT CREATE ON SCHEMA public TO public_data_export_owner;
GRANT public_data_export_owner TO postgres
  WITH INHERIT FALSE, SET TRUE
  GRANTED BY postgres;
SET ROLE public_data_export_owner;

CREATE OR REPLACE VIEW public.public_data_export_crags_v1
WITH (security_barrier = true, security_invoker = false) AS
SELECT id, name, slug, country_code, country_id, country, region_id, region_name,
  sub_area, rock_type, type, tide_dependency, location_visibility,
  CASE location_visibility WHEN 'exact' THEN latitude
    WHEN 'approximate' THEN round(latitude, 2) ELSE NULL END AS latitude,
  CASE location_visibility WHEN 'exact' THEN longitude
    WHEN 'approximate' THEN round(longitude, 2) ELSE NULL END AS longitude,
  created_at, updated_at
FROM public.crags
WHERE deleted_at IS NULL AND superseded_by IS NULL
  AND publication_status = 'published'
  AND NULLIF(btrim(slug), '') IS NOT NULL
  AND NULLIF(btrim(country_code), '') IS NOT NULL;

CREATE OR REPLACE VIEW public.public_data_export_routes_v1
WITH (security_barrier = true, security_invoker = false) AS
SELECT climb.id, COALESCE(climb.shared_climb_id, climb.id) AS effective_climb_id,
  climb.crag_id, climb.sector_id, climb.shared_climb_id, climb.name, climb.slug,
  climb.grade, climb.grade_index, climb.consensus_grade, climb.original_grade_string,
  climb.route_type,
  CASE WHEN crag.location_visibility = 'hidden' OR climb.location_visibility = 'hidden'
    THEN 'hidden'::public.location_visibility
    WHEN crag.location_visibility = 'approximate' OR climb.location_visibility = 'approximate'
    THEN 'approximate'::public.location_visibility
    ELSE 'exact'::public.location_visibility END AS location_visibility,
  CASE WHEN crag.location_visibility = 'exact'
    AND COALESCE(climb.location_visibility, 'exact') = 'exact' THEN climb.latitude ELSE NULL END AS latitude,
  CASE WHEN crag.location_visibility = 'exact'
    AND COALESCE(climb.location_visibility, 'exact') = 'exact' THEN climb.longitude ELSE NULL END AS longitude,
  climb.is_verified, climb.verification_count, climb.created_at, climb.updated_at
FROM public.climbs climb JOIN public.crags crag ON crag.id = climb.crag_id
WHERE climb.deleted_at IS NULL AND climb.status IN ('active', 'approved')
  AND crag.deleted_at IS NULL AND crag.superseded_by IS NULL
  AND crag.publication_status = 'published'
  AND NULLIF(btrim(crag.slug), '') IS NOT NULL
  AND NULLIF(btrim(crag.country_code), '') IS NOT NULL;

CREATE OR REPLACE VIEW public.public_data_export_sectors_v1
WITH (security_barrier = true, security_invoker = false) AS
SELECT sector.id, sector.crag_id, sector.name, sector.created_at
FROM public.sectors sector JOIN public.crags crag ON crag.id = sector.crag_id
WHERE crag.deleted_at IS NULL AND crag.superseded_by IS NULL
  AND crag.publication_status = 'published'
  AND NULLIF(btrim(crag.slug), '') IS NOT NULL
  AND NULLIF(btrim(crag.country_code), '') IS NOT NULL;

-- Hosted migrations start as postgres under a separate session login role.
-- Return to the grantor before revoking, then restore the original session role.
SET ROLE postgres;
REVOKE public_data_export_owner FROM postgres GRANTED BY postgres;
REVOKE CREATE ON SCHEMA public FROM public_data_export_owner;

COMMENT ON COLUMN public.crags.publication_status IS
  'Editorial lifecycle boundary shared by public routes, sitemap, search, map, metrics, and exports.';
COMMENT ON COLUMN public.crags.content_origin IS
  'Provenance classification; fixture content must never be published in production.';
COMMENT ON FUNCTION public.get_public_impact_metrics_v1() IS
  'Atomic versioned public impact totals restricted to discoverable published content.';

-- Restore Supabase's original session login role only after owner-only metadata.
RESET ROLE;
