import { isIP } from 'node:net'

import { Pool } from 'pg'
import { afterAll, describe, expect, it } from 'vitest'

const DEFAULT_DATABASE_URL = 'postgresql://postgres:postgres@127.0.0.1:54322/postgres'
const databaseUrl = process.env.TEST_DATABASE_URL || DEFAULT_DATABASE_URL
const parsedDatabaseUrl = new URL(databaseUrl)
const hostname = parsedDatabaseUrl.hostname.replace(/^\[|\]$/g, '')
const allowNonLocal = process.env.TEST_DATABASE_ALLOW_NON_LOCAL === 'true'
const isLoopback = hostname === 'localhost' || hostname === '::1'
  || (isIP(hostname) === 4 && hostname.startsWith('127.'))

if (!isLoopback && !allowNonLocal) {
  throw new Error(`Refusing database tests against non-loopback host ${hostname}`)
}

const pool = new Pool({ connectionString: databaseUrl, max: 2, statement_timeout: 15_000 })

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
