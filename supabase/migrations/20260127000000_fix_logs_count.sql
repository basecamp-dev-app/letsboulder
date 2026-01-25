-- Migration: Fix get_total_logs_count to query user_climbs table
-- Previous version was querying empty 'logs' table instead of 'user_climbs'

set check_function_bodies = off;

CREATE OR REPLACE FUNCTION public.get_total_logs_count()
 RETURNS bigint
 LANGUAGE sql
 SECURITY DEFINER
AS $function$
  SELECT COUNT(*) FROM user_climbs;
$function$
;
