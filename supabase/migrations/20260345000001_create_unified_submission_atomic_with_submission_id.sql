-- Historical placeholder for a remote-only migration applied on 2026-03-31.
-- The live schema is defined by subsequent canonical migrations already present
-- in git, including 20260337000003_fix_create_unified_submission.sql.
-- Keeping this version in repo restores a complete migration ledger without
-- replaying superseded SQL during local rebuilds.

DO $$
BEGIN
  RAISE NOTICE 'Historical migration 20260345000001 retained for canonical history; no schema changes applied here.';
END;
$$;
