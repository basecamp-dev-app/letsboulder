-- Read-only hosted production verification. This script never inserts, updates,
-- deletes, changes roles permanently, or manipulates migration history.
DO $verification$
DECLARE
  missing_columns text[];
  missing_functions text[];
  missing_views text[];
  governance_count integer;
  export_role record;
BEGIN
  SELECT array_agg(expected.column_name ORDER BY expected.column_name)
  INTO missing_columns
  FROM unnest(ARRAY[
    'publication_status', 'content_origin', 'published_at', 'published_by',
    'reviewed_at', 'reviewed_by', 'publication_notes', 'readiness_version'
  ]) AS expected(column_name)
  WHERE NOT EXISTS (
    SELECT 1 FROM information_schema.columns AS actual
    WHERE actual.table_schema = 'public' AND actual.table_name = 'crags'
      AND actual.column_name = expected.column_name
  );
  IF missing_columns IS NOT NULL THEN
    RAISE EXCEPTION 'Missing crag governance columns: %', missing_columns;
  END IF;

  SELECT array_agg(expected.signature ORDER BY expected.signature)
  INTO missing_functions
  FROM unnest(ARRAY[
    'public.set_crag_publication_status(uuid,text,text)',
    'public.resolve_public_crag_slug(text,text)',
    'public.resolve_public_climb_slug(text,text,text)',
    'public.get_public_impact_metrics_v1()'
  ]) AS expected(signature)
  WHERE to_regprocedure(expected.signature) IS NULL;
  IF missing_functions IS NOT NULL THEN
    RAISE EXCEPTION 'Missing governance functions: %', missing_functions;
  END IF;

  SELECT array_agg(expected.view_name ORDER BY expected.view_name)
  INTO missing_views
  FROM unnest(ARRAY[
    'public_data_export_crags_v1',
    'public_data_export_routes_v1',
    'public_data_export_sectors_v1'
  ]) AS expected(view_name)
  WHERE NOT EXISTS (
    SELECT 1 FROM pg_class AS relation
    JOIN pg_namespace AS namespace ON namespace.oid = relation.relnamespace
    WHERE namespace.nspname = 'public' AND relation.relname = expected.view_name
      AND relation.relkind = 'v'
      AND pg_get_userbyid(relation.relowner) = 'public_data_export_owner'
  );
  IF missing_views IS NOT NULL THEN
    RAISE EXCEPTION 'Missing or incorrectly owned export views: %', missing_views;
  END IF;

  SELECT count(*) INTO governance_count
  FROM supabase_migrations.schema_migrations
  WHERE version = '20260828150000';
  IF governance_count <> 1 THEN
    RAISE EXCEPTION 'Governance migration history count is %, expected exactly 1', governance_count;
  END IF;

  SELECT rolcanlogin, rolinherit, rolbypassrls
  INTO export_role
  FROM pg_roles WHERE rolname = 'public_data_export_owner';
  IF NOT FOUND OR export_role.rolcanlogin OR export_role.rolinherit OR export_role.rolbypassrls THEN
    RAISE EXCEPTION 'public_data_export_owner role attributes are not NOLOGIN, NOINHERIT, NOBYPASSRLS';
  END IF;

  IF EXISTS (
    SELECT 1 FROM pg_auth_members
    WHERE roleid = 'public_data_export_owner'::regrole
      AND member = 'postgres'::regrole
      AND (inherit_option OR set_option)
  ) THEN
    RAISE EXCEPTION 'postgres retains inherited or settable public_data_export_owner membership';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'crags'
      AND policyname = 'Public read published crags'
      AND 'anon' = ANY(roles) AND 'authenticated' = ANY(roles)
  ) OR NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'crags'
      AND policyname = 'Crag stewards read active unpublished crags'
  ) OR NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'crag_publication_events'
      AND policyname = 'Crag stewards read publication history'
  ) THEN
    RAISE EXCEPTION 'Expected publication policies are not installed';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgrelid = 'public.crags'::regclass
      AND tgname = 'crags_guard_publication_fields' AND NOT tgisinternal
  ) OR col_description('public.crags'::regclass, (
    SELECT attnum FROM pg_attribute
    WHERE attrelid = 'public.crags'::regclass AND attname = 'publication_status'
  )) IS NULL THEN
    RAISE EXCEPTION 'Governance trigger or publication_status comment is missing';
  END IF;

  IF NOT has_schema_privilege(current_user, 'supabase_migrations', 'USAGE')
    OR NOT has_table_privilege(current_user, 'supabase_migrations.schema_migrations', 'SELECT,INSERT') THEN
    RAISE EXCEPTION 'Verification runner cannot access migration bookkeeping';
  END IF;

  PERFORM public.get_public_impact_metrics_v1();
  PERFORM * FROM public.resolve_public_crag_slug('ZZ', 'hosted-production-verification-missing');
  PERFORM * FROM public.resolve_public_climb_slug('ZZ', 'hosted-production-verification-missing', 'missing');
END
$verification$;

BEGIN READ ONLY;
SET LOCAL ROLE anon;
SELECT 1 / CASE
  WHEN EXISTS (
    SELECT 1 FROM public.crags
    WHERE publication_status IS DISTINCT FROM 'published'
  ) THEN 0
  ELSE 1
END AS unpublished_crags_hidden_from_anon;
ROLLBACK;

SELECT jsonb_build_object(
  'verified', true,
  'session_user', session_user,
  'current_user', current_user,
  'governance_migration_count', (
    SELECT count(*) FROM supabase_migrations.schema_migrations
    WHERE version = '20260828150000'
  )
) AS hosted_production_verification;
