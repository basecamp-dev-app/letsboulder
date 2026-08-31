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
  await client.query('reset role')
  await client.query('set local role service_role')
  await client.query("select set_config('request.jwt.claims', '{\"role\":\"service_role\"}', true)")
}

async function createUser(client: PoolClient) {
  const id = randomUUID()
  const email = `media-delete-${id}@example.test`
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
    [id, `media-delete-${id.slice(0, 12)}`, email],
  )
  return { email, id }
}

beforeAll(async () => {
  const result = await pool.query(
    `select to_regclass('public.media_deletion_jobs') is not null
       and to_regprocedure('public.claim_media_deletion_job(text,integer)') is not null as installed`,
  )
  if (!result.rows[0].installed) throw new Error('Media deletion outbox migration is not installed')
})

afterAll(async () => pool.end())

describe('media deletion outbox', () => {
  it('captures an immutable R2 locator before an image row is hard-deleted', async () => {
    await transaction(async (client) => {
      const imageId = randomUUID()
      await client.query(
        `insert into public.images (
           id, url, status, storage_provider, storage_bucket, storage_path,
           original_bucket, original_key
         ) values ($1, 'private://test', 'pending', 'r2', 'private-media', 'legacy.jpg',
           'private-media', $2)`,
        [imageId, `images/assets/${imageId}/checksum/original.jpg`],
      )

      await client.query('delete from public.images where id = $1', [imageId])

      expect((await client.query('select id from public.images where id = $1', [imageId])).rows).toEqual([])
      expect((await client.query(
        `select bucket, object_key, reason, source_type, source_id, image_id, status
         from public.media_deletion_jobs where image_id = $1`,
        [imageId],
      )).rows).toEqual([{
        bucket: 'private-media',
        object_key: `images/assets/${imageId}/checksum/original.jpg`,
        reason: 'image_hard_deleted',
        source_type: 'image',
        source_id: imageId,
        image_id: imageId,
        status: 'queued',
      }])
    })
  })

  it('captures published submission tombstones with the route deletion reason', async () => {
    await transaction(async (client) => {
      const owner = await createUser(client)
      const imageId = randomUUID()
      await setServiceRole(client)
      await client.query(
        `insert into public.images (
           id, url, created_by, status, visibility, processing_status,
           storage_provider, original_bucket, original_key
         ) values ($1, 'private://published', $2, 'approved', 'public', 'ready',
           'r2', 'private-media', $3)`,
        [imageId, owner.id, `images/assets/${imageId}/checksum/original.jpg`],
      )
      await client.query(
        `insert into public.media_jobs (image_id, job_type, payload)
         values ($1::uuid, 'ingest_image', jsonb_build_object('imageId', $1::text))`,
        [imageId],
      )
      await client.query(
        'select public.soft_delete_published_submission($1::uuid[], $2)',
        [[imageId], owner.id],
      )

      expect((await client.query(
        'select reason, object_key from public.media_deletion_jobs where image_id = $1',
        [imageId],
      )).rows).toEqual([{
        reason: 'published_submission_deleted',
        object_key: `images/assets/${imageId}/checksum/original.jpg`,
      }])
      expect((await client.query(
        'select status from public.media_jobs where image_id = $1',
        [imageId],
      )).rows).toEqual([{ status: 'cancelled' }])
    })
  })

  it('captures account-owned images only when upload deletion is selected', async () => {
    await transaction(async (client) => {
      const deletingOwner = await createUser(client)
      const retainingOwner = await createUser(client)
      const deletedImageId = randomUUID()
      const retainedImageId = randomUUID()
      await client.query(
        `insert into public.images (
           id, url, created_by, storage_provider, original_bucket, original_key
         ) values
           ($1, 'private://deleted', $2, 'r2', 'private-media', $3),
           ($4, 'private://retained', $5, 'r2', 'private-media', $6)`,
        [
          deletedImageId,
          deletingOwner.id,
          `images/staging/${deletedImageId}/${randomUUID()}/original.jpg`,
          retainedImageId,
          retainingOwner.id,
          `images/staging/${retainedImageId}/${randomUUID()}/original.jpg`,
        ],
      )
      await setServiceRole(client)

      await client.query(
        'select * from public.delete_account_atomic($1, $2, true)',
        [deletingOwner.id, deletingOwner.email],
      )
      await client.query(
        'select * from public.delete_account_atomic($1, $2, false)',
        [retainingOwner.id, retainingOwner.email],
      )

      expect((await client.query(
        'select reason, source_type, source_id from public.media_deletion_jobs',
      )).rows).toEqual([{
        reason: 'account_deleted',
        source_type: 'image',
        source_id: deletedImageId,
      }])
      expect((await client.query(
        'select created_by from public.images where id = $1',
        [retainedImageId],
      )).rows).toEqual([{ created_by: null }])
    })
  })

  it('does not trust an R2 key that is not namespaced to the deleted image', async () => {
    await transaction(async (client) => {
      const imageId = randomUUID()
      const differentImageId = randomUUID()
      await client.query(
        `insert into public.images (
           id, url, storage_provider, original_bucket, original_key
         ) values ($1, 'private://untrusted', 'r2', 'private-media', $2)`,
        [imageId, `images/assets/${differentImageId}/checksum/original.jpg`],
      )

      await client.query('delete from public.images where id = $1', [imageId])

      expect((await client.query('select id from public.media_deletion_jobs')).rows).toEqual([])
    })
  })

  it('prevents ingest from restoring a deleted non-ready image', async () => {
    await transaction(async (client) => {
      const owner = await createUser(client)
      const imageId = randomUUID()
      const objectKey = `images/staging/${imageId}/${randomUUID()}/original.jpg`
      await client.query(
        `insert into public.images (
           id, url, created_by, storage_provider, original_bucket, original_key
         ) values ($1, 'private://deleted-pending', $2, 'r2', 'private-media', $3)`,
        [imageId, owner.id, objectKey],
      )
      await setServiceRole(client)
      await client.query("update public.images set status = 'deleted' where id = $1", [imageId])

      await client.query('savepoint rejected_requeue')
      await expect(client.query(
        `select public.queue_media_ingest_job(
           $1, 'private-media', $2, 'r2', 'draft_image', $3, 'upload', false
         )`,
        [imageId, objectKey, owner.id],
      )).rejects.toThrow('Deleted images cannot be restored')
      await client.query('rollback to savepoint rejected_requeue')

      expect((await client.query(
        'select status, processing_status from public.images where id = $1',
        [imageId],
      )).rows).toEqual([{ status: 'deleted', processing_status: 'pending' }])
      expect((await client.query(
        "select id from public.media_jobs where image_id = $1 and status in ('queued', 'processing')",
        [imageId],
      )).rows).toEqual([])
    })
  })

  it('uses claim tokens for completion and rejects stale transitions', async () => {
    await transaction(async (client) => {
      const jobId = randomUUID()
      await client.query(
        `insert into public.media_deletion_jobs (
           id, bucket, object_key, reason, source_type
         ) values ($1, 'private-media', 'images/assets/claim.jpg', 'image_hard_deleted', 'image')`,
        [jobId],
      )
      await setServiceRole(client)

      const claimed = (await client.query(
        'select claimed.* from public.claim_media_deletion_job($1, 900) as claimed',
        ['test-worker'],
      )).rows[0]
      expect(claimed).toMatchObject({
        id: jobId,
        status: 'processing',
        attempts: 1,
        locked_by: 'test-worker',
      })
      expect(claimed.claim_token).toBeTruthy()

      await client.query('savepoint stale_claim')
      await expect(client.query(
        'select public.complete_media_deletion_job($1, $2)',
        [jobId, randomUUID()],
      )).rejects.toThrow('claim is no longer active')
      await client.query('rollback to savepoint stale_claim')

      await client.query(
        'select public.complete_media_deletion_job($1, $2)',
        [jobId, claimed.claim_token],
      )
      expect((await client.query(
        'select status, completed_at is not null as completed from public.media_deletion_jobs where id = $1',
        [jobId],
      )).rows).toEqual([{ status: 'completed', completed: true }])
    })
  })

  it('terminally fails an expired lease after its final attempt', async () => {
    await transaction(async (client) => {
      const jobId = randomUUID()
      await client.query(
        `insert into public.media_deletion_jobs (
           id, bucket, object_key, reason, source_type, status, attempts, max_attempts,
           locked_at, locked_by, claim_token
         ) values ($1, 'private-media', 'images/assets/final/original.jpg',
           'image_hard_deleted', 'image', 'processing', 8, 8,
           now() - interval '20 minutes', 'dead-worker', $2)`,
        [jobId, randomUUID()],
      )
      await setServiceRole(client)

      const claimed = (await client.query(
        'select claimed.id from public.claim_media_deletion_job($1, 900) as claimed',
        ['replacement-worker'],
      )).rows[0].id
      expect(claimed).toBeNull()
      expect((await client.query(
        'select status, last_error from public.media_deletion_jobs where id = $1',
        [jobId],
      )).rows).toEqual([{
        status: 'failed',
        last_error: 'Processing lease expired after final attempt',
      }])
    })
  })
})
