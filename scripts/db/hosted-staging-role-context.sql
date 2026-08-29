-- Read-only diagnostics for the hosted project selected by the Staging workflow.
-- This intentionally does not SET ROLE or change memberships.
SELECT jsonb_build_object(
  'session_user', session_user,
  'current_user', current_user,
  'relation_owners', COALESCE((
    SELECT jsonb_object_agg(rel.relname, pg_get_userbyid(rel.relowner))
    FROM pg_class AS rel
    JOIN pg_namespace AS namespace ON namespace.oid = rel.relnamespace
    WHERE namespace.nspname = 'public'
      AND rel.relname IN (
        'crags',
        'public_data_export_crags_v1',
        'public_data_export_routes_v1',
        'public_data_export_sectors_v1'
      )
  ), '{}'::jsonb),
  'export_roles', COALESCE((
    SELECT jsonb_agg(jsonb_build_object(
      'role', role.rolname,
      'login', role.rolcanlogin,
      'inherit', role.rolinherit,
      'bypass_rls', role.rolbypassrls
    ) ORDER BY role.rolname)
    FROM pg_roles AS role
    WHERE role.rolname IN ('public_data_export_owner', 'public_data_export_reader')
  ), '[]'::jsonb),
  'export_memberships', COALESCE((
    SELECT jsonb_agg(jsonb_build_object(
      'role', granted.rolname,
      'member', member.rolname,
      'grantor', grantor.rolname,
      'inherit_option', membership.inherit_option,
      'set_option', membership.set_option
    ) ORDER BY granted.rolname, member.rolname)
    FROM pg_auth_members AS membership
    JOIN pg_roles AS granted ON granted.oid = membership.roleid
    JOIN pg_roles AS member ON member.oid = membership.member
    JOIN pg_roles AS grantor ON grantor.oid = membership.grantor
    WHERE granted.rolname IN ('public_data_export_owner', 'public_data_export_reader')
       OR member.rolname IN ('public_data_export_owner', 'public_data_export_reader')
  ), '[]'::jsonb),
  'migration_schema', jsonb_build_object(
    'exists', to_regnamespace('supabase_migrations') IS NOT NULL,
    'session_user_usage', CASE WHEN to_regnamespace('supabase_migrations') IS NULL THEN NULL
      ELSE has_schema_privilege(session_user, 'supabase_migrations', 'USAGE') END,
    'current_user_usage', CASE WHEN to_regnamespace('supabase_migrations') IS NULL THEN NULL
      ELSE has_schema_privilege(current_user, 'supabase_migrations', 'USAGE') END,
    'history_table_exists', to_regclass('supabase_migrations.schema_migrations') IS NOT NULL,
    'session_user_history_privileges', CASE
      WHEN to_regclass('supabase_migrations.schema_migrations') IS NULL THEN NULL
      ELSE has_table_privilege(session_user, 'supabase_migrations.schema_migrations', 'SELECT,INSERT,UPDATE,DELETE') END,
    'current_user_history_privileges', CASE
      WHEN to_regclass('supabase_migrations.schema_migrations') IS NULL THEN NULL
      ELSE has_table_privilege(current_user, 'supabase_migrations.schema_migrations', 'SELECT,INSERT,UPDATE,DELETE') END
  )
) AS hosted_role_context;
