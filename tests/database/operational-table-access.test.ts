import { randomUUID } from 'node:crypto'
import { type PoolClient } from 'pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { createDatabaseTestHarness } from './database-test-harness'

const { pool } = createDatabaseTestHarness({ max: 2, statement_timeout: 15_000 })

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
     on conflict (id) do update set
       username = excluded.username,
       display_name = excluded.display_name,
       email = excluded.email,
       is_admin = excluded.is_admin`,
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
    `update public.crags
     set publication_status = 'published', published_at = now()
     where id = $1`,
    [cragId],
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
      await setRequestRole(client, 'anon')

      for (const table of ['community_post_rsvps', 'crag_reports']) {
        expect(await expectedFailure(client, `select * from public.${table}`)).toContain('permission denied')
      }

      expect((await client.query(
        'select going_count, interested_count from public.community_post_rsvp_counts where post_id = $1',
        [fixtures.postId],
      )).rows).toEqual([{ going_count: '1', interested_count: '1' }])
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
      expect((await client.query('select reporter_id, details from public.crag_reports')).rows)
        .toEqual([{ reporter_id: fixtures.ownerId, details: 'owner report secret' }])

      await setRequestRole(client, 'authenticated', fixtures.adminId)
      expect((await client.query('select user_id from public.community_post_rsvps')).rows).toHaveLength(2)
      expect((await client.query('select reporter_id, moderator_note from public.crag_reports')).rows)
        .toHaveLength(2)
    })
  })

  it('lets a contributor read their admitted image states without exposing private contributions', async () => {
    await transaction(async (client) => {
      const fixtures = await createFixtures(client)
      const admittedImages = [
        { id: randomUUID(), moderationStatus: 'approved' },
        { id: randomUUID(), moderationStatus: 'skipped' },
        { id: randomUUID(), moderationStatus: 'pending' },
        { id: randomUUID(), moderationStatus: null },
      ]
      const otherPrivateImageId = randomUUID()
      const linkedImageId = randomUUID()

      for (const image of admittedImages) {
        await client.query(
          `insert into public.images (
             id, url, crag_id, created_by, status, moderation_status, visibility, processing_status
           ) values ($1, $2, $3, $4, 'approved', $5, 'private', 'ready')`,
          [image.id, `https://example.test/${image.id}.jpg`, fixtures.cragId, fixtures.ownerId, image.moderationStatus],
        )
      }
      await client.query(
        `insert into public.images (
           id, url, crag_id, created_by, status, moderation_status, visibility, processing_status
         ) values
           ($1, 'https://example.test/other-private.jpg', $3, $4, 'approved', 'pending', 'private', 'ready'),
           ($2, 'https://example.test/linked.jpg', $3, $5, 'approved', 'skipped', 'public', 'ready')`,
        [otherPrivateImageId, linkedImageId, fixtures.cragId, fixtures.otherId, fixtures.otherId],
      )
      await client.query(
        `insert into public.crag_images (crag_id, url, source_image_id, linked_image_id)
         values ($1, 'https://example.test/crag-image.jpg', $2, $3)`,
        [fixtures.cragId, admittedImages[2].id, linkedImageId],
      )

      await setRequestRole(client, 'authenticated', fixtures.ownerId)
      expect((await client.query(
        `select id, url, created_at, submission_id, moderation_status, is_anonymous_submission,
                contribution_credit_platform, contribution_credit_handle
         from public.images
         where created_by = $1
           and (moderation_status in ('approved', 'skipped', 'pending') or moderation_status is null)
         order by id`,
        [fixtures.ownerId],
      )).rows.map((row) => row.id).sort()).toEqual(admittedImages.map((image) => image.id).sort())
      expect((await client.query(
        `select source_image_id, linked_image_id
         from public.crag_images
         where source_image_id = $1 or linked_image_id = $1`,
        [admittedImages[2].id],
      )).rows).toEqual([{
        source_image_id: admittedImages[2].id,
        linked_image_id: linkedImageId,
      }])

      await setRequestRole(client, 'authenticated', fixtures.otherId)
      expect((await client.query(
        'select id from public.images where id = $1',
        [admittedImages[2].id],
      )).rows).toEqual([])

      await setRequestRole(client, 'anon')
      expect((await client.query(
        'select id from public.images where id = $1',
        [admittedImages[2].id],
      )).rows).toEqual([])
    })
  })

  it('rejects forged identities and pre-resolved operational inserts', async () => {
    await transaction(async (client) => {
      const fixtures = await createFixtures(client)
      await setRequestRole(client, 'authenticated', fixtures.ownerId)

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
        can_read_moderator_note: false,
        can_read_image_id: false,
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
           and table_name in ('community_post_rsvp_counts', 'crag_report_counts')
         group by table_name order by table_name`,
      )
      expect(columns.rows).toEqual([
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
           has_table_privilege('anon', 'public.community_post_rsvps', 'SELECT') as anon_rsvps,
           has_table_privilege('anon', 'public.crag_reports', 'SELECT') as anon_reports`,
      )).rows[0]).toEqual({
        anon_rsvps: false,
        anon_reports: false,
      })
    })
  })
})
