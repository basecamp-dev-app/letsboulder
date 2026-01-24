-- Add DELETE policy for admins on crags table
-- This allows admin flag resolution to hard delete crags

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'crags' AND policyname = 'Admins can delete crags'
  ) THEN
    CREATE POLICY "Admins can delete crags" ON crags
    FOR DELETE
    USING (
      EXISTS (
        SELECT 1 FROM profiles
        WHERE profiles.id = auth.uid() AND profiles.is_admin = true
      )
    );
  END IF;
END $$;
