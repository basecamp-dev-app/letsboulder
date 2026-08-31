import { randomUUID } from 'node:crypto'
import { type PoolClient } from 'pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { createDatabaseTestHarness } from './database-test-harness'

const { pool } = createDatabaseTestHarness({ max: 4, statement_timeout: 15_000 })

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
  await client.query("select set_config('request.jwt.claims', $1, true)", [JSON.stringify({ role: 'authenticated', sub: userId })])
}

async function expectedFailure(client: PoolClient, values: unknown[]) {
  await client.query('savepoint expected_failure')
  try {
    await client.query('select public.apply_published_submission_edit($1, $2, $3::jsonb)', values)
    throw new Error('Expected query to fail')
  } catch (error) {
    await client.query('rollback to savepoint expected_failure')
    await client.query('release savepoint expected_failure')
    if (error instanceof Error && error.message === 'Expected query to fail') throw error
    return error instanceof Error ? error.message : String(error)
  }
}

async function createFixture(client: PoolClient) {
  const userId = randomUUID()
  const imageId = randomUUID()
  await client.query(
    `insert into auth.users (
       id, aud, role, email, encrypted_password, email_confirmed_at,
       raw_app_meta_data, raw_user_meta_data, created_at, updated_at
     ) values ($1, 'authenticated', 'authenticated', $2, '', now(),
       '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now())`,
    [userId, `atomic-edit-${userId}@example.test`],
  )
  await client.query(
    `insert into public.profiles (
       id, username, email, open_data_consent_version, consent_timestamp
     ) values ($1, $2, $3, public.current_open_data_consent_version(), now())
     on conflict (id) do update set
       username = excluded.username,
       email = excluded.email,
       open_data_consent_version = excluded.open_data_consent_version,
       consent_timestamp = excluded.consent_timestamp`,
    [userId, `atomic-${userId.slice(0, 12)}`, `atomic-edit-${userId}@example.test`],
  )
  await client.query(
    `insert into public.images (
       id, url, created_by, status, visibility, processing_status,
       moderation_status, storage_provider, storage_bucket, storage_path,
       original_bucket, original_key, processed_at, location_mode
     ) values ($1, $2, $3, 'approved', 'public', 'ready', 'approved', 'r2',
       'database-tests', $4, 'database-tests', $4, now(), 'shared')`,
    [imageId, `https://example.test/${imageId}.jpg`, userId, `images/${imageId}.jpg`],
  )
  return { imageId, userId }
}

function createRouteOperations(clientRouteId: string) {
  return {
    baseRevision: 0,
    imageMetadata: { latitude: null, longitude: null, locationMode: 'shared', faceDirections: ['N'] },
    createRoutes: [{
      clientRouteId,
      name: 'Atomic route',
      grade: '6B',
      climbType: 'boulder',
      description: 'Created transactionally',
      points: [{ x: 0.1, y: 0.9 }, { x: 0.8, y: 0.1 }],
      sequenceOrder: 0,
      imageWidth: 1600,
      imageHeight: 1200,
    }],
    updateRoutes: [],
    gradeVotes: [] as Array<{ routeLineId: string; grade: string }>,
  }
}

beforeAll(async () => {
  const migration = await pool.query(
    `select to_regprocedure('public.apply_published_submission_edit(uuid,uuid,jsonb)') is not null as installed`,
  )
  if (!migration.rows[0].installed) throw new Error('Atomic published-edit migration is not installed')
})

afterAll(async () => {
  await pool.end()
})

describe('atomic published wiki edits', () => {
  it('commits all operations once and replays the generated ID mapping', async () => {
    await transaction(async (client) => {
      const fixture = await createFixture(client)
      const mutationId = randomUUID()
      const clientRouteId = randomUUID()
      const operations = createRouteOperations(clientRouteId)
      await setAuthenticatedRole(client, fixture.userId)

      const first = await client.query(
        'select public.apply_published_submission_edit($1, $2, $3::jsonb) as result',
        [fixture.imageId, mutationId, JSON.stringify(operations)],
      )
      const replay = await client.query(
        'select public.apply_published_submission_edit($1, $2, $3::jsonb) as result',
        [fixture.imageId, mutationId, JSON.stringify(operations)],
      )

      expect(first.rows[0].result.revision).toBe(1)
      expect(first.rows[0].result.routeMappings).toHaveLength(1)
      expect(first.rows[0].result.routeMappings[0].clientRouteId).toBe(clientRouteId)
      expect(replay.rows[0].result.routeMappings).toEqual(first.rows[0].result.routeMappings)
      expect(replay.rows[0].result.commitId).toBe(first.rows[0].result.commitId)
      expect(replay.rows[0].result.replayed).toBe(true)

      const rows = await client.query(
        `select
           (select count(*)::int from public.route_lines where image_id = $1) as routes,
           (select count(*)::int from public.grade_votes gv
             join public.route_lines rl on rl.climb_id = gv.climb_id where rl.image_id = $1) as votes,
           (select count(*)::int from public.submission_edit_history where image_id = $1) as history,
           (select wiki_revision::int from public.images where id = $1) as revision`,
        [fixture.imageId],
      )
      expect(rows.rows[0]).toEqual({ routes: 1, votes: 1, history: 2, revision: 1 })
    })
  })

  it('rejects a stale revision without partial route creation', async () => {
    await transaction(async (client) => {
      const fixture = await createFixture(client)
      await client.query('update public.images set wiki_revision = 2 where id = $1', [fixture.imageId])
      await setAuthenticatedRole(client, fixture.userId)
      const message = await expectedFailure(client, [fixture.imageId, randomUUID(), JSON.stringify(createRouteOperations(randomUUID()))])

      expect(message).toContain('changed while editing')
      const routes = await client.query('select id from public.route_lines where image_id = $1', [fixture.imageId])
      expect(routes.rows).toEqual([])
    })
  })

  it('rolls back earlier operations when a later grade vote is invalid', async () => {
    await transaction(async (client) => {
      const fixture = await createFixture(client)
      const operations = createRouteOperations(randomUUID())
      operations.gradeVotes.push({ routeLineId: randomUUID(), grade: '6C' })
      await setAuthenticatedRole(client, fixture.userId)
      const message = await expectedFailure(client, [fixture.imageId, randomUUID(), JSON.stringify(operations)])

      expect(message).toContain('Grade vote route not found')
      await client.query('reset role')
      const rows = await client.query(
        `select
           (select count(*)::int from public.route_lines where image_id = $1) as routes,
           (select count(*)::int from public.submission_edit_history where image_id = $1) as history,
           (select count(*)::int from public.published_edit_mutations where image_id = $1) as receipts`,
        [fixture.imageId],
      )
      expect(rows.rows[0]).toEqual({ routes: 0, history: 0, receipts: 0 })
    })
  })

  it('serializes concurrent retries of the same mutation', async () => {
    const setup = await pool.connect()
    const firstClient = await pool.connect()
    const secondClient = await pool.connect()
    let fixture: { imageId: string; userId: string } | null = null
    try {
      await setup.query("select set_config('request.jwt.claims', '{\"role\":\"service_role\"}', false)")
      fixture = await createFixture(setup)
      const mutationId = randomUUID()
      const operations = createRouteOperations(randomUUID())
      await firstClient.query('begin')
      await secondClient.query('begin')
      await setAuthenticatedRole(firstClient, fixture.userId)
      await setAuthenticatedRole(secondClient, fixture.userId)

      const firstResult = await firstClient.query(
        'select public.apply_published_submission_edit($1, $2, $3::jsonb) as result',
        [fixture.imageId, mutationId, JSON.stringify(operations)],
      )
      const secondResultPromise = secondClient.query(
        'select public.apply_published_submission_edit($1, $2, $3::jsonb) as result',
        [fixture.imageId, mutationId, JSON.stringify(operations)],
      )
      await firstClient.query('commit')
      const secondResult = await secondResultPromise
      await secondClient.query('commit')

      expect(secondResult.rows[0].result.routeMappings).toEqual(firstResult.rows[0].result.routeMappings)
      expect(secondResult.rows[0].result.replayed).toBe(true)
      const count = await setup.query('select count(*)::int as count from public.route_lines where image_id = $1', [fixture.imageId])
      expect(count.rows[0].count).toBe(1)
      const commits = await setup.query(
        `select count(*)::int as count from public.wiki_revision_commits
         where metadata->>'image_id' = $1`,
        [fixture.imageId],
      )
      expect(commits.rows[0].count).toBe(2)
    } finally {
      await firstClient.query('rollback').catch(() => undefined)
      await secondClient.query('rollback').catch(() => undefined)
      try {
        if (fixture) {
          const climbs = await setup.query('select climb_id from public.route_lines where image_id = $1', [fixture.imageId])
          const climbIds = climbs.rows.map((row: { climb_id: string }) => row.climb_id)
          await setup.query('delete from public.submission_edit_history where image_id = $1', [fixture.imageId])
          await setup.query('delete from public.published_edit_mutations where image_id = $1', [fixture.imageId])
          await setup.query('delete from public.submission_contributors where image_id = $1', [fixture.imageId])
          await setup.query('delete from public.grade_votes where climb_id = any($1::uuid[])', [climbIds])
          await setup.query('delete from public.route_lines where image_id = $1', [fixture.imageId])
          await setup.query('set session_replication_role = replica')
          await setup.query('delete from public.climbs where id = any($1::uuid[])', [climbIds])
          await setup.query('delete from public.images where id = $1', [fixture.imageId])
          await setup.query('set session_replication_role = origin')
          await setup.query('delete from auth.users where id = $1', [fixture.userId])
        }
      } finally {
        await setup.query('set session_replication_role = origin').catch(() => undefined)
        setup.release()
        firstClient.release()
        secondClient.release()
      }
    }
  })

  it('rejects reuse of a mutation ID with a changed payload', async () => {
    await transaction(async (client) => {
      const fixture = await createFixture(client)
      const mutationId = randomUUID()
      const operations = createRouteOperations(randomUUID())
      await setAuthenticatedRole(client, fixture.userId)
      await client.query(
        'select public.apply_published_submission_edit($1, $2, $3::jsonb)',
        [fixture.imageId, mutationId, JSON.stringify(operations)],
      )
      const changedOperations = { ...operations, baseRevision: 1, imageMetadata: { ...operations.imageMetadata, faceDirections: ['S'] } }
      const message = await expectedFailure(client, [fixture.imageId, mutationId, JSON.stringify(changedOperations)])
      expect(message).toContain('already used for a different request')
    })
  })

  it('does not create history, scoreable IDs, or a revision for a no-op', async () => {
    await transaction(async (client) => {
      const fixture = await createFixture(client)
      await setAuthenticatedRole(client, fixture.userId)
      const result = await client.query(
        'select public.apply_published_submission_edit($1, $2, $3::jsonb) as result',
        [fixture.imageId, randomUUID(), JSON.stringify({
          baseRevision: 0,
          imageMetadata: { latitude: null, longitude: null, locationMode: 'shared', faceDirections: [] },
          createRoutes: [],
          updateRoutes: [],
          gradeVotes: [],
        })],
      )

      expect(result.rows[0].result.revision).toBe(0)
      expect(result.rows[0].result.historyIds).toEqual([])
      const history = await client.query('select id from public.submission_edit_history where image_id = $1', [fixture.imageId])
      expect(history.rows).toEqual([])
    })
  })

  it('exposes the RPC only to authenticated callers', async () => {
    const privileges = await pool.query(
      `select
         has_function_privilege('anon', 'public.apply_published_submission_edit(uuid,uuid,jsonb)', 'EXECUTE') as anon,
         has_function_privilege('authenticated', 'public.apply_published_submission_edit(uuid,uuid,jsonb)', 'EXECUTE') as authenticated,
         has_function_privilege('service_role', 'public.apply_published_submission_edit(uuid,uuid,jsonb)', 'EXECUTE') as service_role`,
    )
    expect(privileges.rows[0]).toEqual({ anon: false, authenticated: true, service_role: false })
  })
})
