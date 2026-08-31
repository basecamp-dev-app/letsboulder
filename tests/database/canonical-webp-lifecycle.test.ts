import { randomUUID } from 'node:crypto'
import { type PoolClient } from 'pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { createDatabaseTestHarness } from './database-test-harness'

const { pool } = createDatabaseTestHarness({ max: 2, statement_timeout: 15_000 })

async function transaction(run: (client: PoolClient) => Promise<void>) {
  const client = await pool.connect()
  await client.query('begin')
  try {
    await run(client)
  } finally {
    await client.query('rollback')
    client.release()
  }
}

async function setServiceRole(client: PoolClient) {
  await client.query('set local role service_role')
  await client.query("select set_config('request.jwt.claims', '{\"role\":\"service_role\"}', true)")
}

async function createUser(client: PoolClient) {
  const id = randomUUID()
  const email = `canonical-webp-${id}@example.test`
  await client.query(
    `insert into auth.users (
       id, aud, role, email, encrypted_password, email_confirmed_at,
       raw_app_meta_data, raw_user_meta_data, created_at, updated_at
     ) values ($1, 'authenticated', 'authenticated', $2, '', now(),
       '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now())`,
    [id, email],
  )
  await client.query(
    `insert into public.profiles (id, username, email) values ($1, $2, $3)
     on conflict (id) do update set username = excluded.username, email = excluded.email`,
    [id, `canonical-${id.slice(0, 12)}`, email],
  )
  return id
}

function locators(imageId: string) {
  const contentId = 'a'.repeat(64)
  return {
    originalBucket: 'private-media',
    originalKey: `images/assets/${imageId}/${'b'.repeat(64)}/original.jpg`,
    optimizedBucket: 'private-media',
    optimizedKey: `images/assets/${imageId}/${contentId}/canonical.webp`,
    url: `/media/${imageId}/${contentId}/canonical.webp`,
  }
}

async function insertPendingImage(client: PoolClient, imageId: string) {
  const locator = locators(imageId)
  await client.query(
    `insert into public.images (
       id, url, status, storage_provider, original_bucket, original_key,
       processing_status, moderation_status, visibility
     ) values ($1, 'private://pending', 'pending', 'r2', $2, $3,
       'processing', 'skipped', 'private')`,
    [imageId, locator.originalBucket, locator.originalKey],
  )
  return locator
}

async function commit(client: PoolClient, imageId: string, locator: ReturnType<typeof locators>) {
  const existing = await client.query(
    `select id, claim_token from public.media_jobs
     where image_id = $1 and status = 'processing' order by created_at limit 1`,
    [imageId],
  )
  let job = existing.rows[0]
  if (!job) {
    job = (await client.query(
      `insert into public.media_jobs
         (image_id, job_type, status, payload, attempts, max_attempts, locked_at, locked_by, claim_token, lease_expires_at)
       values ($1, 'ingest_image', 'processing', '{}'::jsonb, 1, 5, now(), 'canonical-test', $2, now() + interval '15 minutes')
       returning id, claim_token`,
      [imageId, randomUUID()],
    )).rows[0]
  }
  return client.query(
    `select public.commit_media_webp(
        $1, $2, $3, $4, $5, 'image/webp', 12345, 1200, 800,
        '{"canonical":{"format":"webp"}}'::jsonb, $6, $7, $8
      ) as job_id`,
    [imageId, locator.originalBucket, locator.originalKey,
      locator.optimizedBucket, locator.optimizedKey, locator.url, job.id, job.claim_token],
  )
}

beforeAll(async () => {
  const result = await pool.query(
    `select to_regprocedure('public.commit_media_webp(uuid,text,text,text,text,text,bigint,integer,integer,jsonb,text,uuid,uuid)') is not null
       and to_regprocedure('public.verify_media_replacement_delivery(uuid,text,uuid,uuid)') is not null as installed`,
  )
  if (!result.rows[0].installed) throw new Error('Canonical WebP lifecycle migration is not installed')
})

afterAll(async () => pool.end())

describe('canonical WebP lifecycle', () => {
  it('atomically commits the derivative and queues original deletion', async () => {
    await transaction(async (client) => {
      const imageId = randomUUID()
      const locator = await insertPendingImage(client, imageId)
      const userId = await createUser(client)
      await setServiceRole(client)
      await client.query(
        `update public.images
         set created_by = $2, processing_status = 'ready', moderation_status = 'approved',
             moderation_provider = 'fixture', visibility = 'public', status = 'approved'
         where id = $1`,
        [imageId, userId],
      )
      const cragId = randomUUID()
      const draftId = randomUUID()
      const recoveryDraftId = randomUUID()
      await client.query('insert into public.crags (id, name) values ($1, $2)', [cragId, 'Canonical Test Crag'])
      await client.query(
        `insert into public.submission_drafts (id, user_id, crag_id)
         values ($1, $3, $4), ($2, $3, $4)`,
        [draftId, recoveryDraftId, userId, cragId],
      )
      await client.query(
        `insert into public.submission_draft_images (
           draft_id, display_order, storage_bucket, storage_path, storage_provider,
           linked_image_id, processing_status
         ) values ($1, 0, $2, $3, 'r2', $4, 'processing')`,
        [draftId, locator.originalBucket, locator.originalKey, imageId],
      )
      await client.query(
        `insert into public.submission_draft_images (
           draft_id, display_order, storage_bucket, storage_path, storage_provider,
           processing_status
         ) values ($1, 0, $2, $3, 'r2', 'processing')`,
        [recoveryDraftId, locator.originalBucket, locator.originalKey],
      )
      await client.query(
        `insert into public.submission_draft_images (
           draft_id, display_order, storage_bucket, storage_path, storage_provider,
           processing_status
         ) values ($1, 1, $2, $3, 'r2', 'processing')`,
        [draftId, locator.originalBucket, locator.originalKey],
      )
      await client.query(
        `insert into public.crag_images (crag_id, url, width, height, linked_image_id, source_image_id)
         values ($1, $2, 4000, 3000, $3, $3)`,
        [cragId, `private://${locator.originalBucket}/${locator.originalKey}`, imageId],
      )
      await client.query(
        `insert into public.crag_images (crag_id, url, width, height)
         values ($1, $2, 4000, 3000)`,
        [cragId, `private://${locator.originalBucket}/${locator.originalKey}`],
      )
      await client.query(
        `update public.images
         set processing_status = 'processing', visibility = 'private', status = 'pending'
         where id = $1`,
        [imageId],
      )

      const jobId = (await commit(client, imageId, locator)).rows[0].job_id
      const image = (await client.query(
        `select optimized_bucket, optimized_key, optimized_mime, optimized_bytes,
                 optimized_width, optimized_height, storage_bucket, storage_path,
                 processing_status, moderation_status, moderation_provider, visibility, status, variants, url,
                processed_at is not null as processed, original_deletion_queued_at is not null as queued
         from public.images where id = $1`,
        [imageId],
      )).rows[0]
      expect(image).toEqual({
        optimized_bucket: locator.optimizedBucket,
        optimized_key: locator.optimizedKey,
        optimized_mime: 'image/webp',
        optimized_bytes: '12345',
        optimized_width: 1200,
        optimized_height: 800,
        storage_bucket: locator.optimizedBucket,
        storage_path: locator.optimizedKey,
        processing_status: 'ready',
        moderation_status: 'skipped',
        moderation_provider: 'disabled',
        visibility: 'public',
        status: 'approved',
        variants: { canonical: { format: 'webp' } },
        url: locator.url,
        processed: true,
        queued: true,
      })
      expect((await client.query(
        `select id, bucket, object_key, reason, status,
                delivery_verified_at is not null as delivery_verified
         from public.media_deletion_jobs where image_id = $1`,
        [imageId],
      )).rows).toEqual([{
        id: jobId,
        bucket: locator.originalBucket,
        object_key: locator.originalKey,
        reason: 'source_replaced',
        status: 'queued',
        delivery_verified: false,
      }])
      expect((await client.query(
        `select storage_bucket, storage_path, width, height, linked_image_id, processing_status
         from public.submission_draft_images where draft_id in ($1, $2)
         order by (draft_id = $1) desc, display_order`,
        [draftId, recoveryDraftId],
      )).rows).toEqual([{
        storage_bucket: locator.optimizedBucket,
        storage_path: locator.optimizedKey,
        width: 1200,
        height: 800,
        linked_image_id: imageId,
        processing_status: 'ready',
      }, {
        storage_bucket: locator.originalBucket,
        storage_path: locator.originalKey,
        width: null,
        height: null,
        linked_image_id: null,
        processing_status: 'processing',
      }, {
        storage_bucket: locator.optimizedBucket,
        storage_path: locator.optimizedKey,
        width: 1200,
        height: 800,
        linked_image_id: imageId,
        processing_status: 'ready',
      }])
      expect((await client.query(
        'select url, width, height from public.crag_images where crag_id = $1 order by id',
        [cragId],
      )).rows).toEqual([{
        url: `private://${locator.optimizedBucket}/${locator.optimizedKey}`,
        width: 1200,
        height: 800,
      }, {
        url: `private://${locator.optimizedBucket}/${locator.optimizedKey}`,
        width: 1200,
        height: 800,
      }])
    })
  })

  it('does not backfill an ambiguous original locator', async () => {
    await transaction(async (client) => {
      const imageId = randomUUID()
      const locator = await insertPendingImage(client, imageId)
      const ownerId = await createUser(client)
      const duplicateImageId = randomUUID()
      const draftId = randomUUID()
      await client.query('update public.images set created_by = $2 where id = $1', [imageId, ownerId])
      await client.query(
        `insert into public.images (
           id, url, created_by, storage_provider, original_bucket, original_key,
           storage_bucket, storage_path, processing_status, moderation_status, visibility, status
         ) values ($1, 'private://duplicate', $2, 'r2', $3, $4, $3, $4,
           'processing', 'skipped', 'private', 'pending')`,
        [duplicateImageId, ownerId, locator.originalBucket, locator.originalKey],
      )
      await client.query(
        'insert into public.submission_drafts (id, user_id) values ($1, $2)',
        [draftId, ownerId],
      )
      await client.query(
        `insert into public.submission_draft_images (
           draft_id, display_order, storage_bucket, storage_path, storage_provider, processing_status
         ) values ($1, 0, $2, $3, 'r2', 'processing')`,
        [draftId, locator.originalBucket, locator.originalKey],
      )
      await setServiceRole(client)

      await commit(client, imageId, locator)

      expect((await client.query(
        `select linked_image_id, storage_bucket, storage_path, processing_status
         from public.submission_draft_images where draft_id = $1`,
        [draftId],
      )).rows[0]).toEqual({
        linked_image_id: null,
        storage_bucket: locator.originalBucket,
        storage_path: locator.originalKey,
        processing_status: 'processing',
      })
    })
  })

  it('returns the same deletion job for an exact replay', async () => {
    await transaction(async (client) => {
      const imageId = randomUUID()
      const locator = await insertPendingImage(client, imageId)
      await setServiceRole(client)

      const first = (await commit(client, imageId, locator)).rows[0].job_id
      const replay = (await commit(client, imageId, locator)).rows[0].job_id

      expect(replay).toBe(first)
      expect((await client.query(
        "select count(*)::integer as count from public.media_deletion_jobs where image_id = $1 and reason = 'source_replaced'",
        [imageId],
      )).rows[0].count).toBe(1)
    })
  })

  it('gates source replacement claims on verified delivery without affecting other deletions', async () => {
    await transaction(async (client) => {
      const imageId = randomUUID()
      const locator = await insertPendingImage(client, imageId)
      await setServiceRole(client)
      const jobId = (await commit(client, imageId, locator)).rows[0].job_id

      expect((await client.query(
        'select claimed.id from public.claim_media_deletion_job($1, 900) as claimed',
        ['delivery-gate-worker'],
      )).rows[0].id).toBeNull()

      const unrelatedJobId = randomUUID()
      await client.query(
        `insert into public.media_deletion_jobs (
           id, bucket, object_key, reason, source_type
         ) values ($1, 'private-media', $2, 'image_hard_deleted', 'image')`,
        [unrelatedJobId, `images/assets/${unrelatedJobId}/unrelated.webp`],
      )
      expect((await client.query(
        'select claimed.id from public.claim_media_deletion_job($1, 900) as claimed',
        ['delivery-gate-worker'],
      )).rows[0].id).toBe(unrelatedJobId)

       const claim = (await client.query(
         'select claim_token from public.media_jobs where image_id = $1 and status = \'processing\'',
         [imageId],
       )).rows[0]
       await client.query(
         'select public.verify_media_replacement_delivery($1, $2, $3, $4)',
         [jobId, locator.optimizedKey, (await client.query('select id from public.media_jobs where image_id = $1 and status = \'processing\'', [imageId])).rows[0].id, claim.claim_token],
       )
      expect((await client.query(
        'select claimed.id from public.claim_media_deletion_job($1, 900) as claimed',
        ['delivery-gate-worker'],
      )).rows[0].id).toBe(jobId)
    })
  })

  it('rejects a stale source without committing derivative state', async () => {
    await transaction(async (client) => {
      const imageId = randomUUID()
      const locator = await insertPendingImage(client, imageId)
      await setServiceRole(client)
      await client.query('savepoint stale_source')

      await expect(commit(client, imageId, { ...locator, originalKey: `${locator.originalKey}.stale` }))
        .rejects.toThrow('Stale image source')
      await client.query('rollback to savepoint stale_source')

      expect((await client.query(
        'select optimized_key, processing_status from public.images where id = $1',
        [imageId],
      )).rows).toEqual([{ optimized_key: null, processing_status: 'processing' }])
      expect((await client.query(
        'select id from public.media_deletion_jobs where image_id = $1',
        [imageId],
      )).rows).toEqual([])
    })
  })

  it('captures both original and optimized objects when an image is deleted', async () => {
    await transaction(async (client) => {
      const imageId = randomUUID()
      const locator = locators(imageId)
      await setServiceRole(client)
      await client.query(
        `insert into public.images (
           id, url, status, storage_provider, original_bucket, original_key,
           optimized_bucket, optimized_key, optimized_mime, optimized_bytes,
           optimized_width, optimized_height
         ) values ($1, $2, 'pending', 'r2', $3, $4, $5, $6, 'image/webp', 12345, 1200, 800)`,
        [imageId, locator.url, locator.originalBucket, locator.originalKey,
          locator.optimizedBucket, locator.optimizedKey],
      )

      await client.query('delete from public.images where id = $1', [imageId])

      expect((await client.query(
        `select bucket, object_key, reason from public.media_deletion_jobs
         where image_id = $1 order by object_key`,
        [imageId],
      )).rows).toEqual([
        { bucket: locator.optimizedBucket, object_key: locator.optimizedKey, reason: 'image_hard_deleted' },
        { bucket: locator.originalBucket, object_key: locator.originalKey, reason: 'image_hard_deleted' },
      ].sort((a, b) => a.object_key.localeCompare(b.object_key)))
    })
  })
})
