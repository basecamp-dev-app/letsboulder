import { randomUUID } from 'node:crypto'
import { type PoolClient } from 'pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { createDatabaseTestHarness } from './database-test-harness'

const { pool, transaction } = createDatabaseTestHarness({ max: 2, statement_timeout: 15_000 })

async function setRequestRole(client: PoolClient, role: 'anon' | 'authenticated' | 'service_role') {
  await client.query('reset role')
  await client.query(`set local role ${role}`)
  await client.query("select set_config('request.jwt.claims', $1, true)", [JSON.stringify({ role })])
}

async function addImage(
  client: PoolClient,
  cragId: string,
  overrides: Partial<Record<'status' | 'visibility' | 'processing_status' | 'moderation_status', string>> = {},
) {
  const state = {
    status: 'approved', visibility: 'public', processing_status: 'ready', moderation_status: 'approved', ...overrides,
  }
  await client.query(
    `insert into public.images (
       id, url, crag_id, status, visibility, processing_status, moderation_status, latitude, longitude
     ) values ($1, $2, $3, $4, $5, $6, $7, 10, 10)`,
    [randomUUID(), `https://example.test/${randomUUID()}.jpg`, cragId,
      state.status, state.visibility, state.processing_status, state.moderation_status],
  )
}

beforeAll(async () => {
  const installed = await pool.query("select to_regprocedure('public.get_place_pins(boolean)') is not null as installed")
  if (!installed.rows[0].installed) throw new Error('Place pins migration is not installed')
})

afterAll(async () => pool.end())

describe('get_place_pins', () => {
  it('uses canonical readiness for every public role and ignores the legacy pending toggle', async () => {
    await transaction(async (client) => {
      const states = {
        readyPublic: randomUUID(),
        processing: randomUUID(),
        moderationPending: randomUUID(),
        private: randomUUID(),
        rejected: randomUUID(),
        deleted: randomUUID(),
        legacyPending: randomUUID(),
        deletedCrag: randomUUID(),
      }
      const gymId = randomUUID()
      await client.query(
        `insert into public.crags (id, name, latitude, longitude, slug)
         select id, name, 10, 10, slug from jsonb_to_recordset($1::jsonb)
           as fixture(id uuid, name text, slug text)`,
        [JSON.stringify(Object.entries(states).map(([name, id]) => ({ id, name, slug: name.toLowerCase() })))],
      )
      await client.query(
        `update public.crags set publication_status = 'published', published_at = now()
         where id = any($1::uuid[])`,
        [Object.values(states)],
      )
      await client.query(
        "insert into public.places (id, name, type, latitude, longitude, slug) values ($1, 'Visible gym', 'gym', 10, 10, 'visible-gym')",
        [gymId],
      )
      await addImage(client, states.readyPublic)
      await addImage(client, states.processing, { processing_status: 'processing' })
      await addImage(client, states.moderationPending, { moderation_status: 'pending' })
      await addImage(client, states.private, { visibility: 'private' })
      await addImage(client, states.rejected, { status: 'rejected' })
      await addImage(client, states.deleted, { status: 'deleted' })
      await addImage(client, states.legacyPending, { status: 'pending' })
      await addImage(client, states.deletedCrag)
      await client.query("update public.crags set deleted_at = now(), deletion_reason = 'test' where id = $1", [states.deletedCrag])

      for (const role of ['anon', 'authenticated', 'service_role'] as const) {
        await setRequestRole(client, role)
        for (const includePending of [false, true]) {
          const result = await client.query('select * from public.get_place_pins($1)', [includePending])
          const fixtureRows = result.rows.filter((row) => [...Object.values(states), gymId].includes(row.id))
          expect(fixtureRows.map((row) => row.id).sort()).toEqual([states.readyPublic, gymId].sort())
          expect(fixtureRows.find((row) => row.id === states.readyPublic)?.image_count).toBe('1')
        }
      }
    })
  })

  it('has an explicit owner, hardened search path, and exact API grants', async () => {
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
