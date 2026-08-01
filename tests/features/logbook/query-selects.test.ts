import { describe, expect, it } from 'vitest'

import {
  DETAILED_LOGBOOK_SELECT,
  PUBLIC_DETAILED_LOGBOOK_SELECT,
} from '@/features/logbook/lib/query-selects'

describe('logbook query selects', () => {
  it.each([DETAILED_LOGBOOK_SELECT, PUBLIC_DETAILED_LOGBOOK_SELECT])(
    'qualifies the canonical image-to-crag relationship',
    (select) => {
      expect(select).toContain('crags!images_crag_id_fkey(name)')
      expect(select).not.toContain('images(url, crags(name))')
    },
  )
})
