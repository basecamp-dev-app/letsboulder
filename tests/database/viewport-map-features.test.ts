import { randomUUID } from 'node:crypto'
import { isIP } from 'node:net'

import { Pool, type PoolClient } from 'pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

const databaseUrl = process.env.TEST_DATABASE_URL || 'postgresql://postgres:postgres@127.0.0.1:54322/postgres'
const hostname = new URL(databaseUrl).hostname.replace(/^\[|\]$/g, '')
const isLoopback = hostname === 'localhost' || hostname === '::1'
  || (isIP(hostname) === 4 && hostname.startsWith('127.'))
if (!isLoopback && process.env.TEST_DATABASE_ALLOW_NON_LOCAL !== 'true') {
  throw new Error(`Refusing database tests against non-loopback host ${hostname}`)
}

const pool = new Pool({ connectionString: databaseUrl, max: 2, statement_timeout: 15_000 })

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

async function addImage(
  client: PoolClient,
  cragId: string,
  status: 'approved' | 'pending' | 'deleted',
  latitude: number | null,
  longitude: number | null,
) {
  await client.query(
    `insert into public.images (id, url, crag_id, status, visibility, processing_status, latitude, longitude)
     values ($1, $2, $3, $4, 'public', 'ready', $5, $6)`,
    [randomUUID(), `https://example.test/${randomUUID()}.jpg`, cragId, status, latitude, longitude],
  )
}

beforeAll(async () => {
  const installed = await pool.query("select to_regprocedure('public.get_viewport_map_features(double precision,double precision,double precision,double precision,integer,boolean)') is not null as installed")
  if (!installed.rows[0].installed) throw new Error('Viewport map features migration is not installed')
})

afterAll(async () => pool.end())

describe('get_viewport_map_features', () => {
  it('returns high-zoom leaves at canonical crag coordinates and includes gyms', async () => {
    await transaction(async (client) => {
      const cragId = randomUUID()
      const gymId = randomUUID()
      await client.query(
        "insert into public.crags (id, name, latitude, longitude, slug) values ($1, 'Canonical crag', 10, 10, 'canonical-crag')",
        [cragId],
      )
      await client.query(
        "insert into public.places (id, name, type, latitude, longitude, slug) values ($1, 'Viewport gym', 'gym', 10.01, 10.01, 'viewport-gym')",
        [gymId],
      )
      await addImage(client, cragId, 'approved', 45, 10)
      await client.query(
        `insert into public.climbs (name, grade, crag_id, status, route_type, latitude, longitude)
         values ('Canonical source', '6A', $1, 'approved', 'boulder', -25, 10)`,
        [cragId],
      )

      await client.query('set local role service_role')
      const result = await client.query('select * from public.get_viewport_map_features(11, 9, 11, 9, 12, false)')
      await client.query('reset role')
      expect(result.rows).toHaveLength(2)
      expect(result.rows.find((row) => row.id === cragId)).toMatchObject({
        type: 'crag', latitude: 10, longitude: 10, image_count: '1', is_cluster: false, point_count: '1',
      })
      expect(result.rows.find((row) => row.id === gymId)).toMatchObject({ type: 'gym', is_cluster: false })
    })
  })

  it('clusters nearby places at low zoom and returns leaves above the threshold', async () => {
    await transaction(async (client) => {
      const ids = [randomUUID(), randomUUID()]
      await client.query(
        `insert into public.crags (id, name, latitude, longitude, slug)
         values ($1, 'Cluster one', 10, 10, 'cluster-one'), ($2, 'Cluster two', 10.001, 10.001, 'cluster-two')`,
        ids,
      )
      await addImage(client, ids[0], 'approved', 10, 10)
      await addImage(client, ids[1], 'approved', 10.001, 10.001)

      const clustered = await client.query('select * from public.get_viewport_map_features(11, 9, 11, 9, 11, false)')
      expect(clustered.rows).toHaveLength(1)
      expect(clustered.rows[0]).toMatchObject({ type: 'cluster', is_cluster: true, point_count: '2', image_count: '2' })

      const leaves = await client.query('select * from public.get_viewport_map_features(11, 9, 11, 9, 12, false)')
      expect(leaves.rows.map((row) => row.id).sort()).toEqual([...ids].sort())
    })
  })

  it('supports antimeridian bounds and preserves eligibility, pending, and deletion rules', async () => {
    await transaction(async (client) => {
      const approved = randomUUID()
      const pending = randomUUID()
      const ineligible = randomUUID()
      const deleted = randomUUID()
      await client.query(
        `insert into public.crags (id, name, latitude, longitude)
         values ($1, 'East', 0, 179.5), ($2, 'West pending', 0, -179.5),
                ($3, 'No eligible image', 0, 179.6), ($4, 'Deleted', 0, 179.7)`,
        [approved, pending, ineligible, deleted],
      )
      await addImage(client, approved, 'approved', 0, 179.5)
      await addImage(client, approved, 'deleted', 0, 179.5)
      await addImage(client, pending, 'pending', 0, -179.5)
      await client.query(
        `insert into public.climbs (name, grade, crag_id, status, route_type, latitude, longitude)
         values ('Pending coordinate source', '6A', $1, 'approved', 'boulder', 0, -179.5)`,
        [pending],
      )
      await addImage(client, ineligible, 'approved', null, null)
      await addImage(client, deleted, 'approved', 0, 179.7)
      await client.query("update public.crags set deleted_at = now(), deletion_reason = 'test' where id = $1", [deleted])

      const approvedOnly = await client.query('select * from public.get_viewport_map_features(1, -1, -179, 179, 12, false)')
      const fixtureApprovedOnly = approvedOnly.rows.filter((row) => [approved, pending, ineligible, deleted].includes(row.id))
      expect(fixtureApprovedOnly.map((row) => row.id)).toEqual([approved])
      expect(fixtureApprovedOnly[0].image_count).toBe('1')

      const withPending = await client.query('select * from public.get_viewport_map_features(1, -1, -179, 179, 12, true)')
      const fixtureWithPending = withPending.rows.filter((row) => [approved, pending, ineligible, deleted].includes(row.id))
      expect(fixtureWithPending.map((row) => row.id).sort()).toEqual([approved, pending].sort())
    })
  })

  it('filters latitude for world bounds and treats wide bounds as a geometry envelope', async () => {
    await transaction(async (client) => {
      const inside = randomUUID()
      const outsideLatitude = randomUUID()
      await client.query(
        `insert into public.crags (id, name, latitude, longitude)
         values ($1, 'Wide inside', 50, 0), ($2, 'Wide outside latitude', 0, 0)`,
        [inside, outsideLatitude],
      )
      await addImage(client, inside, 'approved', 50, 0)
      await addImage(client, outsideLatitude, 'approved', 0, 0)

      const result = await client.query(
        'select * from public.get_viewport_map_features(60, 40, 180, -180, 5, false)',
      )
      const fixtureIds = result.rows.map((row) => row.id)
      expect(fixtureIds).toContain(inside)
      expect(fixtureIds).not.toContain(outsideLatitude)

      const wide = await client.query(
        'select * from public.get_viewport_map_features(60, 40, 170, -170, 11, false)',
      )
      expect(wide.rows.some((row) => Math.abs(Number(row.longitude)) < 1)).toBe(true)
    })
  })

  it('strictly validates arguments and grants only explicit API roles', async () => {
    await expect(pool.query('select * from public.get_viewport_map_features(0, 0, 10, -10, 5, false)'))
      .rejects.toMatchObject({ code: '22023' })
    await expect(pool.query('select * from public.get_viewport_map_features(10, -10, 10, -10, 23, false)'))
      .rejects.toMatchObject({ code: '22023' })
    await expect(pool.query('select * from public.get_viewport_map_features(85, -85, 180, -180, 12, false)'))
      .rejects.toMatchObject({ code: '22023' })
    await expect(pool.query('select * from public.get_viewport_map_features(5, -5, 5, -5, 13, false)'))
      .rejects.toMatchObject({ code: '22023' })
    await expect(pool.query("select * from public.get_viewport_map_features('NaN', -10, 10, -10, 5, false)"))
      .rejects.toMatchObject({ code: '22023' })

    const metadata = await pool.query(
      `select p.prosecdef, p.proconfig,
              exists (
                select from aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) acl
                where acl.grantee = 0 and acl.privilege_type = 'EXECUTE'
              ) as public,
              has_function_privilege('anon', p.oid, 'EXECUTE') as anon,
              has_function_privilege('authenticated', p.oid, 'EXECUTE') as authenticated,
              has_function_privilege('service_role', p.oid, 'EXECUTE') as service_role
       from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'public' and p.proname = 'get_viewport_map_features'`,
    )
    expect(metadata.rows[0]).toEqual({
      prosecdef: true, proconfig: ['search_path=""'], public: false,
      anon: false, authenticated: false, service_role: true,
    })
  })

  it('has a GiST index for geometry viewport envelopes', async () => {
    const index = await pool.query(
      `select indexdef from pg_indexes
       where schemaname = 'public' and indexname = 'idx_crags_location_geometry'`,
    )
    expect(index.rows[0].indexdef).toContain('USING gist (((location)::geometry))')
  })
})
