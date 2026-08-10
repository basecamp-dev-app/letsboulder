CREATE OR REPLACE FUNCTION public.resolve_legacy_route_redirect(
  p_country_code text,
  p_crag_slug text,
  p_climb_slug text
)
RETURNS TABLE (
  country_code text,
  crag_slug text,
  climb_slug text,
  effective_climb_id uuid,
  image_id uuid
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  WITH resolved_climb AS (
    SELECT *
    FROM public.resolve_public_climb_slug(p_country_code, p_crag_slug, p_climb_slug)
    LIMIT 1
  ), selected_climb AS (
    SELECT
      resolved_climb.id,
      resolved_climb.slug,
      resolved_climb.crag_id,
      COALESCE(climbs.shared_climb_id, climbs.id) AS effective_climb_id
    FROM resolved_climb
    JOIN public.climbs ON climbs.id = resolved_climb.id
    WHERE climbs.status IN ('active', 'approved')
  ), selected_route_line AS (
    SELECT route_lines.image_id
    FROM selected_climb
    JOIN public.route_lines ON route_lines.climb_id = selected_climb.id
    JOIN public.images ON images.id = route_lines.image_id
    WHERE images.url IS NOT NULL
    ORDER BY
      images.is_verified DESC NULLS LAST,
      images.verification_count DESC NULLS LAST,
      images.created_at DESC NULLS LAST,
      route_lines.id ASC
    LIMIT 1
  ), selected_crag_image AS (
    SELECT crag_images.linked_image_id
    FROM selected_climb
    JOIN selected_route_line ON true
    JOIN public.crag_images
      ON crag_images.crag_id = selected_climb.crag_id
      AND crag_images.linked_image_id = selected_route_line.image_id
    ORDER BY crag_images.created_at DESC NULLS LAST, crag_images.id ASC
    LIMIT 1
  )
  SELECT
    crags.country_code,
    crags.slug,
    selected_climb.slug,
    selected_climb.effective_climb_id,
    COALESCE(selected_crag_image.linked_image_id, selected_route_line.image_id)
  FROM selected_climb
  JOIN public.crags ON crags.id = selected_climb.crag_id
  JOIN selected_route_line ON true
  LEFT JOIN selected_crag_image ON true
  WHERE crags.country_code IS NOT NULL AND crags.slug IS NOT NULL;
$$;

CREATE OR REPLACE FUNCTION public.resolve_legacy_climb_redirect(p_climb_id uuid)
RETURNS TABLE (
  country_code text,
  crag_slug text,
  effective_climb_id uuid,
  route_id uuid,
  image_id uuid
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  WITH selected_climb AS (
    SELECT climbs.id, climbs.crag_id, COALESCE(climbs.shared_climb_id, climbs.id) AS effective_climb_id
    FROM public.climbs
    WHERE climbs.id = p_climb_id
  ), aliases AS (
    SELECT climbs.id
    FROM public.climbs
    JOIN selected_climb
      ON climbs.id = selected_climb.effective_climb_id
      OR climbs.shared_climb_id = selected_climb.effective_climb_id
  ), selected_route_line AS (
    SELECT route_lines.id, route_lines.image_id
    FROM public.route_lines
    JOIN aliases ON aliases.id = route_lines.climb_id
    ORDER BY route_lines.sequence_order ASC NULLS LAST, route_lines.created_at ASC, route_lines.id ASC
    LIMIT 1
  ), selected_crag_image AS (
    SELECT crag_images.linked_image_id
    FROM selected_climb
    JOIN selected_route_line ON true
    JOIN public.crag_images
      ON crag_images.crag_id = selected_climb.crag_id
      AND crag_images.linked_image_id = selected_route_line.image_id
    ORDER BY crag_images.created_at DESC NULLS LAST, crag_images.id ASC
    LIMIT 1
  )
  SELECT
    crags.country_code,
    crags.slug,
    selected_climb.effective_climb_id,
    selected_route_line.id,
    COALESCE(selected_crag_image.linked_image_id, selected_route_line.image_id)
  FROM selected_climb
  JOIN public.crags ON crags.id = selected_climb.crag_id
  JOIN selected_route_line ON true
  LEFT JOIN selected_crag_image ON true
  WHERE crags.country_code IS NOT NULL AND crags.slug IS NOT NULL;
$$;

CREATE OR REPLACE FUNCTION public.resolve_legacy_image_redirect(p_image_id uuid)
RETURNS TABLE (
  country_code text,
  crag_slug text,
  image_id uuid
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  (
    SELECT
      crags.country_code,
      crags.slug,
      COALESCE(crag_images.linked_image_id, crag_images.id) AS image_id
    FROM public.crag_images
    JOIN public.crags ON crags.id = crag_images.crag_id
    WHERE crag_images.id = p_image_id OR crag_images.linked_image_id = p_image_id
    ORDER BY crag_images.created_at DESC NULLS LAST, crag_images.id ASC
    LIMIT 1
  )
  UNION ALL
  (
    SELECT crags.country_code, crags.slug, images.id
    FROM public.images
    JOIN public.crags ON crags.id = images.crag_id
    WHERE images.id = p_image_id
      AND NOT EXISTS (
        SELECT 1
        FROM public.crag_images
        WHERE crag_images.id = p_image_id OR crag_images.linked_image_id = p_image_id
      )
    LIMIT 1
  );
$$;

REVOKE ALL ON FUNCTION public.resolve_legacy_route_redirect(text, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.resolve_legacy_climb_redirect(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.resolve_legacy_image_redirect(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.resolve_legacy_route_redirect(text, text, text) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.resolve_legacy_climb_redirect(uuid) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.resolve_legacy_image_redirect(uuid) TO anon, authenticated, service_role;
