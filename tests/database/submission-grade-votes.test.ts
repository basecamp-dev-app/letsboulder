import { randomUUID } from 'node:crypto'
import { isIP } from 'node:net'

import { Pool, type PoolClient } from 'pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

const DEFAULT_DATABASE_URL = 'postgresql://postgres:postgres@127.0.0.1:54322/postgres'
const databaseUrl = process.env.TEST_DATABASE_URL || DEFAULT_DATABASE_URL
const parsedDatabaseUrl = new URL(databaseUrl)
const allowNonLocal = process.env.TEST_DATABASE_ALLOW_NON_LOCAL === 'true'
const hostname = parsedDatabaseUrl.hostname.replace(/^\[|\]$/g, '')
const isLoopback = hostname === 'localhost' || hostname === '::1'
  || (isIP(hostname) === 4 && hostname.startsWith('127.'))

if (!isLoopback && !allowNonLocal) {
  throw new Error(
    `Refusing database tests against non-loopback host ${hostname}. `
    + 'Set TEST_DATABASE_ALLOW_NON_LOCAL=true to opt in explicitly.',
  )
}

const pool = new Pool({ connectionString: databaseUrl, max: 2, statement_timeout: 15_000 })

async function transaction<T>(run: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect()
  await client.query('begin')
  try {
    await client.query("select set_config('request.jwt.claims', '{\"role\":\"service_role\"}', true)")
    return await run(client)
  } finally {
    await client.query('rollback')
    client.release()
  }
}

async function setAuthenticatedRole(client: PoolClient, userId: string) {
  await client.query('reset role')
  await client.query('set local role authenticated')
  await client.query("select set_config('request.jwt.claims', $1, true)", [
    JSON.stringify({ role: 'authenticated', sub: userId }),
  ])
}

async function expectedFailure(client: PoolClient, sql: string, values: unknown[]): Promise<string> {
  const savepoint = `expected_error_${randomUUID().replaceAll('-', '')}`
  await client.query(`savepoint ${savepoint}`)
  try {
    await client.query(sql, values)
    throw new Error('Expected query to fail')
  } catch (error) {
    await client.query(`rollback to savepoint ${savepoint}`)
    await client.query(`release savepoint ${savepoint}`)
    if (error instanceof Error && error.message === 'Expected query to fail') throw error
    return error instanceof Error ? error.message : String(error)
  }
}

async function createUser(client: PoolClient): Promise<string> {
  const userId = randomUUID()
  await client.query(
    `insert into auth.users (
       id, aud, role, email, encrypted_password, email_confirmed_at,
       raw_app_meta_data, raw_user_meta_data, created_at, updated_at
     ) values ($1, 'authenticated', 'authenticated', $2, '', now(),
       '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now())`,
    [userId, `grade-votes-${userId}@example.test`],
  )
  return userId
}

async function createRoute(client: PoolClient, ownerId: string) {
  const imageId = randomUUID()
  const climbId = randomUUID()
  const routeLineId = randomUUID()
  await client.query(
    `insert into public.images (
       id, url, created_by, status, visibility, processing_status,
       moderation_status, storage_provider, storage_bucket, storage_path,
       original_bucket, original_key, processed_at
     ) values ($1, $2, $3, 'approved', 'public', 'ready', 'approved', 'r2',
       'database-tests', $4, 'database-tests', $4, now())`,
    [imageId, `https://example.test/${imageId}.jpg`, ownerId, `images/${imageId}.jpg`],
  )
  await client.query(
    `insert into public.climbs (id, name, grade, status, route_type, user_id)
     values ($1, 'Grade vote route', '6A', 'approved', 'boulder', $2)`,
    [climbId, ownerId],
  )
  await client.query(
    `insert into public.route_lines (id, image_id, climb_id, points)
     values ($1, $2, $3, '[{"x":0.1,"y":0.9},{"x":0.8,"y":0.1}]'::jsonb)`,
    [routeLineId, imageId, climbId],
  )
  return { climbId, imageId, routeLineId }
}

beforeAll(async () => {
  const migration = await pool.query(
    `select to_regprocedure('public.save_submission_grade_votes(uuid,jsonb)') is not null as installed`,
  )
  if (!migration.rows[0].installed) throw new Error('Secure submission grade-vote migration is not installed')
})

afterAll(async () => {
  await pool.end()
})

describe('secure submission grade votes', () => {
  it('attributes a non-owner edit only to auth.uid and preserves the owner vote', async () => {
    await transaction(async (client) => {
      const ownerId = await createUser(client)
      const editorId = await createUser(client)
      const route = await createRoute(client, ownerId)
      await client.query(
        `insert into public.grade_votes (climb_id, user_id, grade) values ($1, $2, '6A')`,
        [route.climbId, ownerId],
      )
      await setAuthenticatedRole(client, editorId)

      const result = await client.query(
        `select public.save_submission_grade_votes($1, $2::jsonb) as votes_updated`,
        [route.imageId, JSON.stringify([{ routeLineId: route.routeLineId, grade: '6B' }])],
      )

      expect(result.rows[0].votes_updated).toBe(1)
      const votes = await client.query(
        `select user_id, grade from public.grade_votes where climb_id = $1 order by user_id`,
        [route.climbId],
      )
      expect(votes.rows).toEqual(expect.arrayContaining([
        { user_id: ownerId, grade: '6A' },
        { user_id: editorId, grade: '6B' },
      ]))
      expect(votes.rows).toHaveLength(2)
    })
  })

  it('rejects another image route atomically', async () => {
    await transaction(async (client) => {
      const ownerId = await createUser(client)
      const editorId = await createUser(client)
      const firstRoute = await createRoute(client, ownerId)
      const otherRoute = await createRoute(client, ownerId)
      await setAuthenticatedRole(client, editorId)

      const message = await expectedFailure(
        client,
        `select public.save_submission_grade_votes($1, $2::jsonb)`,
        [firstRoute.imageId, JSON.stringify([
          { routeLineId: firstRoute.routeLineId, grade: '6B' },
          { routeLineId: otherRoute.routeLineId, grade: '7A' },
        ])],
      )

      expect(message).toContain('invalid for this submission')
      const votes = await client.query(
        `select user_id from public.grade_votes where climb_id = $1`,
        [firstRoute.climbId],
      )
      expect(votes.rows).toEqual([])
    })
  })

  it('enforces authenticated grade-vote identity through RLS', async () => {
    await transaction(async (client) => {
      const ownerId = await createUser(client)
      const editorId = await createUser(client)
      const forgedUserId = await createUser(client)
      const route = await createRoute(client, ownerId)
      await setAuthenticatedRole(client, editorId)

      const insertError = await expectedFailure(
        client,
        `insert into public.grade_votes (climb_id, user_id, grade) values ($1, $2, '6B')`,
        [route.climbId, forgedUserId],
      )
      expect(insertError).toContain('row-level security policy')

      await client.query(
        `insert into public.grade_votes (climb_id, user_id, grade) values ($1, $2, '6B')`,
        [route.climbId, editorId],
      )
      const updateError = await expectedFailure(
        client,
        `update public.grade_votes set user_id = $1 where climb_id = $2 and user_id = $3`,
        [forgedUserId, route.climbId, editorId],
      )
      expect(updateError).toContain('row-level security policy')
    })
  })

  it('grants the RPC only to authenticated callers', async () => {
    const privileges = await pool.query(
      `select
         has_function_privilege('anon', 'public.save_submission_grade_votes(uuid,jsonb)', 'EXECUTE') as anon,
         has_function_privilege('authenticated', 'public.save_submission_grade_votes(uuid,jsonb)', 'EXECUTE') as authenticated,
         has_function_privilege('service_role', 'public.save_submission_grade_votes(uuid,jsonb)', 'EXECUTE') as service_role`,
    )
    expect(privileges.rows[0]).toEqual({ anon: false, authenticated: true, service_role: false })
  })
})
