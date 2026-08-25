import { afterAll, describe, expect, it } from 'vitest'

import { createDatabaseTestHarness } from './database-test-harness'

const { pool } = createDatabaseTestHarness({ max: 2, statement_timeout: 15_000 })

afterAll(async () => {
  await pool.end()
})

describe('typed client database contracts', () => {
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
