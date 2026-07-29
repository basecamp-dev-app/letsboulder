-- Stable, least-privileged database surfaces for public data exports.

CREATE TYPE public.location_visibility AS ENUM ('exact', 'approximate', 'hidden');

ALTER TABLE public.crags
  ADD COLUMN location_visibility public.location_visibility NOT NULL DEFAULT 'hidden';

ALTER TABLE public.climbs
  ADD COLUMN location_visibility public.location_visibility;

CREATE TABLE public.public_data_export_registry (
  entity_type text NOT NULL CHECK (entity_type IN ('crag', 'route')),
  entity_id uuid NOT NULL,
  first_eligible_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  superseded_by uuid,
  PRIMARY KEY (entity_type, entity_id)
);

ALTER TABLE public.public_data_export_registry ENABLE ROW LEVEL SECURITY;

CREATE FUNCTION public.register_public_data_export_entity()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    UPDATE public.public_data_export_registry
    SET deleted_at = COALESCE(deleted_at, now()),
        superseded_by = OLD.superseded_by
    WHERE entity_type = CASE TG_TABLE_NAME WHEN 'crags' THEN 'crag' ELSE 'route' END
      AND entity_id = OLD.id;
    RETURN OLD;
  END IF;

  IF NEW.deleted_at IS NOT NULL THEN
    UPDATE public.public_data_export_registry
    SET deleted_at = NEW.deleted_at,
        superseded_by = NEW.superseded_by
    WHERE entity_type = CASE TG_TABLE_NAME WHEN 'crags' THEN 'crag' ELSE 'route' END
      AND entity_id = NEW.id;
    RETURN NEW;
  END IF;

  IF TG_TABLE_NAME = 'crags' THEN
    IF NEW.deleted_at IS NULL
      AND NULLIF(btrim(NEW.slug), '') IS NOT NULL
      AND NULLIF(btrim(NEW.country_code), '') IS NOT NULL THEN
      INSERT INTO public.public_data_export_registry (entity_type, entity_id)
      VALUES ('crag', NEW.id)
      ON CONFLICT DO NOTHING;

      INSERT INTO public.public_data_export_registry (entity_type, entity_id)
      SELECT 'route', climb.id
      FROM public.climbs AS climb
      WHERE climb.crag_id = NEW.id
        AND climb.deleted_at IS NULL
        AND climb.status IN ('active', 'approved')
      ON CONFLICT DO NOTHING;
    END IF;
  ELSIF TG_TABLE_NAME = 'climbs' THEN
    IF NEW.deleted_at IS NULL
      AND NEW.status IN ('active', 'approved')
      AND EXISTS (
        SELECT 1 FROM public.crags AS crag
        WHERE crag.id = NEW.crag_id
          AND crag.deleted_at IS NULL
          AND NULLIF(btrim(crag.slug), '') IS NOT NULL
          AND NULLIF(btrim(crag.country_code), '') IS NOT NULL
      ) THEN
      INSERT INTO public.public_data_export_registry (entity_type, entity_id)
      VALUES ('route', NEW.id)
      ON CONFLICT DO NOTHING;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.register_public_data_export_entity() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER crags_register_public_data_export
AFTER INSERT OR UPDATE OF deleted_at, slug, country_code ON public.crags
FOR EACH ROW EXECUTE FUNCTION public.register_public_data_export_entity();

CREATE TRIGGER crags_retain_public_data_export_tombstone
BEFORE DELETE ON public.crags
FOR EACH ROW EXECUTE FUNCTION public.register_public_data_export_entity();

CREATE TRIGGER climbs_register_public_data_export
AFTER INSERT OR UPDATE OF crag_id, deleted_at, status ON public.climbs
FOR EACH ROW EXECUTE FUNCTION public.register_public_data_export_entity();

CREATE TRIGGER climbs_retain_public_data_export_tombstone
BEFORE DELETE ON public.climbs
FOR EACH ROW EXECUTE FUNCTION public.register_public_data_export_entity();

INSERT INTO public.public_data_export_registry (entity_type, entity_id)
SELECT 'crag', crag.id
FROM public.crags AS crag
WHERE crag.deleted_at IS NULL
  AND NULLIF(btrim(crag.slug), '') IS NOT NULL
  AND NULLIF(btrim(crag.country_code), '') IS NOT NULL
UNION ALL
SELECT 'route', climb.id
FROM public.climbs AS climb
JOIN public.crags AS crag ON crag.id = climb.crag_id
WHERE climb.deleted_at IS NULL
  AND climb.status IN ('active', 'approved')
  AND crag.deleted_at IS NULL
  AND NULLIF(btrim(crag.slug), '') IS NOT NULL
  AND NULLIF(btrim(crag.country_code), '') IS NOT NULL
ON CONFLICT DO NOTHING;

INSERT INTO public.public_data_export_registry (
  entity_type, entity_id, deleted_at, superseded_by
)
SELECT 'crag', crag.id, crag.deleted_at, crag.superseded_by
FROM public.crags AS crag
WHERE crag.deleted_at IS NOT NULL
  AND NULLIF(btrim(crag.slug), '') IS NOT NULL
  AND NULLIF(btrim(crag.country_code), '') IS NOT NULL
UNION ALL
SELECT 'route', climb.id, climb.deleted_at, climb.superseded_by
FROM public.climbs AS climb
JOIN public.crags AS crag ON crag.id = climb.crag_id
WHERE climb.deleted_at IS NOT NULL
  AND climb.status IN ('active', 'approved')
  AND NULLIF(btrim(crag.slug), '') IS NOT NULL
  AND NULLIF(btrim(crag.country_code), '') IS NOT NULL
ON CONFLICT (entity_type, entity_id) DO UPDATE
SET deleted_at = EXCLUDED.deleted_at,
    superseded_by = EXCLUDED.superseded_by;

COMMENT ON COLUMN public.crags.location_visibility IS
  'Controls coordinate precision in public data exports.';
COMMENT ON COLUMN public.climbs.location_visibility IS
  'Optional route coordinate policy; public exports apply the stricter of this and the parent crag policy.';

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'public_data_export_owner') THEN
    CREATE ROLE public_data_export_owner NOLOGIN NOINHERIT NOBYPASSRLS;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'public_data_export_reader') THEN
    CREATE ROLE public_data_export_reader NOLOGIN NOINHERIT NOBYPASSRLS;
  END IF;
END
$$;

ALTER ROLE public_data_export_owner WITH NOLOGIN NOINHERIT NOBYPASSRLS;
ALTER ROLE public_data_export_reader WITH NOLOGIN NOINHERIT NOBYPASSRLS;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_auth_members
    WHERE roleid IN ('public_data_export_owner'::regrole, 'public_data_export_reader'::regrole)
      AND member <> 'postgres'::regrole
  ) OR EXISTS (
    SELECT 1 FROM pg_auth_members
    WHERE roleid IN ('public_data_export_owner'::regrole, 'public_data_export_reader'::regrole)
      AND member = 'postgres'::regrole
      AND (inherit_option OR set_option)
  ) OR EXISTS (
    SELECT 1 FROM pg_auth_members
    WHERE member IN ('public_data_export_owner'::regrole, 'public_data_export_reader'::regrole)
  ) THEN
    RAISE EXCEPTION 'public data export roles have unexpected memberships';
  END IF;
END
$$;

GRANT USAGE ON SCHEMA public TO public_data_export_owner, public_data_export_reader;
GRANT SELECT (
  id, name, slug, country_code, country_id, country, region_id, region_name,
  sub_area, rock_type, type, tide_dependency, location_visibility, latitude,
  longitude, created_at, updated_at, deleted_at, superseded_by
) ON public.crags TO public_data_export_owner;
GRANT SELECT (
  id, crag_id, sector_id, shared_climb_id, name, slug, grade, grade_index,
  consensus_grade, original_grade_string, route_type, location_visibility,
  latitude, longitude, is_verified, verification_count, status, created_at,
  updated_at, deleted_at, superseded_by
) ON public.climbs TO public_data_export_owner;
GRANT SELECT (
  id, climb_id, image_id, sequence_order, color, image_width, image_height,
  points, created_at
) ON public.route_lines TO public_data_export_owner;
GRANT SELECT (
  id, crag_id, processing_status, moderation_status, visibility, status
) ON public.images TO public_data_export_owner;
GRANT SELECT (id, crag_id, name, created_at)
  ON public.sectors TO public_data_export_owner;
GRANT SELECT (entity_type, entity_id, deleted_at, superseded_by)
  ON public.public_data_export_registry TO public_data_export_owner;

CREATE POLICY "Export owner sees crags" ON public.crags
  FOR SELECT TO public_data_export_owner USING (true);
CREATE POLICY "Export owner sees climbs" ON public.climbs
  FOR SELECT TO public_data_export_owner USING (true);
CREATE POLICY "Export owner sees route lines" ON public.route_lines
  FOR SELECT TO public_data_export_owner USING (true);
CREATE POLICY "Export owner sees images" ON public.images
  FOR SELECT TO public_data_export_owner USING (true);
CREATE POLICY "Export owner sees sectors" ON public.sectors
  FOR SELECT TO public_data_export_owner USING (true);
CREATE POLICY "Export owner sees registry" ON public.public_data_export_registry
  FOR SELECT TO public_data_export_owner USING (true);

CREATE VIEW public.public_data_export_crags_v1
WITH (security_barrier = true, security_invoker = false)
AS
SELECT
  id,
  name,
  slug,
  country_code,
  country_id,
  country,
  region_id,
  region_name,
  sub_area,
  rock_type,
  type,
  tide_dependency,
  location_visibility,
  CASE location_visibility
    WHEN 'exact' THEN latitude
    WHEN 'approximate' THEN round(latitude, 2)
    ELSE NULL
  END AS latitude,
  CASE location_visibility
    WHEN 'exact' THEN longitude
    WHEN 'approximate' THEN round(longitude, 2)
    ELSE NULL
  END AS longitude,
  created_at,
  updated_at
FROM public.crags
WHERE deleted_at IS NULL
  AND NULLIF(btrim(slug), '') IS NOT NULL
  AND NULLIF(btrim(country_code), '') IS NOT NULL;

CREATE VIEW public.public_data_export_routes_v1
WITH (security_barrier = true, security_invoker = false)
AS
SELECT
  climb.id,
  COALESCE(climb.shared_climb_id, climb.id) AS effective_climb_id,
  climb.crag_id,
  climb.sector_id,
  climb.shared_climb_id,
  climb.name,
  climb.slug,
  climb.grade,
  climb.grade_index,
  climb.consensus_grade,
  climb.original_grade_string,
  climb.route_type,
  CASE
    WHEN crag.location_visibility = 'hidden'
      OR climb.location_visibility = 'hidden' THEN 'hidden'::public.location_visibility
    WHEN crag.location_visibility = 'approximate'
      OR climb.location_visibility = 'approximate' THEN 'approximate'::public.location_visibility
    ELSE 'exact'::public.location_visibility
  END AS location_visibility,
  CASE
    WHEN crag.location_visibility = 'exact'
      AND COALESCE(climb.location_visibility, 'exact') = 'exact' THEN climb.latitude
    ELSE NULL
  END AS latitude,
  CASE
    WHEN crag.location_visibility = 'exact'
      AND COALESCE(climb.location_visibility, 'exact') = 'exact' THEN climb.longitude
    ELSE NULL
  END AS longitude,
  climb.is_verified,
  climb.verification_count,
  climb.created_at,
  climb.updated_at
FROM public.climbs AS climb
JOIN public.crags AS crag ON crag.id = climb.crag_id
WHERE climb.deleted_at IS NULL
  AND climb.status IN ('active', 'approved')
  AND crag.deleted_at IS NULL
  AND NULLIF(btrim(crag.slug), '') IS NOT NULL
  AND NULLIF(btrim(crag.country_code), '') IS NOT NULL;

CREATE VIEW public.public_data_export_route_lines_v1
WITH (security_barrier = true, security_invoker = false)
AS
SELECT
  line.id,
  line.climb_id,
  line.sequence_order,
  line.color,
  line.image_width,
  line.image_height,
  line.points,
  line.created_at
FROM public.route_lines AS line
JOIN public.public_data_export_routes_v1 AS route ON route.id = line.climb_id
JOIN public.images AS image ON image.id = line.image_id
LEFT JOIN public.crags AS image_crag ON image_crag.id = image.crag_id
WHERE image.processing_status = 'ready'
  AND image.moderation_status IN ('approved', 'skipped')
  AND image.visibility = 'public'
  AND image.status = 'approved'
  AND (image.crag_id IS NULL OR image_crag.deleted_at IS NULL);

CREATE VIEW public.public_data_export_sectors_v1
WITH (security_barrier = true, security_invoker = false)
AS
SELECT sector.id, sector.crag_id, sector.name, sector.created_at
FROM public.sectors AS sector
JOIN public.crags AS crag ON crag.id = sector.crag_id
WHERE crag.deleted_at IS NULL
  AND NULLIF(btrim(crag.slug), '') IS NOT NULL
  AND NULLIF(btrim(crag.country_code), '') IS NOT NULL;

CREATE VIEW public.public_data_export_tombstones_v1
WITH (security_barrier = true, security_invoker = false)
AS
SELECT
  entity_type,
  entity_id AS id,
  deleted_at,
  superseded_by
FROM public.public_data_export_registry
WHERE deleted_at IS NOT NULL;

REVOKE ALL ON TABLE public.public_data_export_crags_v1
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON TABLE public.public_data_export_routes_v1
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON TABLE public.public_data_export_route_lines_v1
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON TABLE public.public_data_export_sectors_v1
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON TABLE public.public_data_export_tombstones_v1
  FROM PUBLIC, anon, authenticated, service_role;

GRANT SELECT ON TABLE public.public_data_export_crags_v1 TO public_data_export_reader;
GRANT SELECT ON TABLE public.public_data_export_routes_v1 TO public_data_export_reader;
GRANT SELECT ON TABLE public.public_data_export_route_lines_v1 TO public_data_export_reader;
GRANT SELECT ON TABLE public.public_data_export_sectors_v1 TO public_data_export_reader;
GRANT SELECT ON TABLE public.public_data_export_tombstones_v1 TO public_data_export_reader;

COMMENT ON VIEW public.public_data_export_crags_v1 IS
  'Versioned public crag export with location visibility applied.';
COMMENT ON VIEW public.public_data_export_routes_v1 IS
  'Versioned public route export with the stricter route/crag location policy applied.';
COMMENT ON VIEW public.public_data_export_route_lines_v1 IS
  'Versioned public route geometry export limited to deliverable media.';
COMMENT ON VIEW public.public_data_export_sectors_v1 IS
  'Versioned public sector export under eligible crags.';
COMMENT ON VIEW public.public_data_export_tombstones_v1 IS
  'Versioned crag and route deletion markers without deletion reasons.';

-- The owner can evaluate the views but cannot log in. The workflow role can
-- read only the sanitized views and has no source-table privileges.
GRANT CREATE ON SCHEMA public TO public_data_export_owner;
GRANT public_data_export_owner TO postgres;
ALTER VIEW public.public_data_export_crags_v1 OWNER TO public_data_export_owner;
ALTER VIEW public.public_data_export_routes_v1 OWNER TO public_data_export_owner;
ALTER VIEW public.public_data_export_route_lines_v1 OWNER TO public_data_export_owner;
ALTER VIEW public.public_data_export_sectors_v1 OWNER TO public_data_export_owner;
ALTER VIEW public.public_data_export_tombstones_v1 OWNER TO public_data_export_owner;
REVOKE public_data_export_owner FROM postgres;
REVOKE CREATE ON SCHEMA public FROM public_data_export_owner;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_auth_members
    WHERE roleid IN ('public_data_export_owner'::regrole, 'public_data_export_reader'::regrole)
      AND member <> 'postgres'::regrole
  ) OR EXISTS (
    SELECT 1 FROM pg_auth_members
    WHERE roleid IN ('public_data_export_owner'::regrole, 'public_data_export_reader'::regrole)
      AND member = 'postgres'::regrole
      AND (inherit_option OR set_option)
  ) OR EXISTS (
    SELECT 1 FROM pg_auth_members
    WHERE member IN ('public_data_export_owner'::regrole, 'public_data_export_reader'::regrole)
  ) THEN
    RAISE EXCEPTION 'public data export roles have unexpected memberships';
  END IF;
END
$$;
