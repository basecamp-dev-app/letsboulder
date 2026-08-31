import { randomUUID } from 'node:crypto'
import type { PoolClient } from 'pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { createDatabaseTestHarness } from './database-test-harness'

const { pool, transaction } = createDatabaseTestHarness({ max: 2, statement_timeout: 15_000 })

async function setAuthenticated(client: PoolClient, userId: string) {
  await client.query('reset role')
  await client.query('set local role authenticated')
  await client.query("select set_config('request.jwt.claims', $1, true)", [
    JSON.stringify({ role: 'authenticated', sub: userId }),
  ])
}

async function createUser(client: PoolClient, isAdmin: boolean) {
  const id = randomUUID()
  const email = `topo-replacement-${id}@example.test`
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
    [id, `topo-${id.slice(0, 12)}`, email, isAdmin],
  )
  return id
}

beforeAll(async () => {
  const installed = await pool.query(
    `select to_regprocedure('public.publish_topo_replacement(uuid)') is not null as installed`,
  )
  if (!installed.rows[0].installed) throw new Error('Topo replacement migration is not installed')
})

afterAll(async () => pool.end())

describe('topo replacement workflow', () => {
  it('allows authenticated managers to evaluate replacement RLS policies', async () => {
    const privileges = await pool.query(
      `select
         has_function_privilege('anon', 'public.can_manage_topo_replacement(uuid)', 'EXECUTE') as anon,
         has_function_privilege('authenticated', 'public.can_manage_topo_replacement(uuid)', 'EXECUTE') as authenticated,
         has_function_privilege('service_role', 'public.can_manage_topo_replacement(uuid)', 'EXECUTE') as service_role`,
    )

    expect(privileges.rows[0]).toEqual({
      anon: false,
      authenticated: true,
      service_role: true,
    })
  })

  it('atomically replaces geometry while retaining climb identity and sends', async () => {
    await transaction(async (client) => {
      const admin = await createUser(client, true)
      const climber = await createUser(client, false)
      const cragId = randomUUID()
      const sourceImageId = randomUUID()
      const replacementImageId = randomUUID()
      const climbId = randomUUID()
      const oldLineId = randomUUID()
      const userLogId = randomUUID()
      const draftImageId = randomUUID()
      const draftRouteId = randomUUID()

      await client.query(
        `insert into public.crags (id, name, type, country_code, slug)
         values ($1, 'Replacement crag', 'boulder', 'GB', $2)`,
        [cragId, `replacement-${cragId}`],
      )
      await client.query(
        `insert into public.images (
           id, url, crag_id, created_by, status, moderation_status, visibility, processing_status
         ) values ($1, $2, $3, $4, 'approved', 'skipped', 'public', 'ready')`,
        [sourceImageId, `https://example.test/${sourceImageId}.jpg`, cragId, admin],
      )
      await client.query(
        `insert into public.climbs (
           id, name, grade, status, route_type, crag_id, user_id, slug
         ) values ($1, 'Historical route', '6B', 'approved', 'boulder', $2, $3, $4)`,
        [climbId, cragId, admin, `historical-${climbId}`],
      )
      await client.query(
        `insert into public.route_lines (id, image_id, climb_id, points)
         values ($1, $2, $3, '[{"x":0.1,"y":0.2},{"x":0.5,"y":0.8}]'::jsonb)`,
        [oldLineId, sourceImageId, climbId],
      )
      await client.query(
        `insert into public.user_climbs (id, user_id, climb_id, style, notes)
         values ($1, $2, $3, 'flash', 'Keep this send')`,
        [userLogId, climber, climbId],
      )

      await setAuthenticated(client, admin)
      const started = (await client.query<{ result: { replacement_id: string; draft_id: string } }>(
        `select public.start_topo_replacement($1, $2, $3, $4) as result`,
        [cragId, sourceImageId, 'A clearer photo', randomUUID()],
      )).rows[0].result

      await client.query("select public.accept_open_data_consent('2026-07-29-v1')")
      await client.query(
        `insert into public.images (
           id, url, created_by, status, moderation_status, visibility, processing_status,
           upload_purpose, upload_draft_id
         ) values ($1, $2, $3, 'pending', 'skipped', 'private', 'ready', 'draft_image', $4)`,
        [replacementImageId, `https://example.test/${replacementImageId}.jpg`, admin, started.draft_id],
      )
      await client.query(
        `insert into public.submission_draft_images (
           id, draft_id, display_order, storage_bucket, storage_path,
           processing_status, linked_image_id, width, height
         ) values ($1, $2, 0, 'test', $3, 'ready', $4, 1200, 1600)`,
        [draftImageId, started.draft_id, `${replacementImageId}.jpg`, replacementImageId],
      )
      await client.query(
        `insert into public.submission_draft_routes (
           id, draft_id, draft_image_id, name, grade, climb_type, points,
           sequence_order, image_width, image_height, created_by, updated_by
         ) values ($1, $2, $3, 'Reference label', '6B', 'boulder',
           '[{"x":0.2,"y":0.15},{"x":0.55,"y":0.9}]'::jsonb,
           0, 1200, 1600, $4, $4)`,
        [draftRouteId, started.draft_id, draftImageId, admin],
      )
      await client.query(
        `select public.set_topo_replacement_route_resolution($1, $2, 'mapped', $3)`,
        [started.replacement_id, climbId, draftRouteId],
      )

      const published = (await client.query<{ result: { default_image_id: string } }>(
        `select public.publish_topo_replacement($1) as result`,
        [started.replacement_id],
      )).rows[0].result
      expect(published.default_image_id).toBe(replacementImageId)

      await client.query('reset role')
      expect((await client.query(
        'select status, visibility from public.images where id = $1',
        [sourceImageId],
      )).rows).toEqual([{ status: 'deleted', visibility: 'private' }])
      expect((await client.query(
        'select status, visibility, crag_id from public.images where id = $1',
        [replacementImageId],
      )).rows).toEqual([{ status: 'approved', visibility: 'public', crag_id: cragId }])
      expect((await client.query(
        'select image_id, climb_id, points from public.route_lines where climb_id = $1',
        [climbId],
      )).rows).toEqual([{
        image_id: replacementImageId,
        climb_id: climbId,
        points: [{ x: 0.2, y: 0.15 }, { x: 0.55, y: 0.9 }],
      }])
      expect((await client.query(
        'select id, name, grade, deleted_at from public.climbs where id = $1',
        [climbId],
      )).rows).toEqual([{ id: climbId, name: 'Historical route', grade: '6B', deleted_at: null }])
      expect((await client.query(
        'select id, climb_id, notes from public.user_climbs where id = $1',
        [userLogId],
      )).rows).toEqual([{ id: userLogId, climb_id: climbId, notes: 'Keep this send' }])
      expect((await client.query(
        'select route_line_id, replacement_id from public.topo_route_line_tombstones where route_line_id = $1',
        [oldLineId],
      )).rows).toEqual([{ route_line_id: oldLineId, replacement_id: started.replacement_id }])
    })
  })

  it('rejects publication until every existing route and drawn line is mapped', async () => {
    await transaction(async (client) => {
      const admin = await createUser(client, true)
      const cragId = randomUUID()
      const imageId = randomUUID()
      const climbId = randomUUID()
      await client.query(
        `insert into public.crags (id, name, type, country_code, slug)
         values ($1, 'Incomplete replacement', 'boulder', 'GB', $2)`,
        [cragId, `incomplete-${cragId}`],
      )
      await client.query(
        `insert into public.images (
           id, url, crag_id, created_by, status, moderation_status, visibility, processing_status
         ) values ($1, $2, $3, $4, 'approved', 'skipped', 'public', 'ready')`,
        [imageId, `https://example.test/${imageId}.jpg`, cragId, admin],
      )
      await client.query(
        `insert into public.climbs (id, name, grade, status, route_type, crag_id, slug)
         values ($1, 'Unresolved route', '6A', 'approved', 'boulder', $2, $3)`,
        [climbId, cragId, `unresolved-${climbId}`],
      )
      await client.query(
        `insert into public.route_lines (image_id, climb_id, points)
         values ($1, $2, '[{"x":0,"y":0},{"x":1,"y":1}]'::jsonb)`,
        [imageId, climbId],
      )
      await setAuthenticated(client, admin)
      const started = (await client.query<{ result: { replacement_id: string } }>(
        `select public.start_topo_replacement($1, $2, 'Needs replacement', NULL) as result`,
        [cragId, imageId],
      )).rows[0].result

      await expect(client.query(
        'select public.publish_topo_replacement($1)',
        [started.replacement_id],
      )).rejects.toThrow('exactly one replacement photo')
    })
  })
})
