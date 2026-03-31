import { del, get, set } from 'idb-keyval'
import type { Persister, PersistedClient } from '@tanstack/react-query-persist-client'

const QUERY_CACHE_KEY = 'letsboulder-query-cache'

export function createIdbPersister(): Persister {
  return {
    persistClient: async (client: PersistedClient) => {
      try {
        await set(QUERY_CACHE_KEY, client)
      } catch {
        // IndexedDB not available (e.g. private browsing, quota exceeded)
      }
    },
    restoreClient: async () => {
      try {
        const cached = await get<PersistedClient>(QUERY_CACHE_KEY)
        return cached || undefined
      } catch {
        return undefined
      }
    },
    removeClient: async () => {
      try {
        await del(QUERY_CACHE_KEY)
      } catch {
        // IndexedDB not available
      }
    },
  }
}
