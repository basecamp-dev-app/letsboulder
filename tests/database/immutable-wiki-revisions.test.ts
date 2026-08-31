import { randomUUID } from 'node:crypto'
import { type PoolClient } from 'pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { createDatabaseTestHarness } from './database-test-harness'

const { pool } = createDatabaseTestHarness({ max: 2, statement_timeout: 15_000 })

async function transaction(run: (client: PoolClient) => Promise<void>) {
  const client = await pool.connect()
  await client.query('begin')
  try {
    await client.query("select set_config('request.jwt.claims', '{\"role\":\"service_role\"}', true)")
    await run(client)
  } finally {
    await client.query('rollback')
    client.release()
  }
}

async function setAuthenticatedRole(client: PoolClient, userId: string) {
  await client.query('reset role')
  await client.query('set local role authenticated')
  await client.query("select set_config('request.jwt.claims', $1, true)", [
    JSON.stringify({ role: 'authenticated', sub: userId }),
  ])
}

async function createUser(client: PoolClient, isAdmin = false) {
  const id = randomUUID()
  const email = `wiki-revision-${id}@example.test`
  await client.query(
    `insert into auth.users (
       id, aud, role, email, encrypted_password, email_confirmed_at,
       raw_app_meta_data, raw_user_meta_data, created_at, updated_at
     ) values ($1, 'authenticated', 'authenticated', $2, '', now(),
       '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now())`,
    [id, email],
  )
  await client.query(
    `insert into public.profiles (
       id, username, email, is_admin, open_data_consent_version, consent_timestamp
     ) values ($1, $2, $3, $4, public.current_open_data_consent_version(), now())
     on conflict (id) do update set
       username = excluded.username,
       email = excluded.email,
       is_admin = excluded.is_admin,
       open_data_consent_version = excluded.open_data_consent_version,
       consent_timestamp = excluded.consent_timestamp`,
    [id, `revision-${id.slice(0, 12)}`, email, isAdmin],
  )
  return id
}

async function createImage(client: PoolClient, userId: string) {
  const id = randomUUID()
  await client.query(
    `insert into public.images (
       id, url, created_by, status, visibility, processing_status,
       moderation_status, storage_provider, storage_bucket, storage_path,
       original_bucket, original_key, processed_at, location_mode
     ) values ($1, $2, $3, 'approved', 'public', 'ready', 'approved', 'r2',
       'database-tests', $4, 'database-tests', $4, now(), 'shared')`,
    [id, `https://example.test/${id}.jpg`, userId, `images/${id}.jpg`],
  )
  return id
}

function createOperations(clientRouteId: string) {
  return {
    baseRevision: 0,
    imageMetadata: {
      latitude: null,
      longitude: null,
      locationMode: 'shared',
      faceDirections: ['N'],
    },
    createRoutes: [{
      clientRouteId,
      name: 'Revision route',
      grade: '6B',
      climbType: 'boulder',
      description: 'Original description',
      points: [{ x: 0.1, y: 0.9 }, { x: 0.8, y: 0.1 }],
      sequenceOrder: 0,
      imageWidth: 1600,
      imageHeight: 1200,
    }],
    updateRoutes: [],
    gradeVotes: [],
  }
}

async function failQuery(client: PoolClient, sql: string, values: unknown[] = []) {
  await client.query('savepoint expected_revision_failure')
  try {
    await client.query(sql, values)
    throw new Error('Expected query to fail')
  } catch (error) {
    await client.query('rollback to savepoint expected_revision_failure')
    if (error instanceof Error && error.message === 'Expected query to fail') throw error
    return error instanceof Error ? error.message : String(error)
  }
}

beforeAll(async () => {
  const migration = await pool.query(
    `select to_regprocedure('public.rollback_wiki_entity_revision(uuid,uuid,text)') is not null as installed`,
  )
  if (!migration.rows[0].installed) throw new Error('Immutable wiki revision migration is not installed')
})

afterAll(async () => pool.end())

describe('immutable wiki revisions', () => {
  it('captures a pre-edit baseline and groups authoritative entity snapshots in one commit', async () => {
    await transaction(async (client) => {
      const userId = await createUser(client)
      const imageId = await createImage(client, userId)
      const clientRouteId = randomUUID()
      await setAuthenticatedRole(client, userId)

      const edit = await client.query(
        'select public.apply_published_submission_edit($1, $2, $3::jsonb) as result',
        [imageId, randomUUID(), JSON.stringify(createOperations(clientRouteId))],
      )
      const result = edit.rows[0].result
      expect(result.commitId).toMatch(/^[0-9a-f-]{36}$/)

      await client.query('reset role')
      const revisions = await client.query(
        `select e.entity_kind, r.revision_number, r.parent_revision_id, r.patch,
           r.content_hash, r.commit_id, c.revision_kind
         from public.wiki_entities e
         join public.wiki_entity_revisions r on r.entity_id = e.id
         join public.wiki_revision_commits c on c.id = r.commit_id
         where e.image_id = $1
            or e.route_line_id = $2
            or e.climb_id = $3
         order by e.entity_kind, r.revision_number`,
        [imageId, result.routeMappings[0].routeLineId, result.routeMappings[0].climbId],
      )

      expect(revisions.rows.map((row) => [row.entity_kind, row.revision_number, row.revision_kind])).toEqual([
        ['climb', '1', 'edit'],
        ['image', '1', 'baseline'],
        ['image', '2', 'edit'],
        ['route_line', '1', 'edit'],
      ])
      expect(revisions.rows.every((row) => /^[0-9a-f]{64}$/.test(row.content_hash))).toBe(true)
      const imageEdit = revisions.rows.find((row) => row.entity_kind === 'image' && row.revision_number === '2')
      expect(imageEdit.parent_revision_id).not.toBeNull()
      expect(imageEdit.patch).toContainEqual({ op: 'replace', path: '/face_directions', value: ['N'] })
      expect(revisions.rows.filter((row) => row.revision_kind === 'edit').every(
        (row) => row.commit_id === result.commitId,
      )).toBe(true)
    })
  })

  it('rejects revision mutation and permits only FK-driven author anonymization', async () => {
    await transaction(async (client) => {
      const userId = await createUser(client)
      const imageId = await createImage(client, userId)
      await setAuthenticatedRole(client, userId)
      const edit = await client.query(
        'select public.apply_published_submission_edit($1, $2, $3::jsonb) as result',
        [imageId, randomUUID(), JSON.stringify(createOperations(randomUUID()))],
      )
      await client.query('reset role')

      const revision = await client.query(
        'select id from public.wiki_entity_revisions where commit_id = $1 limit 1',
        [edit.rows[0].result.commitId],
      )
      expect(await failQuery(
        client,
        `update public.wiki_entity_revisions set snapshot = '{}'::jsonb where id = $1`,
        [revision.rows[0].id],
      )).toContain('immutable')
      expect(await failQuery(
        client,
        'update public.wiki_revision_commits set summary = $2 where id = $1',
        [edit.rows[0].result.commitId, 'Tampered'],
      )).toContain('immutable')

      await client.query(
        'update public.wiki_revision_commits set author_user_id = null where id = $1',
        [edit.rows[0].result.commitId],
      )
      const commit = await client.query(
        'select author_user_id, summary from public.wiki_revision_commits where id = $1',
        [edit.rows[0].result.commitId],
      )
      expect(commit.rows[0]).toEqual({ author_user_id: null, summary: 'Updated published submission' })
    })
  })

  it('revisions every linked image changed by shared-location synchronization', async () => {
    await transaction(async (client) => {
      const userId = await createUser(client)
      const sourceImageId = await createImage(client, userId)
      const linkedImageId = await createImage(client, userId)
      const cragId = randomUUID()
      await client.query(
        `insert into public.crags (id, name, type, country_code, slug)
         values ($1, 'Linked revision crag', 'boulder', 'GB', $2)`,
        [cragId, `linked-revision-${cragId}`],
      )
      await client.query(
        `update public.images set crag_id = $1, place_id = $1 where id = any($2::uuid[])`,
        [cragId, [sourceImageId, linkedImageId]],
      )
      await client.query(
        `update public.images set latitude = 51, longitude = -1, location_mode = 'custom'
         where id = $1`,
        [linkedImageId],
      )
      await client.query(
        `insert into public.crag_images (crag_id, url, source_image_id, linked_image_id)
         values ($1, $2, $3, $4)`,
        [cragId, `https://example.test/${linkedImageId}.jpg`, sourceImageId, linkedImageId],
      )
      await setAuthenticatedRole(client, userId)

      await client.query(
        'select public.apply_published_submission_edit($1, $2, $3::jsonb)',
        [sourceImageId, randomUUID(), JSON.stringify({
          baseRevision: 0,
          imageMetadata: {
            latitude: null,
            longitude: null,
            locationMode: 'shared',
            faceDirections: [],
          },
          createRoutes: [],
          updateRoutes: [],
          gradeVotes: [],
        })],
      )
      await client.query('reset role')

      const states = await client.query(
        `select e.image_id, h.revision_number, r.snapshot
         from public.wiki_entities e
         join public.wiki_entity_heads h on h.entity_id = e.id
         join public.wiki_entity_revisions r on r.id = h.revision_id
         where e.image_id = any($1::uuid[])
         order by e.image_id`,
        [[sourceImageId, linkedImageId]],
      )
      expect(states.rows).toHaveLength(2)
      const statesByImage = new Map(states.rows.map((row) => [row.image_id, row]))
      expect(statesByImage.get(sourceImageId)?.revision_number).toBe('1')
      expect(statesByImage.get(linkedImageId)?.revision_number).toBe('2')
      expect(states.rows.every((row) => row.snapshot.location_mode === 'shared')).toBe(true)
      expect(states.rows.every((row) => row.snapshot.latitude === null && row.snapshot.longitude === null)).toBe(true)
    })
  })

  it('captures soft deletion and supersession metadata as a new revision', async () => {
    await transaction(async (client) => {
      const userId = await createUser(client)
      const adminId = await createUser(client, true)
      const imageId = await createImage(client, userId)
      await setAuthenticatedRole(client, userId)
      const edit = await client.query(
        'select public.apply_published_submission_edit($1, $2, $3::jsonb) as result',
        [imageId, randomUUID(), JSON.stringify(createOperations(randomUUID()))],
      )
      const climbId = edit.rows[0].result.routeMappings[0].climbId
      await setAuthenticatedRole(client, adminId)
      await client.query('select public.soft_delete_climb($1, $2, null)', [climbId, 'Duplicate climb'])
      await client.query('reset role')

      const revision = await client.query(
        `select h.revision_number, r.snapshot, c.author_kind
         from public.wiki_entities e
         join public.wiki_entity_heads h on h.entity_id = e.id
         join public.wiki_entity_revisions r on r.id = h.revision_id
         join public.wiki_revision_commits c on c.id = r.commit_id
         where e.climb_id = $1`,
        [climbId],
      )
      expect(revision.rows[0].revision_number).toBe('2')
      expect(revision.rows[0].snapshot).toMatchObject({
        deletion_reason: 'Duplicate climb',
        superseded_by: null,
      })
      expect(revision.rows[0].snapshot.deleted_at).toEqual(expect.any(String))
      expect(revision.rows[0].author_kind).toBe('admin')

      const neverEditedClimbId = randomUUID()
      await client.query(
        `insert into public.climbs (id, name, grade, status, route_type, user_id)
         values ($1, 'Never edited climb', '6A', 'approved', 'boulder', $2)`,
        [neverEditedClimbId, userId],
      )
      await setAuthenticatedRole(client, adminId)
      await client.query(
        'select public.soft_delete_climb($1, $2, null)',
        [neverEditedClimbId, 'Invalid duplicate'],
      )
      await client.query('reset role')
      const lazyLifecycle = await client.query(
        `select r.revision_number, r.snapshot->>'deleted_at' as deleted_at
         from public.wiki_entities e
         join public.wiki_entity_revisions r on r.entity_id = e.id
         where e.climb_id = $1 order by r.revision_number`,
        [neverEditedClimbId],
      )
      expect(lazyLifecycle.rows).toHaveLength(2)
      expect(lazyLifecycle.rows[0]).toEqual({ revision_number: '1', deleted_at: null })
      expect(lazyLifecycle.rows[1].revision_number).toBe('2')
      expect(lazyLifecycle.rows[1].deleted_at).toEqual(expect.any(String))
    })
  })

  it('does not expose retained revisions when the source entity is hidden', async () => {
    await transaction(async (client) => {
      const ownerId = await createUser(client)
      const adminId = await createUser(client, true)
      const strangerId = await createUser(client)
      const imageId = await createImage(client, ownerId)
      await setAuthenticatedRole(client, ownerId)
      const edit = await client.query(
        'select public.apply_published_submission_edit($1, $2, $3::jsonb) as result',
        [imageId, randomUUID(), JSON.stringify({
          baseRevision: 0,
          imageMetadata: {
            latitude: null,
            longitude: null,
            locationMode: 'shared',
            faceDirections: ['N'],
          },
          createRoutes: [],
          updateRoutes: [],
          gradeVotes: [],
        })],
      )
      await setAuthenticatedRole(client, adminId)
      await client.query('select public.soft_delete_image($1, $2)', [imageId, 'Hidden revision test'])

      await setAuthenticatedRole(client, strangerId)
      const hidden = await client.query(
        `select
           (select count(*)::int from public.wiki_entities where image_id = $1) as entities,
           (select count(*)::int from public.wiki_revision_commits where id = $2) as commits`,
        [imageId, edit.rows[0].result.commitId],
      )
      expect(hidden.rows[0]).toEqual({ entities: 0, commits: 0 })

      await setAuthenticatedRole(client, adminId)
      const visible = await client.query(
        'select count(*)::int as count from public.wiki_entities where image_id = $1',
        [imageId],
      )
      expect(visible.rows[0].count).toBe(1)
    })
  })

  it('rolls back by creating a new child revision and rejects a stale expected head', async () => {
    await transaction(async (client) => {
      const userId = await createUser(client)
      const adminId = await createUser(client, true)
      const imageId = await createImage(client, userId)
      await setAuthenticatedRole(client, userId)
      await client.query(
        'select public.apply_published_submission_edit($1, $2, $3::jsonb)',
        [imageId, randomUUID(), JSON.stringify(createOperations(randomUUID()))],
      )
      await client.query('reset role')

      const state = await client.query(
        `select baseline.id as baseline_id, head.revision_id as head_id, entity.id as entity_id
         from public.wiki_entities entity
         join public.wiki_entity_heads head on head.entity_id = entity.id
         join public.wiki_entity_revisions baseline on baseline.entity_id = entity.id
           and baseline.revision_number = 1
         where entity.image_id = $1`,
        [imageId],
      )
      await setAuthenticatedRole(client, adminId)
      const rollback = await client.query(
        'select * from public.rollback_wiki_entity_revision($1, $2, $3)',
        [state.rows[0].baseline_id, state.rows[0].head_id, 'Restore original image metadata'],
      )
      expect(rollback.rows[0].entity_id).toBe(state.rows[0].entity_id)

      await client.query('reset role')
      const restored = await client.query(
        `select r.revision_number, r.parent_revision_id, r.restored_from_revision_id,
           c.revision_kind, i.face_directions
         from public.wiki_entities e
         join public.wiki_entity_heads h on h.entity_id = e.id
         join public.wiki_entity_revisions r on r.id = h.revision_id
         join public.wiki_revision_commits c on c.id = r.commit_id
         join public.images i on i.id = e.image_id
         where e.image_id = $1`,
        [imageId],
      )
      expect(restored.rows[0]).toMatchObject({
        revision_number: '3',
        parent_revision_id: state.rows[0].head_id,
        restored_from_revision_id: state.rows[0].baseline_id,
        revision_kind: 'rollback',
        face_directions: [],
      })

      await setAuthenticatedRole(client, adminId)
      expect(await failQuery(
        client,
        'select * from public.rollback_wiki_entity_revision($1, $2, $3)',
        [state.rows[0].head_id, state.rows[0].head_id, 'Use stale head'],
      )).toContain('changed before rollback')
    })
  })
})
