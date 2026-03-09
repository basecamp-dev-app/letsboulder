set check_function_bodies = off;

CREATE OR REPLACE FUNCTION public.get_total_sends_count()
 RETURNS bigint
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT COUNT(*)
  FROM public.user_climbs
  WHERE style IN ('top', 'flash', 'onsight');
$function$
;

CREATE OR REPLACE FUNCTION public.get_active_climbers_count()
 RETURNS bigint
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT COUNT(DISTINCT user_id)
  FROM public.user_climbs
  WHERE created_at >= NOW() - INTERVAL '60 days'
    AND style IN ('top', 'flash', 'onsight');
$function$
;

CREATE OR REPLACE FUNCTION public.get_crags_mapped_count()
 RETURNS bigint
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT COUNT(*)
  FROM public.get_crag_pins(FALSE);
$function$
;
