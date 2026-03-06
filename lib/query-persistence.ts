import { del, get, set } from 'idb-keyval'
import type { Persister, PersistedClient } from '@tanstack/react-query-persist-client'

const QUERY_CACHE_KEY = 'letsboulder-query-cache'

export function createIdbPersister(): Persister {
  return {
    persistClient: async (client: PersistedClient) => {
      await set(QUERY_CACHE_KEY, client)
    },
    restoreClient: async () => {
      const cached = await get<PersistedClient>(QUERY_CACHE_KEY)
      return cached || undefined
    },
    removeClient: async () => {
      await del(QUERY_CACHE_KEY)
    },
  }
}
