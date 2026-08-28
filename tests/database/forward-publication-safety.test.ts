import { randomUUID } from 'node:crypto'
import { Client, type PoolClient } from 'pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { createDatabaseTestHarness } from './database-test-harness'

const { connectionString, pool } = createDatabaseTestHarness({ max: 8, statement_timeout: 15_000 })
const closedClients = new WeakSet<Client>()

type Queryable = Pick<PoolClient, 'query'>

type Fixture = {
  userId: string
  cragId: string
  draftId: string
  draftImageId: string
  imageId: string
}

async function setServiceContext(client: Queryable) {
  await client.query("select set_config('request.jwt.claims', $1, true)", [
    JSON.stringify({ role: 'service_role' }),
  ])
}

async function setAuthenticatedContext(client: Queryable, userId: string) {
  await client.query('set local role authenticated')
  await client.query("select set_config('request.jwt.claims', $1, true)", [
    JSON.stringify({ sub: userId, role: 'authenticated' }),
  ])
  await client.query("set local lock_timeout = '5s'")
}

async function transaction<T>(run: (client: PoolClient) => Promise<T>): Promise<T> {
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

async function createUser(client: Queryable): Promise<string> {
  const userId = randomUUID()
  const email = `database-${userId}@example.test`
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
     ) values ($1, $2, $3, public.current_open_data_consent_version(), now())
     on conflict (id) do update set username = excluded.username,
       email = excluded.email,
       open_data_consent_version = excluded.open_data_consent_version,
       consent_timestamp = excluded.consent_timestamp`,
    [userId, `db-${userId.slice(0, 12)}`, email],
  )
  return userId
}

async function createCrag(
  client: Queryable,
  createdAt = 'now()',
): Promise<string> {
  const cragId = randomUUID()
  const slug = `database-crag-${cragId}`
  await client.query(
    `insert into public.crags (id, name, type, country, country_code, slug, created_at)
     values ($1, 'Database safety crag', 'sport', 'Testland', 'GB', $2, ${createdAt})`,
    [cragId, slug],
  )
  return cragId
}

async function createReadyImage(
  client: Queryable,
  userId: string,
  overrides: { cragId?: string; processingStatus?: string } = {},
): Promise<{ imageId: string; bucket: string; path: string }> {
  const imageId = randomUUID()
  const bucket = 'database-tests'
  const path = `images/originals/${imageId}/fixture.jpg`
  const processingStatus = overrides.processingStatus || 'ready'
  const ready = processingStatus === 'ready'
  await client.query(
    `insert into public.images (
       id, url, created_by, crag_id, place_id, width, height, storage_provider,
       storage_bucket, storage_path, original_bucket, original_key,
       processing_status, moderation_status, visibility, status, processed_at
     ) values ($1, $2, $3, $4, $4, 1200, 900, 'r2', $5, $6, $5, $6,
       $7, $8, $9, $10, case when $7 = 'ready' then now() else null end)`,
    [
      imageId,
      `https://media.example.test/${imageId}.jpg`,
      userId,
      overrides.cragId || null,
      bucket,
      path,
      processingStatus,
      ready ? 'approved' : 'pending',
      ready ? 'public' : 'private',
      ready ? 'approved' : 'pending',
    ],
  )
  return { imageId, bucket, path }
}

async function createPromotionFixture(
  client: Queryable,
  withRoute = true,
): Promise<Fixture> {
  const userId = await createUser(client)
  const cragId = await createCrag(client, "now() - interval '2 hours'")
  const draftId = randomUUID()
  const draftImageId = randomUUID()
  const image = await createReadyImage(client, userId)
  await client.query(
    `insert into public.submission_drafts (id, user_id, crag_id, metadata)
     values ($1, $2, $3, $4::jsonb)`,
    [
      draftId,
      userId,
      cragId,
      JSON.stringify({
        version: 2,
        navigation: { defaultImageId: draftImageId },
        submission: { location: { latitude: 51.5, longitude: -0.1 } },
      }),
    ],
  )
  await client.query(
    `insert into public.submission_draft_images (
       id, draft_id, display_order, storage_provider, storage_bucket, storage_path,
       original_bucket, original_key, linked_image_id, processing_status, width, height
     ) values ($1, $2, 0, 'r2', $3, $4, $3, $4, $5, 'ready', 1200, 900)`,
    [draftImageId, draftId, image.bucket, image.path, image.imageId],
  )
  if (withRoute) {
    await client.query(
      `insert into public.submission_draft_routes (
         draft_id, draft_image_id, name, grade, climb_type, points,
         sequence_order, image_width, image_height, created_by, updated_by
       ) values ($1, $2, 'Concurrency Route', '6A', 'sport',
         '[{"x":0.2,"y":0.8},{"x":0.7,"y":0.1}]'::jsonb, 0, 1200, 900, $3, $3)`,
      [draftId, draftImageId, userId],
    )
  }
  return { userId, cragId, draftId, draftImageId, imageId: image.imageId }
}

async function committedFixture(withRoute = true): Promise<Fixture> {
  const client = await pool.connect()
  await client.query('begin')
  try {
    await setServiceContext(client)
    const fixture = await createPromotionFixture(client, withRoute)
    await client.query('commit')
    return fixture
  } catch (error) {
    await client.query('rollback')
    throw error
  } finally {
    client.release()
  }
}

async function cleanupFixture(fixture: Fixture) {
  await pool.query('delete from auth.users where id = $1', [fixture.userId])
}

async function authenticatedClient(userId: string, applicationName?: string): Promise<Client> {
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
  if (closedClients.has(client)) return
  await client.query(commit ? 'commit' : 'rollback').catch(() => undefined)
  await client.end()
  closedClients.add(client)
}

async function rpcError(
  client: Queryable,
  sql: string,
  values: unknown[],
): Promise<{ detail?: string; message: string }> {
  const savepoint = `expected_error_${randomUUID().replaceAll('-', '')}`
  await client.query(`savepoint ${savepoint}`)
  try {
    await client.query(sql, values)
    await client.query(`release savepoint ${savepoint}`)
    throw new Error('Expected RPC to fail')
  } catch (error) {
    if (error instanceof Error && error.message === 'Expected RPC to fail') throw error
    await client.query(`rollback to savepoint ${savepoint}`)
    await client.query(`release savepoint ${savepoint}`)
    const pgError = error as Error & { detail?: string }
    return { detail: pgError.detail, message: pgError.message }
  }
}

async function exists(client: Queryable, table: string, id: string): Promise<boolean> {
  const result = await client.query(`select exists(select 1 from public.${table} where id = $1) as present`, [id])
  return result.rows[0].present as boolean
}

beforeAll(async () => {
  const migration = await pool.query(
    `select to_regprocedure('public.promote_draft_to_submission(uuid)') is not null
       and to_regprocedure('public.delete_empty_crag(uuid,interval)') is not null
       and to_regprocedure('public.repair_submission_draft_crag_country(uuid,uuid,uuid,double precision,double precision,text,text,text)') is not null as installed`,
  )
  if (!migration.rows[0].installed) throw new Error('Forward publication safety migrations are not installed')
})

afterAll(async () => {
  await pool.end()
})

describe('forward publication safety migrations', () => {
  it('repairs a countryless draft crag from persisted image GPS', async () => {
    await transaction(async (client) => {
      const userId = await createUser(client)
      const countryId = randomUUID()
      const cragId = randomUUID()
      const draftId = randomUUID()
      await client.query(
        `insert into public.countries (id, iso_a2, iso_a3, name, boundary)
         values ($1, 'XZ', 'XZZ', 'Database Test Country',
           ST_Multi(ST_GeomFromText('POLYGON((-1 50,1 50,1 52,-1 52,-1 50))', 4326)))`,
        [countryId],
      )
      await client.query(
        `insert into public.crags (id, name, type, slug)
         values ($1, 'Countryless crag', 'sport', $2)`,
        [cragId, `countryless-${cragId}`],
      )
      await client.query(
        `insert into public.submission_drafts (id, user_id, crag_id, metadata)
         values ($1, $2, $3, '{"submission":{}}'::jsonb)`,
        [draftId, userId, cragId],
      )
      await client.query(
        `insert into public.submission_draft_images (
           draft_id, display_order, latitude, longitude, storage_provider,
           storage_bucket, storage_path, original_bucket, original_key, processing_status
         ) values ($1, 0, 51.0997358, 0.1870059, 'r2', 'database-tests', $2,
           'database-tests', $2, 'ready')`,
        [draftId, `drafts/${draftId}/country-repair.jpg`],
      )

      const staleLocationError = await rpcError(
        client,
        `select public.repair_submission_draft_crag_country(
           p_draft_id => $1, p_user_id => $2, p_crag_id => $3,
           p_latitude => 50.5, p_longitude => 0.1870059, p_country_code => 'XZ'
         )`,
        [draftId, userId, cragId],
      )
      expect(staleLocationError.message).toContain('Draft location changed before crag country repair')

      const repaired = await client.query(
        `select public.repair_submission_draft_crag_country(
           p_draft_id => $1, p_user_id => $2, p_crag_id => $3,
           p_latitude => 51.0997358, p_longitude => 0.1870059, p_country_code => 'XZ',
           p_country_name => 'Database Test Country', p_region_name => 'Test Region'
         ) as country_code`,
        [draftId, userId, cragId],
      )

      expect(repaired.rows[0].country_code).toBe('XZ')
      const crag = await client.query('select country_code, country_id from public.crags where id = $1', [cragId])
      expect(crag.rows[0].country_code).toBe('XZ')
      expect(crag.rows[0].country_id).toBe(countryId)
    })
  })

  it('rejects country repair when the expected draft owner does not match', async () => {
    await transaction(async (client) => {
      const ownerId = await createUser(client)
      const otherUserId = await createUser(client)
      const cragId = randomUUID()
      const draftId = randomUUID()
      await client.query(
        `insert into public.crags (id, name, type, slug)
         values ($1, 'Protected countryless crag', 'sport', $2)`,
        [cragId, `protected-countryless-${cragId}`],
      )
      await client.query(
        `insert into public.submission_drafts (id, user_id, crag_id, metadata)
         values ($1, $2, $3, '{"submission":{"location":{"latitude":51.1,"longitude":0.18}}}'::jsonb)`,
        [draftId, ownerId, cragId],
      )

      const error = await rpcError(
        client,
        `select public.repair_submission_draft_crag_country(
           p_draft_id => $1, p_user_id => $2, p_crag_id => $3,
           p_latitude => 51.1, p_longitude => 0.18, p_country_code => 'GB'
         )`,
        [draftId, otherUserId, cragId],
      )

      expect(error.message).toContain('Draft owner changed before crag country repair')
    })
  })

  it('does not reclassify a populated countryless crag from draft GPS', async () => {
    await transaction(async (client) => {
      const userId = await createUser(client)
      const cragId = randomUUID()
      const draftId = randomUUID()
      await client.query(
        `insert into public.crags (id, name, type, slug)
         values ($1, 'Populated countryless crag', 'sport', $2)`,
        [cragId, `populated-countryless-${cragId}`],
      )
      await createReadyImage(client, userId, { cragId })
      await client.query(
        `insert into public.submission_drafts (id, user_id, crag_id, metadata)
         values ($1, $2, $3, '{"submission":{"location":{"latitude":51.1,"longitude":0.18}}}'::jsonb)`,
        [draftId, userId, cragId],
      )

      const error = await rpcError(
        client,
        `select public.repair_submission_draft_crag_country(
           p_draft_id => $1, p_user_id => $2, p_crag_id => $3,
           p_latitude => 51.1, p_longitude => 0.18, p_country_code => 'GB'
         )`,
        [draftId, userId, cragId],
      )

      expect(error.message).toContain('Countryless crag with published content requires manual repair')
    })
  })

  it('does not grant authenticated callers access to country repair', async () => {
    const result = await pool.query(
      `select has_function_privilege(
         'authenticated',
         'public.repair_submission_draft_crag_country(uuid,uuid,uuid,double precision,double precision,text,text,text)',
         'EXECUTE'
       ) as can_execute`,
    )
    expect(result.rows[0].can_execute).toBe(false)
  })

  it('retains a crag with a climb when its final image is removed', async () => {
    await transaction(async (client) => {
      const userId = await createUser(client)
      const cragId = await createCrag(client, "now() - interval '2 hours'")
      const image = await createReadyImage(client, userId, { cragId })
      await client.query(
        `insert into public.climbs (name, grade, status, route_type, user_id, crag_id, place_id, slug)
         values ('Retaining route', '6A', 'approved', 'sport', $1, $2, $2, $3)`,
        [userId, cragId, `retaining-${randomUUID()}`],
      )
      await client.query("update public.images set status = 'deleted', visibility = 'private' where id = $1", [image.imageId])
      expect(await exists(client, 'crags', cragId)).toBe(true)
      expect((await client.query(
        "select count(*)::int as count from public.images where crag_id = $1 and status <> 'deleted'",
        [cragId],
      )).rows[0].count).toBe(0)
    })
  })

  it('retains a crag referenced by a draft when its final image is removed', async () => {
    await transaction(async (client) => {
      const userId = await createUser(client)
      const cragId = await createCrag(client, "now() - interval '2 hours'")
      const image = await createReadyImage(client, userId, { cragId })
      await client.query('insert into public.submission_drafts (user_id, crag_id) values ($1, $2)', [userId, cragId])
      await client.query("update public.images set status = 'deleted', visibility = 'private' where id = $1", [image.imageId])
      expect(await exists(client, 'crags', cragId)).toBe(true)
    })
  })

  it('retains crags containing sectors or crag image associations', async () => {
    await transaction(async (client) => {
      const userId = await createUser(client)
      const sectorCragId = await createCrag(client, "now() - interval '2 hours'")
      const imageCragId = await createCrag(client, "now() - interval '2 hours'")
      const sectorImage = await createReadyImage(client, userId, { cragId: sectorCragId })
      const cragImage = await createReadyImage(client, userId, { cragId: imageCragId })
      await client.query("insert into public.sectors (name, crag_id) values ('Sector', $1)", [sectorCragId])
      await client.query("insert into public.crag_images (crag_id, url) values ($1, 'https://example.test/crag.jpg')", [imageCragId])
      await client.query(
        "update public.images set status = 'deleted', visibility = 'private' where id = any($1::uuid[])",
        [[sectorImage.imageId, cragImage.imageId]],
      )
      expect(await exists(client, 'crags', sectorCragId)).toBe(true)
      expect(await exists(client, 'crags', imageCragId)).toBe(true)
    })
  })

  it('deletes only genuinely empty crags after the one-hour grace and agrees with batch cleanup', async () => {
    await transaction(async (client) => {
      const recentId = await createCrag(client, "now() - interval '30 minutes'")
      const singleId = await createCrag(client, "now() - interval '2 hours'")
      const batchId = await createCrag(client, "now() - interval '2 hours'")
      expect((await client.query("select public.delete_empty_crag($1, interval '1 hour') as deleted", [recentId])).rows[0].deleted).toBe(false)
      expect((await client.query("select public.delete_empty_crag($1, interval '1 hour') as deleted", [singleId])).rows[0].deleted).toBe(true)
      const batch = await client.query("select public.delete_empty_crags(interval '1 hour') as count")
      expect(batch.rows[0].count).toBeGreaterThanOrEqual(1)
      expect(await exists(client, 'crags', recentId)).toBe(true)
      expect(await exists(client, 'crags', singleId)).toBe(false)
      expect(await exists(client, 'crags', batchId)).toBe(false)
    })
  })

  it('cannot delete a committed publication while cleanup is queued on its crag lock', async () => {
    const fixture = await committedFixture(false)
    const publisher = await authenticatedClient(fixture.userId)
    const cleanerName = `database-cleaner-${randomUUID()}`
    const cleaner = new Client({ connectionString, application_name: cleanerName })
    await cleaner.connect()
    try {
      await publisher.query('reset role')
      const lockedCrag = await publisher.query('select id from public.crags where id = $1 for update', [fixture.cragId])
      expect(lockedCrag.rowCount).toBe(1)
      await setAuthenticatedContext(publisher, fixture.userId)
      const cleanup = cleaner.query("select public.delete_empty_crag($1, interval '1 hour') as deleted", [fixture.cragId])
      await waitForLock(cleanerName)
      const promoted = await publisher.query('select public.promote_draft_to_submission($1) as result', [fixture.draftId])
      await closeClient(publisher, true)
      expect((await cleanup).rows[0].deleted).toBe(false)
      expect(promoted.rows[0].result.success).toBe(true)
      expect((await pool.query('select status from public.submission_drafts where id = $1', [fixture.draftId])).rows[0].status).toBe('submitted')
      expect(await exists(cleaner, 'crags', fixture.cragId)).toBe(true)
      expect((await cleaner.query('select crag_id from public.images where id = $1', [fixture.imageId])).rows[0].crag_id).toBe(fixture.cragId)
    } finally {
      await closeClient(publisher)
      await cleaner.end()
      await cleanupFixture(fixture)
    }
  })

  it('makes concurrent promotion idempotent with one complete publication set', async () => {
    const fixture = await committedFixture(true)
    const first = await authenticatedClient(fixture.userId)
    const second = await authenticatedClient(fixture.userId)
    try {
      const lockedDraft = await first.query('select id from public.submission_drafts where id = $1 for update', [fixture.draftId])
      expect(lockedDraft.rowCount).toBe(1)
      const firstCall = first.query('select public.promote_draft_to_submission($1) as result', [fixture.draftId])
      const secondCall = second.query('select public.promote_draft_to_submission($1) as result', [fixture.draftId])
      const firstResult = (await firstCall).rows[0].result
      await closeClient(first, true)
      const secondResult = (await secondCall).rows[0].result
      await closeClient(second, true)
      expect(secondResult).toEqual(firstResult)
      const counts = await pool.query(
        `select
           (select count(*)::int from public.images where id = $1 and crag_id = $2 and submission_id is not null) as image_associations,
           (select count(*)::int from public.crag_images where linked_image_id = $1 and crag_id = $2) as crag_images,
           (select count(*)::int from public.climbs where crag_id = $2) as climbs,
           (select count(*)::int from public.route_lines where image_id = $1) as route_lines`,
        [fixture.imageId, fixture.cragId],
      )
      expect(counts.rows[0]).toEqual({ image_associations: 1, crag_images: 1, climbs: 1, route_lines: 1 })
    } finally {
      await closeClient(first)
      await closeClient(second)
      await cleanupFixture(fixture)
    }
  })

  it('gives promotion an atomic win over draft deletion and preserves publication media', async () => {
    const fixture = await committedFixture(true)
    const publisher = await authenticatedClient(fixture.userId)
    const deleterName = `database-deleter-${randomUUID()}`
    const deleter = await authenticatedClient(fixture.userId, deleterName)
    try {
      await publisher.query('select id from public.submission_drafts where id = $1 for update', [fixture.draftId])
      const promoted = await publisher.query('select public.promote_draft_to_submission($1) as result', [fixture.draftId])
      const deletion = rpcError(deleter, 'select public.delete_submission_draft_atomic($1)', [fixture.draftId])
      await waitForLock(deleterName)
      await closeClient(publisher, true)
      expect(promoted.rows[0].result.success).toBe(true)
      expect((await deletion).detail).toBe('draft_not_editable')
      await closeClient(deleter)
      expect((await pool.query('select status from public.submission_drafts where id = $1', [fixture.draftId])).rows[0].status).toBe('submitted')
      expect(await exists(pool, 'images', fixture.imageId)).toBe(true)
      expect((await pool.query('select count(*)::int as count from public.crag_images where linked_image_id = $1', [fixture.imageId])).rows[0].count).toBe(1)
    } finally {
      await closeClient(publisher)
      await closeClient(deleter)
      await cleanupFixture(fixture)
    }
  })

  it('rejects draft-linked and published images regardless of processing status', async () => {
    await transaction(async (client) => {
      const userId = await createUser(client)
      const cragId = await createCrag(client)
      const draftId = randomUUID()
      const pending = await createReadyImage(client, userId, { processingStatus: 'processing' })
      const published = await createReadyImage(client, userId, { cragId })
      await client.query('insert into public.submission_drafts (id, user_id, crag_id) values ($1, $2, $3)', [draftId, userId, cragId])
      await client.query(
        `insert into public.submission_draft_images
           (draft_id, display_order, storage_bucket, storage_path, linked_image_id, processing_status)
         values ($1, 0, $2, $3, $4, 'processing')`,
        [draftId, pending.bucket, pending.path, pending.imageId],
      )
      await client.query('reset role')
      await setAuthenticatedContext(client, userId)
      const draftError = await rpcError(client, 'select public.delete_unassociated_upload_image($1)', [pending.imageId])
      const publishedError = await rpcError(client, 'select public.delete_unassociated_upload_image($1)', [published.imageId])
      expect(draftError.detail).toBe('image_associated')
      expect(publishedError.detail).toBe('image_associated')
    })
  })

  it('allows an owner to delete an unassociated upload', async () => {
    await transaction(async (client) => {
      const userId = await createUser(client)
      const image = await createReadyImage(client, userId, { processingStatus: 'pending' })
      await client.query('reset role')
      await setAuthenticatedContext(client, userId)
      const result = await client.query('select public.delete_unassociated_upload_image($1) as result', [image.imageId])
      expect(result.rows[0].result).toMatchObject({ image_id: image.imageId, storage_bucket: image.bucket, storage_path: image.path })
      expect(await exists(client, 'images', image.imageId)).toBe(false)
    })
  })

  it('protects legacy path-linked draft uploads even when linked_image_id is null', async () => {
    await transaction(async (client) => {
      const userId = await createUser(client)
      const cragId = await createCrag(client)
      const draftId = randomUUID()
      const image = await createReadyImage(client, userId, { processingStatus: 'pending' })
      await client.query('insert into public.submission_drafts (id, user_id, crag_id) values ($1, $2, $3)', [draftId, userId, cragId])
      await client.query(
        `insert into public.submission_draft_images
           (draft_id, display_order, storage_bucket, storage_path, linked_image_id)
         values ($1, 0, $2, $3, null)`,
        [draftId, image.bucket, image.path],
      )
      await client.query('reset role')
      await setAuthenticatedContext(client, userId)
      const deletion = await rpcError(client, 'select public.delete_unassociated_upload_image($1)', [image.imageId])
      expect(deletion.detail).toBe('image_associated')
      expect(await exists(client, 'images', image.imageId)).toBe(true)
    })
  })

  it('rejects duplicate authoritative image identities when they are attached', async () => {
    await transaction(async (client) => {
      const fixture = await createPromotionFixture(client, false)
      await client.query('savepoint duplicate_attachment')
      await expect(client.query(
        `insert into public.submission_draft_images (
           draft_id, display_order, storage_provider, storage_bucket, storage_path,
           original_bucket, original_key, linked_image_id, processing_status, width, height
         )
         select draft_id, 1, storage_provider, storage_bucket, storage_path,
           original_bucket, original_key, linked_image_id, processing_status, width, height
         from public.submission_draft_images where id = $1`,
        [fixture.draftImageId],
      )).rejects.toMatchObject({ code: '23505' })
      await client.query('rollback to savepoint duplicate_attachment')
    })
  })

  it('atomically deletes one draft image, compacts metadata, and preserves one image', async () => {
    await transaction(async (client) => {
      const userId = await createUser(client)
      const cragId = await createCrag(client)
      const draftId = randomUUID()
      const firstImageId = randomUUID()
      const secondImageId = randomUUID()
      await client.query(
        `insert into public.submission_drafts (id, user_id, crag_id, metadata)
         values ($1, $2, $3, '{"primaryIndex":1,"faceDirectionsByImage":{"0":["n"],"1":["s"]}}'::jsonb)`,
        [draftId, userId, cragId],
      )
      await client.query(
        `insert into public.submission_draft_images
           (id, draft_id, display_order, storage_bucket, storage_path)
         values ($1, $3, 0, 'database-tests', 'legacy/first.jpg'),
                ($2, $3, 1, 'database-tests', 'legacy/second.jpg')`,
        [firstImageId, secondImageId, draftId],
      )
      const updatedAt = (await client.query('select updated_at from public.submission_drafts where id = $1', [draftId])).rows[0].updated_at
      await client.query('reset role')
      await setAuthenticatedContext(client, userId)
      const result = (await client.query(
        'select public.delete_submission_draft_image_atomic($1, $2, $3) as result',
        [draftId, firstImageId, updatedAt],
      )).rows[0].result
      expect(result.draft.metadata).toMatchObject({ primaryIndex: 0, faceDirectionsByImage: { 0: ['s'] } })
      expect(result.cleanup).toEqual([expect.objectContaining({ storage_path: 'legacy/first.jpg' })])
      expect((await client.query('select id, display_order from public.submission_draft_images where draft_id = $1', [draftId])).rows).toEqual([
        { id: secondImageId, display_order: 0 },
      ])
    })
  })

  it('does not delete a crag when its place projection is deleted', async () => {
    await transaction(async (client) => {
      const cragId = await createCrag(client)
      await client.query('delete from public.places where id = $1', [cragId])
      expect(await exists(client, 'crags', cragId)).toBe(true)
      expect(await exists(client, 'places', cragId)).toBe(false)
    })
  })

  it('removes the place mirror when a crag is deleted', async () => {
    await transaction(async (client) => {
      const cragId = await createCrag(client)
      expect(await exists(client, 'places', cragId)).toBe(true)
      await client.query('delete from public.crags where id = $1', [cragId])
      expect(await exists(client, 'places', cragId)).toBe(false)
    })
  })

  it('promotes an image-only draft without creating routes', async () => {
    await transaction(async (client) => {
      const fixture = await createPromotionFixture(client, false)
      await client.query('reset role')
      await setAuthenticatedContext(client, fixture.userId)
      const result = (await client.query('select public.promote_draft_to_submission($1) as result', [fixture.draftId])).rows[0].result
      expect(result).toMatchObject({ success: true, status: 'submitted', image_ids: [fixture.imageId], climb_ids: [], route_line_ids: [] })
      // The promotion is durable even though the new crag remains in review
      // and is intentionally hidden from authenticated public-table reads.
      await client.query('reset role')
      expect((await client.query('select count(*)::int as count from public.crag_images where linked_image_id = $1', [fixture.imageId])).rows[0].count).toBe(1)
      expect((await client.query('select count(*)::int as count from public.climbs where crag_id = $1', [fixture.cragId])).rows[0].count).toBe(0)
    })
  })

  it('keeps cleanup RPC privileges restricted and forces destructive writes through RPCs', async () => {
    await transaction(async (client) => {
      const privileges = await client.query(
        `select role_name,
                has_function_privilege(role_name, 'public.delete_empty_crag(uuid,interval)', 'EXECUTE') as single,
                has_function_privilege(role_name, 'public.delete_empty_crags(interval)', 'EXECUTE') as batch
         from unnest(array['anon', 'authenticated', 'service_role']) as role_name`,
      )
      expect(privileges.rows).toEqual([
        { role_name: 'anon', single: false, batch: false },
        { role_name: 'authenticated', single: false, batch: false },
        { role_name: 'service_role', single: true, batch: true },
      ])
      const policies = await client.query(
        `select tablename, count(*)::int as count
         from pg_policies
         where schemaname = 'public'
           and tablename in ('images', 'submission_drafts', 'submission_draft_images')
           and cmd = 'DELETE' and permissive = 'PERMISSIVE'
         group by tablename order by tablename`,
      )
      expect(policies.rows).toEqual([])

      const userId = await createUser(client)
      const cragId = await createCrag(client)
      const draftId = randomUUID()
      const draftImageId = randomUUID()
      const image = await createReadyImage(client, userId)
      await client.query('insert into public.submission_drafts (id, user_id, crag_id) values ($1, $2, $3)', [draftId, userId, cragId])
      await client.query(
        `insert into public.submission_draft_images
           (id, draft_id, display_order, storage_bucket, storage_path, linked_image_id)
         values ($1, $2, 0, $3, $4, $5)`,
        [draftImageId, draftId, image.bucket, image.path, image.imageId],
      )
      await client.query('reset role')
      await setAuthenticatedContext(client, userId)
      const imageDelete = await rpcError(client, 'delete from public.images where id = $1', [image.imageId])
      expect(imageDelete.message).toContain('permission denied')
      expect((await client.query('delete from public.submission_draft_images where id = $1', [draftImageId])).rowCount).toBe(0)
      expect((await client.query('delete from public.submission_drafts where id = $1', [draftId])).rowCount).toBe(0)
      const statusBypass = await rpcError(client, "update public.submission_drafts set status = 'submitted' where id = $1", [draftId])
      expect(statusBypass.message).toContain('row-level security policy')
    })
  })
})
