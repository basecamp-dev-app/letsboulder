import { randomUUID } from 'node:crypto'
import { isIP } from 'node:net'

import { Pool, type PoolClient } from 'pg'
import { afterAll, describe, expect, it } from 'vitest'

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
})
