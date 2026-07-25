CREATE OR REPLACE FUNCTION public.get_logbook_lifetime_stats(p_user_id uuid)
RETURNS TABLE (
  total_climbs bigint,
  total_flashes bigint,
  total_tops bigint,
  total_tries bigint
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = ''
AS $$
  SELECT
    COUNT(*)::bigint AS total_climbs,
    COUNT(*) FILTER (WHERE style = 'flash')::bigint AS total_flashes,
    COUNT(*) FILTER (WHERE style = 'top')::bigint AS total_tops,
    COUNT(*) FILTER (WHERE style = 'try')::bigint AS total_tries
  FROM public.user_climbs
  WHERE user_id = p_user_id;
$$;

REVOKE ALL ON FUNCTION public.get_logbook_lifetime_stats(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_logbook_lifetime_stats(uuid) TO anon, authenticated, service_role;
