-- Fix get_community_photos_count to only count published, unique photos displayed on the map
-- Previously counted ALL images including pending/rejected/deleted, variants, and orphaned images (no crag_id)
-- Conditional: only create if required columns exist

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'images' 
    AND column_name = 'status'
  ) AND EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'images' 
    AND column_name = 'moderation_status'
  ) AND EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'images' 
    AND column_name = 'processing_status'
  ) THEN
    EXECUTE $func$
      CREATE OR REPLACE FUNCTION "public"."get_community_photos_count"() RETURNS bigint
      LANGUAGE "sql" SECURITY DEFINER
      SET "search_path" TO 'public', 'auth', 'extensions'
      AS $inner$
        SELECT COUNT(*)
        FROM images
        WHERE status = 'approved'
          AND moderation_status = 'approved'
          AND processing_status = 'ready'
          AND parent_image_id IS NULL
          AND crag_id IS NOT NULL;
      $inner$
    $func$;
  ELSE
    RAISE NOTICE 'Skipping get_community_photos_count function - required columns do not exist';
  END IF;
END $$;
