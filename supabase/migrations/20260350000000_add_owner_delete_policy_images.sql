-- Add DELETE policy for image owners to delete their own submissions
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'images' AND policyname = 'Owner can delete own images'
  ) THEN
    CREATE POLICY "Owner can delete own images" ON images
    FOR DELETE
    USING (auth.uid() = created_by);
  END IF;
END $$;
