set check_function_bodies = off;

CREATE OR REPLACE FUNCTION public.get_community_contributors_count()
 RETURNS bigint
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT COUNT(*)
  FROM (
    SELECT user_id AS contributor_id
    FROM public.climbs
    WHERE user_id IS NOT NULL

    UNION

    SELECT created_by AS contributor_id
    FROM public.images
    WHERE created_by IS NOT NULL
  ) AS contributors;
$function$
;
