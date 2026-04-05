-- Historical placeholder for a remote-only grant migration applied on 2026-03-31.
-- Function grants are managed by subsequent canonical migrations already in git,
-- including 20260337000004_grant_function_permissions.sql.

DO $$
BEGIN
  RAISE NOTICE 'Historical migration 20260345000004 retained for canonical history; no schema changes applied here.';
END;
$$;
