import { randomUUID } from 'node:crypto'
import { type PoolClient } from 'pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { createDatabaseTestHarness } from './database-test-harness'

const { pool } = createDatabaseTestHarness({ max: 2, statement_timeout: 15_000 })

async function transaction(run: (client: PoolClient) => Promise<void>) {
  const client = await pool.connect()
  await client.query('begin')
  try {
    await run(client)
  } finally {
    await client.query('rollback')
    client.release()
  }
}

async function setRole(
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

async function createUser(client: PoolClient, isAdmin = false) {
  const id = randomUUID()
  const email = `soft-delete-${id}@example.test`
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
    [id, `delete-${id.slice(0, 12)}`, email, isAdmin],
  )
  return { email, id }
}

async function createCrag(client: PoolClient, name: string) {
  const id = randomUUID()
  const slug = `soft-delete-${id}`
  await client.query(
    `insert into public.crags (id, name, type, country_code, slug)
     values ($1, $2, 'boulder', 'GB', $3)`,
    [id, name, slug],
  )
  await client.query(
    `update public.crags set publication_status = 'published', published_at = now()
     where id = $1`,
    [id],
  )
  return { id, slug }
}

async function createClimb(client: PoolClient, cragId: string, userId: string, status = 'approved') {
  const id = randomUUID()
  const slug = `climb-${id}`
  await client.query(
    `insert into public.climbs (id, name, grade, status, route_type, crag_id, place_id, user_id, slug)
     values ($1, 'Soft deletion climb', '6A', $2, 'boulder', $3, $3, $4, $5)`,
    [id, status, cragId, userId, slug],
  )
  return { id, slug }
}

async function failure(client: PoolClient, sql: string, values: unknown[] = []) {
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

beforeAll(async () => {
  const installed = await pool.query(
    `select to_regprocedure('public.soft_delete_climb(uuid,text,uuid)') is not null
       and to_regprocedure('public.resolve_public_crag_slug(text,text)') is not null
       and to_regprocedure('public.resolve_legacy_route_redirect(text,text,text)') is not null
       and to_regprocedure('public.resolve_legacy_climb_redirect(uuid)') is not null
       and to_regprocedure('public.resolve_legacy_image_redirect(uuid)') is not null as installed`,
  )
  if (!installed.rows[0].installed) throw new Error('Published content soft deletion migration is not installed')
})

afterAll(async () => pool.end())

describe('published crag and climb soft deletion', () => {
  it('resolves legacy redirect targets with compact public lookups', async () => {
    await transaction(async (client) => {
      const user = await createUser(client)
      const crag = await createCrag(client, 'Legacy redirect crag')
      const climb = await createClimb(client, crag.id, user.id)
      const imageId = randomUUID()
      const routeId = randomUUID()

      await client.query(
        `insert into public.images (
           id, url, crag_id, created_by, status, moderation_status, visibility, processing_status
         ) values ($1, 'https://example.test/legacy-redirect.jpg', $2, $3,
           'approved', 'skipped', 'public', 'ready')`,
        [imageId, crag.id, user.id],
      )
      await client.query(
        `insert into public.route_lines (id, image_id, climb_id, points)
         values ($1, $2, $3, '[{"x":0,"y":0},{"x":1,"y":1}]'::jsonb)`,
        [routeId, imageId, climb.id],
      )

      await setRole(client, 'anon')
      expect((await client.query(
        'select * from public.resolve_legacy_route_redirect($1, $2, $3)',
        ['GB', crag.slug, climb.slug],
      )).rows).toEqual([{
        country_code: 'GB',
        crag_slug: crag.slug,
        climb_slug: climb.slug,
        effective_climb_id: climb.id,
        image_id: imageId,
      }])
      expect((await client.query(
        'select * from public.resolve_legacy_climb_redirect($1)',
        [climb.id],
      )).rows).toEqual([{
        country_code: 'GB',
        crag_slug: crag.slug,
        effective_climb_id: climb.id,
        route_id: routeId,
        image_id: imageId,
      }])
      expect((await client.query(
        'select * from public.resolve_legacy_image_redirect($1)',
        [imageId],
      )).rows).toEqual([{
        country_code: 'GB',
        crag_slug: crag.slug,
        image_id: imageId,
      }])
    })
  })

  it('resolves a legacy route through a shared climb alias with the topo line', async () => {
    await transaction(async (client) => {
      const user = await createUser(client)
      const crag = await createCrag(client, 'Shared legacy redirect crag')
      const climb = await createClimb(client, crag.id, user.id)
      const alias = await createClimb(client, crag.id, user.id)
      const imageId = randomUUID()

      await client.query('update public.climbs set shared_climb_id = $1 where id = $2', [climb.id, alias.id])
      await client.query(
        `insert into public.images (
           id, url, crag_id, created_by, status, moderation_status, visibility, processing_status
         ) values ($1, 'https://example.test/shared-legacy-redirect.jpg', $2, $3,
           'approved', 'skipped', 'public', 'ready')`,
        [imageId, crag.id, user.id],
      )
      await client.query(
        `insert into public.route_lines (id, image_id, climb_id, points)
         values ($1, $2, $3, '[{"x":0,"y":0},{"x":1,"y":1}]'::jsonb)`,
        [randomUUID(), imageId, alias.id],
      )

      await setRole(client, 'anon')
      expect((await client.query(
        'select * from public.resolve_legacy_route_redirect($1, $2, $3)',
        ['GB', crag.slug, climb.slug],
      )).rows).toEqual([{
        country_code: 'GB',
        crag_slug: crag.slug,
        climb_slug: climb.slug,
        effective_climb_id: climb.id,
        image_id: imageId,
      }])
    })
  })

  it('allows only admins, validates replacements, resolves the active climb, and audits atomically', async () => {
    await transaction(async (client) => {
      const admin = await createUser(client, true)
      const user = await createUser(client)
      const crag = await createCrag(client, 'Resolver crag')
      const oldClimb = await createClimb(client, crag.id, user.id)
      const replacement = await createClimb(client, crag.id, user.id)

      await setRole(client, 'authenticated', user.id)
      expect(await failure(
        client,
        'select public.soft_delete_climb($1, $2, $3)',
        [oldClimb.id, 'Duplicate route', replacement.id],
      )).toContain('Administrator required')

      await setRole(client, 'authenticated', admin.id)
      expect(await failure(client, 'select public.soft_delete_climb($1, $2)', [oldClimb.id, '   ']))
        .toContain('Deletion reason')
      await client.query(
        'select public.soft_delete_climb($1, $2, $3)',
        [oldClimb.id, ' Duplicate route ', replacement.id],
      )
      await client.query('reset role')

      const lifecycle = await client.query(
        'select deletion_reason, superseded_by from public.climbs where id = $1',
        [oldClimb.id],
      )
      expect(lifecycle.rows).toEqual([{ deletion_reason: 'Duplicate route', superseded_by: replacement.id }])
      expect((await client.query(
        `select action, user_id, details->>'reason' as reason
         from public.admin_actions where target_id = $1`,
        [oldClimb.id],
      )).rows).toEqual([{ action: 'soft_delete', user_id: admin.id, reason: 'Duplicate route' }])

      await setRole(client, 'anon')
      expect((await client.query('select id from public.climbs where id = $1', [oldClimb.id])).rows).toEqual([])
      expect((await client.query(
        'select * from public.resolve_public_climb_slug($1, $2, $3)',
        ['GB', crag.slug, oldClimb.slug],
      )).rows[0]).toMatchObject({ id: replacement.id, superseded_from: oldClimb.id })
    })
  })

  it('soft-deletes active children and hides the crag, images, comments, and aggregate rows', async () => {
    await transaction(async (client) => {
      const admin = await createUser(client, true)
      const owner = await createUser(client)
      const crag = await createCrag(client, 'Cascaded crag')
      const climb = await createClimb(client, crag.id, owner.id)
      const imageId = randomUUID()
      await client.query(
        `insert into public.images (
           id, url, crag_id, created_by, status, moderation_status, visibility, processing_status
         ) values ($1, 'https://example.test/deleted-parent.jpg', $2, $3,
           'approved', 'skipped', 'public', 'ready')`,
        [imageId, crag.id, owner.id],
      )
      await client.query(
        `insert into public.comments (target_type, target_id, author_id, body, category)
         values ('crag', $1, $2, 'Hidden parent comment', 'general')`,
        [crag.id, owner.id],
      )
      await client.query(
        `insert into public.crag_reports (crag_id, reporter_id, reason, status)
         values ($1, $2, 'duplicate', 'pending')`,
        [crag.id, owner.id],
      )

      await setRole(client, 'authenticated', admin.id)
      await client.query('select public.soft_delete_crag($1, $2)', [crag.id, 'Merged location'])
      await client.query('reset role')
      expect((await client.query(
        'select deleted_at is not null as deleted from public.climbs where id = $1',
        [climb.id],
      )).rows).toEqual([{ deleted: true }])

      await setRole(client, 'anon')
      expect((await client.query('select id from public.crags where id = $1', [crag.id])).rows).toEqual([])
      expect((await client.query('select id from public.images where id = $1', [imageId])).rows).toEqual([])
      expect((await client.query('select id from public.comments where target_id = $1', [crag.id])).rows).toEqual([])
      expect((await client.query('select crag_id from public.crag_report_counts where crag_id = $1', [crag.id])).rows).toEqual([])

      await setRole(client, 'service_role')
      expect(await failure(
        client,
        `insert into public.climbs (name, grade, status, route_type, crag_id)
         values ('Late route', '6A', 'approved', 'boulder', $1)`,
        [crag.id],
      )).toContain('deleted crag')
      expect(await failure(
        client,
        `insert into public.images (url, crag_id, status, visibility, processing_status)
         values ('https://example.test/late.jpg', $1, 'approved', 'public', 'ready')`,
        [crag.id],
      )).toContain('deleted crag')
    })
  })

  it('blocks hard deletion of published content even for service role but permits disposable rows', async () => {
    await transaction(async (client) => {
      const owner = await createUser(client)
      const populated = await createCrag(client, 'Populated crag')
      const published = await createClimb(client, populated.id, owner.id)
      const empty = await createCrag(client, 'Empty crag')
      const draftCrag = await createCrag(client, 'Draft crag')
      const draft = await createClimb(client, draftCrag.id, owner.id, 'pending')

      await setRole(client, 'service_role')
      expect(await failure(client, 'delete from public.climbs where id = $1', [published.id]))
        .toContain('never-published')
      expect(await failure(client, 'delete from public.crags where id = $1', [populated.id]))
        .toContain('Only empty crags')
      expect((await client.query('delete from public.climbs where id = $1', [draft.id])).rowCount).toBe(1)
      expect((await client.query('delete from public.crags where id = $1', [empty.id])).rowCount).toBe(1)

      const imageId = randomUUID()
      await client.query(
        `insert into public.images (id, url, created_by, status, visibility, processing_status)
         values ($1, 'https://example.test/published.jpg', $2, 'approved', 'public', 'ready')`,
        [imageId, owner.id],
      )
      expect(await failure(client, 'delete from public.images where id = $1', [imageId]))
        .toContain('never-published images')
    })
  })

  it('preserves edit history and tombstones published images and climbs during account deletion', async () => {
    await transaction(async (client) => {
      const owner = await createUser(client)
      const crag = await createCrag(client, 'Account deletion crag')
      const climb = await createClimb(client, crag.id, owner.id)
      const imageId = randomUUID()
      await client.query(
        `insert into public.images (id, url, crag_id, created_by, status, visibility, processing_status)
         values ($1, 'https://example.test/history.jpg', $2, $3, 'approved', 'public', 'ready')`,
        [imageId, crag.id, owner.id],
      )
      await client.query(
        `insert into public.submission_edit_history (image_id, edited_by, edit_kind, summary)
         values ($1, $2, 'metadata', 'Published edit')`,
        [imageId, owner.id],
      )

      await setRole(client, 'service_role')
      await client.query('select * from public.delete_account_atomic($1, $2, true)', [owner.id, owner.email])
      await client.query('reset role')
      await client.query('delete from auth.users where id = $1', [owner.id])

      expect((await client.query(
        'select status, visibility, created_by from public.images where id = $1',
        [imageId],
      )).rows).toEqual([{ status: 'deleted', visibility: 'private', created_by: null }])
      expect((await client.query(
        'select edited_by from public.submission_edit_history where image_id = $1',
        [imageId],
      )).rows).toEqual([{ edited_by: null }])
      expect((await client.query(
        'select deleted_at is not null as deleted, deletion_reason, user_id from public.climbs where id = $1',
        [climb.id],
      )).rows).toEqual([{ deleted: true, deletion_reason: 'Creator account deleted', user_id: null }])
    })
  })

  it('allows an unassociated unpublished image to be hard-deleted', async () => {
    await transaction(async (client) => {
      const owner = await createUser(client)
      const imageId = randomUUID()
      await client.query(
        `insert into public.images (id, url, created_by, status, visibility, processing_status)
         values ($1, 'https://example.test/disposable.jpg', $2, 'pending', 'private', 'pending')`,
        [imageId, owner.id],
      )
      await setRole(client, 'service_role')
      expect((await client.query('delete from public.images where id = $1', [imageId])).rowCount).toBe(1)
    })
  })

  it('removes authenticated direct-delete privileges and uses restrictive self references', async () => {
    const result = await pool.query(
      `select
         has_table_privilege('authenticated', 'public.crags', 'DELETE') as crag_delete,
         has_table_privilege('authenticated', 'public.climbs', 'DELETE') as climb_delete,
         has_table_privilege('authenticated', 'public.images', 'DELETE') as image_delete,
         (select confdeltype from pg_constraint where conname = 'crags_superseded_by_fkey') as crag_fk,
         (select confdeltype from pg_constraint where conname = 'climbs_superseded_by_fkey') as climb_fk`,
    )
    expect(result.rows[0]).toEqual({
      crag_delete: false,
      climb_delete: false,
      image_delete: false,
      crag_fk: 'r',
      climb_fk: 'r',
    })
  })

  it('does not trust caller-set lifecycle context', async () => {
    await transaction(async (client) => {
      const owner = await createUser(client)
      const crag = await createCrag(client, 'Lifecycle guard crag')
      const climb = await createClimb(client, crag.id, owner.id, 'pending')

      await setRole(client, 'authenticated', owner.id)
      await client.query("select set_config('app.soft_delete_context', 'allowed', true)")
      expect(await failure(
        client,
        `update public.climbs
         set deleted_at = now(), deletion_reason = 'Caller bypass'
         where id = $1`,
        [climb.id],
      )).toContain('soft-delete RPC')
    })
  })
})
