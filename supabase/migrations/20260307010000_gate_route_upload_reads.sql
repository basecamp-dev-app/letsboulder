-- Gate private route upload reads:
-- - anyone can read approved images
-- - uploader can read their own uploads (for submit flow preview before moderation)

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'storage'
      AND tablename = 'objects'
      AND policyname = 'Route uploads read gated'
  ) THEN
    EXECUTE 'DROP POLICY "Route uploads read gated" ON storage.objects';
  END IF;

  EXECUTE $policy$
    CREATE POLICY "Route uploads read gated"
    ON storage.objects
    FOR SELECT
    TO public
    USING (
      bucket_id = 'route-uploads'
      AND (
        split_part(name, '/', 1) = auth.uid()::text
        OR EXISTS (
          SELECT 1
          FROM public.images i
          WHERE i.storage_bucket = 'route-uploads'
            AND i.storage_path = storage.objects.name
            AND coalesce(i.moderation_status, 'pending') = 'approved'
        )
      )
    )
  $policy$;
END $$;
