-- Add covering index for nearby crags query
-- This index includes all columns needed by the query, avoiding heap lookups

CREATE INDEX IF NOT EXISTS idx_crags_nearby_cover 
ON crags(latitude, longitude) 
INCLUDE (id, name, rock_type, type);
