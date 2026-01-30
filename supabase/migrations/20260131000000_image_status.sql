-- Add status column to images table for content moderation
ALTER TABLE images ADD COLUMN status VARCHAR(20) DEFAULT 'pending' NOT NULL CHECK (status IN ('pending', 'approved', 'rejected'));

-- Update existing images to approved (backwards compatibility)
UPDATE images SET status = 'approved' WHERE status IS NULL;

-- Add index for faster pending image queries
CREATE INDEX idx_images_status ON images(status) WHERE status = 'pending';
