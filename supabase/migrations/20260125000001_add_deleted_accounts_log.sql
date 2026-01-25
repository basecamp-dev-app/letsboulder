-- Create table to log deleted accounts for audit trail
-- This table persists even after user deletion from auth.users

CREATE TABLE IF NOT EXISTS public.deleted_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  email TEXT NOT NULL,
  deleted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  delete_route_uploads BOOLEAN NOT NULL DEFAULT false,
  metadata JSONB DEFAULT '{}'::jsonb
);

-- Index for querying deleted accounts by user_id
CREATE INDEX IF NOT EXISTS idx_deleted_accounts_user_id ON public.deleted_accounts(user_id);

-- Index for querying deleted accounts by email (for searching)
CREATE INDEX IF NOT EXISTS idx_deleted_accounts_email ON public.deleted_accounts(email);

-- Index for querying recent deletions
CREATE INDEX IF NOT EXISTS idx_deleted_accounts_deleted_at ON public.deleted_accounts(deleted_at DESC);

-- Grant read access to authenticated users (for viewing their own deletion record)
GRANT SELECT ON TABLE public.deleted_accounts TO authenticated;
GRANT SELECT ON TABLE public.deleted_accounts TO anon;

-- Grant insert access to service_role (for logging deletions)
GRANT INSERT, DELETE ON TABLE public.deleted_accounts TO service_role;
