import { randomUUID } from 'node:crypto'
import { type PoolClient } from 'pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { createDatabaseTestHarness } from './database-test-harness'

const { pool } = createDatabaseTestHarness({ max: 2, statement_timeout: 20_000 })
const bucket = 'lb-prod-media-private'
const artifactDigest = `sha256:${'a'.repeat(64)}`
const reconciliationRunId = 123

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

function orphanKey(imageId = randomUUID(), name = 'orphan.jpg') {
  return `images/originals/${imageId}/${name}`
}

async function enqueue(client: PoolClient, keys: string[], selectedBucket = bucket) {
  return client.query(
    `select object_key, job_id::text
     from public.enqueue_reconciled_media_orphans(
       $1, $2::text[], $3::text[], $4::bigint[], $5::bigint, $6::text
     )`,
    [selectedBucket, keys, keys.map(() => 'reviewed-etag'), keys.map(() => 123), reconciliationRunId, artifactDigest],
  )
}

beforeAll(async () => {
  const result = await pool.query(
    `select to_regprocedure(
       'public.enqueue_reconciled_media_orphans(text,text[],text[],bigint[],bigint,text)'
     ) is not null as installed`,
  )
  if (!result.rows[0].installed) throw new Error('Reconciled R2 orphan migration is not installed')
})

afterAll(async () => pool.end())

describe('reconciled R2 orphan enqueue', () => {
  it('atomically enqueues validated keys with namespace-derived metadata', async () => {
    await transaction(async (client) => {
      const imageIds = [randomUUID(), randomUUID()]
      const keys = imageIds.map((id, index) => orphanKey(id, `orphan-${index}.jpg`))
      await setServiceRole(client)

      const enqueued = (await enqueue(client, keys)).rows
      const jobIds = enqueued.map((row) => row.job_id)
      expect(jobIds).toHaveLength(2)
      expect(enqueued.map((row) => row.object_key)).toEqual(keys)
      expect((await client.query(
        `select id, bucket, object_key, reason, source_type, source_id, image_id, status,
           expected_object_etag, expected_object_bytes::integer, reconciliation_run_id::integer,
           reconciliation_artifact_digest
         from public.media_deletion_jobs where id = any($1::uuid[])
         order by array_position($1::uuid[], id)`,
        [jobIds],
      )).rows).toEqual(keys.map((key, index) => ({
        id: jobIds[index],
        bucket,
        object_key: key,
        reason: 'reconciled_orphan',
        source_type: 'image',
        source_id: imageIds[index],
        image_id: imageIds[index],
        status: 'queued',
        expected_object_etag: 'reviewed-etag',
        expected_object_bytes: 123,
        reconciliation_run_id: reconciliationRunId,
        reconciliation_artifact_digest: artifactDigest,
      })))
    })
  })

  it('allows only service role execution', async () => {
    await transaction(async (client) => {
      await client.query('set local role authenticated')
      await client.query("select set_config('request.jwt.claims', '{\"role\":\"authenticated\"}', true)")

      await expect(enqueue(client, [orphanKey()])).rejects.toThrow('permission denied')
    })
  })

  it('rejects reconciled orphan rows without complete durable proof', async () => {
    await transaction(async (client) => {
      const imageId = randomUUID()
      await setServiceRole(client)

      await expect(client.query(
        `insert into public.media_deletion_jobs
           (bucket, object_key, reason, source_type, source_id, image_id)
         values ($1, $2, 'reconciled_orphan', 'image', $3, $3)`,
        [bucket, orphanKey(imageId), imageId],
      )).rejects.toThrow('media_deletion_jobs_reconciled_orphan_proof_check')
    })
  })

  it.each([
    ['wrong bucket', [orphanKey()], 'another-bucket'],
    ['empty batch', [], bucket],
    ['malformed namespace', ['images/originals/not-a-uuid/orphan.jpg'], bucket],
    ['wrong prefix', [`images/assets/${randomUUID()}/orphan.jpg`], bucket],
    ['empty suffix', [`images/originals/${randomUUID()}/`], bucket],
  ])('rejects %s', async (_label, keys, selectedBucket) => {
    await transaction(async (client) => {
      await setServiceRole(client)
      await expect(enqueue(client, keys, selectedBucket)).rejects.toThrow()
    })
  })

  it('rejects oversized batches and duplicate keys', async () => {
    await transaction(async (client) => {
      await setServiceRole(client)
      const duplicate = orphanKey()
      await expect(enqueue(client, [duplicate, duplicate])).rejects.toThrow('must be unique')
    })
  })

  it('rejects oversized batches', async () => {
    await transaction(async (client) => {
      await setServiceRole(client)
      await expect(enqueue(client, Array.from({ length: 26 }, () => orphanKey())))
        .rejects.toThrow('between 1 and 25')
    })
  })

  it('returns the original active job for exact replays', async () => {
    await transaction(async (client) => {
      const key = orphanKey()
      await setServiceRole(client)
      const first = (await enqueue(client, [key])).rows[0].job_id

      const replay = (await enqueue(client, [key])).rows[0].job_id
      expect(replay).toBe(first)
      expect((await client.query(
        'select count(*)::integer as count from public.media_deletion_jobs where object_key = $1',
        [key],
      )).rows[0].count).toBe(1)
    })
  })

  it('allows a newly reviewed job after terminal work', async () => {
    await transaction(async (client) => {
      const key = orphanKey()
      await setServiceRole(client)
      const first = (await enqueue(client, [key])).rows[0].job_id
      await client.query(
        `update public.media_deletion_jobs
         set status = 'failed', last_error = 'prior terminal failure' where id = $1`,
        [first],
      )

      const replay = (await enqueue(client, [key])).rows[0].job_id
      expect(replay).not.toBe(first)
      expect((await client.query(
        'select count(*)::integer as count from public.media_deletion_jobs where object_key = $1',
        [key],
      )).rows[0].count).toBe(2)
    })
  })

  it('rejects namespaces belonging to existing images', async () => {
    await transaction(async (client) => {
      const imageId = randomUUID()
      const imageKey = orphanKey(imageId)
      await client.query(
        `insert into public.images (id, url, storage_provider)
         values ($1, 'private://existing', 'r2')`,
        [imageId],
      )
      await setServiceRole(client)

      await expect(enqueue(client, [imageKey])).rejects.toThrow('existing image')
    })
  })

  it('rejects conflicting work without partially enqueueing the batch', async () => {
    await transaction(async (client) => {
      const freshKey = orphanKey()
      const conflictKey = orphanKey()
      const conflictId = randomUUID()
      await client.query(
        `insert into public.media_deletion_jobs
           (bucket, object_key, reason, source_type, source_id, image_id)
         values ($1, $2, 'image_hard_deleted', 'image', $3, $3)`,
        [bucket, conflictKey, conflictId],
      )
      await setServiceRole(client)
      await client.query('savepoint conflicting_batch')

      await expect(enqueue(client, [freshKey, conflictKey])).rejects.toThrow('Conflicting deletion work')
      await client.query('rollback to savepoint conflicting_batch')
      expect((await client.query(
        'select id from public.media_deletion_jobs where object_key = $1',
        [freshKey],
      )).rows).toEqual([])
    })
  })

  it.each([
    ['text', (key: string) => [key, null, null]],
    ['json', (key: string) => [null, JSON.stringify({ historical: { locator: key } }), null]],
    ['text array', (key: string) => [null, null, [key]]],
  ])('rejects persisted %s references', async (_label, values) => {
    await transaction(async (client) => {
      const key = orphanKey()
      await client.query(
        `create table public.reconciled_orphan_reference_fixture (
           current_locator text,
           historical_snapshot jsonb,
           structured_locators text[]
         )`,
      )
      const [textValue, jsonValue, arrayValue] = values(key)
      await client.query(
        `insert into public.reconciled_orphan_reference_fixture values ($1, $2::jsonb, $3::text[])`,
        [textValue, jsonValue, arrayValue],
      )
      await setServiceRole(client)

      await expect(enqueue(client, [key])).rejects.toThrow('is referenced by')
    })
  })

  it('rechecks references against the claimed job immediately before deletion', async () => {
    await transaction(async (client) => {
      const key = orphanKey()
      await setServiceRole(client)
      const jobId = (await enqueue(client, [key])).rows[0].job_id
      const claimToken = randomUUID()
      await client.query(
        `update public.media_deletion_jobs
         set status = 'processing', locked_at = now(), locked_by = 'test', claim_token = $2, attempts = 1
         where id = $1`,
        [jobId, claimToken],
      )
      await client.query('reset role')
      await client.query('create table public.reconciled_orphan_late_reference_fixture (locator text)')
      await client.query('insert into public.reconciled_orphan_late_reference_fixture values ($1)', [key])
      await setServiceRole(client)

      await expect(client.query(
        'select public.verify_reconciled_orphan_deletion($1::uuid, $2::uuid)',
        [jobId, claimToken],
      )).rejects.toThrow('acquired a reference')
    })
  })

  it('reserves active orphan namespaces and locators against new writes', async () => {
    await transaction(async (client) => {
      const imageId = randomUUID()
      const key = orphanKey(imageId)
      await setServiceRole(client)
      await enqueue(client, [key])

      await client.query('savepoint namespace_reservation')
      await expect(client.query(
        `insert into public.images (id, url, storage_provider)
         values ($1, '/unrelated.webp', 'r2')`,
        [imageId],
      )).rejects.toThrow('namespace is reserved')
      await client.query('rollback to savepoint namespace_reservation')

      await client.query('savepoint locator_reservation')
      await expect(client.query(
        `insert into public.images (id, url, storage_provider)
         values ($1, $2, 'r2')`,
        [randomUUID(), `private://${bucket}/${key}`],
      )).rejects.toThrow('locator is reserved')
      await client.query('rollback to savepoint locator_reservation')
    })
  })
})
