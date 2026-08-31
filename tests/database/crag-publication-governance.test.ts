import { randomUUID } from 'node:crypto'
import { type PoolClient } from 'pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { createDatabaseTestHarness } from './database-test-harness'

const { pool, transaction } = createDatabaseTestHarness({ max: 2, statement_timeout: 15_000 })

async function setAuthenticatedUser(client: PoolClient, userId: string) {
  await client.query('reset role')
  await client.query('set local role authenticated')
  await client.query("select set_config('request.jwt.claims', $1, true)", [
    JSON.stringify({ role: 'authenticated', sub: userId }),
  ])
}

async function setAnon(client: PoolClient) {
  await client.query('reset role')
  await client.query('set local role anon')
  await client.query("select set_config('request.jwt.claims', '{\"role\":\"anon\"}', true)")
}

beforeAll(async () => {
  const installed = await pool.query(
    "select to_regprocedure('public.set_crag_publication_status(uuid,text,text)') is not null as installed",
  )
  if (!installed.rows[0].installed) throw new Error('Crag publication governance migration is not installed')
})

afterAll(async () => pool.end())

describe('crag publication governance', () => {
  it('keeps new content private until an assigned steward publishes it and records the transition', async () => {
    await transaction(async (client) => {
      const userId = randomUUID()
      const cragId = randomUUID()
      await client.query(
        `insert into auth.users (id, aud, role, email, encrypted_password, created_at, updated_at)
         values ($1, 'authenticated', 'authenticated', $2, '', now(), now())`,
        [userId, `${userId}@example.test`],
      )
      await client.query(
        `insert into public.profiles (id, username, email)
         values ($1, $2, $3)
         on conflict (id) do update set username = excluded.username, email = excluded.email`,
        [userId, `publisher-${userId}`, `${userId}@example.test`],
      )

      await setAuthenticatedUser(client, userId)
      await client.query(
        `insert into public.crags (
           id, name, slug, country_code, latitude, longitude, created_by
         ) values ($1, 'Publication test crag', $2, 'GB', 51, -1, $3)`,
        [cragId, `publication-${cragId}`, userId],
      )

      await setAnon(client)
      expect((await client.query('select id from public.crags where id = $1', [cragId])).rows).toEqual([])

      await setAuthenticatedUser(client, userId)
      const directPublication = await client.query(
        `update public.crags
         set publication_status = 'published', published_at = now()
         where id = $1`,
        [cragId],
      )
      expect(directPublication.rowCount).toBe(0)
      expect((await client.query(
        'select publication_status from public.crags where id = $1',
        [cragId],
      )).rows).toEqual([{ publication_status: 'review' }])

      const transition = await client.query(
        'select public.set_crag_publication_status($1, $2, $3) as status',
        [cragId, 'published', 'Canonical identity and coordinates reviewed'],
      )
      expect(transition.rows[0].status).toBe('published')

      await setAnon(client)
      expect((await client.query('select id from public.crags where id = $1', [cragId])).rows)
        .toEqual([{ id: cragId }])

      await client.query('reset role')
      expect((await client.query(
        `select previous_status, next_status, notes
         from public.crag_publication_events where crag_id = $1`,
        [cragId],
      )).rows).toEqual([{
        previous_status: 'review',
        next_status: 'published',
        notes: 'Canonical identity and coordinates reviewed',
      }])
    })
  })

  it('does not expose the transition RPC to anonymous or service roles', async () => {
    const metadata = await pool.query(
      `select has_function_privilege('anon', p.oid, 'EXECUTE') as anon,
              has_function_privilege('authenticated', p.oid, 'EXECUTE') as authenticated,
              has_function_privilege('service_role', p.oid, 'EXECUTE') as service_role
       from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'public' and p.proname = 'set_crag_publication_status'`,
    )
    expect(metadata.rows[0]).toEqual({ anon: false, authenticated: true, service_role: false })
  })
})
