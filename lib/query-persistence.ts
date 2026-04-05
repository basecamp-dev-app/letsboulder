import { del, get, set } from 'idb-keyval'
import type { Persister, PersistedClient } from '@tanstack/react-query-persist-client'

const QUERY_CACHE_PREFIX = 'letsboulder-query-cache'
const LEGACY_QUERY_CACHE_KEY = QUERY_CACHE_PREFIX

function getQueryCacheKey(scope: string) {
  return `${QUERY_CACHE_PREFIX}:${scope}`
}

export function createIdbPersister(scope: string): Persister {
  const queryCacheKey = getQueryCacheKey(scope)

  return {
    persistClient: async (client: PersistedClient) => {
      try {
        await set(queryCacheKey, client)
      } catch {
        // IndexedDB not available (e.g. private browsing, quota exceeded)
      }
    },
    restoreClient: async () => {
      try {
        const cached = await get<PersistedClient>(queryCacheKey)
        return cached || undefined
      } catch {
        return undefined
      }
    },
    removeClient: async () => {
      try {
        await del(queryCacheKey)
      } catch {
        // IndexedDB not available
      }
    },
  }
}

export async function removePersistedQueryCache(scope: string) {
  try {
    await del(getQueryCacheKey(scope))
  } catch {
    // IndexedDB not available
  }
}

export async function removeLegacyPersistedQueryCache() {
  try {
    await del(LEGACY_QUERY_CACHE_KEY)
  } catch {
    // IndexedDB not available
  }
}
