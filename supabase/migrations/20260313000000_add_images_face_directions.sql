ALTER TABLE images
ADD COLUMN IF NOT EXISTS face_directions TEXT[];

UPDATE images
SET face_directions = ARRAY[face_direction]
WHERE face_direction IS NOT NULL
  AND (face_directions IS NULL OR array_length(face_directions, 1) IS NULL);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'images_face_directions_check'
      AND conrelid = 'images'::regclass
  ) THEN
    ALTER TABLE images
    ADD CONSTRAINT images_face_directions_check
    CHECK (
      face_directions IS NULL
      OR face_directions <@ ARRAY['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW']::TEXT[]
    );
  END IF;
END $$;
