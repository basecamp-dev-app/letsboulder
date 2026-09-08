import { randomUUID } from 'node:crypto'
import { type PoolClient } from 'pg'
import { afterAll, describe, expect, it } from 'vitest'

import { createDatabaseTestHarness } from './database-test-harness'

const { pool } = createDatabaseTestHarness({ max: 2, statement_timeout: 15_000 })

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

async function addPublishedCrag(client: PoolClient, id: string, name: string, latitude: number, longitude: number) {
  await client.query(
    `insert into public.crags (id, name, latitude, longitude, slug)
     values ($1, $2, $3, $4, $5)`,
    [id, name, latitude, longitude, `${name.toLowerCase().replaceAll(' ', '-')}-${id.slice(0, 8)}`],
  )
  await client.query(
    `update public.crags
     set publication_status = 'published', published_at = now()
     where id = $1`,
    [id],
  )
  await client.query(
    `insert into public.images (
       id, url, crag_id, status, visibility, processing_status, moderation_status, latitude, longitude
     ) values ($1, $2, $3, 'approved', 'public', 'ready', 'approved', $4, $5)`,
    [randomUUID(), `https://example.test/${randomUUID()}.jpg`, id, latitude, longitude],
  )
}

afterAll(async () => pool.end())

describe('viewport map cluster bounds', () => {
  it('returns actual member bounds for clusters and null bounds for zoom-12 leaves', async () => {
    await transaction(async (client) => {
      const firstId = randomUUID()
      const secondId = randomUUID()
      const first = { latitude: 23.456, longitude: 12.345 }
      const second = { latitude: 23.457, longitude: 12.346 }

      await addPublishedCrag(client, firstId, 'Bounds One', first.latitude, first.longitude)
      await addPublishedCrag(client, secondId, 'Bounds Two', second.latitude, second.longitude)

      const clustered = await client.query(
        'select * from public.get_viewport_map_features(24, 23, 13, 12, 11)',
      )
      const cluster = clustered.rows.find((row) => row.is_cluster
        && Number(row.min_lng) === first.longitude
        && Number(row.min_lat) === first.latitude
        && Number(row.max_lng) === second.longitude
        && Number(row.max_lat) === second.latitude)

      expect(cluster).toMatchObject({
        type: 'cluster',
        is_cluster: true,
        point_count: '2',
      })

      const leaves = await client.query(
        'select * from public.get_viewport_map_features(24, 23, 13, 12, 12)',
      )
      const fixtureLeaves = leaves.rows.filter((row) => row.id === firstId || row.id === secondId)

      expect(fixtureLeaves).toHaveLength(2)
      expect(fixtureLeaves).toEqual(expect.arrayContaining([
        expect.objectContaining({
          id: firstId,
          is_cluster: false,
          point_count: '1',
          min_lng: null,
          min_lat: null,
          max_lng: null,
          max_lat: null,
        }),
        expect.objectContaining({
          id: secondId,
          is_cluster: false,
          point_count: '1',
          min_lng: null,
          min_lat: null,
          max_lng: null,
          max_lat: null,
        }),
      ]))
    })
  })
})
