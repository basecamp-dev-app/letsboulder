-- =====================================================
-- Fix migration history sync issue
-- Created: 2026-02-01
-- =====================================================

-- This migration manually registers missing migrations
-- as applied in the remote database to fix sync issues

INSERT INTO supabase_schema.migrations (id, name)
VALUES ('20260120000000_verification_system', '20260120000000_verification_system')
ON CONFLICT (id) DO NOTHING;

INSERT INTO supabase_schema.migrations (id, name)
VALUES ('20260201000000_sync_google_profile', '20260201000000_sync_google_profile')
ON CONFLICT (id) DO NOTHING;
