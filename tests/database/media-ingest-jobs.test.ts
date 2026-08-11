import { randomUUID } from 'node:crypto'
import { type PoolClient } from 'pg'
import { afterAll, describe, expect, it } from 'vitest'

import { createDatabaseTestHarness } from './database-test-harness'

const { pool, transaction, close } = createDatabaseTestHarness({
  max: 2,
  statement_timeout: 15_000,
})

async function serviceRole(client: PoolClient) {
  await client.query('set local role service_role')
  await client.query("select set_config('request.jwt.claims', '{\"role\":\"service_role\"}', true)")
}

describe('fenced media ingest jobs', () => {
  it('claims queued jobs and rejects stale completion tokens', async () => {
    await transaction(async (client) => {
      const imageId = randomUUID()
      const jobId = randomUUID()
      await client.query(
        `insert into public.images (id, url, storage_provider, original_bucket, original_key)
         values ($1, 'private://fixture', 'r2', 'private-media', $2)`,
        [imageId, `images/assets/${imageId}/${'a'.repeat(64)}/original.jpg`],
      )
      await client.query(
        `insert into public.media_jobs (id, image_id, job_type, payload)
         values ($1, $2, 'ingest_image', '{}'::jsonb)`,
        [jobId, imageId],
      )
      await serviceRole(client)
      const claimed = (await client.query(
        'select * from public.claim_media_job($1, 900)', ['ingest-test'],
      )).rows[0]
      expect(claimed).toMatchObject({ id: jobId, status: 'processing', attempts: 1, locked_by: 'ingest-test' })
      expect(claimed.claim_token).toBeTruthy()
      await client.query('savepoint stale')
      await expect(client.query(
        'select public.complete_media_job($1, $2)', [jobId, randomUUID()],
      )).rejects.toThrow('claim is no longer active')
      await client.query('rollback to savepoint stale')
      await client.query('select public.complete_media_job($1, $2)', [jobId, claimed.claim_token])
      expect((await client.query('select status, completed_at is not null as completed from public.media_jobs where id=$1', [jobId])).rows)
        .toEqual([{ status: 'completed', completed: true }])
    })
  })

  it('reclaims expired processing leases with a new token', async () => {
    await transaction(async (client) => {
      const imageId = randomUUID()
      const jobId = randomUUID()
      const oldToken = randomUUID()
      await client.query(
        `insert into public.images (id, url, storage_provider, original_bucket, original_key)
         values ($1, 'private://fixture', 'r2', 'private-media', $2)`,
        [imageId, `images/assets/${imageId}/${'b'.repeat(64)}/original.jpg`],
      )
      await client.query(
        `insert into public.media_jobs
          (id, image_id, job_type, payload, status, attempts, locked_at, locked_by, claim_token, lease_expires_at)
         values ($1, $2, 'ingest_image', '{}'::jsonb, 'processing', 1, now() - interval '20 minutes', 'dead-worker', $3, now() - interval '10 minutes')`,
        [jobId, imageId, oldToken],
      )
      await serviceRole(client)
      const claimed = (await client.query('select * from public.claim_media_job($1, 900)', ['replacement-worker'])).rows[0]
      expect(claimed.id).toBe(jobId)
      expect(claimed.claim_token).not.toBe(oldToken)
      await client.query('savepoint stale_retry')
      await expect(client.query('select public.retry_media_job($1, $2, $3)', [jobId, oldToken, 'stale']))
        .rejects.toThrow('claim is no longer active')
      await client.query('rollback to savepoint stale_retry')
    })
  })
})

afterAll(close)
