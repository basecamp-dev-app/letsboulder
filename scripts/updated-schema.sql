-- Create crags table (more generic than boulders)
CREATE TABLE crags (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT,
  latitude DECIMAL(10, 8),
  longitude DECIMAL(11, 8),
  type VARCHAR(20) DEFAULT 'crag', -- crag, boulder, sport, trad, etc.
  tide_level VARCHAR(20),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(latitude, longitude)
);

-- Create climbs table
CREATE TABLE climbs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  crag_id UUID REFERENCES crags(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  grade VARCHAR(10),
  description TEXT,
  coordinates JSONB NOT NULL,
  image_url TEXT NOT NULL,
  status VARCHAR(20) DEFAULT 'pending',
  created_by UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  approved_at TIMESTAMPTZ,
  rejected_reason TEXT
);

-- Create admin_actions table
CREATE TABLE admin_actions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  climb_id UUID REFERENCES climbs(id) ON DELETE CASCADE,
  admin_id UUID REFERENCES auth.users(id),
  action VARCHAR(20),
  reason TEXT,
  performed_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE crags ENABLE ROW LEVEL SECURITY;
ALTER TABLE climbs ENABLE ROW LEVEL SECURITY;
ALTER TABLE admin_actions ENABLE ROW LEVEL SECURITY;

-- RLS Policies
-- Crags: anyone can read, authenticated can insert
CREATE POLICY "Anyone can view crags" ON crags FOR SELECT USING (true);
CREATE POLICY "Authenticated users can create crags" ON crags FOR INSERT WITH CHECK (auth.role() = 'authenticated');

-- Climbs: approved climbs public, pending only to creator and admins
CREATE POLICY "Approved climbs are public" ON climbs FOR SELECT USING (status = 'approved');
CREATE POLICY "Users can view their own climbs" ON climbs FOR SELECT USING (auth.uid() = created_by);
CREATE POLICY "Admins can view all climbs" ON climbs FOR SELECT USING (auth.jwt() ->> 'role' = 'admin');
CREATE POLICY "Authenticated users can create climbs" ON climbs FOR INSERT WITH CHECK (auth.role() = 'authenticated');
CREATE POLICY "Users can update their own pending climbs" ON climbs FOR UPDATE USING (auth.uid() = created_by AND status = 'pending');
CREATE POLICY "Admins can update any climb" ON climbs FOR UPDATE USING (auth.jwt() ->> 'role' = 'admin');

-- Admin actions: only admins
CREATE POLICY "Admins can manage admin actions" ON admin_actions FOR ALL USING (auth.jwt() ->> 'role' = 'admin');

-- =====================================================
-- WOODAH MIGRATION COLUMNS (One-time use - delete after migration)
-- =====================================================

-- Add legacy_id column for mapping old crag IDs during migration
ALTER TABLE crags ADD COLUMN legacy_id INTEGER;

-- Add route_type column to distinguish boulder/sport/trad
ALTER TABLE climbs ADD COLUMN route_type VARCHAR(20) DEFAULT 'boulder';

-- Add tide_dependency column (tide level specific to this climb)
ALTER TABLE climbs ADD COLUMN tide_dependency INTEGER;

-- Remove unique constraint on coordinates (now optional for approved climbs)
-- Note: This is a breaking change - only run if you understand the implications
-- ALTER TABLE climbs ALTER COLUMN coordinates DROP NOT NULL;