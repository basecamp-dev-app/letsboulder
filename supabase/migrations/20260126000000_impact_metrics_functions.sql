-- Migration: Add impact metrics RPC functions
-- Purpose: Create reusable functions for counting community impact metrics

set check_function_bodies = off;

CREATE OR REPLACE FUNCTION public.get_verified_routes_count()
 RETURNS bigint
 LANGUAGE sql
 SECURITY DEFINER
AS $function$
  SELECT COUNT(*) FROM climbs
  WHERE (verification_count >= 3 OR is_verified = true)
  AND deleted_at IS NULL;
$function$
;

CREATE OR REPLACE FUNCTION public.get_total_sends_count()
 RETURNS bigint
 LANGUAGE sql
 SECURITY DEFINER
AS $function$
  SELECT COUNT(*) FROM logs
  WHERE status IN ('completed', 'flash', 'onsight');
$function$
;

CREATE OR REPLACE FUNCTION public.get_boulders_with_gps_count()
 RETURNS bigint
 LANGUAGE sql
 SECURITY DEFINER
AS $function$
  SELECT COUNT(DISTINCT c.crag_id)
  FROM climbs c
  INNER JOIN crags cr ON c.crag_id = cr.id
  WHERE c.deleted_at IS NULL
  AND cr.latitude IS NOT NULL
  AND cr.longitude IS NOT NULL;
$function$
;

CREATE OR REPLACE FUNCTION public.get_community_photos_count()
 RETURNS bigint
 LANGUAGE sql
 SECURITY DEFINER
AS $function$
  SELECT COUNT(*) FROM images;
$function$
;

CREATE OR REPLACE FUNCTION public.get_active_climbers_count()
 RETURNS bigint
 LANGUAGE sql
 SECURITY DEFINER
AS $function$
  SELECT COUNT(DISTINCT user_id) FROM logs
  WHERE date_climbed >= NOW() - INTERVAL '60 days';
$function$
;

CREATE OR REPLACE FUNCTION public.get_total_climbs_count()
 RETURNS bigint
 LANGUAGE sql
 SECURITY DEFINER
AS $function$
  SELECT COUNT(*) FROM climbs WHERE deleted_at IS NULL;
$function$
;

CREATE OR REPLACE FUNCTION public.get_total_logs_count()
 RETURNS bigint
 LANGUAGE sql
 SECURITY DEFINER
AS $function$
  SELECT COUNT(*) FROM logs;
$function$
;
