import { randomUUID } from 'node:crypto'
import { afterAll, describe, expect, it } from 'vitest'

import { createDatabaseTestHarness } from './database-test-harness'

const { pool, transaction, close } = createDatabaseTestHarness()

afterAll(close)

describe('get_crag_route_targets_page', () => {
  it('derives public targets only from publicly deliverable images at the requested crag', async () => {
    await transaction(async (client) => {
      const cragId = randomUUID()
      const otherCragId = randomUUID()
      const climbId = randomUUID()
      const imageIds = Array.from({ length: 7 }, randomUUID)
      await client.query(
        `insert into public.crags (id, name, slug, country_code) values
          ($1, 'Target crag', 'route-target-crag', 'GB'), ($2, 'Other crag', 'other-route-target-crag', 'GB')`,
        [cragId, otherCragId],
      )
      await client.query(
        `insert into public.climbs (id, crag_id, name, slug, grade, status, route_type)
         values ($1, $2, 'Target route', 'target-route', '6A', 'approved', 'boulder')`,
        [climbId, cragId],
      )
      await client.query(
        `insert into public.images (id, url, crag_id, processing_status, moderation_status, visibility, status)
          values ($1, 'https://example.test/ready.jpg', $8, 'ready', 'approved', 'public', 'approved'),
            ($2, 'https://example.test/processing.jpg', $8, 'ready', 'approved', 'public', 'approved'),
            ($3, 'https://example.test/moderation.jpg', $8, 'ready', 'approved', 'public', 'approved'),
            ($4, 'https://example.test/private.jpg', $8, 'ready', 'approved', 'public', 'approved'),
            ($5, 'https://example.test/rejected.jpg', $8, 'ready', 'approved', 'public', 'approved'),
            ($6, 'https://example.test/deleted.jpg', $8, 'ready', 'approved', 'public', 'approved'),
            ($7, 'https://example.test/wrong-crag.jpg', $9, 'ready', 'approved', 'public', 'approved')`,
        [...imageIds, cragId, otherCragId],
      )
      for (const [index, imageId] of imageIds.entries()) {
        await client.query(
          `insert into public.route_lines (id, climb_id, image_id, points, sequence_order)
           values ($1, $2, $3, '[]'::jsonb, $4)`, [randomUUID(), climbId, imageId, index],
        )
      }
      await client.query(`update public.images set processing_status = 'processing' where id = $1`, [imageIds[1]])
      await client.query(`update public.images set moderation_status = 'pending' where id = $1`, [imageIds[2]])
      await client.query(`update public.images set visibility = 'private' where id = $1`, [imageIds[3]])
      await client.query(`update public.images set status = 'rejected' where id = $1`, [imageIds[4]])
      await client.query(`update public.images set status = 'deleted' where id = $1`, [imageIds[5]])

      await client.query('set local role anon')
      await client.query("select set_config('request.jwt.claims', '{\"role\":\"anon\"}', true)")
      const result = await client.query('select * from public.get_crag_route_targets_page($1, 10, 0)', [cragId])

      expect(result.rows).toEqual([expect.objectContaining({
        effective_climb_id: climbId,
        preview_image_id: imageIds[0],
        navigation_image_id: imageIds[0],
        route_image_ids: [imageIds[0]],
      })])
      expect(Object.keys(result.rows[0]).sort()).toEqual([
        'climb_slug', 'effective_climb_id', 'navigation_image_id', 'navigation_route_id', 'preview_image_id', 'route_image_ids',
      ])
      expect((await client.query(
        'select count(*)::int as count from public.route_lines where image_id = any($1::uuid[])',
        [result.rows[0].route_image_ids],
      )).rows).toEqual([{ count: 1 }])
    })
  })

  it('is a fixed-search-path public RPC with explicit API grants', async () => {
    const metadata = await pool.query(
      `select p.prosecdef, p.proconfig,
              has_function_privilege('anon', p.oid, 'execute') as anon,
              has_function_privilege('authenticated', p.oid, 'execute') as authenticated,
              has_function_privilege('service_role', p.oid, 'execute') as service_role
       from pg_proc as p
       join pg_namespace as n on n.oid = p.pronamespace
       where n.nspname = 'public'
         and p.oid = 'public.get_crag_route_targets_page(uuid,integer,integer)'::regprocedure`,
    )
    expect(metadata.rows).toEqual([{
      prosecdef: true,
      proconfig: ['search_path=""'],
      anon: true,
      authenticated: true,
      service_role: true,
    }])
  })
})
