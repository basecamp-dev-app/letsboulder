import { randomUUID } from 'node:crypto'
import { type PoolClient } from 'pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { createDatabaseTestHarness } from './database-test-harness'

const { pool } = createDatabaseTestHarness({ max: 4, statement_timeout: 15_000 })

type VoteResult = {
  approval_count: number
  rejection_count: number
  status: string
  vote_action: string
}

async function createUser(client: PoolClient) {
  const id = randomUUID()
  const email = `correction-vote-${id}@example.test`
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
       id, username, email, open_data_consent_version, consent_timestamp
     ) values ($1, $2, $3, public.current_open_data_consent_version(), now())
     on conflict (id) do update set
       username = excluded.username,
       email = excluded.email,
       open_data_consent_version = excluded.open_data_consent_version,
       consent_timestamp = excluded.consent_timestamp`,
    [id, `correction-${id.slice(0, 12)}`, email],
  )
  return id
}

async function createFixture() {
  const client = await pool.connect()
  try {
    const authorId = await createUser(client)
    const voterIds = [
      await createUser(client),
      await createUser(client),
      await createUser(client),
    ]
    const climbId = randomUUID()
    const correctionId = randomUUID()
    await client.query(
      `insert into public.climbs (id, name, grade, status, user_id)
       values ($1, 'Original name', '6A', 'pending', $2)`,
      [climbId, authorId],
    )
    await client.query(
      `insert into public.climb_corrections (
         id, climb_id, user_id, correction_type, suggested_value
       ) values ($1, $2, $3, 'name', '{"name":"Corrected name"}'::jsonb)`,
      [correctionId, climbId, authorId],
    )
    return { authorId, voterIds, climbId, correctionId }
  } finally {
    client.release()
  }
}

async function removeFixture(fixture: Awaited<ReturnType<typeof createFixture>>) {
  await pool.query('delete from public.climb_corrections where id = $1', [fixture.correctionId])
  await pool.query("update public.climbs set status = 'pending' where id = $1", [fixture.climbId])
  await pool.query('delete from public.climbs where id = $1', [fixture.climbId])
  await pool.query('delete from auth.users where id = any($1::uuid[])', [
    [fixture.authorId, ...fixture.voterIds],
  ])
}

async function vote(userId: string, correctionId: string, voteType: 'approve' | 'reject' | null) {
  const client = await pool.connect()
  try {
    await client.query('begin')
    await client.query('set local role authenticated')
    await client.query("select set_config('request.jwt.claims', $1, true)", [
      JSON.stringify({ role: 'authenticated', sub: userId }),
    ])
    const result = await client.query<VoteResult>(
      'select * from public.vote_on_climb_correction($1, $2)',
      [correctionId, voteType],
    )
    await client.query('commit')
    return result.rows[0]
  } catch (error) {
    await client.query('rollback')
    throw error
  } finally {
    client.release()
  }
}

async function correctionState(correctionId: string) {
  const result = await pool.query(
    `select approval_count, rejection_count, status, resolved_at
     from public.climb_corrections where id = $1`,
    [correctionId],
  )
  return result.rows[0]
}

beforeAll(async () => {
  const result = await pool.query(
    `select to_regprocedure('public.vote_on_climb_correction(uuid,text)') is not null as installed`,
  )
  if (!result.rows[0].installed) throw new Error('Atomic correction vote migration is not installed')
})

afterAll(async () => pool.end())

describe('atomic correction votes', () => {
  it('approves a correction atomically at three approvals', async () => {
    const fixture = await createFixture()
    try {
      await vote(fixture.voterIds[0], fixture.correctionId, 'approve')
      await vote(fixture.voterIds[1], fixture.correctionId, 'approve')
      expect(await vote(fixture.voterIds[2], fixture.correctionId, 'approve')).toMatchObject({
        approval_count: 3,
        rejection_count: 0,
        status: 'approved',
        vote_action: 'added',
      })
      expect(await correctionState(fixture.correctionId)).toMatchObject({
        approval_count: 3,
        rejection_count: 0,
        status: 'approved',
      })
    } finally {
      await removeFixture(fixture)
    }
  })

  it('rejects a correction atomically at three rejections', async () => {
    const fixture = await createFixture()
    try {
      await vote(fixture.voterIds[0], fixture.correctionId, 'reject')
      await vote(fixture.voterIds[1], fixture.correctionId, 'reject')
      await vote(fixture.voterIds[2], fixture.correctionId, 'reject')
      expect(await correctionState(fixture.correctionId)).toMatchObject({
        approval_count: 0,
        rejection_count: 3,
        status: 'rejected',
      })
    } finally {
      await removeFixture(fixture)
    }
  })

  it('changes and removes a vote while recalculating both counts', async () => {
    const fixture = await createFixture()
    try {
      await vote(fixture.voterIds[0], fixture.correctionId, 'approve')
      expect(await vote(fixture.voterIds[0], fixture.correctionId, 'reject')).toMatchObject({
        approval_count: 0,
        rejection_count: 1,
        status: 'pending',
        vote_action: 'changed',
      })
      expect(await vote(fixture.voterIds[0], fixture.correctionId, null)).toMatchObject({
        approval_count: 0,
        rejection_count: 0,
        status: 'pending',
        vote_action: 'removed',
      })
    } finally {
      await removeFixture(fixture)
    }
  })

  it('requires an authenticated non-author voter', async () => {
    const fixture = await createFixture()
    const client = await pool.connect()
    try {
      await expect(vote(fixture.authorId, fixture.correctionId, 'approve'))
        .rejects.toThrow('You cannot vote on your own correction')
      await client.query('begin')
      await expect(client.query(
        'select * from public.vote_on_climb_correction($1, $2)',
        [fixture.correctionId, 'approve'],
      )).rejects.toThrow('Authentication required')
      await client.query('rollback')
    } finally {
      client.release()
      await removeFixture(fixture)
    }
  })

  it('serializes concurrent votes without losing counts', async () => {
    const fixture = await createFixture()
    try {
      const [first, second] = await Promise.all([
        vote(fixture.voterIds[0], fixture.correctionId, 'approve'),
        vote(fixture.voterIds[1], fixture.correctionId, 'approve'),
      ])
      expect([first.approval_count, second.approval_count].sort()).toEqual([1, 2])
      expect(await correctionState(fixture.correctionId)).toMatchObject({
        approval_count: 2,
        rejection_count: 0,
        status: 'pending',
      })
    } finally {
      await removeFixture(fixture)
    }
  })
})
