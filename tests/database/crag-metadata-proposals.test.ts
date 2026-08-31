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

async function expectedFailure(client: PoolClient, sql: string, values: unknown[] = []) {
  const savepoint = `expected_${randomUUID().replaceAll('-', '')}`
  await client.query(`savepoint ${savepoint}`)
  try {
    await client.query(sql, values)
    throw new Error('Expected query to fail')
  } catch (error) {
    await client.query(`rollback to savepoint ${savepoint}`)
    await client.query(`release savepoint ${savepoint}`)
    if (error instanceof Error && error.message === 'Expected query to fail') throw error
    return error instanceof Error ? error.message : String(error)
  }
}

async function createUser(client: PoolClient, isAdmin = false) {
  const id = randomUUID()
  const email = `crag-proposal-${id}@example.test`
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
    [id, `crag-proposal-${id.slice(0, 8)}`, email, isAdmin],
  )
  return id
}

async function createCrag(client: PoolClient, createdBy: string | null = null) {
  const id = randomUUID()
  await client.query(
    `insert into public.crags (
       id, name, type, country_code, region_name, sub_area, slug, created_by
      ) values ($1, 'Original Crag', 'boulder', 'GB', 'Old Region', 'Old Area', $2, $3)`,
    [id, `proposal-${id}`, createdBy],
  )
  return id
}

async function createImage(client: PoolClient, userId: string, cragId: string) {
  const id = randomUUID()
  await client.query(
    `insert into public.images (
       id, url, created_by, crag_id, place_id, status, visibility,
       processing_status, moderation_status, storage_provider, storage_bucket,
       storage_path, original_bucket, original_key, processed_at, location_mode
     ) values ($1, $2, $3, $4, $4, 'approved', 'public', 'ready', 'approved',
       'r2', 'database-tests', $5, 'database-tests', $5, now(), 'shared')`,
    [id, `https://example.test/${id}.jpg`, userId, cragId, `images/${id}.jpg`],
  )
  return id
}

async function assignMaintainer(
  client: PoolClient,
  adminId: string,
  cragId: string,
  userId: string,
) {
  await setAuthenticatedRole(client, adminId)
  await client.query('select public.set_crag_maintainer($1, $2, true)', [cragId, userId])
}

async function propose(
  client: PoolClient,
  userId: string,
  cragId: string,
  mutationId = randomUUID(),
  name = 'Proposed Crag',
  region = 'New Region',
  subArea: string | null = 'New Area',
  sourceImageId: string | null = null,
  reason = 'The current metadata is inaccurate and needs correction.',
) {
  await setAuthenticatedRole(client, userId)
  const result = await client.query(
    `select public.propose_crag_metadata($1, $2, $3, $4, $5, $6, $7) as result`,
    [cragId, mutationId, name, region, reason, subArea, sourceImageId],
  )
  return result.rows[0].result as {
    proposalId: string
    status: string
    baseRevisionId: string
    replayed: boolean
  }
}

beforeAll(async () => {
  const migration = await pool.query(
    `select to_regprocedure('public.propose_crag_metadata(uuid,uuid,text,text,text,text,uuid)') is not null
       and to_regprocedure('public.review_crag_metadata_proposal(uuid,text,text)') is not null as installed`,
  )
  if (!migration.rows[0].installed) throw new Error('Crag metadata proposal migration is not installed')
})

afterAll(async () => pool.end())

describe('crag metadata proposals', () => {
  it('allows only the creator to link an initial empty crag and blocks direct edges once shared', async () => {
    await transaction(async (client) => {
      const creatorId = await createUser(client)
      const attackerId = await createUser(client)
      const emptyCragId = await createCrag(client, creatorId)
      const sharedCragId = await createCrag(client, creatorId)
      const proposedCragId = await createCrag(client, creatorId)
      const tagId = randomUUID()
      await client.query(
        `insert into public.location_tags (id, kind, name, slug, country_code)
         values ($1, 'region', 'Policy Region', $2, 'GB')`,
        [tagId, `policy-${tagId}`],
      )

      await setAuthenticatedRole(client, attackerId)
      expect(await expectedFailure(
        client,
        `insert into public.crag_location_tags (crag_id, tag_id, is_primary_region)
         values ($1, $2, true)`,
        [emptyCragId, tagId],
      )).toContain('row-level security')

      await setAuthenticatedRole(client, creatorId)
      await client.query(
        `insert into public.crag_location_tags (crag_id, tag_id, is_primary_region)
         values ($1, $2, true)`,
        [emptyCragId, tagId],
      )

      await propose(client, creatorId, proposedCragId)
      expect(await expectedFailure(
        client,
        `insert into public.crag_location_tags (crag_id, tag_id, is_primary_region)
         values ($1, $2, true)`,
        [proposedCragId, tagId],
      )).toContain('row-level security')

      await client.query('reset role')
      await client.query("select set_config('request.jwt.claims', '{\"role\":\"service_role\"}', true)")
      await createImage(client, creatorId, sharedCragId)
      await setAuthenticatedRole(client, creatorId)
      expect(await expectedFailure(
        client,
        `insert into public.crag_location_tags (crag_id, tag_id, is_primary_region)
         values ($1, $2, true)`,
        [sharedCragId, tagId],
      )).toContain('row-level security')
    })
  })

  it('allows only admins to assign crag-scoped maintainers', async () => {
    await transaction(async (client) => {
      const adminId = await createUser(client, true)
      const userId = await createUser(client)
      const outsiderId = await createUser(client)
      const cragId = await createCrag(client)

      await setAuthenticatedRole(client, outsiderId)
      expect(await expectedFailure(
        client,
        'select public.set_crag_maintainer($1, $2, true)',
        [cragId, userId],
      )).toContain('Administrator permission required')

      await assignMaintainer(client, adminId, cragId, userId)
      expect((await client.query(
        'select crag_id from public.crag_maintainers where user_id = $1',
        [userId],
      )).rows).toEqual([{ crag_id: cragId }])

      await setAuthenticatedRole(client, adminId)
      await client.query('select public.set_crag_maintainer($1, $2, false)', [cragId, userId])
      await client.query('reset role')
      expect((await client.query(
        'select count(*)::int as count from public.crag_maintainers where crag_id = $1',
        [cragId],
      )).rows[0].count).toBe(0)
    })
  })

  it('creates an idempotent immutable-head proposal without mutating crag, place, or tags', async () => {
    await transaction(async (client) => {
      const proposerId = await createUser(client)
      const cragId = await createCrag(client)
      const imageId = await createImage(client, proposerId, cragId)
      const mutationId = randomUUID()
      const before = await client.query(
        `select c.name, c.region_name, c.sub_area, p.name as place_name,
           (select count(*)::int from public.crag_location_tags where crag_id = c.id) as tag_count
         from public.crags c join public.places p on p.id = c.id where c.id = $1`,
        [cragId],
      )

      const first = await propose(
        client, proposerId, cragId, mutationId, 'Trimmed Crag', 'North Wales', null, imageId,
        '  The listed region is inaccurate according to local records.  ',
      )
      const replay = await propose(
        client, proposerId, cragId, mutationId, 'Trimmed Crag', 'North Wales', null, imageId,
        'The listed region is inaccurate according to local records.',
      )
      expect(replay).toEqual({ ...first, replayed: true })
      expect(first.status).toBe('pending')
      expect(first.baseRevisionId).toMatch(/^[0-9a-f-]{36}$/)

      await client.query('reset role')
      const after = await client.query(
        `select c.name, c.region_name, c.sub_area, p.name as place_name,
           (select count(*)::int from public.crag_location_tags where crag_id = c.id) as tag_count
         from public.crags c join public.places p on p.id = c.id where c.id = $1`,
        [cragId],
      )
      expect(after.rows[0]).toEqual(before.rows[0])
      expect((await client.query(
        `select count(*)::int as count, min(reason) as reason
         from public.crag_metadata_proposals where crag_id = $1`,
        [cragId],
      )).rows[0]).toEqual({
        count: 1,
        reason: 'The listed region is inaccurate according to local records.',
      })

      await setAuthenticatedRole(client, proposerId)
      expect(await expectedFailure(
        client,
        'select public.propose_crag_metadata($1, $2, $3, $4, $5, $6, $7)',
        [
          cragId, mutationId, 'Trimmed Crag', 'North Wales',
          'A different rationale changes the idempotent payload.', null, imageId,
        ],
      )).toContain('different proposal')

      expect(await expectedFailure(
        client,
        'select public.propose_crag_metadata($1, $2, $3, $4, $5, $6, $7)',
        [cragId, randomUUID(), 'Trimmed Crag', 'North Wales', 'Too short', null, imageId],
      )).toContain('10 to 1000')
      expect(await expectedFailure(
        client,
        'select public.propose_crag_metadata($1, $2, $3, $4, $5, $6, $7)',
        [cragId, randomUUID(), 'Trimmed Crag', 'North Wales', 'x'.repeat(1001), null, imageId],
      )).toContain('10 to 1000')
    })
  })

  it('notifies assigned maintainers and admins once, excluding and deduplicating users', async () => {
    await transaction(async (client) => {
      const proposerId = await createUser(client, true)
      const adminId = await createUser(client, true)
      const maintainerId = await createUser(client)
      const dualRoleId = await createUser(client, true)
      const outsiderId = await createUser(client)
      const cragId = await createCrag(client)
      await assignMaintainer(client, adminId, cragId, maintainerId)
      await assignMaintainer(client, adminId, cragId, dualRoleId)
      const mutationId = randomUUID()
      await client.query('reset role')
      const expectedRecipients = (await client.query(
        `select user_id from (
           select user_id from public.crag_maintainers where crag_id = $1
           union
           select id from public.profiles where is_admin = true
         ) recipients
         where user_id <> $2
         order by user_id`,
        [cragId, proposerId],
      )).rows.map((row) => row.user_id as string)

      const proposal = await propose(client, proposerId, cragId, mutationId)
      await propose(client, proposerId, cragId, mutationId)
      await client.query('reset role')
      const notifications = await client.query(
        `select user_id, type, link
         from public.notifications
         where type = 'crag_metadata_review_requested'
         order by user_id`,
      )
      expect(notifications.rows).toEqual(expectedRecipients.map((userId) => ({
        user_id: userId,
        type: 'crag_metadata_review_requested',
        link: `/maintain/crags?cragId=${cragId}&proposalId=${proposal.proposalId}`,
      })))
      expect(expectedRecipients).toEqual(expect.arrayContaining([adminId, maintainerId, dualRoleId]))
      expect(notifications.rows.some((row) => row.user_id === proposerId)).toBe(false)
      expect(notifications.rows.some((row) => row.user_id === outsiderId)).toBe(false)
    })
  })

  it('limits proposal reads and review to owner, crag scope, and admins and blocks self-review', async () => {
    await transaction(async (client) => {
      const adminId = await createUser(client, true)
      const proposerId = await createUser(client)
      const maintainerId = await createUser(client)
      const outsiderId = await createUser(client)
      const cragId = await createCrag(client)
      await assignMaintainer(client, adminId, cragId, maintainerId)
      const proposal = await propose(client, proposerId, cragId)

      await setAuthenticatedRole(client, outsiderId)
      expect((await client.query(
        'select id from public.crag_metadata_proposals where id = $1',
        [proposal.proposalId],
      )).rows).toEqual([])
      expect(await expectedFailure(
        client,
        `select public.review_crag_metadata_proposal($1, 'approve', null)`,
        [proposal.proposalId],
      )).toContain('permission required')

      await setAuthenticatedRole(client, proposerId)
      expect((await client.query(
        'select id from public.crag_metadata_proposals where id = $1',
        [proposal.proposalId],
      )).rows).toHaveLength(1)
      expect(await expectedFailure(
        client,
        `select public.review_crag_metadata_proposal($1, 'reject', null)`,
        [proposal.proposalId],
      )).toContain('cannot review their own')

      await setAuthenticatedRole(client, maintainerId)
      expect((await client.query(
        'select id from public.crag_metadata_proposals where id = $1',
        [proposal.proposalId],
      )).rows).toHaveLength(1)
      await setAuthenticatedRole(client, adminId)
      expect((await client.query(
        'select id from public.crag_metadata_proposals where id = $1',
        [proposal.proposalId],
      )).rows).toHaveLength(1)
    })
  })

  it('rejects without canonical mutation and cannot review the proposal twice', async () => {
    await transaction(async (client) => {
      const adminId = await createUser(client, true)
      const proposerId = await createUser(client)
      const maintainerId = await createUser(client)
      const cragId = await createCrag(client)
      await assignMaintainer(client, adminId, cragId, maintainerId)
      const proposal = await propose(client, proposerId, cragId)

      await setAuthenticatedRole(client, maintainerId)
      const rejected = await client.query(
        `select public.review_crag_metadata_proposal($1, 'reject', 'Insufficient source') as result`,
        [proposal.proposalId],
      )
      expect(rejected.rows[0].result.status).toBe('rejected')
      expect(await expectedFailure(
        client,
        `select public.review_crag_metadata_proposal($1, 'approve', null)`,
        [proposal.proposalId],
      )).toContain('already been reviewed')

      await client.query('reset role')
      expect((await client.query(
        'select name, region_name, sub_area from public.crags where id = $1',
        [cragId],
      )).rows[0]).toEqual({ name: 'Original Crag', region_name: 'Old Region', sub_area: 'Old Area' })
      expect((await client.query(
        `select type, link from public.notifications
         where user_id = $1 and type = 'crag_metadata_rejected'`,
        [proposerId],
      )).rows).toEqual([{
        type: 'crag_metadata_rejected',
        link: `/maintain/crags?cragId=${cragId}&proposalId=${proposal.proposalId}`,
      }])
    })
  })

  it('atomically approves metadata, primary region edge, place projection, and one immutable revision', async () => {
    await transaction(async (client) => {
      const adminId = await createUser(client, true)
      const proposerId = await createUser(client)
      const maintainerId = await createUser(client)
      const cragId = await createCrag(client)
      await assignMaintainer(client, adminId, cragId, maintainerId)
      const proposal = await propose(
        client,
        proposerId,
        cragId,
        randomUUID(),
        'Approved Crag',
        'Snowdonia',
        'Ogwen Valley',
      )

      await setAuthenticatedRole(client, maintainerId)
      const approval = await client.query(
        `select public.review_crag_metadata_proposal($1, 'approve', 'Verified locally') as result`,
        [proposal.proposalId],
      )
      expect(approval.rows[0].result.status).toBe('approved')
      expect(approval.rows[0].result.commitId).toMatch(/^[0-9a-f-]{36}$/)

      await client.query('reset role')
      const state = await client.query(
        `select c.name, c.region_name, c.sub_area, c.last_edited_by,
           p.name as place_name, p.region_name as place_region,
           t.name as tag_name, clt.is_primary_region,
           proposal.status, proposal.approved_commit_id,
           revision.parent_revision_id, revision.snapshot
         from public.crags c
         join public.places p on p.id = c.id
         join public.crag_location_tags clt on clt.crag_id = c.id and clt.is_primary_region
         join public.location_tags t on t.id = clt.tag_id
         join public.crag_metadata_proposals proposal on proposal.crag_id = c.id
         join public.wiki_entity_revisions revision on revision.commit_id = proposal.approved_commit_id
         where c.id = $1`,
        [cragId],
      )
      expect(state.rows[0]).toMatchObject({
        name: 'Approved Crag',
        region_name: 'Snowdonia',
        sub_area: 'Ogwen Valley',
        last_edited_by: maintainerId,
        place_name: 'Approved Crag',
        place_region: 'Snowdonia',
        tag_name: 'Snowdonia',
        is_primary_region: true,
        status: 'approved',
        approved_commit_id: approval.rows[0].result.commitId,
      })
      expect(state.rows[0].parent_revision_id).toBe(proposal.baseRevisionId)
      expect(state.rows[0].snapshot).toMatchObject({
        name: 'Approved Crag',
        region_name: 'Snowdonia',
        sub_area: 'Ogwen Valley',
      })
      expect(state.rows[0].snapshot.primary_region_tag_id).not.toBeNull()
      expect((await client.query(
        `select type from public.notifications
         where user_id = $1 and type = 'crag_metadata_approved'`,
        [proposerId],
      )).rows).toEqual([{ type: 'crag_metadata_approved' }])
    })
  })

  it('marks approval as conflict when another approval advanced the immutable crag head', async () => {
    await transaction(async (client) => {
      const adminId = await createUser(client, true)
      const firstProposerId = await createUser(client)
      const secondProposerId = await createUser(client)
      const cragId = await createCrag(client)
      const first = await propose(client, firstProposerId, cragId, randomUUID(), 'First Winner', 'First Region')
      const stale = await propose(client, secondProposerId, cragId, randomUUID(), 'Stale Edit', 'Stale Region')
      expect(stale.baseRevisionId).toBe(first.baseRevisionId)

      await setAuthenticatedRole(client, adminId)
      await client.query(
        `select public.review_crag_metadata_proposal($1, 'approve', null)`,
        [first.proposalId],
      )
      const conflict = await client.query(
        `select public.review_crag_metadata_proposal($1, 'approve', null) as result`,
        [stale.proposalId],
      )
      expect(conflict.rows[0].result.status).toBe('conflict')

      await client.query('reset role')
      expect((await client.query(
        'select name, region_name from public.crags where id = $1',
        [cragId],
      )).rows[0]).toEqual({ name: 'First Winner', region_name: 'First Region' })
      expect((await client.query(
        'select status, approved_commit_id from public.crag_metadata_proposals where id = $1',
        [stale.proposalId],
      )).rows[0]).toEqual({ status: 'conflict', approved_commit_id: null })
      expect((await client.query(
        `select type from public.notifications
         where user_id = $1 and type = 'crag_metadata_conflict'`,
        [secondProposerId],
      )).rows).toEqual([{ type: 'crag_metadata_conflict' }])
    })
  })

  it('prevents hard deletion of a crag with proposal history', async () => {
    await transaction(async (client) => {
      const proposerId = await createUser(client)
      const cragId = await createCrag(client)
      await propose(client, proposerId, cragId)
      await client.query('reset role')

      expect(await expectedFailure(
        client,
        'delete from public.crags where id = $1',
        [cragId],
      )).toContain('crag_metadata_proposals')
      expect((await client.query(
        'select id from public.crags where id = $1',
        [cragId],
      )).rows).toEqual([{ id: cragId }])
    })
  })

  it('denies direct proposal writes and the legacy immediate-update RPC', async () => {
    await transaction(async (client) => {
      const userId = await createUser(client)
      const cragId = await createCrag(client)
      const imageId = await createImage(client, userId, cragId)
      const proposal = await propose(client, userId, cragId)

      expect(await expectedFailure(
        client,
        `update public.crag_metadata_proposals set status = 'approved' where id = $1`,
        [proposal.proposalId],
      )).toContain('permission denied')
      expect(await expectedFailure(
        client,
        `select public.update_submission_crag_metadata($1, 'Bypass', 'Bypass', null)`,
        [imageId],
      )).toContain('permission denied')
    })
  })

  it('retains proposal history while nulling deleted proposer and reviewer identities', async () => {
    await transaction(async (client) => {
      const adminId = await createUser(client, true)
      const proposerId = await createUser(client)
      const reviewerId = await createUser(client)
      const cragId = await createCrag(client)
      await assignMaintainer(client, adminId, cragId, reviewerId)
      const proposal = await propose(client, proposerId, cragId)
      await setAuthenticatedRole(client, reviewerId)
      await client.query(
        `select public.review_crag_metadata_proposal($1, 'reject', 'Not accepted')`,
        [proposal.proposalId],
      )

      await client.query('reset role')
      await client.query('delete from auth.users where id = any($1::uuid[])', [[proposerId, reviewerId]])
      expect((await client.query(
        `select proposer_id, reviewer_id, status
         from public.crag_metadata_proposals where id = $1`,
        [proposal.proposalId],
      )).rows[0]).toEqual({ proposer_id: null, reviewer_id: null, status: 'rejected' })
    })
  })
})
