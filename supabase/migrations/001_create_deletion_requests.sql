-- Migration: Create deletion_requests table for account deletion workflow
-- Run this in Supabase SQL Editor

CREATE TABLE IF NOT EXISTS deletion_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  scheduled_at TIMESTAMPTZ NOT NULL,
  cancelled_at TIMESTAMPTZ,
  delete_route_uploads BOOLEAN DEFAULT FALSE NOT NULL,
  primary_reason TEXT,
  deleted_at TIMESTAMPTZ
);

-- Create index for efficient cleanup queries
CREATE INDEX IF NOT EXISTS idx_deletion_requests_scheduled
ON deletion_requests(scheduled_at)
WHERE cancelled_at IS NULL AND deleted_at IS NULL;
