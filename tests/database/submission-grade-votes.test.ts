import { afterAll, describe, expect, it } from 'vitest'

import { createDatabaseTestHarness } from './database-test-harness'

const { pool } = createDatabaseTestHarness({ max: 2, statement_timeout: 15_000 })

afterAll(async () => {
  await pool.end()
})

describe('retired submission grade-vote RPC', () => {
  it('requires published editor grade votes to use the atomic edit RPC', async () => {
    const privileges = await pool.query(
      `select
         has_function_privilege('anon', 'public.save_submission_grade_votes(uuid,jsonb)', 'EXECUTE') as anon,
         has_function_privilege('authenticated', 'public.save_submission_grade_votes(uuid,jsonb)', 'EXECUTE') as authenticated,
         has_function_privilege('service_role', 'public.save_submission_grade_votes(uuid,jsonb)', 'EXECUTE') as service_role`,
    )
    expect(privileges.rows[0]).toEqual({ anon: false, authenticated: false, service_role: false })
  })
})
