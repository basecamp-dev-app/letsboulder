-- Fix get_community_photos_count to only count published, unique photos displayed on the map
-- Previously counted ALL images including pending/rejected/deleted, variants, and orphaned images (no crag_id)

CREATE OR REPLACE FUNCTION "public"."get_community_photos_count"() RETURNS bigint
    LANGUAGE "sql" SECURITY DEFINER
    SET "search_path" TO 'public', 'auth', 'extensions'
    AS $$
  SELECT COUNT(*)
  FROM images
  WHERE status = 'approved'
    AND moderation_status = 'approved'
    AND processing_status = 'ready'
    AND parent_image_id IS NULL
    AND crag_id IS NOT NULL;
$$;
