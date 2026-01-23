-- Add DELETE policies for admins on climbs and images tables
-- This allows admin flag resolution to hard delete content

-- Add DELETE policy for admins on climbs table
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'climbs' AND policyname = 'Admins can delete climbs'
  ) THEN
    CREATE POLICY "Admins can delete climbs" ON climbs
    FOR DELETE
    USING (
      EXISTS (
        SELECT 1 FROM profiles
        WHERE profiles.id = auth.uid() AND profiles.is_admin = true
      )
    );
  END IF;
END $$;

-- Add DELETE policy for admins on images table
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'images' AND policyname = 'Admins can delete images'
  ) THEN
    CREATE POLICY "Admins can delete images" ON images
    FOR DELETE
    USING (
      EXISTS (
        SELECT 1 FROM profiles
        WHERE profiles.id = auth.uid() AND profiles.is_admin = true
      )
    );
  END IF;
END $$;
