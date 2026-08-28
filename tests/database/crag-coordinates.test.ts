import { randomUUID } from 'node:crypto'
import { type PoolClient } from 'pg'
import { afterAll, describe, expect, it } from 'vitest'

import { createDatabaseTestHarness } from './database-test-harness'

const { pool } = createDatabaseTestHarness({ max: 2, statement_timeout: 15_000 })

async function expectConstraintViolation(client: PoolClient, query: string, values: unknown[]) {
  await client.query('savepoint coordinate_constraint')
  try {
    await expect(client.query(query, values)).rejects.toMatchObject({ code: '23514' })
  } finally {
    await client.query('rollback to savepoint coordinate_constraint')
  }
}

describe('canonical crag coordinates', () => {
  afterAll(async () => {
    await pool.end()
  })

  it('derives geography from latitude and longitude during recomputation', async () => {
    const client = await pool.connect()
    await client.query('begin')

    try {
      const cragId = randomUUID()
      const climbId = randomUUID()
      await client.query(
        `insert into public.crags (id, name, latitude, longitude)
         values ($1, 'Coordinate test crag', 51.5007, -0.1246)`,
        [cragId],
      )

      const initial = await client.query(
        `select extensions.ST_Y(location::extensions.geometry) as latitude,
                extensions.ST_X(location::extensions.geometry) as longitude
         from public.crags where id = $1`,
        [cragId],
      )
      expect(Number(initial.rows[0].latitude)).toBeCloseTo(51.5007, 8)
      expect(Number(initial.rows[0].longitude)).toBeCloseTo(-0.1246, 8)

      await client.query(
        `insert into public.climbs (id, crag_id, name, grade, latitude, longitude, status)
         values ($1, $2, 'Coordinate test climb', '6A', 52.123456, 4.987654, 'approved')`,
        [climbId, cragId],
      )

      const recomputed = await client.query(
        `select latitude::double precision as latitude,
                longitude::double precision as longitude,
                extensions.ST_Y(location::extensions.geometry) as location_latitude,
                extensions.ST_X(location::extensions.geometry) as location_longitude
         from public.crags where id = $1`,
        [cragId],
      )
      expect(recomputed.rows[0]).toMatchObject({
        latitude: 52.123456,
        longitude: 4.987654,
        location_latitude: 52.123456,
        location_longitude: 4.987654,
      })

      await client.query(
        'update public.climbs set latitude = null, longitude = null where id = $1',
        [climbId],
      )
      const cleared = await client.query(
        'select latitude, longitude, location from public.crags where id = $1',
        [cragId],
      )
      expect(cleared.rows[0]).toEqual({ latitude: null, longitude: null, location: null })
    } finally {
      await client.query('rollback')
      client.release()
    }
  })

  it('enforces coordinate ranges and complete coordinate pairs', async () => {
    const client = await pool.connect()
    await client.query('begin')

    try {
      const insert = `insert into public.crags (id, name, latitude, longitude)
        values ($1, 'Invalid coordinate crag', $2, $3)`
      await expectConstraintViolation(client, insert, [randomUUID(), 90.00000001, 0])
      await expectConstraintViolation(client, insert, [randomUUID(), 0, 180.00000001])
      await expectConstraintViolation(client, insert, [randomUUID(), 45, null])

      await expect(client.query(insert, [randomUUID(), -90, 180])).resolves.toBeDefined()
    } finally {
      await client.query('rollback')
      client.release()
    }
  })

  it('stores location as generated geography with a GiST index', async () => {
    const generated = await pool.query(
      `select is_generated
       from information_schema.columns
       where table_schema = 'public' and table_name = 'crags' and column_name = 'location'`,
    )
    expect(generated.rows[0].is_generated).toBe('ALWAYS')

    const index = await pool.query(
      `select indexdef
       from pg_indexes
       where schemaname = 'public' and indexname = 'idx_crags_location'`,
    )
    expect(index.rows[0].indexdef).toContain('USING gist (location)')
  })

  it('finds nearby crags accurately across the antimeridian at high latitude', async () => {
    const client = await pool.connect()
    await client.query('begin')

    try {
      const nearestId = randomUUID()
      const antimeridianId = randomUUID()
      const outsideId = randomUUID()
      const deletedId = randomUUID()
      await client.query(
        `insert into public.crags (id, name, latitude, longitude)
         values ($1, 'Nearest polar crag', 85, 179.95),
                ($2, 'Across antimeridian crag', 85, -179.9),
                ($3, 'Outside radius crag', 85, -170),
                ($4, 'Deleted polar crag', 85, 179.9)`,
        [nearestId, antimeridianId, outsideId, deletedId],
      )
      await client.query(
        `update public.crags set publication_status = 'published', published_at = now()
         where id = any($1::uuid[])`,
        [[nearestId, antimeridianId, outsideId, deletedId]],
      )

      await client.query('set local role service_role')
      await client.query(
        `update public.crags
         set deleted_at = now(), deletion_reason = 'Database test deletion'
         where id = $1`,
        [deletedId],
      )
      await client.query('reset role')
      await client.query('set local role anon')
      const result = await client.query(
        `select id, distance_meters
         from public.get_nearby_crags(85, 179.9, 10000, 30)`,
      )
      await client.query('reset role')

      const ids = result.rows.map((row) => row.id)
      expect(ids).toContain(nearestId)
      expect(ids.indexOf(nearestId)).toBeLessThan(ids.indexOf(antimeridianId))
      expect(ids).toContain(antimeridianId)
      expect(ids).not.toContain(outsideId)
      expect(ids).not.toContain(deletedId)
      expect(Number(result.rows.find((row) => row.id === antimeridianId)?.distance_meters)).toBeLessThan(10_000)
    } finally {
      await client.query('rollback')
      client.release()
    }
  })

  it('validates nearby RPC arguments and exposes a hardened invoker function', async () => {
    await expect(pool.query('select * from public.get_nearby_crags(91, 0, 10000, 30)'))
      .rejects.toMatchObject({ code: '22023' })
    await expect(pool.query('select * from public.get_nearby_crags(0, 0, 100001, 30)'))
      .rejects.toMatchObject({ code: '22023' })
    await expect(pool.query('select * from public.get_nearby_crags(0, 0, 10000, 31)'))
      .rejects.toMatchObject({ code: '22023' })

    const metadata = await pool.query(
      `select p.prosecdef, p.proconfig
       from pg_proc p
       join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'public' and p.proname = 'get_nearby_crags'`,
    )
    expect(metadata.rows[0]).toMatchObject({ prosecdef: false, proconfig: ['search_path=""'] })

    const grants = await pool.query(
      `select has_function_privilege('anon', p.oid, 'EXECUTE') as anon,
              has_function_privilege('authenticated', p.oid, 'EXECUTE') as authenticated,
              has_function_privilege('service_role', p.oid, 'EXECUTE') as service_role
       from pg_proc p
       join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'public' and p.proname = 'get_nearby_crags'`,
    )
    expect(grants.rows[0]).toEqual({ anon: true, authenticated: true, service_role: true })
  })

  it('can use the crag geography GiST index for radius filtering and KNN ordering', async () => {
    const client = await pool.connect()
    await client.query('begin')

    try {
      await client.query('set local enable_seqscan = off')
      const plan = await client.query(
        `explain (costs off)
         select id
         from public.crags
         where extensions.ST_DWithin(
           location,
           extensions.ST_SetSRID(extensions.ST_MakePoint(179.9, 85), 4326)::extensions.geography,
           10000
         )
         order by location <-> extensions.ST_SetSRID(
           extensions.ST_MakePoint(179.9, 85), 4326
         )::extensions.geography
         limit 30`,
      )
      expect(plan.rows.map((row) => row['QUERY PLAN']).join('\n')).toContain('idx_crags_location')
    } finally {
      await client.query('rollback')
      client.release()
    }
  })
})
