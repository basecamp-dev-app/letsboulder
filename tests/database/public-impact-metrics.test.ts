import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { createDatabaseTestHarness } from './database-test-harness'

const { pool, transaction } = createDatabaseTestHarness({ max: 2, statement_timeout: 15_000 })

beforeAll(async () => {
  const installed = await pool.query(
    "select to_regprocedure('public.get_public_impact_metrics_v1()') is not null as installed",
  )
  if (!installed.rows[0].installed) throw new Error('Public impact metrics migration is not installed')
})

afterAll(async () => pool.end())

describe('get_public_impact_metrics_v1', () => {
  it('counts published guide content and excludes records awaiting review', async () => {
    await transaction(async (client) => {
      const before = (await client.query('select public.get_public_impact_metrics_v1() as metrics')).rows[0].metrics
      const published = randomUUID()
      const review = randomUUID()

      await client.query(
        `insert into public.crags (id, name, slug, country_code, latitude, longitude)
         values ($1, 'Published metric crag', $2, 'GB', 51, -1),
                ($3, 'Review metric crag', $4, 'GB', 52, -2)`,
        [published, `published-${published}`, review, `review-${review}`],
      )
      await client.query(
        `update public.crags set publication_status = 'published', published_at = now()
         where id = $1`,
        [published],
      )
      const afterCrags = (await client.query(
        'select public.get_public_impact_metrics_v1() as metrics',
      )).rows[0].metrics
      expect(Number(afterCrags.cragsMapped) - Number(before.cragsMapped)).toBe(1)

      await client.query(
        `insert into public.climbs (id, crag_id, name, grade, status, route_type)
         values ($1, $2, 'Published metric route', '6A', 'approved', 'boulder'),
                ($3, $4, 'Review metric route', '6A', 'approved', 'boulder')`,
        [randomUUID(), published, randomUUID(), review],
      )

      await client.query('set local role anon')
      const after = (await client.query('select public.get_public_impact_metrics_v1() as metrics')).rows[0].metrics
      expect(after.definitionVersion).toBe(1)
      expect(after.generatedAt).toEqual(expect.any(String))
      expect(Number(after.routesDocumented) - Number(before.routesDocumented)).toBe(1)
      expect(after.cragsMapped).toBe(afterCrags.cragsMapped)
    })
  })

  it('uses a fixed search path and is executable by public application roles', async () => {
    const metadata = await pool.query(
      `select pg_get_userbyid(p.proowner) as owner, p.prosecdef, p.proconfig,
              has_function_privilege('anon', p.oid, 'EXECUTE') as anon,
              has_function_privilege('authenticated', p.oid, 'EXECUTE') as authenticated,
              has_function_privilege('service_role', p.oid, 'EXECUTE') as service_role
       from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'public' and p.proname = 'get_public_impact_metrics_v1'`,
    )
    expect(metadata.rows[0]).toEqual({
      owner: 'postgres', prosecdef: true, proconfig: ['search_path=""'],
      anon: true, authenticated: true, service_role: true,
    })
  })
})
