import { randomUUID } from 'node:crypto'

import { afterAll, describe, expect, it } from 'vitest'

import { createDatabaseTestHarness } from './database-test-harness'

const { pool, transaction } = createDatabaseTestHarness({ max: 2, statement_timeout: 15_000 })

afterAll(async () => {
  await pool.end()
})

describe('typed client database contracts', () => {
  it('exposes atomic flag removal only to authenticated callers', async () => {
    const privileges = await pool.query(
      `select
         has_function_privilege('anon', 'public.resolve_flag_and_soft_delete(uuid,text)', 'EXECUTE') as anon,
         has_function_privilege('authenticated', 'public.resolve_flag_and_soft_delete(uuid,text)', 'EXECUTE') as authenticated,
         has_function_privilege('service_role', 'public.resolve_flag_and_soft_delete(uuid,text)', 'EXECUTE') as service_role`,
    )
    expect(privileges.rows[0]).toEqual({ anon: false, authenticated: true, service_role: true })
  })

  it('soft deletes a climb and resolves its flag in one call', async () => {
    await transaction(async (client) => {
      const adminId = randomUUID()
      const cragId = randomUUID()
      const climbId = randomUUID()
      const flagId = randomUUID()
      await client.query(
        `insert into auth.users (id, aud, role, email, encrypted_password, email_confirmed_at,
           raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
         values ($1, 'authenticated', 'authenticated', $2, '', now(),
           '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now())`,
        [adminId, `typed-client-${adminId}@example.test`],
      )
      await client.query(
        `insert into public.profiles (id, username, is_admin) values ($1, $2, true)`,
        [adminId, `typed-${adminId.slice(0, 12)}`],
      )
      await client.query(
        `insert into public.crags (id, name, type, country_code, slug)
         values ($1, 'Typed client crag', 'boulder', 'GB', $2)`,
        [cragId, `typed-${cragId}`],
      )
      await client.query(
        `insert into public.climbs (id, name, grade, status, route_type, crag_id, place_id, slug)
         values ($1, 'Typed client climb', '6A', 'approved', 'boulder', $2, $2, $3)`,
        [climbId, cragId, `typed-${climbId}`],
      )
      await client.query(
        `insert into public.climb_flags (id, climb_id, flagger_id, flag_type, comment, status)
         values ($1, $2, $3, 'route_name', 'Invalid route', 'pending')`,
        [flagId, climbId, adminId],
      )

      await client.query('set local role authenticated')
      await client.query("select set_config('request.jwt.claims', $1, true)", [
        JSON.stringify({ role: 'authenticated', sub: adminId }),
      ])
      await client.query('select public.resolve_flag_and_soft_delete($1, $2)', [flagId, 'Invalid route'])
      await client.query('reset role')

      const result = await client.query(
        `select f.status, f.action_taken, f.resolved_by, c.deleted_at is not null as climb_deleted
         from public.climb_flags f join public.climbs c on c.id = f.climb_id where f.id = $1`,
        [flagId],
      )
      expect(result.rows[0]).toEqual({
        status: 'resolved',
        action_taken: 'remove',
        resolved_by: adminId,
        climb_deleted: true,
      })
    })
  })

  it('prevents correction payload changes after submission', async () => {
    const functionDefinition = await pool.query(
      `select pg_get_functiondef('public.protect_climb_correction_payload()'::regprocedure) as definition`,
    )
    expect(functionDefinition.rows[0].definition).toContain('Correction payload cannot be changed after submission')

    const trigger = await pool.query(
      `select 1 from pg_trigger
       where tgrelid = 'public.climb_corrections'::regclass
         and tgname = 'climb_corrections_protect_payload'
         and not tgisinternal`,
    )
    expect(trigger.rowCount).toBe(1)
  })
})
