import { randomUUID } from 'node:crypto'
import { type PoolClient } from 'pg'
import { afterAll, describe, expect, it } from 'vitest'

import { createDatabaseTestHarness } from './database-test-harness'

const { transaction, close } = createDatabaseTestHarness()

async function createUser(client: PoolClient) {
  const id = randomUUID()
  await client.query(
    `insert into auth.users (id, aud, role, email, encrypted_password, email_confirmed_at,
       raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
     values ($1, 'authenticated', 'authenticated', $2, '', now(),
       '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now())`,
    [id, `schema-audit-${id}@example.test`],
  )
  await client.query(
    `update public.profiles set open_data_consent_version = public.current_open_data_consent_version(),
       consent_timestamp = now() where id = $1`,
    [id],
  )
  return id
}

async function setRole(client: PoolClient, role: 'anon' | 'authenticated', userId?: string) {
  await client.query('reset role')
  await client.query(`set local role ${role}`)
  await client.query("select set_config('request.jwt.claims', $1, true)", [
    JSON.stringify({ role, ...(userId ? { sub: userId } : {}) }),
  ])
}

describe('schema audit integrity and access contracts', () => {
  afterAll(close)

  it('counts all votes and recomputes both parents when a vote moves', async () => {
    await transaction(async (client) => {
      const voters = [await createUser(client), await createUser(client), await createUser(client)]
      const climbs = [randomUUID(), randomUUID()]
      await client.query(
        `insert into public.climbs (id, name, grade, status, user_id)
         values ($1, 'Vote source', '6A', 'approved', $3), ($2, 'Vote target', '6A', 'approved', $3)`,
        [...climbs, voters[0]],
      )
      for (let index = 0; index < voters.length; index += 1) {
        await setRole(client, 'authenticated', voters[index])
        await client.query('insert into public.grade_votes (climb_id, user_id, grade) values ($1, $2, $3)',
          [climbs[0], voters[index], index === 2 ? '6B' : '6A'])
      }
      await client.query('reset role')
      const summary = async (id: string) => (await client.query(
        'select total_votes, consensus_grade, grade_tied from public.climbs where id = $1', [id],
      )).rows[0]
      expect(await summary(climbs[0])).toEqual({ total_votes: 3, consensus_grade: '6A', grade_tied: false })
      await client.query('update public.grade_votes set climb_id = $1 where climb_id = $2 and user_id = $3',
        [climbs[1], climbs[0], voters[0]])
      expect(await summary(climbs[0])).toEqual({ total_votes: 2, consensus_grade: '6A', grade_tied: true })
      expect(await summary(climbs[1])).toEqual({ total_votes: 1, consensus_grade: '6A', grade_tied: false })
      await client.query('delete from public.grade_votes where climb_id = $1', [climbs[1]])
      expect(await summary(climbs[1])).toEqual({ total_votes: 0, consensus_grade: null, grade_tied: false })
    })
  })

  it('keeps private topo geometry visible to its owner and hidden from other clients', async () => {
    await transaction(async (client) => {
      const owner = await createUser(client)
      const other = await createUser(client)
      const climb = randomUUID()
      const image = randomUUID()
      const line = randomUUID()
      await client.query(
        `insert into public.climbs (id, name, grade, status, user_id)
         values ($1, 'Private topo climb', '6A', 'approved', $2)`, [climb, owner],
      )
      await client.query(
        `insert into public.images (id, url, created_by, status, moderation_status, visibility, processing_status)
         values ($1, 'https://example.test/private-topo.jpg', $2, 'approved', 'skipped', 'private', 'ready')`,
        [image, owner],
      )
      await client.query(
        `insert into public.route_lines (id, image_id, climb_id, points)
         values ($1, $2, $3, '[{"x":0,"y":0},{"x":1,"y":1}]'::jsonb)`, [line, image, climb],
      )
      await setRole(client, 'anon')
      expect((await client.query('select id from public.route_lines where id = $1', [line])).rows).toEqual([])
      await setRole(client, 'authenticated', other)
      expect((await client.query('select id from public.route_lines where id = $1', [line])).rows).toEqual([])
      await setRole(client, 'authenticated', owner)
      expect((await client.query('select id from public.route_lines where id = $1', [line])).rows).toEqual([{ id: line }])
    })
  })

  it('clears deleted editor attribution and removes account logs without removing content', async () => {
    await transaction(async (client) => {
      const owner = await createUser(client)
      const editor = await createUser(client)
      const climb = randomUUID()
      const image = randomUUID()
      await client.query(
        `insert into public.climbs (id, name, grade, status, user_id)
         values ($1, 'Retained climb', '6A', 'approved', $2)`, [climb, owner],
      )
      await client.query(
        `insert into public.images (id, url, created_by, last_edited_by, status, visibility, processing_status)
         values ($1, 'https://example.test/retained.jpg', $2, $3, 'pending', 'private', 'queued')`,
        [image, owner, editor],
      )
      await client.query(`insert into public.user_climbs (user_id, climb_id, style) values ($1, $2, 'top')`, [owner, climb])
      await client.query('delete from auth.users where id = $1', [editor])
      expect((await client.query('select last_edited_by from public.images where id = $1', [image])).rows)
        .toEqual([{ last_edited_by: null }])
      await client.query('delete from auth.users where id = $1', [owner])
      expect((await client.query('select created_by from public.images where id = $1', [image])).rows)
        .toEqual([{ created_by: null }])
      expect((await client.query('select user_id from public.climbs where id = $1', [climb])).rows)
        .toEqual([{ user_id: null }])
      expect((await client.query('select id from public.user_climbs where user_id = $1', [owner])).rows).toEqual([])
    })
  })

  it('denies client table-wide privileges and timestamps ordinary profile edits', async () => {
    await transaction(async (client) => {
      const grants = await client.query(
        `select c.relname, r.role, p.privilege from pg_class c
         cross join (values ('anon'), ('authenticated')) r(role)
         cross join (values ('TRUNCATE'), ('REFERENCES'), ('TRIGGER'), ('MAINTAIN')) p(privilege)
         where c.relnamespace = 'public'::regnamespace and c.relkind in ('r', 'p')
           and has_table_privilege(r.role, c.oid, p.privilege)`,
      )
      expect(grants.rows).toEqual([])
      const user = await createUser(client)
      await client.query("update public.profiles set updated_at = '2000-01-01' where id = $1", [user])
      await setRole(client, 'authenticated', user)
      await client.query("update public.profiles set bio = 'Updated biography' where id = $1", [user])
      await client.query('reset role')
      const updated = await client.query('select updated_at from public.profiles where id = $1', [user])
      expect(new Date(updated.rows[0].updated_at).getUTCFullYear()).toBeGreaterThan(2000)
    })
  })
})
