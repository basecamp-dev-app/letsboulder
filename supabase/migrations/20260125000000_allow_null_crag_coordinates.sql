-- Allow crag coordinates to be NULL (will be calculated from climbs later)
ALTER TABLE crags ALTER COLUMN latitude DROP NOT NULL;
ALTER TABLE crags ALTER COLUMN longitude DROP NOT NULL;
