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
     values ($1, $2, $3, $4)`,
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

  it('soft-deletes the image and audit record while preserving routes and edit history', async () => {
    await transaction(async (client) => {
      const admin = await createUser(client, true)
      const owner = await createUser(client, false)
      const crag = await createCrag(client, 'Removal crag')
      const image = await createImage(client, crag, owner)
      const climb = randomUUID()
      const routeLine = randomUUID()
      const edit = randomUUID()
      await client.query(
        `insert into public.climbs (id, name, grade, status, route_type, crag_id, place_id, user_id, slug)
         values ($1, 'Preserved route', '6A', 'approved', 'boulder', $2, $2, $3, $4)`,
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
      )).rows).toEqual([{ id: routeLine, image_id: image, climb_id: climb }])
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
})
