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

async function asExportReader(client: PoolClient) {
  // Supabase's local postgres role is intentionally not a superuser. Granting
  // inside the rolled-back fixture transaction lets the tests exercise NOLOGIN.
  await client.query('grant public_data_export_reader to postgres')
  await client.query('set local role public_data_export_reader')
}

async function publishCrags(client: PoolClient, ids: string[]) {
  await client.query(
    `update public.crags set publication_status = 'published', published_at = now()
     where id = any($1::uuid[])`,
    [ids],
  )
}

async function expectedFailure(client: PoolClient, sql: string): Promise<string> {
  const savepoint = `expected_error_${randomUUID().replaceAll('-', '')}`
  await client.query(`savepoint ${savepoint}`)
  try {
    await client.query(sql)
    throw new Error('Expected query to fail')
  } catch (error) {
    if (error instanceof Error && error.message === 'Expected query to fail') throw error
    await client.query(`rollback to savepoint ${savepoint}`)
    await client.query(`release savepoint ${savepoint}`)
    return error instanceof Error ? error.message : String(error)
  }
}

async function markDeleted(
  client: PoolClient,
  table: 'crags' | 'climbs',
  id: string,
  supersededBy: string | null = null,
) {
  await client.query("select set_config('request.jwt.claims', '{\"role\":\"service_role\"}', true)")
  await client.query(
    `update public.${table}
     set deleted_at = now(), deletion_reason = 'private test reason', superseded_by = $2
     where id = $1`,
    [id, supersededBy],
  )
  await client.query("select set_config('request.jwt.claims', '{}', true)")
}

beforeAll(async () => {
  const installed = await pool.query(
    `select to_regclass('public.public_data_export_crags_v1') is not null
       and to_regclass('public.public_data_export_routes_v1') is not null
       and to_regclass('public.public_data_export_route_lines_v1') is not null
       and to_regclass('public.public_data_export_sectors_v1') is not null
       and to_regclass('public.public_data_export_tombstones_v1') is not null as installed`,
  )
  if (!installed.rows[0].installed) throw new Error('Public data export migration is not installed')
})

afterAll(async () => pool.end())

describe('public data export views', () => {
  it('exports only eligible crags and applies exact, approximate, and hidden coordinates', async () => {
    await transaction(async (client) => {
      const exact = randomUUID()
      const approximate = randomUUID()
      const hidden = randomUUID()
      const blankSlug = randomUUID()
      const blankCountry = randomUUID()
      const deleted = randomUUID()
      const awaitingReview = randomUUID()
      await client.query(
        `insert into public.crags (
           id, name, slug, country_code, latitude, longitude, location_visibility
         ) values
           ($1, 'Exact', 'export-exact', 'GB', 12.345678, -45.678912, 'exact'),
           ($2, 'Approximate', 'export-approximate', 'GB', 12.345678, -45.678912, 'approximate'),
           ($3, 'Hidden', 'export-hidden', 'GB', 12.345678, -45.678912, 'hidden'),
           ($4, 'Blank slug', ' ', 'GB', 1, 2, 'exact'),
           ($5, 'Blank country', 'blank-country', ' ', 1, 2, 'exact'),
           ($6, 'Deleted', 'export-deleted', 'GB', 1, 2, 'exact'),
           ($7, 'Awaiting review', 'export-review', 'GB', 1, 2, 'exact')`,
        [exact, approximate, hidden, blankSlug, blankCountry, deleted, awaitingReview],
      )
      await publishCrags(client, [exact, approximate, hidden, blankSlug, blankCountry, deleted])
      await markDeleted(client, 'crags', deleted)

      await asExportReader(client)
      const result = await client.query(
        `select id, location_visibility, latitude, longitude
         from public.public_data_export_crags_v1
         where id = any($1::uuid[]) order by id`,
        [[exact, approximate, hidden, blankSlug, blankCountry, deleted, awaitingReview]],
      )
      expect(result.rows.map((row) => row.id).sort()).toEqual([exact, approximate, hidden].sort())
      expect(result.rows.find((row) => row.id === exact)).toMatchObject({
        location_visibility: 'exact', latitude: '12.34567800', longitude: '-45.67891200',
      })
      expect(result.rows.find((row) => row.id === approximate)).toMatchObject({
        location_visibility: 'approximate', latitude: '12.35', longitude: '-45.68',
      })
      expect(result.rows.find((row) => row.id === hidden)).toMatchObject({
        location_visibility: 'hidden', latitude: null, longitude: null,
      })
    })
  })

  it('exports active and approved routes with the stricter inherited location policy', async () => {
    await transaction(async (client) => {
      const exactCrag = randomUUID()
      const approximateCrag = randomUUID()
      const hiddenCrag = randomUUID()
      await client.query(
        `insert into public.crags (id, name, slug, country_code, location_visibility)
         values ($1, 'Exact parent', 'exact-parent', 'GB', 'exact'),
                ($2, 'Approximate parent', 'approximate-parent', 'GB', 'approximate'),
                ($3, 'Hidden parent', 'hidden-parent', 'GB', 'hidden')`,
        [exactCrag, approximateCrag, hiddenCrag],
      )
      await publishCrags(client, [exactCrag, approximateCrag, hiddenCrag])

      const shared = randomUUID()
      const exact = randomUUID()
      const routeApproximate = randomUUID()
      const inheritedApproximate = randomUUID()
      const routeHidden = randomUUID()
      const inheritedHidden = randomUUID()
      const pending = randomUUID()
      await client.query(
        `insert into public.climbs (
           id, crag_id, shared_climb_id, name, slug, grade, status, route_type,
           latitude, longitude, location_visibility
         ) values
           ($1, $8, $7, 'Exact route', 'exact-route', '6A', 'approved', 'boulder', 1.12345678, 2.12345678, null),
           ($2, $8, null, 'Route approximate', 'route-approximate', '6A', 'active', 'boulder', 1, 2, 'approximate'),
           ($3, $9, null, 'Inherited approximate', 'inherited-approximate', '6A', 'approved', 'boulder', 1, 2, 'exact'),
           ($4, $8, null, 'Route hidden', 'route-hidden', '6A', 'approved', 'boulder', 1, 2, 'hidden'),
           ($5, $10, null, 'Inherited hidden', 'inherited-hidden', '6A', 'approved', 'boulder', 1, 2, null),
           ($6, $8, null, 'Pending route', 'pending-route', '6A', 'pending', 'boulder', 1, 2, null),
           ($7, $8, null, 'Shared source', 'shared-source', '6A', 'pending', 'boulder', 1, 2, null)`,
        [exact, routeApproximate, inheritedApproximate, routeHidden, inheritedHidden, pending, shared,
          exactCrag, approximateCrag, hiddenCrag],
      )

      await asExportReader(client)
      const result = await client.query(
        `select id, effective_climb_id, location_visibility, latitude, longitude
         from public.public_data_export_routes_v1
         where id = any($1::uuid[])`,
        [[exact, routeApproximate, inheritedApproximate, routeHidden, inheritedHidden, pending]],
      )
      expect(result.rows).toHaveLength(5)
      expect(result.rows.find((row) => row.id === exact)).toMatchObject({
        effective_climb_id: shared,
        location_visibility: 'exact',
        latitude: '1.12345678',
        longitude: '2.12345678',
      })
      for (const id of [routeApproximate, inheritedApproximate]) {
        expect(result.rows.find((row) => row.id === id)).toMatchObject({
          location_visibility: 'approximate', latitude: null, longitude: null,
        })
      }
      for (const id of [routeHidden, inheritedHidden]) {
        expect(result.rows.find((row) => row.id === id)).toMatchObject({
          location_visibility: 'hidden', latitude: null, longitude: null,
        })
      }
      expect(result.rows.some((row) => row.id === pending)).toBe(false)
    })
  })

  it('limits sectors and route lines to eligible parents and publicly ready media', async () => {
    await transaction(async (client) => {
      const crag = randomUUID()
      const ineligibleCrag = randomUUID()
      const deletedImageCrag = randomUUID()
      await client.query(
        `insert into public.crags (id, name, slug, country_code)
         values ($1, 'Eligible', 'eligible-media', 'GB'),
                ($2, 'Ineligible', null, 'GB'),
                ($3, 'Deleted image parent', 'deleted-image-parent', 'GB')`,
        [crag, ineligibleCrag, deletedImageCrag],
      )
      await publishCrags(client, [crag, ineligibleCrag, deletedImageCrag])
      const sector = randomUUID()
      const hiddenSector = randomUUID()
      await client.query(
        `insert into public.sectors (id, crag_id, name)
         values ($1, $3, 'Exported sector'), ($2, $4, 'Hidden sector')`,
        [sector, hiddenSector, crag, ineligibleCrag],
      )
      const route = randomUUID()
      const ineligibleRoute = randomUUID()
      const deletedParentRoute = randomUUID()
      await client.query(
        `insert into public.climbs (id, crag_id, name, grade, status, route_type)
         values ($1, $3, 'Exported route', '6A', 'approved', 'boulder'),
                ($2, $4, 'Pending route', '6A', 'pending', 'boulder'),
                ($5, $6, 'Deleted parent route', '6A', 'approved', 'boulder')`,
        [route, ineligibleRoute, crag, ineligibleCrag, deletedParentRoute, deletedImageCrag],
      )

      const readyImage = randomUUID()
      const processingImage = randomUUID()
      const moderatedImage = randomUUID()
      const privateImage = randomUUID()
      const pendingImage = randomUUID()
      const deletedParentImage = randomUUID()
      const ineligibleImage = randomUUID()
      await client.query(
        `insert into public.images (
           id, url, crag_id, processing_status, moderation_status, visibility, status
         ) values
           ($1, 'https://example.test/ready.jpg', $7, 'ready', 'approved', 'public', 'approved'),
           ($2, 'https://example.test/processing.jpg', $7, 'ready', 'approved', 'public', 'approved'),
           ($3, 'https://example.test/moderated.jpg', $7, 'ready', 'approved', 'public', 'approved'),
           ($4, 'https://example.test/private.jpg', $7, 'ready', 'skipped', 'public', 'approved'),
           ($5, 'https://example.test/pending.jpg', $7, 'ready', 'skipped', 'public', 'approved'),
           ($6, 'https://example.test/deleted-parent.jpg', $8, 'ready', 'skipped', 'public', 'approved'),
           ($9, 'https://example.test/ineligible.jpg', $10, 'ready', 'skipped', 'public', 'approved')`,
        [readyImage, processingImage, moderatedImage, privateImage, pendingImage, deletedParentImage,
          crag, deletedImageCrag, ineligibleImage, ineligibleCrag],
      )
      await markDeleted(client, 'crags', deletedImageCrag)

      const lineIds = [readyImage, processingImage, moderatedImage, privateImage, pendingImage,
        deletedParentImage].map(() => randomUUID())
      for (const [index, imageId] of [readyImage, processingImage, moderatedImage, privateImage,
        pendingImage, deletedParentImage].entries()) {
        await client.query(
          `insert into public.route_lines (id, climb_id, image_id, points, sequence_order)
           values ($1, $2, $3, '[{"x":0.2,"y":0.8},{"x":0.5,"y":0.5}]'::jsonb, $4)`,
          [lineIds[index], imageId === deletedParentImage ? deletedParentRoute : route, imageId, index],
        )
      }
      const ineligibleLine = randomUUID()
      await client.query(
        `insert into public.route_lines (id, climb_id, image_id, points)
         values ($1, $2, $3, '[]'::jsonb)`,
        [ineligibleLine, ineligibleRoute, ineligibleImage],
      )
      await client.query("update public.images set processing_status = 'processing' where id = $1", [processingImage])
      await client.query("update public.images set moderation_status = 'pending' where id = $1", [moderatedImage])
      await client.query("update public.images set visibility = 'private' where id = $1", [privateImage])
      await client.query("update public.images set status = 'pending' where id = $1", [pendingImage])

      await asExportReader(client)
      expect((await client.query(
        'select id from public.public_data_export_sectors_v1 where id = any($1::uuid[])',
        [[sector, hiddenSector]],
      )).rows).toEqual([{ id: sector }])
      expect((await client.query(
        `select id from public.public_data_export_route_lines_v1
         where id = any($1::uuid[]) order by id`,
        [[...lineIds, ineligibleLine]],
      )).rows).toEqual([{ id: lineIds[0] }])
    })
  })

  it('exposes sanitized tombstones and preserves least-privileged role boundaries', async () => {
    await transaction(async (client) => {
      const replacementCrag = randomUUID()
      const deletedCrag = randomUUID()
      const replacementRoute = randomUUID()
      const deletedRoute = randomUUID()
      await client.query(
        `insert into public.crags (id, name, slug, country_code)
         values ($1, 'Replacement crag', 'replacement-crag', 'GB'),
                ($2, 'Deleted crag', 'deleted-crag', 'GB')`,
        [replacementCrag, deletedCrag],
      )
      await publishCrags(client, [replacementCrag, deletedCrag])
      await client.query(
        `insert into public.climbs (id, crag_id, name, grade, status, route_type)
         values ($1, $3, 'Replacement route', '6A', 'approved', 'boulder'),
                ($2, $3, 'Deleted route', '6A', 'approved', 'boulder')`,
        [replacementRoute, deletedRoute, replacementCrag],
      )
      await client.query("update public.crags set slug = ' ' where id = $1", [deletedCrag])
      await client.query("update public.climbs set status = 'pending' where id = $1", [deletedRoute])
      await markDeleted(client, 'crags', deletedCrag, replacementCrag)
      await markDeleted(client, 'climbs', deletedRoute, replacementRoute)
      await client.query('delete from public.crags where id = $1', [deletedCrag])

      const roles = await client.query(
        `select rolname, rolcanlogin, rolinherit, rolbypassrls
         from pg_roles
         where rolname in ('public_data_export_owner', 'public_data_export_reader')
         order by rolname`,
      )
      expect(roles.rows).toEqual([
        { rolname: 'public_data_export_owner', rolcanlogin: false, rolinherit: false, rolbypassrls: false },
        { rolname: 'public_data_export_reader', rolcanlogin: false, rolinherit: false, rolbypassrls: false },
      ])
      const views = await client.query(
        `select class.relname as name, owner.rolname as owner, class.reloptions
         from pg_class class
         join pg_roles owner on owner.oid = class.relowner
         where class.relname = any($1::text[]) order by class.relname`,
        [[
          'public_data_export_crags_v1',
          'public_data_export_route_lines_v1',
          'public_data_export_routes_v1',
          'public_data_export_sectors_v1',
          'public_data_export_tombstones_v1',
        ]],
      )
      expect(views.rows).toHaveLength(5)
      for (const view of views.rows) {
        expect(view).toMatchObject({
          owner: 'public_data_export_owner',
          reloptions: ['security_barrier=true', 'security_invoker=false'],
        })
      }
      const columns = await client.query(
        `select table_name, array_agg(column_name::text order by ordinal_position) as columns
         from information_schema.columns
         where table_schema = 'public' and table_name = any($1::text[])
         group by table_name order by table_name`,
        [views.rows.map((view) => view.name)],
      )
      expect(columns.rows).toEqual([
        {
          table_name: 'public_data_export_crags_v1',
          columns: ['id', 'name', 'slug', 'country_code', 'country_id', 'country', 'region_id',
            'region_name', 'sub_area', 'rock_type', 'type', 'tide_dependency', 'location_visibility',
            'latitude', 'longitude', 'created_at', 'updated_at'],
        },
        {
          table_name: 'public_data_export_route_lines_v1',
          columns: ['id', 'climb_id', 'sequence_order', 'color', 'image_width',
            'image_height', 'points', 'created_at'],
        },
        {
          table_name: 'public_data_export_routes_v1',
          columns: ['id', 'effective_climb_id', 'crag_id', 'sector_id', 'shared_climb_id', 'name',
            'slug', 'grade', 'grade_index', 'consensus_grade', 'original_grade_string', 'route_type',
            'location_visibility', 'latitude', 'longitude', 'is_verified', 'verification_count',
            'created_at', 'updated_at'],
        },
        {
          table_name: 'public_data_export_sectors_v1',
          columns: ['id', 'crag_id', 'name', 'created_at'],
        },
        {
          table_name: 'public_data_export_tombstones_v1',
          columns: ['entity_type', 'id', 'deleted_at', 'superseded_by'],
        },
      ])
      expect((await client.query(
        `select member.rolname as member, granted.rolname as granted
         from pg_auth_members membership
         join pg_roles granted on granted.oid = membership.roleid
         join pg_roles member on member.oid = membership.member
          where (membership.roleid in ('public_data_export_owner'::regrole, 'public_data_export_reader'::regrole)
                 and membership.member <> 'postgres'::regrole)
             or membership.member in ('public_data_export_owner'::regrole, 'public_data_export_reader'::regrole)`,
      )).rows).toEqual([])
      expect((await client.query(
        `select coalesce(bool_or(inherit_option or set_option), false) as active_membership
         from pg_auth_members
          where roleid in ('public_data_export_owner'::regrole, 'public_data_export_reader'::regrole)
           and member = 'postgres'::regrole`,
      )).rows).toEqual([{ active_membership: false }])

      const privileges = await client.query(
        `select
           has_table_privilege('public_data_export_reader', 'public.crags', 'SELECT') as broad_crags,
           has_column_privilege('public_data_export_reader', 'public.crags', 'id', 'SELECT') as crag_id,
           has_column_privilege('public_data_export_reader', 'public.crags', 'description', 'SELECT') as crag_description,
           has_column_privilege('public_data_export_reader', 'public.climbs', 'description', 'SELECT') as route_description,
           has_column_privilege('public_data_export_reader', 'public.climbs', 'user_id', 'SELECT') as route_identity,
           has_column_privilege('public_data_export_reader', 'public.images', 'url', 'SELECT') as image_url,
           has_schema_privilege('public_data_export_reader', 'public', 'CREATE') as schema_create`,
      )
      expect(privileges.rows[0]).toEqual({
        broad_crags: false,
        crag_id: false,
        crag_description: false,
        route_description: false,
        route_identity: false,
        image_url: false,
        schema_create: false,
      })

      for (const apiRole of ['anon', 'authenticated', 'service_role']) {
        for (const view of views.rows) {
          expect((await client.query(
            'select has_table_privilege($1, $2, \'SELECT\') as allowed',
            [apiRole, `public.${view.name}`],
          )).rows[0].allowed).toBe(false)
        }
      }

      await asExportReader(client)
      const tombstones = await client.query(
        `select entity_type, id, superseded_by, deleted_at is not null as deleted
         from public.public_data_export_tombstones_v1
         where id = any($1::uuid[]) order by entity_type`,
        [[deletedCrag, deletedRoute]],
      )
      expect(tombstones.rows).toEqual([
        { entity_type: 'crag', id: deletedCrag, superseded_by: replacementCrag, deleted: true },
        { entity_type: 'route', id: deletedRoute, superseded_by: replacementRoute, deleted: true },
      ])
      expect(await expectedFailure(client, 'select deletion_reason from public.crags')).toContain('permission denied')
      expect(await expectedFailure(client, 'select latitude, longitude from public.crags'))
        .toContain('permission denied')
      expect(await expectedFailure(client, 'select description, user_id, status from public.climbs'))
        .toContain('permission denied')
      expect(await expectedFailure(client, 'select url from public.images')).toContain('permission denied')
    })
  })
})
