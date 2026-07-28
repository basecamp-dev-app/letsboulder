import { randomUUID } from 'node:crypto'
import { isIP } from 'node:net'

import { Pool, type PoolClient } from 'pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

const DEFAULT_DATABASE_URL = 'postgresql://postgres:postgres@127.0.0.1:54322/postgres'
const databaseUrl = process.env.TEST_DATABASE_URL || DEFAULT_DATABASE_URL
const parsedDatabaseUrl = new URL(databaseUrl)
const allowNonLocal = process.env.TEST_DATABASE_ALLOW_NON_LOCAL === 'true'
const hostname = parsedDatabaseUrl.hostname.replace(/^\[|\]$/g, '')
const isLoopback = hostname === 'localhost' || hostname === '::1'
  || (isIP(hostname) === 4 && hostname.startsWith('127.'))

if (!isLoopback && !allowNonLocal) {
  throw new Error(
    `Refusing database tests against non-loopback host ${hostname}. `
    + 'Set TEST_DATABASE_ALLOW_NON_LOCAL=true to opt in explicitly.',
  )
}

const pool = new Pool({ connectionString: databaseUrl, max: 2, statement_timeout: 15_000 })

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

async function createUser(client: PoolClient, isAdmin = false) {
  const userId = randomUUID()
  const email = `operational-access-${userId}@example.test`
  await client.query(
    `insert into auth.users (
       id, aud, role, email, encrypted_password, email_confirmed_at,
       raw_app_meta_data, raw_user_meta_data, created_at, updated_at
     ) values ($1, 'authenticated', 'authenticated', $2, '', now(),
       '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now())`,
    [userId, email],
  )
  await client.query(
    `insert into public.profiles (id, username, display_name, email, is_admin)
     values ($1, $2, 'Operational access fixture', $3, $4)
     on conflict (id) do update set is_admin = excluded.is_admin`,
    [userId, `ops-${userId.slice(0, 12)}`, email, isAdmin],
  )
  return userId
}

async function createFixtures(client: PoolClient) {
  const ownerId = await createUser(client)
  const otherId = await createUser(client)
  const adminId = await createUser(client, true)
  const cragId = randomUUID()
  const postId = randomUUID()

  await client.query(
    `insert into public.crags (id, name, type, slug)
     values ($1, 'Operational test crag', 'boulder', $2)`,
    [cragId, `operational-test-${cragId}`],
  )
  await client.query(
    `insert into public.community_posts (
       id, author_id, place_id, type, body, start_at
     ) values ($1, $2, $3, 'session', 'Test session', now())`,
    [postId, ownerId, cragId],
  )
  await client.query(
    `insert into public.community_post_rsvps (post_id, user_id, status)
     values ($1, $2, 'going'), ($1, $3, 'interested')`,
    [postId, ownerId, otherId],
  )
  await client.query(
    `insert into public.climb_flags (
       crag_id, flagger_id, flag_type, comment, status, action_taken, resolved_by, resolved_at
     ) values
       ($1, $2, 'access', 'owner flag secret', 'pending', null, null, null),
       ($1, $3, 'other', 'other flag secret', 'resolved', 'keep', $4, now())`,
    [cragId, ownerId, otherId, adminId],
  )
  await client.query(
    `insert into public.crag_reports (
       crag_id, reporter_id, reason, details, status, moderator_id, moderator_note, resolved_at
     ) values
       ($1, $2, 'access', 'owner report secret', 'pending', null, null, null),
       ($1, $3, 'safety', 'other report secret', 'resolved', $4, 'moderator secret', now())`,
    [cragId, ownerId, otherId, adminId],
  )

  return { adminId, cragId, otherId, ownerId, postId }
}

beforeAll(async () => {
  const migration = await pool.query(
    `select to_regclass('public.community_post_rsvp_counts') is not null
       and to_regclass('public.climb_flag_counts') is not null
       and to_regclass('public.crag_report_counts') is not null as installed`,
  )
  if (!migration.rows[0].installed) {
    throw new Error('Operational table access hardening migration is not installed')
  }
})

afterAll(async () => {
  await pool.end()
})

describe('operational table access hardening', () => {
  it('denies anonymous table reads but exposes sanitized aggregate counts', async () => {
    await transaction(async (client) => {
      const fixtures = await createFixtures(client)
      const publicImageId = randomUUID()
      const privateImageId = randomUUID()
      await client.query(
        `insert into public.images (
           id, url, crag_id, created_by, status, moderation_status, visibility, processing_status
         ) values
           ($1, 'https://example.test/public.jpg', $3, $4, 'approved', 'skipped', 'public', 'ready'),
           ($2, 'https://example.test/private.jpg', $3, $4, 'approved', 'skipped', 'private', 'ready')`,
        [publicImageId, privateImageId, fixtures.cragId, fixtures.ownerId],
      )
      await client.query(
        `insert into public.climb_flags (image_id, flagger_id, flag_type, comment, status)
         values
           ($1, $3, 'image_quality', 'public image flag', 'pending'),
           ($2, $3, 'image_quality', 'private image flag', 'pending')`,
        [publicImageId, privateImageId, fixtures.ownerId],
      )
      await setRequestRole(client, 'anon')

      for (const table of ['climb_flags', 'community_post_rsvps', 'crag_reports']) {
        expect(await expectedFailure(client, `select * from public.${table}`)).toContain('permission denied')
      }

      expect((await client.query(
        'select going_count, interested_count from public.community_post_rsvp_counts where post_id = $1',
        [fixtures.postId],
      )).rows).toEqual([{ going_count: '1', interested_count: '1' }])
      expect((await client.query(
        `select total_count, pending_count from public.climb_flag_counts
         where target_type = 'crag' and target_id = $1`,
        [fixtures.cragId],
      )).rows).toEqual([{ total_count: '2', pending_count: '1' }])
      expect((await client.query(
        `select target_id from public.climb_flag_counts
         where target_type = 'image' order by target_id`,
      )).rows).toEqual([{ target_id: publicImageId }])
      expect(await expectedFailure(
        client,
        'select public.get_image_pending_flag_count($1)',
        [publicImageId],
      )).toContain('permission denied')
      expect((await client.query(
        `select total_count, pending_count, investigating_count, resolved_count, dismissed_count
         from public.crag_report_counts where crag_id = $1`,
        [fixtures.cragId],
      )).rows).toEqual([{
        total_count: '2',
        pending_count: '1',
        investigating_count: '0',
        resolved_count: '1',
        dismissed_count: '0',
      }])
    })
  })

  it('limits ordinary users to their own rows and lets admins read all rows', async () => {
    await transaction(async (client) => {
      const fixtures = await createFixtures(client)
      await setRequestRole(client, 'authenticated', fixtures.ownerId)

      expect((await client.query('select user_id from public.community_post_rsvps')).rows)
        .toEqual([{ user_id: fixtures.ownerId }])
      expect((await client.query('select flagger_id, comment from public.climb_flags')).rows)
        .toEqual([{ flagger_id: fixtures.ownerId, comment: 'owner flag secret' }])
      expect((await client.query('select reporter_id, details from public.crag_reports')).rows)
        .toEqual([{ reporter_id: fixtures.ownerId, details: 'owner report secret' }])

      await setRequestRole(client, 'authenticated', fixtures.adminId)
      expect((await client.query('select user_id from public.community_post_rsvps')).rows).toHaveLength(2)
      expect((await client.query('select flagger_id, comment from public.climb_flags')).rows).toHaveLength(2)
      expect((await client.query('select reporter_id, moderator_note from public.crag_reports')).rows)
        .toHaveLength(2)
    })
  })

  it('counts private image flags only for callers who can access the image', async () => {
    await transaction(async (client) => {
      const fixtures = await createFixtures(client)
      const privateImageId = randomUUID()
      await client.query(
        `insert into public.images (
           id, url, crag_id, created_by, status, moderation_status, visibility, processing_status
         ) values ($1, 'https://example.test/private-rpc.jpg', $2, $3,
           'approved', 'skipped', 'private', 'ready')`,
        [privateImageId, fixtures.cragId, fixtures.ownerId],
      )
      await client.query(
        `insert into public.climb_flags (image_id, flagger_id, flag_type, comment, status)
         values ($1, $2, 'image_quality', 'private image flag', 'pending')`,
        [privateImageId, fixtures.ownerId],
      )

      await setRequestRole(client, 'authenticated', fixtures.ownerId)
      expect((await client.query(
        'select public.get_image_pending_flag_count($1) as count',
        [privateImageId],
      )).rows).toEqual([{ count: '1' }])

      await setRequestRole(client, 'authenticated', fixtures.otherId)
      expect((await client.query(
        'select public.get_image_pending_flag_count($1) as count',
        [privateImageId],
      )).rows).toEqual([{ count: '0' }])
    })
  })

  it('rejects forged identities and pre-resolved operational inserts', async () => {
    await transaction(async (client) => {
      const fixtures = await createFixtures(client)
      await setRequestRole(client, 'authenticated', fixtures.ownerId)

      expect(await expectedFailure(
        client,
        `insert into public.climb_flags (crag_id, flagger_id, flag_type, comment, status)
         values ($1, $2, 'other', 'forged identity', 'pending')`,
        [fixtures.cragId, fixtures.otherId],
      )).toContain('row-level security policy')
      expect(await expectedFailure(
        client,
        `insert into public.climb_flags (crag_id, flagger_id, flag_type, comment, status, action_taken)
         values ($1, $2, 'other', 'pre-resolved', 'resolved', 'keep')`,
        [fixtures.cragId, fixtures.ownerId],
      )).toContain('row-level security policy')
      expect(await expectedFailure(
        client,
        `insert into public.crag_reports (
           crag_id, reporter_id, reason, status, moderator_id, moderator_note
         ) values ($1, $2, 'access', 'resolved', $3, 'forged moderation')`,
        [fixtures.cragId, fixtures.ownerId, fixtures.otherId],
      )).toContain('row-level security policy')
    })
  })

  it('keeps aggregate view ownership and columns least-privileged', async () => {
    await transaction(async (client) => {
      const role = await client.query(
        `select rolcanlogin, rolinherit, rolbypassrls
         from pg_roles where rolname = 'operational_aggregate_reader'`,
      )
      expect(role.rows).toEqual([{ rolcanlogin: false, rolinherit: false, rolbypassrls: false }])

      expect((await client.query(
        `select
           has_column_privilege(
             'operational_aggregate_reader', 'public.climb_flags', 'status', 'SELECT'
           ) as can_count_status,
           has_column_privilege(
             'operational_aggregate_reader', 'public.climb_flags', 'flagger_id', 'SELECT'
           ) as can_read_flagger,
           has_column_privilege(
             'operational_aggregate_reader', 'public.crag_reports', 'moderator_note', 'SELECT'
           ) as can_read_moderator_note,
           has_column_privilege(
             'operational_aggregate_reader', 'public.images', 'id', 'SELECT'
           ) as can_read_image_id,
           has_column_privilege(
             'operational_aggregate_reader', 'public.images', 'url', 'SELECT'
           ) as can_read_image_url,
           has_schema_privilege(
             'operational_aggregate_reader', 'public', 'CREATE'
           ) as can_create_public_objects`,
      )).rows[0]).toEqual({
        can_count_status: true,
        can_read_flagger: false,
        can_read_moderator_note: false,
        can_read_image_id: true,
        can_read_image_url: false,
        can_create_public_objects: false,
      })

      expect((await client.query(
        `select member.rolname as member
         from pg_auth_members as membership
         join pg_roles as member on member.oid = membership.member
         where membership.roleid = 'operational_aggregate_reader'::regrole
           and member.rolname <> 'postgres'`,
      )).rows).toEqual([])

      const columns = await client.query(
        `select table_name, array_agg(column_name::text order by ordinal_position) as columns
         from information_schema.columns
         where table_schema = 'public'
           and table_name in ('community_post_rsvp_counts', 'climb_flag_counts', 'crag_report_counts')
         group by table_name order by table_name`,
      )
      expect(columns.rows).toEqual([
        {
          table_name: 'climb_flag_counts',
          columns: ['target_type', 'target_id', 'total_count', 'pending_count'],
        },
        {
          table_name: 'community_post_rsvp_counts',
          columns: ['post_id', 'going_count', 'interested_count'],
        },
        {
          table_name: 'crag_report_counts',
          columns: [
            'crag_id',
            'total_count',
            'pending_count',
            'investigating_count',
            'resolved_count',
            'dismissed_count',
          ],
        },
      ])

      expect((await client.query(
        `select
           has_table_privilege('anon', 'public.climb_flags', 'SELECT') as anon_flags,
           has_table_privilege('anon', 'public.community_post_rsvps', 'SELECT') as anon_rsvps,
           has_table_privilege('anon', 'public.crag_reports', 'SELECT') as anon_reports,
           has_table_privilege('anon', 'public.climb_flag_counts', 'SELECT') as anon_flag_counts`,
      )).rows[0]).toEqual({
        anon_flags: false,
        anon_rsvps: false,
        anon_reports: false,
        anon_flag_counts: true,
      })
    })
  })
})
