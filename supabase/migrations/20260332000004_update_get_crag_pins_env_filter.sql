-- =====================================================
-- Update get_crag_pins() to support env-aware pending filter
-- Created: 2026-02-25
-- =====================================================

CREATE OR REPLACE FUNCTION public.get_crag_pins(include_pending BOOLEAN DEFAULT FALSE)
RETURNS TABLE (
  id UUID,
  name TEXT,
  latitude NUMERIC(10,8),
  longitude NUMERIC(11,8),
  image_count BIGINT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  RETURN QUERY
  SELECT
    c.id,
    c.name::TEXT,
    AVG(i.latitude)::NUMERIC(10,8) AS latitude,
    AVG(i.longitude)::NUMERIC(11,8) AS longitude,
    COUNT(i.id)::BIGINT AS image_count
  FROM public.crags c
  INNER JOIN public.images i ON i.crag_id = c.id
    AND i.status != 'deleted'
    AND (
      i.status = 'approved'
      OR (include_pending AND i.status = 'pending')
    )
    AND i.latitude IS NOT NULL
    AND i.longitude IS NOT NULL
  GROUP BY c.id, c.name
  HAVING COUNT(i.id) > 0;
END;
$$;
