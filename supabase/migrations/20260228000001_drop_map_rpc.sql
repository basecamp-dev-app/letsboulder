-- Cleanup: drop the experimental map RPC function.

DROP FUNCTION IF EXISTS public.get_map_crag_points(
  double precision,
  double precision,
  double precision,
  double precision,
  integer
);
