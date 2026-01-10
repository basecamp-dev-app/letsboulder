-- Migration: Add Region and Report Features to Crags
-- Created: 2026-01-10

-- 1. Add region_name column if not exists
ALTER TABLE crags ADD COLUMN IF NOT EXISTS region_name VARCHAR(100);

-- 2. Add report columns if not exists
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'crags' AND column_name = 'report_count') THEN
        ALTER TABLE crags ADD COLUMN report_count INTEGER DEFAULT 0;
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'crags' AND column_name = 'is_flagged') THEN
        ALTER TABLE crags ADD COLUMN is_flagged BOOLEAN DEFAULT FALSE;
    END IF;
END $$;

-- 3. Drop unique constraint on lat/lon if it exists
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_constraints WHERE conname = 'crags_latitude_longitude_key') THEN
        ALTER TABLE crags DROP CONSTRAINT crags_latitude_longitude_key;
    END IF;
END $$;

-- 4. Create crag_reports table if not exists
CREATE TABLE IF NOT EXISTS crag_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  crag_id UUID REFERENCES crags(id) ON DELETE CASCADE,
  reporter_id UUID,
  reason TEXT NOT NULL,
  status VARCHAR(20) DEFAULT 'pending',
  moderator_id UUID,
  moderator_note TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  resolved_at TIMESTAMPTZ
);

-- 5. Create indexes for fast lookups
CREATE INDEX IF NOT EXISTS idx_crag_reports_crag_id ON crag_reports(crag_id);
CREATE INDEX IF NOT EXISTS idx_crag_reports_status ON crag_reports(status);
CREATE INDEX IF NOT EXISTS idx_crags_report_count ON crags(report_count);
CREATE INDEX IF NOT EXISTS idx_crags_is_flagged ON crags(is_flagged);
