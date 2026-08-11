import { randomUUID } from 'node:crypto'

import { Client, type PoolClient } from 'pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { createDatabaseTestHarness } from './database-test-harness'

const { connectionString, pool } = createDatabaseTestHarness({ max: 8, statement_timeout: 15_000 })

type Queryable = Pick<PoolClient, 'query'>

type Fixture = {
  collaboratorId: string
  cragId: string
  draftId: string
  firstImageId: string
  ownerId: string
  routeId: string
  secondCragId: string
  secondImageId: string
  updatedAt: Date
}

type SavePayload = {
  cragId: string
  images: Array<{ id: string; display_order: number; route_data: Record<string, unknown> }>
  metadata: Record<string, unknown>
  routeSets: Array<{ draftImageId: string; routes: Array<Record<string, unknown>> }>
}

async function setServiceContext(client: Queryable) {
  await client.query("select set_config('request.jwt.claims', $1, true)", [JSON.stringify({ role: 'service_role' })])
}

async function setAuthenticatedContext(client: Queryable, userId: string) {
  await client.query('set local role authenticated')
  await client.query("select set_config('request.jwt.claims', $1, true)", [
    JSON.stringify({ sub: userId, role: 'authenticated' }),
  ])
  await client.query("set local lock_timeout = '5s'")
}

async function createUser(client: Queryable, label: string) {
  const userId = randomUUID()
  const email = `atomic-draft-${label}-${userId}@example.test`
  await client.query(
    `insert into auth.users (
       id, aud, role, email, encrypted_password, email_confirmed_at,
       raw_app_meta_data, raw_user_meta_data, created_at, updated_at
     ) values ($1, 'authenticated', 'authenticated', $2, '', now(),
       '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now())`,
    [userId, email],
  )
  await client.query(
    `insert into public.profiles (
       id, username, email, open_data_consent_version, consent_timestamp
     ) values ($1, $2, $3, public.current_open_data_consent_version(), now())`,
    [userId, `atomic-${label}-${userId.slice(0, 8)}`, email],
  )
  return userId
}

async function createFixture(client: Queryable): Promise<Fixture> {
  const ownerId = await createUser(client, 'owner')
  const collaboratorId = await createUser(client, 'collaborator')
  const cragId = randomUUID()
  const secondCragId = randomUUID()
  const draftId = randomUUID()
  const firstImageId = randomUUID()
  const secondImageId = randomUUID()
  const routeId = randomUUID()

  await client.query(
    `insert into public.crags (id, name, type, country, country_code, slug)
     values ($1, 'Atomic draft crag', 'sport', 'Testland', 'GB', $2),
            ($3, 'Atomic target crag', 'sport', 'Testland', 'GB', $4)`,
    [cragId, `atomic-source-${cragId}`, secondCragId, `atomic-target-${secondCragId}`],
  )
  await client.query(
    `insert into public.submission_drafts (id, user_id, crag_id, metadata)
     values ($1, $2, $3, $4::jsonb)`,
    [draftId, ownerId, cragId, JSON.stringify({
      retainedTop: 'top',
      submission: { retainedSubmission: 'submission', location: { latitude: 51.5, retainedLocation: 'location' } },
    })],
  )
  await client.query(
    `insert into public.submission_draft_collaborators (draft_id, user_id, created_by)
     values ($1, $2, $3)`,
    [draftId, collaboratorId, ownerId],
  )
  await client.query(
    `insert into public.submission_draft_images
       (id, draft_id, display_order, storage_bucket, storage_path, route_data)
     values ($1, $3, 0, 'database-tests', $4, '{"before":"first"}'::jsonb),
            ($2, $3, 1, 'database-tests', $5, '{"before":"second"}'::jsonb)`,
    [firstImageId, secondImageId, draftId, `drafts/${draftId}/first.jpg`, `drafts/${draftId}/second.jpg`],
  )
  await client.query(
    `insert into public.submission_draft_routes (
       id, draft_id, draft_image_id, name, grade, climb_type, points,
       sequence_order, image_width, image_height, created_by, updated_by
     ) values ($1, $2, $3, 'Before route', '6A', 'sport',
       '[{"x":0.1,"y":0.9},{"x":0.5,"y":0.2}]'::jsonb, 0, 1200, 900, $4, $4)`,
    [routeId, draftId, firstImageId, ownerId],
  )
  const updatedAt = (await client.query(
    'select updated_at from public.submission_drafts where id = $1',
    [draftId],
  )).rows[0].updated_at as Date
  return { collaboratorId, cragId, draftId, firstImageId, ownerId, routeId, secondCragId, secondImageId, updatedAt }
}

function payloadFor(fixture: Fixture, marker: string): SavePayload {
  return {
    cragId: fixture.secondCragId,
    images: [
      { id: fixture.secondImageId, display_order: 0, route_data: { marker, image: 'second' } },
      { id: fixture.firstImageId, display_order: 1, route_data: { marker, image: 'first' } },
    ],
    metadata: {
      addedTop: marker,
      submission: { addedSubmission: marker, location: { longitude: -0.1 } },
    },
    routeSets: [{
      draftImageId: fixture.firstImageId,
      routes: [{
        id: fixture.routeId,
        name: `Route ${marker}`,
        grade: '6B',
        description: '  normalized description  ',
        climbType: 'deep_water_solo',
        points: [{ x: 0.2, y: 0.8 }, { x: 0.7, y: 0.1 }],
        sequenceOrder: 2,
        imageWidth: 1600,
        imageHeight: 1000,
      }],
    }, {
      draftImageId: fixture.secondImageId,
      routes: [],
    }],
  }
}

async function save(client: Queryable, fixture: Fixture, expectedUpdatedAt: Date, payload: SavePayload) {
  return client.query(
    `select public.save_submission_draft_atomic(
       p_draft_id => $1, p_expected_updated_at => $2, p_images => $3::jsonb,
       p_route_sets => $4::jsonb, p_metadata => $5::jsonb, p_crag_id => $6
     ) as result`,
    [fixture.draftId, expectedUpdatedAt, JSON.stringify(payload.images), JSON.stringify(payload.routeSets), JSON.stringify(payload.metadata), payload.cragId],
  )
}

async function rpcError(client: Queryable, run: () => Promise<unknown>) {
  const savepoint = `expected_error_${randomUUID().replaceAll('-', '')}`
  await client.query(`savepoint ${savepoint}`)
  try {
    await run()
    throw new Error('Expected RPC to fail')
  } catch (error) {
    if (error instanceof Error && error.message === 'Expected RPC to fail') throw error
    await client.query(`rollback to savepoint ${savepoint}`)
    const pgError = error as Error & { detail?: string }
    return { detail: pgError.detail, message: pgError.message }
  } finally {
    await client.query(`release savepoint ${savepoint}`)
  }
}

async function transaction<T>(run: (client: PoolClient) => Promise<T>) {
  const client = await pool.connect()
  await client.query('begin')
  try {
    await setServiceContext(client)
    return await run(client)
  } finally {
    await client.query('rollback')
    client.release()
  }
}

async function committedFixture() {
  const client = await pool.connect()
  await client.query('begin')
  try {
    await setServiceContext(client)
    const fixture = await createFixture(client)
    await client.query('commit')
    return fixture
  } catch (error) {
    await client.query('rollback')
    throw error
  } finally {
    client.release()
  }
}

async function authenticatedClient(userId: string, applicationName?: string) {
  const client = new Client({ connectionString, application_name: applicationName })
  await client.connect()
  await client.query('begin')
  await setAuthenticatedContext(client, userId)
  return client
}

async function waitForLock(applicationName: string) {
  const deadline = Date.now() + 5_000
  while (Date.now() < deadline) {
    const result = await pool.query(
      `select wait_event_type from pg_stat_activity
       where application_name = $1 and state = 'active'`,
      [applicationName],
    )
    if (result.rows[0]?.wait_event_type === 'Lock') return
    await new Promise((resolve) => setTimeout(resolve, 20))
  }
  throw new Error(`Connection ${applicationName} did not enter a lock wait`)
}

async function closeClient(client: Client, commit = false) {
  await client.query(commit ? 'commit' : 'rollback').catch(() => undefined)
  await client.end()
}

beforeAll(async () => {
  const installed = await pool.query(
    `select to_regprocedure(
       'public.save_submission_draft_atomic(uuid,timestamptz,jsonb,jsonb,jsonb,uuid)'
     ) is not null as installed`,
  )
  if (!installed.rows[0].installed) throw new Error('Atomic explicit draft save migration is not installed')
})

afterAll(async () => {
  await pool.end()
})

describe('atomic explicit draft saves', () => {
  it('saves images, complete dirty route sets, nested metadata, and crag in one revision', async () => {
    await transaction(async (client) => {
      const fixture = await createFixture(client)
      const payload = payloadFor(fixture, 'owner-win')
      await client.query('reset role')
      await setAuthenticatedContext(client, fixture.ownerId)

      const result = (await save(client, fixture, fixture.updatedAt, payload)).rows[0].result
      expect(result.updated_at).not.toBe(fixture.updatedAt.toISOString())
      expect(new Date(result.updated_at).getTime()).toBeGreaterThan(fixture.updatedAt.getTime())
      expect(result.images.map((image: { id: string }) => image.id)).toEqual([fixture.secondImageId, fixture.firstImageId])
      expect(result.routeSets[0].routes[0]).toMatchObject({
        id: fixture.routeId,
        name: 'Route owner-win',
        climbType: 'deep-water-solo',
        description: 'normalized description',
        sequenceOrder: 2,
      })
      expect(result.routeSets[1].routes).toEqual([])

      const draft = (await client.query(
        'select crag_id, metadata, last_edited_by, updated_at from public.submission_drafts where id = $1',
        [fixture.draftId],
      )).rows[0]
      expect(draft).toMatchObject({ crag_id: fixture.secondCragId, last_edited_by: fixture.ownerId })
      expect(draft.metadata).toEqual({
        retainedTop: 'top',
        addedTop: 'owner-win',
        submission: {
          retainedSubmission: 'submission',
          addedSubmission: 'owner-win',
          location: { latitude: 51.5, longitude: -0.1, retainedLocation: 'location' },
        },
      })
      expect(draft.updated_at.getTime()).toBe(new Date(result.updated_at).getTime())
    })
  })

  it('rolls back every surface when a later route set tries to move a route ID', async () => {
    await transaction(async (client) => {
      const fixture = await createFixture(client)
      const payload = payloadFor(fixture, 'must-rollback')
      payload.routeSets[1].routes = [{
        ...payload.routeSets[0].routes[0],
        name: 'Illegal moved route',
      }]
      const before = (await client.query(
        `select
           (select jsonb_agg(to_jsonb(image) order by image.id) from public.submission_draft_images image where image.draft_id = $1) as images,
           (select jsonb_agg(to_jsonb(route) order by route.id) from public.submission_draft_routes route where route.draft_id = $1) as routes,
           (select to_jsonb(draft) from public.submission_drafts draft where draft.id = $1) as draft`,
        [fixture.draftId],
      )).rows[0]
      await client.query('reset role')
      await setAuthenticatedContext(client, fixture.collaboratorId)

      const error = await rpcError(client, () => save(client, fixture, fixture.updatedAt, payload))
      expect(error.detail).toBe('invalid_payload')
      const after = (await client.query(
        `select
           (select jsonb_agg(to_jsonb(image) order by image.id) from public.submission_draft_images image where image.draft_id = $1) as images,
           (select jsonb_agg(to_jsonb(route) order by route.id) from public.submission_draft_routes route where route.draft_id = $1) as routes,
           (select to_jsonb(draft) from public.submission_drafts draft where draft.id = $1) as draft`,
        [fixture.draftId],
      )).rows[0]
      expect(after).toEqual(before)
    })
  })

  it('rejects a stale revision before changing any saved surface', async () => {
    await transaction(async (client) => {
      const fixture = await createFixture(client)
      const payload = payloadFor(fixture, 'stale')
      const staleRevision = new Date(fixture.updatedAt.getTime() - 1)
      await client.query('reset role')
      await setAuthenticatedContext(client, fixture.ownerId)

      const error = await rpcError(client, () => save(client, fixture, staleRevision, payload))
      expect(error.detail).toBe('draft_conflict')
      expect((await client.query(
        'select crag_id, metadata, updated_at from public.submission_drafts where id = $1',
        [fixture.draftId],
      )).rows[0]).toMatchObject({ crag_id: fixture.cragId, updated_at: fixture.updatedAt })
      expect((await client.query(
        'select display_order, route_data from public.submission_draft_images where draft_id = $1 order by display_order',
        [fixture.draftId],
      )).rows).toEqual([
        { display_order: 0, route_data: { before: 'first' } },
        { display_order: 1, route_data: { before: 'second' } },
      ])
      expect((await client.query(
        'select name from public.submission_draft_routes where id = $1',
        [fixture.routeId],
      )).rows[0].name).toBe('Before route')
    })
  })

  it('requires current open-data consent even for deletion-only route replacements', async () => {
    await transaction(async (client) => {
      const fixture = await createFixture(client)
      const payload = payloadFor(fixture, 'consent-required')
      payload.routeSets = [{ draftImageId: fixture.firstImageId, routes: [] }]
      await client.query(
        'update public.profiles set open_data_consent_version = null, consent_timestamp = null where id = $1',
        [fixture.ownerId],
      )
      await client.query('reset role')
      await setAuthenticatedContext(client, fixture.ownerId)

      const error = await rpcError(client, () => save(client, fixture, fixture.updatedAt, payload))
      expect(error.detail).toBe('open_data_consent_required')
      expect((await client.query(
        'select name from public.submission_draft_routes where id = $1',
        [fixture.routeId],
      )).rows[0].name).toBe('Before route')
    })
  })

  it('rejects malformed point objects through direct RPC execution', async () => {
    await transaction(async (client) => {
      const fixture = await createFixture(client)
      const payload = payloadFor(fixture, 'invalid-points')
      payload.routeSets[0].routes[0].points = [null, null]
      await client.query('reset role')
      await setAuthenticatedContext(client, fixture.ownerId)

      const error = await rpcError(client, () => save(client, fixture, fixture.updatedAt, payload))
      expect(error.detail).toBe('invalid_payload')
      expect((await client.query(
        'select name, points from public.submission_draft_routes where id = $1',
        [fixture.routeId],
      )).rows[0]).toEqual({
        name: 'Before route',
        points: [{ x: 0.1, y: 0.9 }, { x: 0.5, y: 0.2 }],
      })
    })
  })

  it('allows exactly one complete payload in an owner/collaborator same-revision race', async () => {
    const fixture = await committedFixture()
    const owner = await authenticatedClient(fixture.ownerId)
    const collaboratorName = `atomic-draft-collaborator-${randomUUID()}`
    const collaborator = await authenticatedClient(fixture.collaboratorId, collaboratorName)
    let ownerClosed = false
    let collaboratorClosed = false
    try {
      const ownerPayload = payloadFor(fixture, 'owner-race-win')
      const collaboratorPayload = payloadFor(fixture, 'collaborator-race-loss')
      const ownerResult = (await save(owner, fixture, fixture.updatedAt, ownerPayload)).rows[0].result
      const collaboratorResult = rpcError(
        collaborator,
        () => save(collaborator, fixture, fixture.updatedAt, collaboratorPayload),
      )
      await waitForLock(collaboratorName)
      await closeClient(owner, true)
      ownerClosed = true

      expect((await collaboratorResult).detail).toBe('draft_conflict')
      await closeClient(collaborator)
      collaboratorClosed = true
      const persisted = (await pool.query(
        `select draft.metadata, draft.last_edited_by, draft.updated_at,
           (select jsonb_agg(image.route_data order by image.display_order) from public.submission_draft_images image where image.draft_id = draft.id) as route_data,
           (select name from public.submission_draft_routes route where route.id = $2) as route_name
         from public.submission_drafts draft where draft.id = $1`,
        [fixture.draftId, fixture.routeId],
      )).rows[0]
      expect(persisted.last_edited_by).toBe(fixture.ownerId)
      expect(persisted.updated_at.getTime()).toBe(new Date(ownerResult.updated_at).getTime())
      expect(persisted.metadata.addedTop).toBe('owner-race-win')
      expect(persisted.route_data).toEqual([
        { marker: 'owner-race-win', image: 'second' },
        { marker: 'owner-race-win', image: 'first' },
      ])
      expect(persisted.route_name).toBe('Route owner-race-win')
    } finally {
      if (!ownerClosed) await closeClient(owner)
      if (!collaboratorClosed) await closeClient(collaborator)
      await pool.query('delete from public.submission_drafts where id = $1', [fixture.draftId])
      await pool.query('delete from auth.users where id = any($1::uuid[])', [[fixture.ownerId, fixture.collaboratorId]])
    }
  })
})
