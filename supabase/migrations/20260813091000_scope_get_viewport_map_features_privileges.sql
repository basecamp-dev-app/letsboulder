ALTER FUNCTION public.get_viewport_map_features(
  double precision, double precision, double precision, double precision, integer, boolean
) OWNER TO postgres;

REVOKE ALL ON FUNCTION public.get_viewport_map_features(
  double precision, double precision, double precision, double precision, integer, boolean
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_viewport_map_features(
  double precision, double precision, double precision, double precision, integer, boolean
) TO service_role;
