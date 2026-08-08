import { randomUUID } from 'node:crypto'
import { Pool, type PoolClient } from 'pg'
import { afterAll, describe, expect, it } from 'vitest'

const pool = new Pool({ connectionString: process.env.TEST_DATABASE_URL || 'postgresql://postgres:postgres@127.0.0.1:54322/postgres' })

async function setAuthenticatedUser(client: PoolClient, userId: string) {
  await client.query('set local role authenticated')
  await client.query("select set_config('request.jwt.claims', $1, true)", [JSON.stringify({ role: 'authenticated', sub: userId })])
}

describe('log_routes_idempotent', () => {
  afterAll(async () => pool.end())

  it('replays the same mutation and rejects stale writes', async () => {
    const client = await pool.connect()
    await client.query('begin')
    try {
      const userId = randomUUID()
      const climbId = randomUUID()
      await client.query(
        `insert into auth.users (id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
         values ($1, 'authenticated', 'authenticated', $2, '', now(), '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now())`,
        [userId, `${userId}@example.test`],
      )
      await client.query(
        `insert into public.climbs (id, name, grade, status, user_id) values ($1, 'Idempotency test climb', '6A', 'approved', $2)`,
        [climbId, userId],
      )
      await setAuthenticatedUser(client, userId)

      const mutationId = randomUUID()
      const first = await client.query(
        `select public.log_routes_idempotent($1, $2::uuid[], $3, $4, $5::date, $6::timestamptz) as result`,
        [mutationId, [climbId], 'top', null, '2026-08-01', '2026-08-01T10:00:00Z'],
      )
      const replay = await client.query(
        `select public.log_routes_idempotent($1, $2::uuid[], $3, $4, $5::date, $6::timestamptz) as result`,
        [mutationId, [climbId], 'top', null, '2026-08-01', '2026-08-01T10:00:00Z'],
      )
      expect(first.rows[0].result.logged).toBe(1)
      expect(replay.rows[0].result.replayed).toBe(true)

      await client.query(
        `select public.log_routes_idempotent($1, $2::uuid[], $3, $4, $5::date, $6::timestamptz)`,
        [randomUUID(), [climbId], 'flash', null, '2026-08-02', '2026-08-02T10:00:00Z'],
      )
      const stale = await client.query(
        `select public.log_routes_idempotent($1, $2::uuid[], $3, $4, $5::date, $6::timestamptz) as result`,
        [randomUUID(), [climbId], 'try', null, '2026-07-31', '2026-07-31T10:00:00Z'],
      )
      const row = await client.query("select style, to_char(date_climbed, 'YYYY-MM-DD') as date_climbed from public.user_climbs where user_id = $1 and climb_id = $2", [userId, climbId])
      expect(stale.rows[0].result.logged).toBe(0)
      expect(row.rows[0]).toEqual({ style: 'flash', date_climbed: '2026-08-02' })
    } finally {
      await client.query('rollback')
      client.release()
    }
  })
})
