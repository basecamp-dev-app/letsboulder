import { randomUUID } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { type PoolClient } from 'pg'
import { afterAll, describe, expect, it } from 'vitest'

import { createDatabaseTestHarness } from './database-test-harness'

const migrationSql = readFileSync(
  new URL('../../supabase/migrations/20260830143000_restore_auth_profile_triggers.sql', import.meta.url),
  'utf8',
)
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

async function expectQueryToFail(client: PoolClient, sql: string): Promise<string> {
  const savepoint = `expected_error_${randomUUID().replaceAll('-', '')}`
  await client.query(`savepoint ${savepoint}`)
  try {
    await client.query(sql)
    await client.query(`release savepoint ${savepoint}`)
    throw new Error('Expected query to fail')
  } catch (error) {
    if (error instanceof Error && error.message === 'Expected query to fail') throw error
    await client.query(`rollback to savepoint ${savepoint}`)
    await client.query(`release savepoint ${savepoint}`)
    return error instanceof Error ? error.message : String(error)
  }
}

async function insertAuthUser(client: PoolClient, userId: string, email: string | null) {
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
}

afterAll(async () => {
  await pool.end()
})

describe('auth profile provisioning', () => {
  it('keeps the production auth.users lifecycle trigger definitions installed', async () => {
    const result = await pool.query(
      `select
         t.tgname as trigger_name,
         t.tgtype::integer as trigger_type,
         pg_get_expr(t.tgqual, t.tgrelid) as condition,
         pn.nspname as function_schema,
         p.proname as function_name,
         p.prosecdef as security_definer,
         p.proconfig as function_config
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
        trigger_type: 5,
        condition: null,
        function_schema: 'public',
        function_name: 'handle_new_user',
        security_definer: true,
        function_config: ['search_path=public, auth, extensions'],
      },
      {
        trigger_name: 'on_auth_user_login',
        trigger_type: 17,
        condition: null,
        function_schema: 'public',
        function_name: 'sync_profile_on_login',
        security_definer: true,
        function_config: ['search_path=public, auth, extensions'],
      },
      {
        trigger_name: 'on_auth_user_updated',
        trigger_type: 17,
        condition: '(old.raw_user_meta_data IS DISTINCT FROM new.raw_user_meta_data)',
        function_schema: 'public',
        function_name: 'handle_user_metadata_update',
        security_definer: true,
        function_config: ['search_path=public, auth, extensions'],
      },
    ])
  })

  it('creates exactly one non-admin profile through the insert trigger', async () => {
    await transaction(async (client) => {
      const userId = randomUUID()
      const email = `auth-profile-${userId}@example.test`

      await insertAuthUser(client, userId, email)

      const profile = await client.query(
        `select id, email, is_admin
         from public.profiles
         where id = $1`,
        [userId],
      )

      expect(profile.rows).toEqual([{ id: userId, email, is_admin: false }])
    })
  })

  it('preserves an email-matched profile when the production trigger reconciles its ID', async () => {
    await transaction(async (client) => {
      const oldUserId = randomUUID()
      const newUserId = randomUUID()
      const targetEmail = `auth-profile-reconcile-${newUserId}@example.test`

      await insertAuthUser(client, oldUserId, `auth-profile-old-${oldUserId}@example.test`)
      await client.query(
        `update public.profiles
         set email = $2, display_name = 'Preserved name', is_admin = true
         where id = $1`,
        [oldUserId, targetEmail],
      )

      await insertAuthUser(client, newUserId, targetEmail)

      const profile = await client.query(
        `select id, email, display_name, is_admin
         from public.profiles
         where id in ($1, $2)`,
        [oldUserId, newUserId],
      )
      expect(profile.rows).toEqual([{
        id: newUserId,
        email: targetEmail,
        display_name: 'Preserved name',
        is_admin: true,
      }])
    })
  })

  it('backfills only unambiguous users and is idempotent', async () => {
    await transaction(async (client) => {
      const existingUserId = randomUUID()
      const missingUserId = randomUUID()
      const nullEmailUserId = randomUUID()
      const existingEmail = `auth-profile-existing-${existingUserId}@example.test`
      const missingEmail = `auth-profile-missing-${missingUserId}@example.test`

      await insertAuthUser(client, existingUserId, existingEmail)
      await client.query(
        `update public.profiles
         set display_name = 'Keep me', is_admin = true, updated_at = '2026-01-01T00:00:00Z'
         where id = $1`,
        [existingUserId],
      )

      await client.query('alter table auth.users disable trigger on_auth_user_created')
      await insertAuthUser(client, missingUserId, missingEmail)
      await insertAuthUser(client, nullEmailUserId, null)
      await client.query('alter table auth.users enable trigger on_auth_user_created')

      await client.query(migrationSql)
      const firstPass = await client.query(
        `select id, email, display_name, is_admin, updated_at
         from public.profiles
         where id = any($1::uuid[])
         order by id`,
        [[existingUserId, missingUserId, nullEmailUserId]],
      )

      await client.query(migrationSql)
      const secondPass = await client.query(
        `select id, email, display_name, is_admin, updated_at
         from public.profiles
         where id = any($1::uuid[])
         order by id`,
        [[existingUserId, missingUserId, nullEmailUserId]],
      )

      expect(secondPass.rows).toEqual(firstPass.rows)
      expect(secondPass.rows).toHaveLength(2)
      expect(secondPass.rows).toEqual(expect.arrayContaining([
        expect.objectContaining({
          id: existingUserId,
          email: existingEmail,
          display_name: 'Keep me',
          is_admin: true,
        }),
        expect.objectContaining({
          id: missingUserId,
          email: missingEmail,
          display_name: null,
          is_admin: false,
        }),
      ]))
    })
  })

  it('rejects an email conflict without changing either profile', async () => {
    await transaction(async (client) => {
      const existingUserId = randomUUID()
      const missingUserId = randomUUID()
      const conflictingEmail = `auth-profile-conflict-${missingUserId}@example.test`

      await insertAuthUser(client, existingUserId, `auth-profile-existing-${existingUserId}@example.test`)
      await client.query(
        `update public.profiles
         set email = $2, display_name = 'Do not move', is_admin = true
         where id = $1`,
        [existingUserId, conflictingEmail],
      )
      await client.query('alter table auth.users disable trigger on_auth_user_created')
      await insertAuthUser(client, missingUserId, conflictingEmail)
      await client.query('alter table auth.users enable trigger on_auth_user_created')

      const message = await expectQueryToFail(client, migrationSql)
      expect(message).toContain('Auth profile reconciliation blocked')

      const profiles = await client.query(
        `select id, email, display_name, is_admin
         from public.profiles
         where id = any($1::uuid[])`,
        [[existingUserId, missingUserId]],
      )
      expect(profiles.rows).toEqual([{
        id: existingUserId,
        email: conflictingEmail,
        display_name: 'Do not move',
        is_admin: true,
      }])
    })
  })
})
