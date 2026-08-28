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
  firstLiveImageId: string
  ownerId: string
  routeId: string
  secondCragId: string
  secondImageId: string
  secondLiveImageId: string
  unrelatedId: string
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
  const unrelatedId = await createUser(client, 'unrelated')
  const cragId = randomUUID()
  const secondCragId = randomUUID()
  const draftId = randomUUID()
  const firstImageId = randomUUID()
  const secondImageId = randomUUID()
  const firstLiveImageId = randomUUID()
  const secondLiveImageId = randomUUID()
  const routeId = randomUUID()

  await client.query(
    `insert into public.crags (id, name, type, country, country_code, slug)
     values ($1, 'Atomic draft crag', 'sport', 'Testland', 'GB', $2),
            ($3, 'Atomic target crag', 'sport', 'Testland', 'GB', $4)`,
    [cragId, `atomic-source-${cragId}`, secondCragId, `atomic-target-${secondCragId}`],
  )
  await client.query(
    `insert into public.images (
       id, url, created_by, width, height, storage_provider, storage_bucket, storage_path,
       original_bucket, original_key, processing_status, moderation_status, visibility, status, processed_at
     ) values
       ($1, $2, $3, 1200, 900, 'r2', 'database-tests', $4, 'database-tests', $4,
        'ready', 'approved', 'public', 'approved', now()),
       ($5, $6, $3, 1200, 900, 'r2', 'database-tests', $7, 'database-tests', $7,
        'ready', 'approved', 'public', 'approved', now())`,
    [
      firstLiveImageId, `https://media.example.test/${firstLiveImageId}.jpg`, ownerId,
      `drafts/${draftId}/first.jpg`, secondLiveImageId,
      `https://media.example.test/${secondLiveImageId}.jpg`, `drafts/${draftId}/second.jpg`,
    ],
  )
  await client.query(
    `insert into public.submission_drafts (id, user_id, crag_id, metadata)
     values ($1, $2, $3, $4::jsonb)`,
    [draftId, ownerId, cragId, JSON.stringify(metadataFor({
      firstImageId, secondImageId, defaultImageId: firstImageId,
    }))],
  )
  await client.query(
    `insert into public.submission_draft_collaborators (draft_id, user_id, created_by)
     values ($1, $2, $3)`,
    [draftId, collaboratorId, ownerId],
  )
  await client.query(
    `insert into public.submission_draft_images
       (id, draft_id, display_order, storage_provider, storage_bucket, storage_path,
        original_bucket, original_key, linked_image_id, processing_status, width, height,
        latitude, longitude, route_data)
     values ($1, $3, 0, 'r2', 'database-tests', $4, 'database-tests', $4, $6,
              'ready', 1200, 900, 51.501, -0.101, $8::jsonb),
            ($2, $3, 1, 'r2', 'database-tests', $5, 'database-tests', $5, $7,
              'ready', 1200, 900, 51.502, -0.102, '{}'::jsonb)`,
    [
      firstImageId, secondImageId, draftId, `drafts/${draftId}/first.jpg`,
      `drafts/${draftId}/second.jpg`, firstLiveImageId, secondLiveImageId,
      JSON.stringify({ completedRoutes: [routeFor(routeId, 'Before route')] }),
    ],
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
  return {
    collaboratorId, cragId, draftId, firstImageId, firstLiveImageId, ownerId, routeId,
    secondCragId, secondImageId, secondLiveImageId, unrelatedId, updatedAt,
  }
}

function routeFor(id: string | undefined, name: string) {
  return {
    ...(id ? { id } : {}),
    name,
    grade: '6B',
    description: 'normalized description',
    climbType: 'deep_water_solo',
    points: [{ x: 0.2, y: 0.8 }, { x: 0.7, y: 0.1 }],
    sequenceOrder: 2,
    imageWidth: 1600,
    imageHeight: 1000,
  }
}

function metadataFor(input: { firstImageId: string; secondImageId: string; defaultImageId: string }) {
  return {
    version: 2,
    navigation: { defaultImageId: input.defaultImageId },
    images: {
      [input.firstImageId]: {
        imageId: input.firstImageId, displayOrder: 0, orientation: ['N'], locationMode: 'custom',
        gps: { latitude: 51.501, longitude: -0.101 },
      },
      [input.secondImageId]: {
        imageId: input.secondImageId, displayOrder: 1, orientation: ['E'], locationMode: 'custom',
        gps: { latitude: 51.502, longitude: -0.102 },
      },
    },
    submission: {
      routeType: 'sport',
      location: { latitude: 51.5, longitude: -0.1, countryCode: 'GB', countryName: 'Testland' },
      isAnonymousSubmission: false,
      contributionCreditPlatform: null,
      contributionCreditHandle: null,
      sectorId: null,
      canvasSource: null,
    },
  }
}

function payloadFor(fixture: Fixture, marker: string): SavePayload {
  const route = routeFor(fixture.routeId, `Route ${marker}`)
  const metadata = metadataFor({
    firstImageId: fixture.firstImageId,
    secondImageId: fixture.secondImageId,
    defaultImageId: fixture.firstImageId,
  })
  metadata.images[fixture.firstImageId].displayOrder = 1
  metadata.images[fixture.secondImageId].displayOrder = 0
  return {
    cragId: fixture.secondCragId,
    images: [
      { id: fixture.secondImageId, display_order: 0, route_data: { marker, image: 'second' } },
      { id: fixture.firstImageId, display_order: 1, route_data: { marker, image: 'first', completedRoutes: [route] } },
    ],
    metadata,
    routeSets: [{
      draftImageId: fixture.firstImageId,
      routes: [route],
    }, {
      draftImageId: fixture.secondImageId,
      routes: [],
    }],
  }
}

async function savedState(client: Queryable, draftId: string) {
  return (await client.query(
    `select
       (select jsonb_agg(to_jsonb(image) order by image.id) from public.submission_draft_images image where image.draft_id = $1) as images,
       (select jsonb_agg(to_jsonb(route) order by route.id) from public.submission_draft_routes route where route.draft_id = $1) as routes,
       (select to_jsonb(draft) from public.submission_drafts draft where draft.id = $1) as draft`,
    [draftId],
  )).rows[0]
}

const malformedPayloadCases: Array<[string, (payload: SavePayload, fixture: Fixture) => void]> = [
  ['route point coordinates outside the normalized range', (payload, fixture) => {
    payload.routeSets[0].routes[0].points = [{ x: -0.01, y: 0.8 }, { x: 0.7, y: 0.1 }]
    payload.images[1].route_data.completedRoutes = payload.routeSets[0].routes
    const images = payload.metadata.images as Record<string, Record<string, unknown>>
    images[fixture.firstImageId].gps = { latitude: 51.501, longitude: -0.101 }
  }],
  ['GPS coordinates outside valid latitude bounds', (payload, fixture) => {
    const images = payload.metadata.images as Record<string, Record<string, unknown>>
    images[fixture.firstImageId].gps = { latitude: 90.01, longitude: -0.101 }
  }],
  ['an unsupported image location mode', (payload, fixture) => {
    const images = payload.metadata.images as Record<string, Record<string, unknown>>
    images[fixture.firstImageId].locationMode = 'automatic'
  }],
  ['an unknown default image reference', (payload) => {
    payload.metadata.navigation = { defaultImageId: randomUUID() }
  }],
  ['an incomplete image metadata map', (payload, fixture) => {
    const images = payload.metadata.images as Record<string, Record<string, unknown>>
    delete images[fixture.secondImageId]
  }],
  ['a string metadata version that would otherwise cast', (payload) => {
    payload.metadata.version = '2'
  }],
  ['a string anonymous flag that would otherwise cast', (payload) => {
    const submission = payload.metadata.submission as Record<string, unknown>
    submission.isAnonymousSubmission = 'false'
  }],
  ['a non-string route type', (payload) => {
    const submission = payload.metadata.submission as Record<string, unknown>
    submission.routeType = true
  }],
  ['a numeric contribution handle', (payload) => {
    const submission = payload.metadata.submission as Record<string, unknown>
    submission.contributionCreditHandle = 123
  }],
  ['a string image order that would otherwise cast', (payload) => {
    payload.images[0].display_order = '0' as unknown as number
  }],
  ['a string route sequence that would otherwise cast', (payload) => {
    payload.routeSets[0].routes[0].sequenceOrder = '2'
  }],
  ['a string route dimension that would otherwise cast', (payload) => {
    payload.routeSets[0].routes[0].imageWidth = '1600'
  }],
]

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
      expect(draft.metadata).toEqual(payload.metadata)
      expect(draft.updated_at.getTime()).toBe(new Date(result.updated_at).getTime())
    })
  })

  it('deletes an explicitly empty route set from durable and compatibility JSON', async () => {
    await transaction(async (client) => {
      const fixture = await createFixture(client)
      const payload = payloadFor(fixture, 'explicit-empty')
      payload.routeSets = [{ draftImageId: fixture.firstImageId, routes: [] }]
      payload.images[1].route_data = { marker: 'explicit-empty', completedRoutes: [] }
      await client.query('reset role')
      await setAuthenticatedContext(client, fixture.ownerId)

      const result = (await save(client, fixture, fixture.updatedAt, payload)).rows[0].result

      expect(result.routeSets).toEqual([{ draftImageId: fixture.firstImageId, routes: [] }])
      expect((await client.query(
        'select count(*)::int as count from public.submission_draft_routes where draft_image_id = $1',
        [fixture.firstImageId],
      )).rows[0].count).toBe(0)
      expect((await client.query(
        'select route_data from public.submission_draft_images where id = $1',
        [fixture.firstImageId],
      )).rows[0].route_data.completedRoutes).toEqual([])
    })
  })

  it('deletes omitted old routes while retaining an untouched unsubmitted image route set', async () => {
    await transaction(async (client) => {
      const fixture = await createFixture(client)
      const omittedRouteId = randomUUID()
      const untouchedRouteId = randomUUID()
      await client.query(
        `insert into public.submission_draft_routes (
           id, draft_id, draft_image_id, name, grade, climb_type, points, sequence_order,
           image_width, image_height, created_by, updated_by
         ) values
           ($1, $2, $3, 'Omitted route', '6A', 'sport', '[{"x":0.1,"y":0.9},{"x":0.5,"y":0.2}]', 3, 1200, 900, $5, $5),
           ($4, $2, $6, 'Untouched route', '6A', 'sport', '[{"x":0.1,"y":0.9},{"x":0.5,"y":0.2}]', 0, 1200, 900, $5, $5)`,
        [omittedRouteId, fixture.draftId, fixture.firstImageId, untouchedRouteId, fixture.ownerId, fixture.secondImageId],
      )
      const payload = payloadFor(fixture, 'omission')
      payload.routeSets = [payload.routeSets[0]]
      payload.images[0].route_data = {}
      await client.query('reset role')
      await setAuthenticatedContext(client, fixture.ownerId)

      await save(client, fixture, fixture.updatedAt, payload)

      expect((await client.query(
        'select id from public.submission_draft_routes where draft_id = $1 order by id',
        [fixture.draftId],
      )).rows.map((row) => row.id).sort()).toEqual([fixture.routeId, untouchedRouteId].sort())
      expect((await client.query(
        'select route_data from public.submission_draft_images where id = $1',
        [fixture.secondImageId],
      )).rows[0].route_data).toEqual({})
    })
  })

  it('cannot resurrect or publish a deleted route from stale compatibility JSON', async () => {
    await transaction(async (client) => {
      const fixture = await createFixture(client)
      const payload = payloadFor(fixture, 'deleted-compatibility')
      payload.routeSets = [{ draftImageId: fixture.firstImageId, routes: [] }]
      payload.images[1].route_data = {
        completedRoutes: [routeFor(fixture.routeId, 'Stale compatibility route')],
      }
      await client.query('reset role')
      await setAuthenticatedContext(client, fixture.ownerId)

      await save(client, fixture, fixture.updatedAt, payload)
      const promoted = (await client.query(
        'select public.promote_draft_to_submission($1) as result', [fixture.draftId],
      )).rows[0].result

      expect(promoted).toMatchObject({ success: true, climb_ids: [], route_line_ids: [] })
      expect((await client.query(
        'select count(*)::int as count from public.submission_draft_routes where draft_id = $1',
        [fixture.draftId],
      )).rows[0].count).toBe(0)
      expect((await client.query(
        'select count(*)::int as count from public.climbs where crag_id = $1',
        [fixture.secondCragId],
      )).rows[0].count).toBe(0)
    })
  })

  it('saves valid custom GPS metadata and preserves custom coordinates on publication', async () => {
    await transaction(async (client) => {
      const fixture = await createFixture(client)
      const payload = payloadFor(fixture, 'custom-gps')
      await client.query('reset role')
      await setAuthenticatedContext(client, fixture.ownerId)

      await save(client, fixture, fixture.updatedAt, payload)
      const promoted = (await client.query(
        'select public.promote_draft_to_submission($1) as result', [fixture.draftId],
      )).rows[0].result

      expect(promoted).toMatchObject({ success: true })
      // Publication governance keeps content on review-state crags out of API
      // reads. Inspect the persisted publication result as the database owner.
      await client.query('reset role')
      expect((await client.query(
        `select id, latitude::double precision as latitude,
           longitude::double precision as longitude, location_mode from public.images
         where id = any($1::uuid[]) order by id`,
        [[fixture.firstLiveImageId, fixture.secondLiveImageId]],
      )).rows).toEqual([
        { id: fixture.firstLiveImageId, latitude: 51.501, longitude: -0.101, location_mode: 'custom' },
        { id: fixture.secondLiveImageId, latitude: 51.502, longitude: -0.102, location_mode: 'custom' },
      ].sort((left, right) => left.id.localeCompare(right.id)))
    })
  })

  it('generates a route ID once and keeps it stable on the next save', async () => {
    await transaction(async (client) => {
      const fixture = await createFixture(client)
      const firstPayload = payloadFor(fixture, 'generated')
      firstPayload.routeSets[0].routes = [routeFor(undefined, 'Generated route')]
      firstPayload.images[1].route_data = { completedRoutes: firstPayload.routeSets[0].routes }
      await client.query('reset role')
      await setAuthenticatedContext(client, fixture.ownerId)

      const firstResult = (await save(client, fixture, fixture.updatedAt, firstPayload)).rows[0].result
      const generatedId = firstResult.routeSets[0].routes[0].id as string
      expect(generatedId).toMatch(/^[0-9a-f-]{36}$/)
      const secondPayload = payloadFor(fixture, 'stable')
      secondPayload.routeSets[0].routes = [routeFor(generatedId, 'Stable route')]
      secondPayload.images[1].route_data = { completedRoutes: secondPayload.routeSets[0].routes }

      const secondResult = (await save(
        client, fixture, new Date(firstResult.updated_at), secondPayload,
      )).rows[0].result
      expect(secondResult.routeSets[0].routes[0].id).toBe(generatedId)
      expect((await client.query(
        'select array_agg(id) as ids from public.submission_draft_routes where draft_image_id = $1',
        [fixture.firstImageId],
      )).rows[0].ids).toEqual([generatedId])
    })
  })

  it('allows a collaborator to save atomically and records last_edited_by', async () => {
    await transaction(async (client) => {
      const fixture = await createFixture(client)
      await client.query('reset role')
      await setAuthenticatedContext(client, fixture.collaboratorId)

      const result = (await save(client, fixture, fixture.updatedAt, payloadFor(fixture, 'collaborator'))).rows[0].result

      expect(result.routeSets[0].routes[0].name).toBe('Route collaborator')
      expect((await client.query(
        'select last_edited_by from public.submission_drafts where id = $1', [fixture.draftId],
      )).rows[0].last_edited_by).toBe(fixture.collaboratorId)
    })
  })

  it('denies an unrelated user without mutating any saved surface', async () => {
    await transaction(async (client) => {
      const fixture = await createFixture(client)
      const before = await savedState(client, fixture.draftId)
      await client.query('reset role')
      await setAuthenticatedContext(client, fixture.unrelatedId)

      const error = await rpcError(client, () => save(
        client, fixture, fixture.updatedAt, payloadFor(fixture, 'unauthorized'),
      ))

      expect(error.detail).toBe('permission_denied')
      await client.query('reset role')
      await setServiceContext(client)
      expect(await savedState(client, fixture.draftId)).toEqual(before)
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
        {
          display_order: 0,
          route_data: { completedRoutes: [routeFor(fixture.routeId, 'Before route')] },
        },
        { display_order: 1, route_data: {} },
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

  it.each(malformedPayloadCases)('rejects %s and rolls back the complete save', async (_label, mutate) => {
    await transaction(async (client) => {
      const fixture = await createFixture(client)
      const payload = payloadFor(fixture, 'malformed')
      mutate(payload, fixture)
      const before = await savedState(client, fixture.draftId)
      await client.query('reset role')
      await setAuthenticatedContext(client, fixture.ownerId)

      const error = await rpcError(client, () => save(client, fixture, fixture.updatedAt, payload))

      expect(error.detail).toBe('invalid_payload')
      expect(await savedState(client, fixture.draftId)).toEqual(before)
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
      expect(persisted.metadata).toEqual(ownerPayload.metadata)
      expect(persisted.route_data[0]).toEqual({ marker: 'owner-race-win', image: 'second', completedRoutes: [] })
      expect(persisted.route_data[1]).toMatchObject({
        marker: 'owner-race-win',
        image: 'first',
        completedRoutes: [{ id: fixture.routeId, name: 'Route owner-race-win', climbType: 'deep-water-solo' }],
      })
      expect(persisted.route_name).toBe('Route owner-race-win')
    } finally {
      if (!ownerClosed) await closeClient(owner)
      if (!collaboratorClosed) await closeClient(collaborator)
      await pool.query('delete from public.submission_drafts where id = $1', [fixture.draftId])
      await pool.query('delete from auth.users where id = any($1::uuid[])', [[
        fixture.ownerId, fixture.collaboratorId, fixture.unrelatedId,
      ]])
    }
  })
})
