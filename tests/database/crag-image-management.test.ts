import { randomUUID } from 'node:crypto'
import type { PoolClient } from 'pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { createDatabaseTestHarness } from './database-test-harness'

const { pool, transaction } = createDatabaseTestHarness({ max: 2, statement_timeout: 15_000 })

async function setRole(client: PoolClient, role: 'anon' | 'authenticated', userId?: string) {
  await client.query('reset role')
  await client.query(`set local role ${role}`)
  await client.query("select set_config('request.jwt.claims', $1, true)", [
    JSON.stringify({ role, ...(userId ? { sub: userId } : {}) }),
  ])
}

async function expectedFailure(client: PoolClient, sql: string, values: unknown[]) {
  const savepoint = `failure_${randomUUID().replaceAll('-', '')}`
  await client.query(`savepoint ${savepoint}`)
  try {
    await client.query(sql, values)
    throw new Error('Expected query to fail')
  } catch (error) {
    if (error instanceof Error && error.message === 'Expected query to fail') throw error
    await client.query(`rollback to savepoint ${savepoint}`)
    return error instanceof Error ? error.message : String(error)
  }
}

async function createUser(client: PoolClient, isAdmin: boolean) {
  const id = randomUUID()
  const email = `managed-image-${id}@example.test`
  await client.query(
    `insert into auth.users (
       id, aud, role, email, encrypted_password, email_confirmed_at,
       raw_app_meta_data, raw_user_meta_data, created_at, updated_at
     ) values ($1, 'authenticated', 'authenticated', $2, '', now(),
       '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now())`,
    [id, email],
  )
  await client.query(
    `insert into public.profiles (id, username, email, is_admin)
     values ($1, $2, $3, $4)
     on conflict (id) do update set
       username = excluded.username, email = excluded.email, is_admin = excluded.is_admin`,
    [id, `managed-${id.slice(0, 12)}`, email, isAdmin],
  )
  return id
}

async function createCrag(client: PoolClient, name: string) {
  const id = randomUUID()
  await client.query(
    `insert into public.crags (id, name, type, country_code, slug)
     values ($1, $2, 'boulder', 'GB', $3)`,
    [id, name, `managed-${id}`],
  )
  return id
}

async function createImage(client: PoolClient, cragId: string, ownerId: string) {
  const id = randomUUID()
  await client.query(
    `insert into public.images (
       id, url, crag_id, created_by, status, moderation_status, visibility, processing_status
     ) values ($1, $2, $3, $4, 'approved', 'skipped', 'public', 'ready')`,
    [id, `https://example.test/${id}.jpg`, cragId, ownerId],
  )
  return id
}

beforeAll(async () => {
  const installed = await pool.query(
    `select to_regprocedure('public.soft_delete_crag_image(uuid,uuid,text)') is not null as installed`,
  )
  if (!installed.rows[0].installed) throw new Error('Atomic crag image removal migration is not installed')
})

afterAll(async () => pool.end())

describe('atomic crag image removal', () => {
  it('rejects unauthenticated, ordinary, and scoped maintainer callers', async () => {
    await transaction(async (client) => {
      const admin = await createUser(client, true)
      const user = await createUser(client, false)
      const crag = await createCrag(client, 'Authorization crag')
      const image = await createImage(client, crag, user)
      const otherCrag = await createCrag(client, 'Unassigned crag')
      const otherImage = await createImage(client, otherCrag, user)
      await client.query(
        `insert into public.crag_maintainers (crag_id, user_id, assigned_by)
         values ($1, $2, $3)`,
        [crag, user, admin],
      )

      await setRole(client, 'anon')
      expect(await expectedFailure(
        client,
        'select public.soft_delete_crag_image($1, $2, $3)',
        [crag, image, 'Unauthenticated attempt'],
      )).toContain('permission denied')

      await setRole(client, 'authenticated', user)
      expect(await expectedFailure(
        client,
        'select public.soft_delete_crag_image($1, $2, $3)',
        [otherCrag, otherImage, 'Cross-crag maintainer attempt'],
      )).toContain('Administrator required')

      await client.query('reset role')
      expect((await client.query('select status, visibility from public.images where id = $1', [image])).rows)
        .toEqual([{ status: 'approved', visibility: 'public' }])
      expect((await client.query('select status, visibility from public.images where id = $1', [otherImage])).rows)
        .toEqual([{ status: 'approved', visibility: 'public' }])
    })
  })

  it('rejects crag mismatches, invalid reasons, and already-deleted images without mutation', async () => {
    await transaction(async (client) => {
      const admin = await createUser(client, true)
      const owner = await createUser(client, false)
      const crag = await createCrag(client, 'Expected crag')
      const otherCrag = await createCrag(client, 'Other crag')
      const image = await createImage(client, crag, owner)
      await setRole(client, 'authenticated', admin)

      expect(await expectedFailure(
        client,
        'select public.soft_delete_crag_image($1, $2, $3)',
        [otherCrag, image, 'Wrong crag'],
      )).toContain('does not belong')
      expect(await expectedFailure(
        client,
        'select public.soft_delete_crag_image($1, $2, $3)',
        [crag, image, '   '],
      )).toContain('Deletion reason')
      expect(await expectedFailure(
        client,
        'select public.soft_delete_crag_image($1, $2, $3)',
        [crag, image, 'x'.repeat(501)],
      )).toContain('Deletion reason')

      await client.query('select public.soft_delete_crag_image($1, $2, $3)', [crag, image, 'Duplicate photograph'])
      expect(await expectedFailure(
        client,
        'select public.soft_delete_crag_image($1, $2, $3)',
        [crag, image, 'Second removal'],
      )).toContain('already deleted')

      await client.query('reset role')
      expect((await client.query(
        'select count(*)::int as count from public.admin_actions where target_id = $1',
        [image],
      )).rows).toEqual([{ count: 1 }])
    })
  })

  it('deletes perspective-specific lines while preserving routes, user logs, and edit history', async () => {
    await transaction(async (client) => {
      const admin = await createUser(client, true)
      const owner = await createUser(client, false)
      const crag = await createCrag(client, 'Removal crag')
      const image = await createImage(client, crag, owner)
      const climb = randomUUID()
      const routeLine = randomUUID()
      const edit = randomUUID()
      const userLog = randomUUID()
      await client.query(
        `insert into public.climbs (id, name, grade, status, route_type, crag_id, user_id, slug)
         values ($1, 'Preserved route', '6A', 'approved', 'boulder', $2, $3, $4)`,
        [climb, crag, owner, `preserved-${climb}`],
      )
      await client.query(
        `insert into public.route_lines (id, image_id, climb_id, points)
         values ($1, $2, $3, '[{"x":0,"y":0},{"x":1,"y":1}]'::jsonb)`,
        [routeLine, image, climb],
      )
      await client.query(
        `insert into public.submission_edit_history (id, image_id, edit_kind, summary)
         values ($1, $2, 'metadata', 'Preserved edit history')`,
        [edit, image],
      )
      await client.query(
        `insert into public.user_climbs (id, user_id, climb_id, style, notes)
         values ($1, $2, $3, 'top', 'Historical send')`,
        [userLog, owner, climb],
      )

      await setRole(client, 'authenticated', admin)
      await client.query(
        'select public.soft_delete_crag_image($1, $2, $3)',
        [crag, image, ' Unsafe or irrelevant topo '],
      )
      await client.query('reset role')

      expect((await client.query(
        'select status, visibility from public.images where id = $1',
        [image],
      )).rows).toEqual([{ status: 'deleted', visibility: 'private' }])
      expect((await client.query(
        'select id, image_id, climb_id from public.route_lines where id = $1',
        [routeLine],
      )).rows).toEqual([])
      expect((await client.query(
        'select id, name, grade from public.climbs where id = $1',
        [climb],
      )).rows).toEqual([{ id: climb, name: 'Preserved route', grade: '6A' }])
      expect((await client.query(
        'select id, climb_id, notes from public.user_climbs where id = $1',
        [userLog],
      )).rows).toEqual([{ id: userLog, climb_id: climb, notes: 'Historical send' }])
      expect((await client.query(
        `select route_line_id, image_id, climb_id, snapshot->'points' as points
         from public.topo_route_line_tombstones where route_line_id = $1`,
        [routeLine],
      )).rows).toEqual([{
        route_line_id: routeLine,
        image_id: image,
        climb_id: climb,
        points: [{ x: 0, y: 0 }, { x: 1, y: 1 }],
      }])
      expect((await client.query(
        'select id, image_id from public.submission_edit_history where id = $1',
        [edit],
      )).rows).toEqual([{ id: edit, image_id: image }])
      expect((await client.query(
        `select action, user_id, details->>'reason' as reason
         from public.admin_actions where target_id = $1`,
        [image],
      )).rows).toEqual([{ action: 'soft_delete', user_id: admin, reason: 'Unsafe or irrelevant topo' }])

      await setRole(client, 'anon')
      expect((await client.query('select id from public.images where id = $1', [image])).rows).toEqual([])
    })
  })

  it('optionally soft-deletes associated route data while retaining user logs', async () => {
    await transaction(async (client) => {
      const admin = await createUser(client, true)
      const climber = await createUser(client, false)
      const crag = await createCrag(client, 'Route removal crag')
      const image = await createImage(client, crag, admin)
      const otherImage = await createImage(client, crag, admin)
      const climb = randomUUID()
      const log = randomUUID()
      await client.query(
        `insert into public.climbs (id, name, grade, status, route_type, crag_id, slug)
         values ($1, 'Remove this route', '6C', 'approved', 'boulder', $2, $3)`,
        [climb, crag, `remove-${climb}`],
      )
      await client.query(
        `insert into public.route_lines (image_id, climb_id, points) values
           ($1, $3, '[{"x":0,"y":0},{"x":1,"y":1}]'::jsonb),
           ($2, $3, '[{"x":0.2,"y":0.1},{"x":0.8,"y":0.9}]'::jsonb)`,
        [image, otherImage, climb],
      )
      await client.query(
        `insert into public.user_climbs (id, user_id, climb_id, style)
         values ($1, $2, $3, 'top')`,
        [log, climber, climb],
      )

      await setRole(client, 'authenticated', admin)
      await client.query(
        'select public.soft_delete_crag_image($1, $2, $3, true)',
        [crag, image, 'Route no longer exists'],
      )
      await client.query('reset role')

      expect((await client.query(
        'select deleted_at is not null as deleted, deletion_reason from public.climbs where id = $1',
        [climb],
      )).rows).toEqual([{ deleted: true, deletion_reason: 'Removed with topo: Route no longer exists' }])
      expect((await client.query(
        'select count(*)::int as count from public.route_lines where climb_id = $1',
        [climb],
      )).rows).toEqual([{ count: 0 }])
      expect((await client.query(
        'select id, climb_id from public.user_climbs where id = $1',
        [log],
      )).rows).toEqual([{ id: log, climb_id: climb }])
      expect((await client.query(
        'select count(*)::int as count from public.topo_route_line_tombstones where climb_id = $1',
        [climb],
      )).rows).toEqual([{ count: 2 }])
    })
  })
})
