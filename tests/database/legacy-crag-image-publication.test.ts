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

async function setRole(client: PoolClient, role: 'anon' | 'service_role') {
  await client.query('reset role')
  await client.query(`set local role ${role}`)
  await client.query("select set_config('request.jwt.claims', $1, true)", [JSON.stringify({ role })])
}

async function createCrag(client: PoolClient) {
  const id = randomUUID()
  await client.query(
    `insert into public.crags (id, name, type, country_code, slug)
     values ($1, 'Legacy image test', 'boulder', 'GB', $2)`,
    [id, `legacy-image-${id}`],
  )
  await client.query(
    `update public.crags
     set publication_status = 'published', published_at = now()
     where id = $1`,
    [id],
  )
  return id
}

async function createImage(client: PoolClient, cragId: string) {
  const id = randomUUID()
  await client.query(
    `insert into public.images (id, url, crag_id, status, moderation_status, visibility, processing_status)
     values ($1, $2, $3, $4, $5, $6, $7)`,
    [id, `https://example.test/${id}.jpg`, cragId, 'approved', 'skipped', 'public', 'ready'],
  )
  return id
}

async function makeImageIneligible(client: PoolClient, imageId: string, state: 'processing' | 'private' | 'rejected') {
  await setRole(client, 'service_role')
  const values = state === 'processing'
    ? ['approved', 'skipped', 'public', 'processing']
    : state === 'private'
      ? ['approved', 'skipped', 'private', 'ready']
      : ['rejected', 'rejected', 'public', 'ready']
  await client.query(
    'update public.images set status = $2, moderation_status = $3, visibility = $4, processing_status = $5 where id = $1',
    [imageId, ...values],
  )
}

async function createCragImage(client: PoolClient, cragId: string, linkedImageId?: string, sourceImageId?: string) {
  const id = randomUUID()
  await client.query(
    `insert into public.crag_images (id, crag_id, url, linked_image_id, source_image_id)
      values ($1, $2, $3, $4, $5)`,
    [id, cragId, `https://example.test/legacy-${id}.jpg`, linkedImageId ?? null, sourceImageId ?? linkedImageId ?? null],
  )
  return id
}

beforeAll(async () => {
  const installed = await pool.query(
    `select to_regprocedure('public.mark_legacy_crag_image_published(uuid)') is not null as installed`,
  )
  if (!installed.rows[0].installed) throw new Error('Legacy crag image publication migration is not installed')
})

afterAll(async () => pool.end())

describe('legacy crag image publication', () => {
  it('allows anon reads only for explicitly published legacy rows or deliverable linked images', async () => {
    await transaction(async (client) => {
      const cragId = await createCrag(client)
      const unpublished = await createCragImage(client, cragId)
      const marked = await createCragImage(client, cragId)
      const ready = await createCragImage(client, cragId, await createImage(client, cragId))
      const processingImage = await createImage(client, cragId)
      const processing = await createCragImage(client, cragId, processingImage)
      const privateLinkedImage = await createImage(client, cragId)
      const privateImage = await createCragImage(client, cragId, privateLinkedImage)
      const rejectedLinkedImage = await createImage(client, cragId)
      const rejected = await createCragImage(client, cragId, rejectedLinkedImage)

      await setRole(client, 'service_role')
      await client.query('select public.mark_legacy_crag_image_published($1)', [marked])
      await makeImageIneligible(client, processingImage, 'processing')
      await makeImageIneligible(client, privateLinkedImage, 'private')
      await makeImageIneligible(client, rejectedLinkedImage, 'rejected')
      await setRole(client, 'anon')
      const visible = await client.query(
        'select id from public.crag_images where id = any($1::uuid[]) order by id',
        [[unpublished, marked, ready, processing, privateImage, rejected]],
      )
      expect(visible.rows.map((row) => row.id).sort()).toEqual([marked, ready].sort())
    })
  })

  it('hides crag images when the parent crag is deleted', async () => {
    await transaction(async (client) => {
      const cragId = await createCrag(client)
      const cragImageId = await createCragImage(client, cragId, await createImage(client, cragId))
      await client.query('update public.crags set deleted_at = now() where id = $1', [cragId])
      await setRole(client, 'anon')
      expect((await client.query('select id from public.crag_images where id = $1', [cragImageId])).rows).toEqual([])
    })
  })

  it('permits only service role to mark legacy rows and excludes ineligible related faces from the summary', async () => {
    await transaction(async (client) => {
      const cragId = await createCrag(client)
      const primary = await createImage(client, cragId)
      const readyFace = await createCragImage(client, cragId, await createImage(client, cragId), primary)
      const processingImage = await createImage(client, cragId)
      const processingFace = await createCragImage(client, cragId, processingImage, primary)
      const unpublishedFace = await createCragImage(client, cragId, undefined, primary)

      await makeImageIneligible(client, processingImage, 'processing')

      await setRole(client, 'anon')
      await client.query('savepoint rejected_legacy_publication')
      await expect(client.query('select public.mark_legacy_crag_image_published($1)', [unpublishedFace]))
        .rejects.toThrow('permission denied')
      await client.query('rollback to savepoint rejected_legacy_publication')
      for (const role of ['anon', 'service_role'] as const) {
        await setRole(client, role)
        const summary = await client.query(
          `select coalesce(jsonb_agg(face->'crag_image_id'), '[]'::jsonb) as face_ids
           from jsonb_array_elements(public.get_crag_faces_complete_summary($1)->'faces') as face
           where face->>'crag_image_id' is not null`,
          [primary],
        )
        expect(summary.rows[0].face_ids).toEqual([readyFace])
      }
      expect(processingFace).not.toBe(readyFace)
    })
  })
})
