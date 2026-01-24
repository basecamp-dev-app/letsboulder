-- Change foreign keys to ON DELETE CASCADE for proper cascading deletes
-- When a crag is deleted, all associated climbs and images will be auto-deleted

-- First, get the current constraint names by attempting to drop and recreate

-- Drop existing foreign key constraint on climbs.crag_id
ALTER TABLE climbs DROP CONSTRAINT IF EXISTS climbs_crag_id_fkey;

-- Add new constraint with CASCADE
ALTER TABLE climbs ADD CONSTRAINT climbs_crag_id_fkey
  FOREIGN KEY (crag_id) REFERENCES crags(id) ON DELETE CASCADE;

-- Drop existing foreign key constraint on images.crag_id  
ALTER TABLE images DROP CONSTRAINT IF EXISTS images_crag_id_fkey;

-- Add new constraint with CASCADE
ALTER TABLE images ADD CONSTRAINT images_crag_id_fkey
  FOREIGN KEY (crag_id) REFERENCES crags(id) ON DELETE CASCADE;
