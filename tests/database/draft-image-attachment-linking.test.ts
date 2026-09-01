import { randomUUID } from 'node:crypto'
import { type PoolClient } from 'pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { createDatabaseTestHarness } from './database-test-harness'

const { pool, transaction } = createDatabaseTestHarness({ max: 2, statement_timeout: 15_000 })

type Fixture = {
  collaboratorId: string
  draftId: string
  otherUserId: string
  ownerId: string
  updatedAt: Date
}

async function createUser(client: PoolClient, label: string) {
  const id = randomUUID()
  const email = `draft-attachment-${label}-${id}@example.test`
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
    [id, `draft-attachment-${label}-${id.slice(0, 8)}`, email],
  )
  return id
}

async function createFixture(client: PoolClient): Promise<Fixture> {
  const ownerId = await createUser(client, 'owner')
  const collaboratorId = await createUser(client, 'collaborator')
  const otherUserId = await createUser(client, 'other')
  const draftId = randomUUID()
  await client.query(
    'insert into public.submission_drafts (id, user_id) values ($1, $2)',
    [draftId, ownerId],
  )
  await client.query(
    `insert into public.submission_draft_collaborators (draft_id, user_id, created_by)
     values ($1, $2, $3)`,
    [draftId, collaboratorId, ownerId],
  )
  const updatedAt = (await client.query(
    'select updated_at from public.submission_drafts where id = $1',
    [draftId],
  )).rows[0].updated_at as Date
  return { collaboratorId, draftId, otherUserId, ownerId, updatedAt }
}

async function insertImage(client: PoolClient, ownerId: string, imageId = randomUUID()) {
  const bucket = 'private-media'
  const path = `images/assets/${imageId}/${'a'.repeat(64)}/original.jpg`
  await client.query(
    `insert into public.images (
       id, url, created_by, storage_provider, storage_bucket, storage_path,
       original_bucket, original_key, processing_status, moderation_status,
       visibility, status
     ) values ($1, 'private://pending', $2, 'r2', $3, $4, $3, $4,
       'processing', 'skipped', 'private', 'pending')`,
    [imageId, ownerId, bucket, path],
  )
  return { bucket, imageId, path }
}

async function setAuthenticatedContext(client: PoolClient, userId: string) {
  await client.query('set local role authenticated')
  await client.query("select set_config('request.jwt.claims', $1, true)", [
    JSON.stringify({ sub: userId, role: 'authenticated' }),
  ])
}

async function setServiceContext(client: PoolClient) {
  await client.query('set local role service_role')
  await client.query("select set_config('request.jwt.claims', '{\"role\":\"service_role\"}', true)")
}

function payload(image: { bucket: string; imageId: string; path: string }) {
  return [{
    linked_image_id: image.imageId,
    storage_bucket: image.bucket,
    storage_path: image.path,
    width: 1200,
    height: 800,
    route_data: {},
  }]
}

async function append(
  client: PoolClient,
  draftId: string,
  images: Array<Record<string, unknown>>,
  expectedUpdatedAt: Date,
) {
  return client.query(
    'select public.append_submission_draft_images_atomic($1, $2::jsonb, $3) as result',
    [draftId, JSON.stringify(images), expectedUpdatedAt],
  )
}

beforeAll(async () => {
  const installed = await pool.query(
    `select to_regprocedure(
       'public.append_submission_draft_images_atomic(uuid,jsonb,timestamp with time zone)'
     ) is not null as installed`,
  )
  if (!installed.rows[0].installed) throw new Error('Draft attachment RPC is not installed')
})

afterAll(async () => pool.end())

describe('draft image attachment linking', () => {
  it('persists the supplied authoritative image link and passes publication readiness', async () => {
    await transaction(async (client) => {
      const fixture = await createFixture(client)
      const image = await insertImage(client, fixture.ownerId)
      await setAuthenticatedContext(client, fixture.ownerId)

      await append(client, fixture.draftId, payload(image), fixture.updatedAt)
      const stored = (await client.query(
        `select linked_image_id, storage_bucket, storage_path
         from public.submission_draft_images where draft_id = $1`,
        [fixture.draftId],
      )).rows[0]
      expect(stored).toEqual({
        linked_image_id: image.imageId,
        storage_bucket: image.bucket,
        storage_path: image.path,
      })

      await setServiceContext(client)
      await client.query(
        `update public.images set processing_status = 'ready', moderation_status = 'skipped',
           visibility = 'public', status = 'approved' where id = $1`,
        [image.imageId],
      )
      await setAuthenticatedContext(client, fixture.ownerId)
      await expect(client.query(
        'select public.assert_media_ready_for_publication(array[$1]::uuid[])',
        [stored.linked_image_id],
      )).resolves.toBeDefined()
    })
  })

  it('allows a collaborator to attach an image they own and preserves conflict behavior', async () => {
    await transaction(async (client) => {
      const fixture = await createFixture(client)
      const image = await insertImage(client, fixture.collaboratorId)
      await setAuthenticatedContext(client, fixture.collaboratorId)

      const result = (await append(client, fixture.draftId, payload(image), fixture.updatedAt)).rows[0].result
      expect(result.appended_image_ids).toHaveLength(1)
      expect((await client.query(
        'select last_edited_by from public.submission_drafts where id = $1',
        [fixture.draftId],
      )).rows[0].last_edited_by).toBe(fixture.collaboratorId)

      await client.query('savepoint stale_revision')
      await expect(append(client, fixture.draftId, payload(image), fixture.updatedAt))
        .rejects.toThrow('Draft conflict')
      await client.query('rollback to savepoint stale_revision')
    })
  })

  it.each([
    ['an image owned by another user', 'other_owner'],
    ['a nonexistent image', 'missing_image'],
    ['a mismatched locator', 'locator_mismatch'],
  ])('rejects %s', async (_label, mode) => {
    await transaction(async (client) => {
      const fixture = await createFixture(client)
      const image = await insertImage(
        client,
        mode === 'other_owner' ? fixture.otherUserId : fixture.ownerId,
      )
      const invalidPayload = payload(image)
      if (mode === 'missing_image') invalidPayload[0].linked_image_id = randomUUID()
      if (mode === 'locator_mismatch') invalidPayload[0].storage_path = `${image.path}.wrong`
      await setAuthenticatedContext(client, fixture.ownerId)

      await expect(append(client, fixture.draftId, invalidPayload, fixture.updatedAt))
        .rejects.toThrow('Uploaded image record')
    })
  })

  it('rejects a missing image link and rolls back a mixed valid/invalid append', async () => {
    await transaction(async (client) => {
      const fixture = await createFixture(client)
      const valid = await insertImage(client, fixture.ownerId)
      const invalid = await insertImage(client, fixture.otherUserId)
      await setAuthenticatedContext(client, fixture.ownerId)

      await client.query('savepoint missing_link')
      await expect(append(client, fixture.draftId, [{
        storage_bucket: valid.bucket,
        storage_path: valid.path,
      }], fixture.updatedAt)).rejects.toThrow('Uploaded image record is required')
      await client.query('rollback to savepoint missing_link')

      await client.query('savepoint atomic_append')
      await expect(append(
        client,
        fixture.draftId,
        [...payload(valid), ...payload(invalid)],
        fixture.updatedAt,
      )).rejects.toThrow('Uploaded image record')
      await client.query('rollback to savepoint atomic_append')

      expect((await client.query(
        'select count(*)::integer as count from public.submission_draft_images where draft_id = $1',
        [fixture.draftId],
      )).rows[0].count).toBe(0)
    })
  })

  it('links an exact current asset path in the defence-in-depth trigger', async () => {
    await transaction(async (client) => {
      const fixture = await createFixture(client)
      const image = await insertImage(client, fixture.ownerId)
      await setAuthenticatedContext(client, fixture.ownerId)

      await client.query(
        `insert into public.submission_draft_images (
           draft_id, display_order, storage_bucket, storage_path
         ) values ($1, 0, $2, $3)`,
        [fixture.draftId, image.bucket, image.path],
      )
      expect((await client.query(
        'select linked_image_id from public.submission_draft_images where draft_id = $1',
        [fixture.draftId],
      )).rows[0].linked_image_id).toBe(image.imageId)
    })
  })
})
