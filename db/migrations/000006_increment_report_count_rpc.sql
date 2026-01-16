-- Migration: Add increment_crag_report_count RPC function
-- Created: 2026-01-16

CREATE OR REPLACE FUNCTION increment_crag_report_count(target_crag_id UUID)
RETURNS void AS $$
BEGIN
  UPDATE crags SET report_count = report_count + 1 WHERE id = target_crag_id;
END;
$$ LANGUAGE plpgsql;
