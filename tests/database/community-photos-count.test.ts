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
  cragId: string | null,
  overrides: Partial<Record<'status' | 'visibility' | 'processing_status' | 'moderation_status', string>> = {},
  parentImageId: string | null = null,
) {
  const id = randomUUID()
  const state = {
    status: 'approved', visibility: 'public', processing_status: 'ready', moderation_status: 'approved', ...overrides,
  }
  await client.query(
    `insert into public.images (
       id, url, crag_id, parent_image_id, status, visibility, processing_status, moderation_status
     ) values ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [id, `https://example.test/${id}.jpg`, cragId, parentImageId,
      state.status, state.visibility, state.processing_status, state.moderation_status],
  )
  return id
}

beforeAll(async () => {
  const installed = await pool.query("select to_regprocedure('public.get_community_photos_count()') is not null as installed")
  if (!installed.rows[0].installed) throw new Error('Community photos count migration is not installed')
})

afterAll(async () => pool.end())

describe('get_community_photos_count', () => {
  it('counts only root ready-public media on active crags', async () => {
    await transaction(async (client) => {
      const activeCrag = randomUUID()
      const deletedCrag = randomUUID()
      await client.query(
        `insert into public.crags (id, name, slug) values
           ($1, 'Active aggregate crag', $2), ($3, 'Deleted aggregate crag', $4)`,
        [activeCrag, `active-${activeCrag}`, deletedCrag, `deleted-${deletedCrag}`],
      )
      await client.query(
        `update public.crags
         set publication_status = 'published', published_at = now()
         where id in ($1, $2)`,
        [activeCrag, deletedCrag],
      )
      const before = Number((await client.query('select public.get_community_photos_count() as count')).rows[0].count)
      const ready = await addImage(client, activeCrag)
      await addImage(client, activeCrag, { moderation_status: 'skipped' })
      await addImage(client, activeCrag, { processing_status: 'processing' })
      await addImage(client, activeCrag, { moderation_status: 'pending' })
      await addImage(client, activeCrag, { visibility: 'private' })
      await addImage(client, activeCrag, { status: 'rejected' })
      await addImage(client, activeCrag, { status: 'deleted' })
      await addImage(client, activeCrag, { status: 'pending' })
      await addImage(client, deletedCrag)
      await client.query("update public.crags set deleted_at = now(), deletion_reason = 'test' where id = $1", [deletedCrag])
      await addImage(client, activeCrag, {}, ready)
      await addImage(client, null)
      await client.query(
        `insert into public.crag_images (id, crag_id, url)
         values ($1, $2, $3)`,
        [randomUUID(), activeCrag, `https://example.test/legacy-${randomUUID()}.jpg`],
      )

      for (const role of ['anon', 'authenticated', 'service_role'] as const) {
        await setRequestRole(client, role)
        const count = Number((await client.query('select public.get_community_photos_count() as count')).rows[0].count)
        expect(count - before).toBe(2)
      }
    })
  })

  it('has a fixed search path and exact public API grants', async () => {
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
       where n.nspname = 'public' and p.proname = 'get_community_photos_count'`,
    )
    expect(metadata.rows[0]).toEqual({
      owner: 'postgres', prosecdef: true, proconfig: ['search_path=""'], public: false,
      anon: true, authenticated: true, service_role: true,
    })
  })
})
