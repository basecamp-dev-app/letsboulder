-- Read-only checks for staging, then production after CI deployment.
-- Expected: no orphan creators, no mismatched totals, no client-wide maintenance
-- privileges, no unvalidated public constraints, and no listed duplicate indexes.
BEGIN READ ONLY;
SET LOCAL statement_timeout = '30s';

SELECT 'climbs.user_id' AS relationship, count(*) AS orphan_rows
FROM public.climbs c WHERE c.user_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM auth.users u WHERE u.id = c.user_id)
UNION ALL
SELECT 'images.created_by', count(*) FROM public.images i WHERE i.created_by IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM auth.users u WHERE u.id = i.created_by)
UNION ALL
SELECT 'crags.last_edited_by', count(*) FROM public.crags c WHERE c.last_edited_by IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM auth.users u WHERE u.id = c.last_edited_by);

SELECT count(*) AS incorrect_vote_totals FROM public.climbs c
WHERE COALESCE(c.total_votes, 0) <> (SELECT count(*) FROM public.grade_votes g WHERE g.climb_id = c.id);

SELECT c.relname, r.rolname, p.privilege
FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
CROSS JOIN (SELECT rolname FROM pg_roles WHERE rolname IN ('anon', 'authenticated')) r
CROSS JOIN (VALUES ('TRUNCATE'), ('REFERENCES'), ('TRIGGER'), ('MAINTAIN')) p(privilege)
WHERE n.nspname = 'public' AND c.relkind IN ('r', 'p')
  AND has_table_privilege(r.rolname, c.oid, p.privilege);

SELECT conrelid::regclass AS table_name, conname, pg_get_constraintdef(oid) AS definition
FROM pg_constraint WHERE connamespace = 'public'::regnamespace AND NOT convalidated;

SELECT to_regclass('public.profiles_id_key') AS redundant_id_index,
       to_regclass('public.idx_profiles_username') AS redundant_username_index;

SELECT conrelid::regclass AS table_name, conname, pg_get_constraintdef(oid) AS definition
FROM pg_constraint WHERE contype = 'f' AND confrelid = 'auth.users'::regclass
  AND connamespace = 'public'::regnamespace ORDER BY 1, 2;

-- Deliberate sanitized definer views remain unchanged; check their owners.
SELECT c.relname, pg_get_userbyid(c.relowner) AS owner, c.reloptions
FROM pg_class c WHERE c.relnamespace = 'public'::regnamespace
  AND c.relname IN ('community_post_rsvp_counts', 'crag_report_counts');

-- Representative plans: on small tables PostgreSQL may correctly prefer sequential scans.
-- Do not use EXPLAIN ANALYZE on mutation RPCs as an audit technique.
EXPLAIN (COSTS, VERBOSE) SELECT * FROM public.crag_maintainers
WHERE user_id = '00000000-0000-4000-8000-000000000001'::uuid;

COMMIT;
