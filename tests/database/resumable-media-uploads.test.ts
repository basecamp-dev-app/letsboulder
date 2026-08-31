import { randomUUID } from 'node:crypto'
import { type PoolClient } from 'pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { createDatabaseTestHarness } from './database-test-harness'

const { pool } = createDatabaseTestHarness({ statement_timeout: 15_000 })

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

async function createUser(client: PoolClient) {
  const id = randomUUID()
  const email = `resumable-${id}@example.test`
  await client.query(
    `insert into auth.users (id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
     values ($1, 'authenticated', 'authenticated', $2, '', now(), '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now())`,
    [id, email],
  )
  await client.query(
    `insert into public.profiles (id, username, email) values ($1, $2, $3)
     on conflict (id) do update set username = excluded.username, email = excluded.email`,
    [id, `resume-${id.slice(0, 12)}`, email],
  )
  return id
}

async function authenticate(client: PoolClient, userId: string) {
  await client.query('set local role authenticated')
  await client.query("select set_config('request.jwt.claims', $1, true)", [JSON.stringify({ role: 'authenticated', sub: userId })])
}

beforeAll(async () => {
  const result = await pool.query("select to_regprocedure('public.finalize_media_upload(uuid,text,text)') is not null as installed")
  if (!result.rows[0].installed) throw new Error('Resumable media upload migration is not installed')
})

afterAll(async () => pool.end())

describe('resumable media uploads', () => {
  it('deduplicates client upload IDs and finalizes ingest idempotently', async () => {
    await transaction(async (client) => {
      const userId = await createUser(client)
      const imageId = randomUUID()
      const clientUploadId = randomUUID()
      const stagingKey = `images/staging/${imageId}/${randomUUID()}/original.jpg`
      await client.query(
        `insert into public.images (
           id, url, created_by, status, storage_provider, storage_bucket, storage_path,
           original_bucket, original_key, original_mime_type, original_bytes,
           processing_status, moderation_status, visibility, client_upload_id, upload_purpose
         ) values ($1, $2, $3, 'pending', 'r2', 'private-media', $4,
           'private-media', $4, 'image/jpeg', 100, 'pending', 'skipped', 'private', $5, 'draft_image')`,
        [imageId, `private://private-media/${stagingKey}`, userId, stagingKey, clientUploadId],
      )
      await client.query('savepoint duplicate_upload')
      await expect(client.query(
        `insert into public.images (id, url, created_by, client_upload_id)
         values ($1, 'private://duplicate', $2, $3)`,
        [randomUUID(), userId, clientUploadId],
      )).rejects.toMatchObject({ code: '23505' })
      await client.query('rollback to savepoint duplicate_upload')
    })
  })

  it('replays finalization without creating another active ingest job', async () => {
    await transaction(async (client) => {
      const userId = await createUser(client)
      const imageId = randomUUID()
      const stagingKey = `images/staging/${imageId}/${randomUUID()}/original.jpg`
       const immutableKey = `images/assets/${imageId}/${'a'.repeat(64)}/original.jpg`
      await client.query(
        `insert into public.images (
           id, url, created_by, status, storage_provider, storage_bucket, storage_path,
           original_bucket, original_key, original_mime_type, original_bytes,
           processing_status, moderation_status, visibility, client_upload_id, upload_purpose
         ) values ($1, $2, $3, 'pending', 'r2', 'private-media', $4,
           'private-media', $4, 'image/jpeg', 100, 'pending', 'skipped', 'private', $5, 'draft_image')`,
        [imageId, `private://private-media/${stagingKey}`, userId, stagingKey, randomUUID()],
      )
      await authenticate(client, userId)

       await client.query('select public.finalize_media_upload($1, $2, $3)', [imageId, immutableKey, 'a'.repeat(64)])
       await client.query('select public.finalize_media_upload($1, $2, $3)', [imageId, immutableKey, 'a'.repeat(64)])

      await client.query('reset role')
      const image = await client.query('select original_key, processing_status from public.images where id = $1', [imageId])
       const jobs = await client.query("select id from public.media_jobs where image_id = $1 and job_type = 'ingest_image'", [imageId])
       const stagingJobs = await client.query(
         "select reason, object_key from public.media_deletion_jobs where image_id = $1",
         [imageId],
       )
       expect(image.rows[0]).toEqual({ original_key: immutableKey, processing_status: 'queued' })
       expect(jobs.rowCount).toBe(1)
       expect(stagingJobs.rows).toEqual([{ reason: 'staging_replaced', object_key: stagingKey }])
    })
  })

  it('delays failed-copy cleanup and cancels it atomically on finalization retry', async () => {
    await transaction(async (client) => {
      const userId = await createUser(client)
      const imageId = randomUUID()
      const stagingKey = `images/staging/${imageId}/${randomUUID()}/original.jpg`
      const immutableKey = `images/assets/${imageId}/${'b'.repeat(64)}/original.jpg`
      await client.query(
        `insert into public.images (
           id, url, created_by, status, storage_provider, storage_bucket, storage_path,
           original_bucket, original_key, original_mime_type, original_bytes,
           processing_status, moderation_status, visibility, client_upload_id, upload_purpose
         ) values ($1, $2, $3, 'pending', 'r2', 'private-media', $4,
           'private-media', $4, 'image/jpeg', 100, 'pending', 'skipped', 'private', $5, 'draft_image')`,
        [imageId, `private://private-media/${stagingKey}`, userId, stagingKey, randomUUID()],
      )
      await authenticate(client, userId)

      await client.query(
        'select public.enqueue_failed_media_upload_copy_cleanup($1, $2, $3)',
        [imageId, stagingKey, immutableKey],
      )
      await client.query(
        'select public.finalize_media_upload($1, $2, $3)',
        [imageId, immutableKey, 'b'.repeat(64)],
      )

      await client.query('reset role')
      const cleanup = await client.query(
        `select status, reason, run_at > created_at + interval '23 hours' AS delayed
         from public.media_deletion_jobs
         where image_id = $1 and object_key = $2`,
        [imageId, immutableKey],
      )
      expect(cleanup.rows).toEqual([{
        status: 'cancelled',
        reason: 'upload_finalize_failed',
        delayed: true,
      }])
    })
  })
})
