import { afterAll, describe, expect, it } from 'vitest'

import { createDatabaseTestHarness } from './database-test-harness'

const { pool } = createDatabaseTestHarness({ max: 2, statement_timeout: 15_000 })

afterAll(async () => {
  await pool.end()
})

describe('retired climb flagging infrastructure', () => {
  it('removes the flag table, aggregate view, and RPCs', async () => {
    const result = await pool.query(
      `select
         to_regclass('public.climb_flags') as flag_table,
         to_regclass('public.climb_flag_counts') as flag_counts,
         to_regprocedure('public.get_image_pending_flag_count(uuid)') as pending_count_rpc,
         to_regprocedure('public.resolve_flag_and_soft_delete(uuid,text)') as resolve_rpc`,
    )

    expect(result.rows[0]).toEqual({
      flag_table: null,
      flag_counts: null,
      pending_count_rpc: null,
      resolve_rpc: null,
    })
  })

  it('removes retired table references from retained deletion helpers', async () => {
    const result = await pool.query(
      `select p.proname, pg_get_functiondef(p.oid) as definition
       from pg_proc p
       join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'public'
         and p.proname in (
           'image_has_content_references',
           'delete_empty_crag',
           'climb_is_hard_deletable',
           'crag_is_hard_deletable'
         )
       order by p.proname`,
    )

    expect(result.rows).toHaveLength(4)
    for (const row of result.rows as Array<{ definition: string }>) {
      expect(row.definition).not.toContain('climb_flags')
    }
  })
})
