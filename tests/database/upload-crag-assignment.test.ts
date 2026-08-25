import { randomUUID } from 'node:crypto'
import { type PoolClient } from 'pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { createDatabaseTestHarness } from './database-test-harness'

const { pool } = createDatabaseTestHarness({ statement_timeout: 15_000 })

async function transaction(run: (client: PoolClient) => Promise<void>) {
  const client = await pool.connect()
  await client.query('begin')
  try {
    await client.query('set local role service_role')
    await run(client)
  } finally {
    await client.query('rollback')
    client.release()
  }
}

beforeAll(async () => {
  const installed = await pool.query(
    `select to_regprocedure('public.ensure_submission_draft_active_crag()') is not null as installed`,
  )
  if (!installed.rows[0].installed) throw new Error('Upload crag assignment migration is not installed')
})

afterAll(async () => pool.end())

describe('upload crag assignment', () => {
  it('ignores deleted crags in direct and legacy-image proximity matches', async () => {
    await transaction(async (client) => {
      const deletedDirectId = randomUUID()
      const activeDirectId = randomUUID()
      const deletedFallbackId = randomUUID()
      const activeFallbackId = randomUUID()

      await client.query(
        `insert into public.crags (id, name, latitude, longitude, type)
         values ($1, 'Deleted direct', 51.5000, -0.1000, 'boulder'),
                ($2, 'Active direct', 51.5005, -0.1000, 'boulder'),
                ($3, 'Deleted fallback', null, null, 'boulder'),
                ($4, 'Active fallback', null, null, 'boulder')`,
        [deletedDirectId, activeDirectId, deletedFallbackId, activeFallbackId],
      )
      await client.query(
        `insert into public.crag_images (crag_id, url, latitude, longitude)
         values ($1, 'https://example.test/deleted.jpg', 52.0000, -0.2000),
                ($2, 'https://example.test/active.jpg', 52.0002, -0.2000)`,
        [deletedFallbackId, activeFallbackId],
      )
      await client.query(
        `update public.crags
         set deleted_at = now(), deletion_reason = 'Database test deletion'
         where id = any($1::uuid[])`,
        [[deletedDirectId, deletedFallbackId]],
      )

      const direct = await client.query(
        `select public.get_upload_context(51.5000, -0.1000)::jsonb #>> '{crag,id}' as crag_id`,
      )
      const fallback = await client.query(
        `select public.get_upload_context(52.0000, -0.2000)::jsonb #>> '{crag,id}' as crag_id`,
      )

      expect(direct.rows[0].crag_id).toBe(activeDirectId)
      expect(fallback.rows[0].crag_id).toBe(activeFallbackId)
    })
  })

  it('rejects draft assignments to a crag deleted after draft creation', async () => {
    await transaction(async (client) => {
      const userId = randomUUID()
      const cragId = randomUUID()
      const draftId = randomUUID()
      const email = `inactive-crag-${userId}@example.test`

      await client.query(
        `insert into auth.users (
           id, aud, role, email, encrypted_password, email_confirmed_at,
           raw_app_meta_data, raw_user_meta_data, created_at, updated_at
         ) values ($1, 'authenticated', 'authenticated', $2, '', now(),
           '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now())`,
        [userId, email],
      )
      await client.query(
        `insert into public.crags (id, name, type) values ($1, 'Deleted draft crag', 'boulder')`,
        [cragId],
      )
      await client.query(
        `insert into public.submission_drafts (id, user_id, crag_id, metadata)
         values ($1, $2, $3, '{}'::jsonb)`,
        [draftId, userId, cragId],
      )
      await client.query(
        `update public.crags
         set deleted_at = now(), deletion_reason = 'Database test deletion'
         where id = $1`,
        [cragId],
      )

      await expect(client.query(
        'update public.submission_drafts set crag_id = $1 where id = $2',
        [cragId, draftId],
      )).rejects.toMatchObject({ detail: 'inactive_crag' })
    })
  })
})
