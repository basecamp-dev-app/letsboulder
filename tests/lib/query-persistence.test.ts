import { describe, expect, it } from 'vitest'
import type { PersistedClient } from '@tanstack/react-query-persist-client'
import { isCommunityQueryKey, removePersistedCommunityQueries } from '@/lib/query-persistence'

function createPersistedClient(): PersistedClient {
  return {
    timestamp: 1,
    buster: '',
    clientState: {
      mutations: [],
      queries: [
        { queryKey: ['community', 'rankings', 'place:test'], queryHash: 'community', state: {} },
        { queryKey: ['crag', 'crag-1', 'routes'], queryHash: 'crag', state: {} },
      ],
    },
  } as unknown as PersistedClient
}

describe('query persistence migrations', () => {
  it('identifies only community query families', () => {
    expect(isCommunityQueryKey(['community', 'contributors'])).toBe(true)
    expect(isCommunityQueryKey(['crag', 'community'])).toBe(false)
    expect(isCommunityQueryKey('community')).toBe(false)
  })

  it('removes legacy community queries without dropping crag data', () => {
    const migrated = removePersistedCommunityQueries(createPersistedClient())

    expect(migrated.clientState.queries).toHaveLength(1)
    expect(migrated.clientState.queries[0]?.queryKey).toEqual(['crag', 'crag-1', 'routes'])
  })
})
