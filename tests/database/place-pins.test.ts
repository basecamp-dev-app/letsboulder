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

async function setRequestRole(client: PoolClient, role: 'anon' | 'authenticated' | 'service_role') {
  await client.query('reset role')
  await client.query(`set local role ${role}`)
  await client.query("select set_config('request.jwt.claims', $1, true)", [JSON.stringify({ role })])
}

beforeAll(async () => {
  const installed = await pool.query("select to_regprocedure('public.get_place_pins(boolean)') is not null as installed")
  if (!installed.rows[0].installed) throw new Error('Place pins migration is not installed')
})

afterAll(async () => pool.end())

describe('get_place_pins', () => {
  it('returns visible crag pins and valid gym pins for every granted API role', async () => {
    await transaction(async (client) => {
      const cragId = randomUUID()
      const gymId = randomUUID()
      const pendingId = randomUUID()
      const deletedCragId = randomUUID()
      await client.query(
        `insert into public.crags (id, name, latitude, longitude, slug)
         values ($1, 'Visible crag', 10, 10, 'visible-crag'),
                ($2, 'Pending crag', 11, 11, 'pending-crag'),
                ($3, 'Deleted crag', 12, 12, 'deleted-crag')`,
        [cragId, pendingId, deletedCragId],
      )
      await client.query(
        `insert into public.places (id, name, type, latitude, longitude, slug)
         values ($1, 'Visible gym', 'gym', 10.01, 10.01, 'visible-gym'),
                ($2, 'No slug gym', 'gym', 10.02, 10.02, null)`,
        [gymId, randomUUID()],
      )
      await client.query(
        `insert into public.images (id, url, crag_id, status, latitude, longitude)
         values ($1, $2, $3, 'approved', 10, 10),
                ($4, $5, $6, 'pending', 11, 11),
                ($7, $8, $9, 'approved', 12, 12),
                ($10, $11, $3, 'deleted', 10, 10)`,
        [
          randomUUID(), `https://example.test/${randomUUID()}.jpg`, cragId,
          randomUUID(), `https://example.test/${randomUUID()}.jpg`, pendingId,
          randomUUID(), `https://example.test/${randomUUID()}.jpg`, deletedCragId,
          randomUUID(), `https://example.test/${randomUUID()}.jpg`,
        ],
      )
      await client.query("update public.crags set deleted_at = now(), deletion_reason = 'test' where id = $1", [deletedCragId])

      for (const role of ['anon', 'authenticated', 'service_role'] as const) {
        await setRequestRole(client, role)
        const approvedOnly = await client.query('select * from public.get_place_pins(false)')
        const approvedIds = approvedOnly.rows.map((row) => row.id)
        expect(approvedIds).toContain(cragId)
        expect(approvedIds).toContain(gymId)
        expect(approvedIds).not.toContain(pendingId)
        expect(approvedIds).not.toContain(deletedCragId)

        const withPending = await client.query('select * from public.get_place_pins(true)')
        expect(withPending.rows.map((row) => row.id)).toContain(pendingId)
      }
    })
  })

  it('has an explicit owner, hardened search path, and only declared API grants', async () => {
    const metadata = await pool.query(
      `select pg_get_userbyid(p.proowner) as owner, p.prosecdef, p.proconfig,
              exists (
                select from aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) acl
                where acl.grantee = 0 and acl.privilege_type = 'EXECUTE'
              ) as public,
              has_function_privilege('anon', p.oid, 'EXECUTE') as anon,
              has_function_privilege('authenticated', p.oid, 'EXECUTE') as authenticated,
              has_function_privilege('service_role', p.oid, 'EXECUTE') as service_role
       from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'public' and p.proname = 'get_place_pins'`,
    )
    expect(metadata.rows[0]).toEqual({
      owner: 'postgres', prosecdef: true, proconfig: ['search_path=""'], public: false,
      anon: true, authenticated: true, service_role: true,
    })
  })
})
