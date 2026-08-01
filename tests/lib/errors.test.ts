import { afterEach, describe, expect, it, vi } from 'vitest'

import { reportError } from '@/lib/errors'

describe('reportError', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('preserves structured PostgREST error details', () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined)

    reportError({
      code: 'PGRST201',
      message: 'Ambiguous relationship',
      details: [{ relationship: 'images_crag_id_fkey' }],
      hint: 'Qualify the relationship',
    }, { message: 'Logbook query failed' })

    expect(consoleError).toHaveBeenCalledWith(
      expect.stringContaining('Logbook query failed'),
      expect.objectContaining({ message: 'Ambiguous relationship' }),
      {
        structuredError: {
          code: 'PGRST201',
          message: 'Ambiguous relationship',
          details: [{ relationship: 'images_crag_id_fkey' }],
          hint: 'Qualify the relationship',
        },
      },
    )
  })
})
