select pg_get_function_identity_arguments(p.oid) as args,
       pg_get_function_result(p.oid) as returns
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname='public' and p.proname='get_map_crag_points';