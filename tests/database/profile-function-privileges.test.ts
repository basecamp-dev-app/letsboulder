import { randomUUID } from 'node:crypto'
import { type PoolClient } from 'pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { createDatabaseTestHarness } from './database-test-harness'

const { pool } = createDatabaseTestHarness({ max: 2, statement_timeout: 15_000 })

const API_EXECUTABLE_DEFINERS = [
  'accept_open_data_consent(text)',
  'apply_published_submission_edit(uuid,uuid,jsonb)',
  'assert_media_ready_for_publication(uuid[])',
  'can_manage_topo_replacement(uuid)',
  'claim_submission_collaborator_invite(uuid)',
  'claim_submission_draft_collaborator_invite(uuid)',
  'create_notification(uuid,character varying,text,text,text)',
  'create_unified_submission_atomic(uuid,jsonb,jsonb[],jsonb,text)',
  'delete_submission_draft_atomic(uuid)',
  'delete_submission_draft_image_atomic(uuid,uuid,timestamp with time zone)',
  'delete_unassociated_upload_image(uuid)',
  'enqueue_failed_media_upload_copy_cleanup(uuid,text,text)',
  'finalize_media_upload(uuid,text,text)',
  'get_active_climbers_count()',
  'get_admin_viewport_map_features(double precision,double precision,double precision,double precision,integer)',
  'get_boulders_with_gps_count()',
  'get_crag_contributor_leaderboard(uuid,integer)',
  'get_climbs_with_consensus(uuid,integer,integer)',
  'get_community_contributors_count()',
  'get_community_photos_count()',
  'get_crag_faces_complete_summary(uuid)',
  'get_crag_pins()',
  'get_crag_pins(boolean)',
  'get_crag_rankings_leaderboard(uuid,text,integer,integer,timestamp with time zone)',
  'get_crag_route_intelligence(uuid)',
  'get_crag_route_targets_page(uuid,integer,integer)',
  'get_crags_mapped_count()',
  'get_effective_climb_id(uuid)',
  'get_own_profile()',
  'get_open_data_consent_status()',
  'get_place_contributor_leaderboard(uuid,integer)',
  'get_place_pins(boolean)',
  'get_place_rankings_leaderboard(uuid,text,integer,integer,timestamp with time zone)',
  'get_public_impact_metrics_v1()',
  'get_rankings_leaderboard(text,uuid,text,integer,integer,timestamp with time zone)',
  'get_star_rating_summary(uuid)',
  'get_top_contributors(integer)',
  'get_total_climbs_count()',
  'get_total_logs_count()',
  'get_total_sends_count()',
  'get_upload_context(uuid,text,text,uuid)',
  'get_user_count()',
  'get_visible_profile(uuid)',
  'get_verified_routes_count()',
  'get_viewport_map_features(double precision,double precision,double precision,double precision,integer)',
  'insert_grade_vote(uuid,character varying)',
  'has_valid_open_data_consent(uuid)',
  'is_current_user_admin()',
  'is_submission_collaborator(uuid,uuid)',
  'is_submission_draft_collaborator(uuid,uuid)',
  'list_submission_draft_collaborators(uuid)',
  'log_routes_idempotent(uuid,uuid[],text,text,date,timestamp with time zone)',
  'log_submission_edit(uuid,uuid,text,text,jsonb,jsonb)',
  'log_submission_edit(uuid,uuid,text,text,jsonb,jsonb,text,text,text[],text[])',
  'promote_draft_to_submission(uuid)',
  'publish_topo_replacement(uuid)',
  'propose_crag_metadata(uuid,uuid,text,text,text,text,uuid)',
  'queue_media_ingest_job(uuid,text,text,text,text,uuid,text,boolean)',
  'resolve_legacy_climb_redirect(uuid)',
  'resolve_legacy_image_redirect(uuid)',
  'resolve_legacy_route_redirect(text,text,text)',
  'resolve_public_climb_slug(text,text,text)',
  'resolve_public_crag_slug(text,text)',
  'review_crag_metadata_proposal(uuid,text,text)',
  'rollback_wiki_entity_revision(uuid,uuid,text)',
  'save_submission_draft_atomic(uuid,timestamp with time zone,jsonb,jsonb,jsonb,uuid)',
  'set_crag_maintainer(uuid,uuid,boolean)',
  'set_crag_publication_status(uuid,text,text)',
  'set_topo_replacement_route_resolution(uuid,uuid,text,uuid)',
  'soft_delete_climb(uuid,text,uuid)',
  'soft_delete_comment(uuid)',
  'soft_delete_crag(uuid,text,uuid)',
  'soft_delete_crag_image(uuid,uuid,text)',
  'soft_delete_crag_image(uuid,uuid,text,boolean)',
  'soft_delete_image(uuid,text)',
  'start_topo_replacement(uuid,uuid,text,uuid)',
  'update_own_profile_submission_credit(text,text)',
  'update_own_submission_anonymity(uuid,boolean)',
  'update_own_submission_credit(uuid,text,text)',
  'update_submission_image_order(uuid,jsonb)',
  'user_can_edit_submission_draft(uuid,uuid)',
  'user_can_wiki_edit_submission(uuid,uuid)',
  'vote_on_climb_correction(uuid,text)',
]

const RESTRICTED_FUNCTIONS = [
  'add_correction_type_value(text)',
  'add_correction_type_value(text,text)',
  'archive_and_delete_climb_topo_lines(uuid,text)',
  'archive_and_delete_topo_lines(uuid,text,uuid)',
  'claim_media_job(text,integer)',
  'claim_media_job_for_image(text,uuid,integer)',
  'claim_media_deletion_job(text,integer)',
  'cleanup_orphan_route_uploads(interval,integer)',
  'commit_media_webp(uuid,text,text,text,text,text,bigint,integer,integer,jsonb,text,uuid,uuid)',
  'complete_media_deletion_job(uuid,uuid)',
  'complete_media_job(uuid,uuid)',
  'create_submission_routes_atomic(uuid,uuid,text,jsonb)',
  'create_submission_routes_service(uuid,uuid,uuid,text,jsonb)',
  'delete_account_atomic(uuid,text,boolean)',
  'enforce_draft_consent()',
  'enforce_open_data_consent()',
  'initialize_climb_grade_vote(uuid,uuid,character varying)',
  'fail_media_deletion_job(uuid,uuid,text)',
  'fail_media_job(uuid,uuid,text)',
  'prune_media_deletion_jobs(integer,integer)',
  'require_open_data_consent()',
  'save_submission_draft_atomic_20260811_internal(uuid,timestamp with time zone,jsonb,jsonb,jsonb,uuid)',
  'update_submission_crag_metadata(uuid,text,text,text)',
  'record_contribution_event(uuid,text,integer,text,uuid,uuid,uuid,uuid,uuid,jsonb,text)',
  'retry_media_deletion_job(uuid,uuid,text)',
  'retry_media_job(uuid,uuid,text)',
  'recover_media_ingest_jobs(jsonb,bigint,text)',
  'recover_media_deletion_jobs(jsonb,bigint,text)',
  'soft_delete_published_submission(uuid[],uuid)',
  'update_own_submitted_routes(uuid,jsonb)',
  'update_submission_image_metadata(uuid,double precision,double precision,text[])',
  'update_submission_image_metadata(uuid,double precision,double precision,text[],text)',
]

const SERVICE_FUNCTIONS = [
  'archive_and_delete_climb_topo_lines(uuid,text)',
  'archive_and_delete_topo_lines(uuid,text,uuid)',
  'claim_media_job(text,integer)',
  'claim_media_job_for_image(text,uuid,integer)',
  'claim_media_deletion_job(text,integer)',
  'cleanup_orphan_route_uploads(interval,integer)',
  'commit_media_webp(uuid,text,text,text,text,text,bigint,integer,integer,jsonb,text,uuid,uuid)',
  'complete_media_deletion_job(uuid,uuid)',
  'complete_media_job(uuid,uuid)',
  'create_submission_routes_service(uuid,uuid,uuid,text,jsonb)',
  'delete_account_atomic(uuid,text,boolean)',
  'initialize_climb_grade_vote(uuid,uuid,character varying)',
  'fail_media_deletion_job(uuid,uuid,text)',
  'fail_media_job(uuid,uuid,text)',
  'prune_media_deletion_jobs(integer,integer)',
  'record_contribution_event(uuid,text,integer,text,uuid,uuid,uuid,uuid,uuid,jsonb,text)',
  'retry_media_deletion_job(uuid,uuid,text)',
  'retry_media_job(uuid,uuid,text)',
  'recover_media_ingest_jobs(jsonb,bigint,text)',
  'recover_media_deletion_jobs(jsonb,bigint,text)',
  'soft_delete_published_submission(uuid[],uuid)',
]

async function transaction<T>(run: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect()
  await client.query('begin')
  try {
    return await run(client)
  } finally {
    await client.query('rollback')
    client.release()
  }
}

async function setRequestRole(
  client: PoolClient,
  role: 'anon' | 'authenticated' | 'service_role',
  userId?: string,
) {
  await client.query('reset role')
  await client.query(`set local role ${role}`)
  await client.query("select set_config('request.jwt.claims', $1, true)", [
    JSON.stringify({ role, ...(userId ? { sub: userId } : {}) }),
  ])
}

async function expectedFailure(
  client: PoolClient,
  sql: string,
  values: unknown[] = [],
): Promise<string> {
  const savepoint = `expected_error_${randomUUID().replaceAll('-', '')}`
  await client.query(`savepoint ${savepoint}`)
  try {
    await client.query(sql, values)
    await client.query(`release savepoint ${savepoint}`)
    throw new Error('Expected query to fail')
  } catch (error) {
    if (error instanceof Error && error.message === 'Expected query to fail') throw error
    await client.query(`rollback to savepoint ${savepoint}`)
    await client.query(`release savepoint ${savepoint}`)
    return error instanceof Error ? error.message : String(error)
  }
}

async function createProfile(client: PoolClient, isPublic: boolean) {
  const userId = randomUUID()
  const email = `profile-privileges-${userId}@example.test`
  await client.query(
    `insert into auth.users (
       id, aud, role, email, encrypted_password, email_confirmed_at,
       raw_app_meta_data, raw_user_meta_data, created_at, updated_at
     ) values ($1, 'authenticated', 'authenticated', $2, '', now(),
       '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now())`,
    [userId, email],
  )
  await client.query(
    `insert into public.profiles (
       id, username, display_name, email, is_public, first_name,
       contributor_score_total, accepted_contribution_count, contributor_tier
     ) values ($1, $2, 'Privilege fixture', $3, $4, 'Private first name', 25, 2, 'contributor')
     on conflict (id) do update set
       username = excluded.username,
       display_name = excluded.display_name,
       email = excluded.email,
       is_public = excluded.is_public,
       first_name = excluded.first_name,
       contributor_score_total = excluded.contributor_score_total,
       accepted_contribution_count = excluded.accepted_contribution_count,
       contributor_tier = excluded.contributor_tier`,
    [userId, `priv-${userId.slice(0, 12)}`, email, isPublic],
  )
  await client.query(
    `update public.profiles set display_name = 'Privilege fixture' where id = $1`,
    [userId],
  )
  return { email, userId }
}

async function createDraftCollaboratorFixture(client: PoolClient) {
  const owner = await createProfile(client, false)
  const publicCollaborator = await createProfile(client, true)
  const privateCollaborator = await createProfile(client, false)
  const unrelated = await createProfile(client, true)
  const draftId = randomUUID()

  await client.query(
    `insert into public.submission_drafts (id, user_id, metadata)
     values ($1, $2, '{}'::jsonb)`,
    [draftId, owner.userId],
  )
  await client.query(
    `insert into public.submission_draft_collaborators (draft_id, user_id, role, created_by)
     values ($1, $2, 'editor', $3), ($1, $4, 'editor', $3)`,
    [draftId, publicCollaborator.userId, owner.userId, privateCollaborator.userId],
  )

  return { draftId, owner, privateCollaborator, publicCollaborator, unrelated }
}

beforeAll(async () => {
  const migration = await pool.query(
     `select to_regprocedure('public.get_own_profile()') is not null
        and to_regprocedure('public.claim_media_job(text,integer)') is not null as installed`,
  )
  if (!migration.rows[0].installed) {
    throw new Error('Profile and function privilege hardening migration is not installed')
  }
})

afterAll(async () => {
  await pool.end()
})

describe('profile and function privilege hardening', () => {
  it('exposes only safe public profile columns to anon and hides private profiles', async () => {
    await transaction(async (client) => {
      const publicProfile = await createProfile(client, true)
      const privateProfile = await createProfile(client, false)
      await setRequestRole(client, 'anon')

      const visible = await client.query(
        `select id, username, display_name, avatar_url, bio, country, country_code,
                preferred_grade_system, preferred_style, is_public, created_at
         from public.profiles where id = $1`,
        [publicProfile.userId],
      )
      expect(visible.rows).toHaveLength(1)
      expect(visible.rows[0]).toMatchObject({ id: publicProfile.userId, is_public: true })
      expect((await client.query(
        'select id from public.profiles where id = $1',
        [privateProfile.userId],
      )).rows).toEqual([])

      expect(await expectedFailure(
        client,
        'select email, is_admin from public.profiles where id = $1',
        [publicProfile.userId],
      )).toContain('permission denied')
    })
  })

  it('returns private fields only for the authenticated owner', async () => {
    await transaction(async (client) => {
      const owner = await createProfile(client, false)
      const other = await createProfile(client, false)
      await setRequestRole(client, 'authenticated', owner.userId)

      const ownProfile = await client.query(
        'select id, email, first_name, contributor_score_total, contributor_tier from public.get_own_profile()',
      )
      expect(ownProfile.rows).toEqual([{
        id: owner.userId,
        email: owner.email,
        first_name: 'Private first name',
        contributor_score_total: 25,
        contributor_tier: 'contributor',
      }])
      expect(ownProfile.rows.some((row) => row.id === other.userId)).toBe(false)
      expect((await client.query(
        'select id from public.profiles where id = $1',
        [other.userId],
      )).rows).toEqual([])
    })
  })

  it('assigns crag creators as maintainers and exposes the public badge state', async () => {
    await transaction(async (client) => {
      const creator = await createProfile(client, true)
      const cragId = randomUUID()

      await setRequestRole(client, 'authenticated', creator.userId)
      await client.query(
        `insert into public.crags (id, name, slug, country_code, created_by)
         values ($1, 'Creator Crag', $2, 'GB', $3)`,
        [cragId, `creator-${cragId}`, creator.userId],
      )

      expect((await client.query(
        'select assigned_by from public.crag_maintainers where crag_id = $1 and user_id = $2',
        [cragId, creator.userId],
      )).rows).toEqual([{ assigned_by: creator.userId }])

      await setRequestRole(client, 'anon')
      expect((await client.query(
        'select is_crag_maintainer from public.get_visible_profile($1)',
        [creator.userId],
      )).rows).toEqual([{ is_crag_maintainer: true }])
    })
  })

  it('lists authorized draft collaborators with profile visibility applied inside the RPC', async () => {
    await transaction(async (client) => {
      const fixture = await createDraftCollaboratorFixture(client)

      await setRequestRole(client, 'authenticated', fixture.owner.userId)
      const ownerRows = await client.query(
        'select * from public.list_submission_draft_collaborators($1)',
        [fixture.draftId],
      )
      expect(ownerRows.rows).toHaveLength(2)
      expect(ownerRows.rows.map((row) => row.user_id).sort()).toEqual(
        [fixture.privateCollaborator.userId, fixture.publicCollaborator.userId].sort(),
      )
      expect(ownerRows.rows.find((row) => row.user_id === fixture.publicCollaborator.userId)).toMatchObject({
        display_name: 'Privilege fixture',
        username: `priv-${fixture.publicCollaborator.userId.slice(0, 12)}`,
        avatar_url: null,
      })
      expect(ownerRows.rows.find((row) => row.user_id === fixture.privateCollaborator.userId)).toMatchObject({
        display_name: null,
        username: null,
        avatar_url: null,
      })
      expect(Object.keys(ownerRows.rows[0]).sort()).toEqual([
        'avatar_url', 'created_at', 'display_name', 'role', 'user_id', 'username',
      ])

      await setRequestRole(client, 'authenticated', fixture.privateCollaborator.userId)
      const collaboratorRows = await client.query(
        'select * from public.list_submission_draft_collaborators($1)',
        [fixture.draftId],
      )
      expect(collaboratorRows.rows).toHaveLength(2)
      expect(collaboratorRows.rows.find((row) => row.user_id === fixture.privateCollaborator.userId)).toMatchObject({
        display_name: 'Privilege fixture',
        username: `priv-${fixture.privateCollaborator.userId.slice(0, 12)}`,
      })

      await setRequestRole(client, 'authenticated', fixture.unrelated.userId)
      expect(await expectedFailure(
        client,
        'select * from public.list_submission_draft_collaborators($1)',
        [fixture.draftId],
      )).toContain('Draft collaborator access denied')

      await setRequestRole(client, 'anon')
      expect(await expectedFailure(
        client,
        'select * from public.list_submission_draft_collaborators($1)',
        [fixture.draftId],
      )).toContain('permission denied')

      await setRequestRole(client, 'authenticated', fixture.owner.userId)
      expect((await client.query(
        'select id from public.profiles where id = $1',
        [fixture.privateCollaborator.userId],
      )).rows).toEqual([])
      expect(await expectedFailure(
        client,
        'select email from public.profiles where id = $1',
        [fixture.publicCollaborator.userId],
      )).toContain('permission denied')
    })
  })

  it('grants draft collaborator listing only to authenticated callers with a fixed search path', async () => {
    const metadata = await pool.query(
      `select p.prosecdef, p.proconfig,
              has_function_privilege('anon', p.oid, 'EXECUTE') as anon,
              has_function_privilege('authenticated', p.oid, 'EXECUTE') as authenticated,
              has_function_privilege('service_role', p.oid, 'EXECUTE') as service_role
       from pg_proc AS p
       join pg_namespace AS n on n.oid = p.pronamespace
       where n.nspname = 'public'
         and p.proname = 'list_submission_draft_collaborators'`,
    )
    expect(metadata.rows).toEqual([{
      prosecdef: true,
      proconfig: ['search_path=""'],
      anon: false,
      authenticated: true,
      service_role: false,
    }])
  })

  it('allows an owner to update an allowed profile field', async () => {
    await transaction(async (client) => {
      const owner = await createProfile(client, false)
      await setRequestRole(client, 'authenticated', owner.userId)

      expect((await client.query(
        `update public.profiles set display_name = 'Updated owner' where id = $1 returning display_name`,
        [owner.userId],
      )).rows[0].display_name).toBe('Updated owner')
    })
  })

  it('keeps the public display name synchronized with protected name fields', async () => {
    await transaction(async (client) => {
      const owner = await createProfile(client, true)
      await client.query(
        `update public.profiles
         set first_name = '  Alex  ', last_name = '  Stone  ', display_name = null
         where id = $1`,
        [owner.userId],
      )

      expect((await client.query(
        'select display_name from public.profiles where id = $1',
        [owner.userId],
      )).rows[0].display_name).toBe('Alex Stone')

      await client.query(
        `update public.profiles set last_name = 'River' where id = $1`,
        [owner.userId],
      )

      expect((await client.query(
        'select display_name from public.profiles where id = $1',
        [owner.userId],
      )).rows[0].display_name).toBe('Alex River')
    })
  })

  it('records current open data consent only through the identity-bound RPC', async () => {
    await transaction(async (client) => {
      const owner = await createProfile(client, false)
      await setRequestRole(client, 'authenticated', owner.userId)

      expect((await client.query('select public.has_valid_open_data_consent() as valid')).rows[0].valid).toBe(false)
      expect(await expectedFailure(
        client,
        `update public.profiles
         set open_data_consent_version = 'forged', consent_timestamp = now()
         where id = $1`,
        [owner.userId],
      )).toContain('permission denied')
      expect(await expectedFailure(
        client,
        "select public.accept_open_data_consent('stale-version')",
      )).toContain('Open data consent version changed')

      const accepted = await client.query("select * from public.accept_open_data_consent('2026-07-29-v1')")
      expect(accepted.rows[0].open_data_consent_version).toBe('2026-07-29-v1')
      expect(accepted.rows[0].consent_timestamp).toBeTruthy()
      expect((await client.query('select public.has_valid_open_data_consent() as valid')).rows[0].valid).toBe(true)
    })
  })

  it('blocks protected owner updates and profile inserts', async () => {
    await transaction(async (client) => {
      const owner = await createProfile(client, false)
      await setRequestRole(client, 'authenticated', owner.userId)

      expect(await expectedFailure(
        client,
        'update public.profiles set is_admin = true where id = $1',
        [owner.userId],
      )).toContain('permission denied')
      expect(await expectedFailure(
        client,
        'update public.profiles set contributor_score_total = 999 where id = $1',
        [owner.userId],
      )).toContain('permission denied')
      expect(await expectedFailure(
        client,
        `insert into public.profiles (id, username) values ($1, 'forbidden-insert')`,
        [randomUUID()],
      )).toContain('permission denied')
    })
  })

  it('keeps privileged functions unavailable to API roles and available to service workers', async () => {
    await transaction(async (client) => {
      const privileges = await client.query(
        `select signature,
                has_function_privilege('anon', 'public.' || signature, 'EXECUTE') as anon,
                has_function_privilege('authenticated', 'public.' || signature, 'EXECUTE') as authenticated,
                has_function_privilege('service_role', 'public.' || signature, 'EXECUTE') as service_role
         from unnest($1::text[]) as signature order by signature`,
        [RESTRICTED_FUNCTIONS],
      )

      for (const row of privileges.rows) {
        expect(row.anon, row.signature).toBe(false)
        expect(row.authenticated, row.signature).toBe(false)
        expect(row.service_role, row.signature).toBe(SERVICE_FUNCTIONS.includes(row.signature))
      }
    })
  })

  it('does not allow an authenticated caller to forge a submission editor', async () => {
    await transaction(async (client) => {
      const caller = await createProfile(client, true)
      const forgedEditor = await createProfile(client, true)
      await setRequestRole(client, 'authenticated', caller.userId)

      const riskError = await expectedFailure(
        client,
        `select public.log_submission_edit(
           null::uuid, $1, 'metadata', 'forged edit', null::jsonb, null::jsonb,
           'safe', 'accepted', array[]::text[], array[]::text[]
         )`,
        [forgedEditor.userId],
      )
      expect(riskError).toContain('Cannot record an edit for another user')
    })
  })

  it('removes permissive defaults and allowlists API-executable security definers', async () => {
    await transaction(async (client) => {
      const defaultGrants = await client.query(
        `select d.defaclobjtype, coalesce(grantee.rolname, 'PUBLIC') as grantee
         from pg_default_acl as d
         cross join lateral aclexplode(d.defaclacl) as acl
         left join pg_roles as grantee on grantee.oid = acl.grantee
         where d.defaclrole = 'postgres'::regrole
           and d.defaclnamespace = 'public'::regnamespace
           and d.defaclobjtype in ('f', 'r', 'S')
           and (acl.grantee = 0 or grantee.rolname in ('anon', 'authenticated'))`,
      )
      expect(defaultGrants.rows).toEqual([])

      const publicDefiners = await client.query(
        `select p.oid::regprocedure::text as signature
         from pg_proc as p
         join pg_namespace as n on n.oid = p.pronamespace
         cross join lateral aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) as acl
         where n.nspname = 'public' and p.prosecdef
           and acl.grantee = 0 and acl.privilege_type = 'EXECUTE'
         order by signature`,
      )
      expect(publicDefiners.rows).toEqual([])

      const definersWithoutFixedSearchPath = await client.query(
        `select p.oid::regprocedure::text as signature
         from pg_proc as p
         join pg_namespace as n on n.oid = p.pronamespace
         where n.nspname = 'public' and p.prosecdef
           and not exists (
             select 1
             from unnest(coalesce(p.proconfig, array[]::text[])) as setting
             where setting like 'search_path=%'
           )
         order by signature`,
      )
      expect(definersWithoutFixedSearchPath.rows).toEqual([])

      const apiDefiners = await client.query(
        `select p.oid::regprocedure::text as signature
         from pg_proc as p
         join pg_namespace as n on n.oid = p.pronamespace
         where n.nspname = 'public' and p.prosecdef
           and (has_function_privilege('anon', p.oid, 'EXECUTE')
             or has_function_privilege('authenticated', p.oid, 'EXECUTE'))
         order by signature`,
      )
      expect(apiDefiners.rows.map((row) => row.signature).sort()).toEqual(
        [...API_EXECUTABLE_DEFINERS].sort(),
      )
    })
  })
})
