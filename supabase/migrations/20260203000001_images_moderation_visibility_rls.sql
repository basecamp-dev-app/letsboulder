-- Images: moderation visibility (approved public, owner/admin can see all)
-- Pending/rejected images are hidden from everyone except uploader/admin.

DO $$
BEGIN
  -- Ensure RLS is enabled
  ALTER TABLE public.images ENABLE ROW LEVEL SECURITY;

  -- Public can read approved images; owners/admins can read any moderation status
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'images' AND policyname = 'Images read visibility'
  ) THEN
    CREATE POLICY "Images read visibility" ON public.images
    FOR SELECT
    USING (
      moderation_status = 'approved'
      OR created_by = auth.uid()
      OR EXISTS (
        SELECT 1
        FROM public.profiles
        WHERE profiles.id = auth.uid() AND profiles.is_admin = true
      )
    );
  END IF;
END $$;
