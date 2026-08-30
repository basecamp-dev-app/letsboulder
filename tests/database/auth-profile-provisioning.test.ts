import { randomUUID } from 'node:crypto'
import { type PoolClient } from 'pg'
import { afterAll, describe, expect, it } from 'vitest'

import { createDatabaseTestHarness } from './database-test-harness'

const { pool } = createDatabaseTestHarness({ max: 2, statement_timeout: 15_000 })

async function transaction<T>(run: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect()
  await client.query('begin')
  try {
    return await run(client)
  } finally {
    await client.query('rollback')
    client.release()
  }
}

afterAll(async () => {
  await pool.end()
})

describe('auth profile provisioning', () => {
  it('keeps the expected auth.users lifecycle triggers installed', async () => {
    const result = await pool.query(
      `select
         t.tgname as trigger_name,
         pn.nspname as function_schema,
         p.proname as function_name
       from pg_trigger t
       join pg_class c on c.oid = t.tgrelid
       join pg_namespace cn on cn.oid = c.relnamespace
       join pg_proc p on p.oid = t.tgfoid
       join pg_namespace pn on pn.oid = p.pronamespace
       where cn.nspname = 'auth'
         and c.relname = 'users'
         and t.tgname in (
           'on_auth_user_created',
           'on_auth_user_login',
           'on_auth_user_updated'
         )
         and not t.tgisinternal
       order by t.tgname`,
    )

    expect(result.rows).toEqual([
      {
        trigger_name: 'on_auth_user_created',
        function_schema: 'public',
        function_name: 'handle_new_user',
      },
      {
        trigger_name: 'on_auth_user_login',
        function_schema: 'public',
        function_name: 'sync_profile_on_login',
      },
      {
        trigger_name: 'on_auth_user_updated',
        function_schema: 'public',
        function_name: 'handle_user_metadata_update',
      },
    ])
  })

  it('creates a public profile when a new auth user is inserted', async () => {
    await transaction(async (client) => {
      const userId = randomUUID()
      const email = `auth-profile-${userId}@example.test`

      await client.query(
        `insert into auth.users (
           id, aud, role, email, encrypted_password, email_confirmed_at,
           raw_app_meta_data, raw_user_meta_data, created_at, updated_at
         ) values (
           $1, 'authenticated', 'authenticated', $2, '', now(),
           '{"provider":"google","providers":["google"]}'::jsonb,
           '{"given_name":"Staging","family_name":"Tester"}'::jsonb,
           now(), now()
         )`,
        [userId, email],
      )

      const profile = await client.query(
        `select id, email, is_admin
         from public.profiles
         where id = $1`,
        [userId],
      )

      expect(profile.rows).toEqual([
        {
          id: userId,
          email,
          is_admin: false,
        },
      ])
    })
  })
})
