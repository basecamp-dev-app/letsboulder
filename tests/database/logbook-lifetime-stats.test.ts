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

async function createUser(client: PoolClient, isPublic: boolean): Promise<string> {
  const userId = randomUUID()
  const email = `logbook-${userId}@example.test`
  await client.query(
    `insert into auth.users (
       id, aud, role, email, encrypted_password, email_confirmed_at,
       raw_app_meta_data, raw_user_meta_data, created_at, updated_at
     ) values ($1, 'authenticated', 'authenticated', $2, '', now(),
       '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now())`,
    [userId, email],
  )
  await client.query(
    `insert into public.profiles (id, username, email, is_public)
     values ($1, $2, $3, $4)
     on conflict (id) do update
     set username = excluded.username, email = excluded.email, is_public = excluded.is_public`,
    [userId, `logbook-${userId.slice(0, 12)}`, email, isPublic],
  )
  return userId
}

async function addLog(client: PoolClient, userId: string, style: string) {
  const climbId = randomUUID()
  await client.query(
    `insert into public.climbs (id, name, grade, status, user_id)
     values ($1, 'Aggregate test climb', '6A', 'approved', $2)`,
    [climbId, userId],
  )
  await client.query(
    `insert into public.user_climbs (user_id, climb_id, style)
     values ($1, $2, $3)`,
    [userId, climbId, style],
  )
}

async function setRequestRole(client: PoolClient, role: 'anon' | 'authenticated', userId?: string) {
  await client.query(`set local role ${role}`)
  await client.query("select set_config('request.jwt.claims', $1, true)", [
    JSON.stringify({ role, ...(userId ? { sub: userId } : {}) }),
  ])
}

describe('get_logbook_lifetime_stats', () => {
  afterAll(async () => {
    await pool.end()
  })

  it('returns exact style counts while respecting public and owner visibility', async () => {
    const client = await pool.connect()
    await client.query('begin')

    try {
      const publicUserId = await createUser(client, true)
      const privateUserId = await createUser(client, false)
      await addLog(client, publicUserId, 'flash')
      await addLog(client, publicUserId, 'top')
      await addLog(client, publicUserId, 'top')
      await addLog(client, publicUserId, 'try')
      await addLog(client, privateUserId, 'flash')

      await setRequestRole(client, 'anon')
      const publicProfile = await client.query(
        'select is_public from public.profiles where id = $1',
        [publicUserId],
      )
      expect(publicProfile.rows[0]?.is_public).toBe(true)
      const visibleRows = await client.query(
        'select count(*)::int as count from public.user_climbs where user_id = $1',
        [publicUserId],
      )
      expect(visibleRows.rows[0].count).toBe(4)
      const publicStats = await client.query(
        'select * from public.get_logbook_lifetime_stats($1)',
        [publicUserId],
      )
      expect(publicStats.rows[0]).toMatchObject({
        total_climbs: '4',
        total_flashes: '1',
        total_tops: '2',
        total_tries: '1',
      })

      const hiddenStats = await client.query(
        'select * from public.get_logbook_lifetime_stats($1)',
        [privateUserId],
      )
      expect(hiddenStats.rows[0].total_climbs).toBe('0')

      await client.query('reset role')
      await setRequestRole(client, 'authenticated', privateUserId)
      const ownerStats = await client.query(
        'select * from public.get_logbook_lifetime_stats($1)',
        [privateUserId],
      )
      expect(ownerStats.rows[0]).toMatchObject({
        total_climbs: '1',
        total_flashes: '1',
        total_tops: '0',
        total_tries: '0',
      })
    } finally {
      await client.query('rollback')
      client.release()
    }
  })
})
