-- Database security + hygiene audit queries
-- Run against dev first, then prod.

-- 1) Public tables missing RLS
SELECT n.nspname AS schema_name, c.relname AS table_name
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE c.relkind = 'r'
  AND n.nspname = 'public'
  AND c.relrowsecurity = false
ORDER BY 1, 2;

-- 2) Privileges granted to anon/authenticated on public tables
SELECT table_schema, table_name, grantee, privilege_type
FROM information_schema.role_table_grants
WHERE table_schema = 'public'
  AND grantee IN ('anon', 'authenticated')
ORDER BY table_name, grantee, privilege_type;

-- 3) SECURITY DEFINER functions missing explicit search_path
SELECT p.proname,
       n.nspname AS schema_name,
       pg_get_function_identity_arguments(p.oid) AS args,
       p.prosecdef,
       p.proconfig
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.prosecdef = true
  AND (
    p.proconfig IS NULL
    OR NOT EXISTS (
      SELECT 1
      FROM unnest(p.proconfig) cfg
      WHERE cfg LIKE 'search_path=%'
    )
  )
ORDER BY 2, 1;

-- 4) Policies with weak insert checks (authenticated only)
SELECT schemaname, tablename, policyname, with_check
FROM pg_policies
WHERE schemaname = 'public'
  AND cmd = 'INSERT'
  AND with_check ILIKE '%auth.role()%authenticated%'
ORDER BY tablename, policyname;

-- 5) Top table sizes
SELECT relname AS table_name,
       pg_size_pretty(pg_total_relation_size(relid)) AS total_size,
       n_live_tup
FROM pg_stat_user_tables
ORDER BY pg_total_relation_size(relid) DESC;

-- 6) Candidate idle tables (manual review before cleanup)
SELECT relname AS table_name,
       n_live_tup,
       COALESCE(last_vacuum, last_autovacuum) AS last_vacuum_at,
       GREATEST(
         COALESCE(last_seq_scan, 'epoch'::timestamp),
         COALESCE(last_idx_scan, 'epoch'::timestamp),
         COALESCE(last_analyze, 'epoch'::timestamp),
         COALESCE(last_autoanalyze, 'epoch'::timestamp)
       ) AS last_observed_activity
FROM pg_stat_user_tables
ORDER BY last_observed_activity NULLS FIRST, n_live_tup ASC;

-- 7) Orphan route-upload objects without DB image rows
SELECT o.name, o.created_at
FROM storage.objects o
LEFT JOIN public.images i
  ON i.storage_bucket = o.bucket_id
 AND i.storage_path = o.name
WHERE o.bucket_id = 'route-uploads'
  AND i.id IS NULL
ORDER BY o.created_at ASC;

-- 8) Image rows that reference missing route-upload objects
SELECT i.id, i.storage_bucket, i.storage_path, i.created_at
FROM public.images i
LEFT JOIN storage.objects o
  ON o.bucket_id = i.storage_bucket
 AND o.name = i.storage_path
WHERE i.storage_bucket = 'route-uploads'
  AND i.storage_path IS NOT NULL
  AND o.id IS NULL
ORDER BY i.created_at ASC;

-- 9) Orphan avatar objects (no profile avatar_url points to object)
SELECT o.name, o.created_at
FROM storage.objects o
LEFT JOIN public.profiles p
  ON p.avatar_url LIKE '%' || '/avatars/' || o.name
WHERE o.bucket_id = 'avatars'
  AND p.id IS NULL
ORDER BY o.created_at ASC;
