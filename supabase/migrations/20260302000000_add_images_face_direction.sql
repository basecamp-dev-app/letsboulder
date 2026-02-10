ALTER TABLE images
ADD COLUMN IF NOT EXISTS face_direction VARCHAR(2);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'images_face_direction_check'
      AND conrelid = 'images'::regclass
  ) THEN
    ALTER TABLE images
    ADD CONSTRAINT images_face_direction_check
    CHECK (face_direction IS NULL OR face_direction IN ('N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'));
  END IF;
END $$;
