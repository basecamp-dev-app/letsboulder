import { randomUUID } from 'node:crypto'
import { type PoolClient } from 'pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { createDatabaseTestHarness } from './database-test-harness'

const { pool } = createDatabaseTestHarness({ max: 2, statement_timeout: 15_000 })
const bucket = 'lb-prod-media-private'
const digest = `sha256:${'b'.repeat(64)}`

async function transaction(run: (client: PoolClient) => Promise<void>) {
  const client = await pool.connect()
  await client.query('begin')
  try { await run(client) } finally { await client.query('rollback'); client.release() }
}

async function setServiceRole(client: PoolClient) {
  await client.query('reset role')
  await client.query('set local role service_role')
  await client.query("select set_config('request.jwt.claims', '{\"role\":\"service_role\"}', true)")
}

beforeAll(async () => {
  const installed = await pool.query(
    `select to_regprocedure('public.quarantine_missing_media_references(jsonb,bigint,text)') is not null as installed`,
  )
  if (!installed.rows[0].installed) throw new Error('Missing-media quarantine migration is not installed')
})

afterAll(async () => pool.end())

describe('missing media quarantine', () => {
  it('reversibly hides a reviewed missing image while retaining its row', async () => {
    await transaction(async (client) => {
      const id = randomUUID()
      const key = `images/originals/${id}/original.jpg`
      await setServiceRole(client)
      await client.query(
        `insert into public.images (
           id, url, status, visibility, processing_status, moderation_status,
           storage_provider, storage_bucket, storage_path, original_bucket, original_key
         ) values ($1, $2, 'approved', 'public', 'ready', 'approved',
           'r2', $3, $4, $3, $4)`,
        [id, `private://${bucket}/${key}`, bucket, key],
      )
      const items = [{ kind: 'image', id, objectKey: key, status: 'approved', processingStatus: 'ready' }]
      expect((await client.query(
        `select record_kind, record_id::text, action
         from public.quarantine_missing_media_references($1::jsonb, 321, $2)`,
        [JSON.stringify(items), digest],
      )).rows).toEqual([{ record_kind: 'image', record_id: id, action: 'quarantined' }])
      expect((await client.query(
        'select status, visibility, processing_status from public.images where id = $1', [id],
      )).rows).toEqual([{ status: 'pending', visibility: 'private', processing_status: 'failed' }])
      expect((await client.query(
        'select record_kind, record_id::text, object_key, source_run_id::integer from public.media_quarantine_events where record_id = $1',
        [id],
      )).rows).toEqual([{ record_kind: 'image', record_id: id, object_key: key, source_run_id: 321 }])
    })
  })

  it('rejects state drift and non-service callers', async () => {
    await transaction(async (client) => {
      const id = randomUUID()
      const key = `images/originals/${id}/original.jpg`
      await setServiceRole(client)
      await client.query(
        `insert into public.images (
           id, url, status, visibility, processing_status, moderation_status,
           storage_provider, storage_bucket, storage_path, original_bucket, original_key
         ) values ($1, $2, 'approved', 'public', 'ready', 'approved',
           'r2', $3, $4, $3, $4)`,
        [id, `private://${bucket}/${key}`, bucket, key],
      )
      const drifted = [{ kind: 'image', id, objectKey: key, status: 'pending', processingStatus: 'ready' }]
      await expect(client.query(
        'select * from public.quarantine_missing_media_references($1::jsonb, 321, $2)',
        [JSON.stringify(drifted), digest],
      )).rejects.toThrow(/changed after reviewed reconciliation/)

      await client.query('set local role authenticated')
      await client.query("select set_config('request.jwt.claims', '{\"role\":\"authenticated\"}', true)")
      await expect(client.query(
        'select * from public.quarantine_missing_media_references($1::jsonb, 321, $2)',
        [JSON.stringify(drifted), digest],
      )).rejects.toThrow(/permission denied/)
    })
  })
})
