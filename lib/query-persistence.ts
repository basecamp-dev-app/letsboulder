import { del, get, set } from 'idb-keyval'
import type { Persister, PersistedClient } from '@tanstack/react-query-persist-client'

export const QUERY_CACHE_PREFIX = 'letsboulder-query-cache'
const LEGACY_QUERY_CACHE_KEY = QUERY_CACHE_PREFIX
export const ANON_QUERY_CACHE_SCOPE = 'anon'

export function getQueryCacheKey(scope: string) {
  return `${QUERY_CACHE_PREFIX}:${scope}`
}

export interface PersistedQueryState {
  data: unknown
  queryKey: unknown
}

function isObjectRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

export function isCommunityQueryKey(queryKey: unknown) {
  return Array.isArray(queryKey) && queryKey[0] === 'community'
}

export function removePersistedCommunityQueries(client: PersistedClient): PersistedClient {
  const queries = client.clientState.queries
  const retainedQueries = queries.filter((query) => !isCommunityQueryKey(query.queryKey))
  if (retainedQueries.length === queries.length) return client

  return {
    ...client,
    clientState: {
      ...client.clientState,
      queries: retainedQueries,
    },
  }
}

export async function readPersistedQueryClient(scope: string): Promise<PersistedClient | undefined> {
  try {
    const cached = await get<PersistedClient>(getQueryCacheKey(scope))
    return cached || undefined
  } catch {
    return undefined
  }
}

export function getPersistedQueries(client: PersistedClient | undefined): PersistedQueryState[] {
  const queries = client?.clientState?.queries
  if (!Array.isArray(queries)) return []

  return queries
    .filter((entry) => isObjectRecord(entry) && 'queryKey' in entry && 'state' in entry && isObjectRecord(entry.state))
    .map((entry) => ({
      queryKey: (entry as { queryKey?: unknown }).queryKey,
      data: ((entry as { state?: { data?: unknown } }).state)?.data,
    }))
}

export function isPersistedQueryKeyEqual(queryKey: unknown, expected: readonly unknown[]) {
  if (!Array.isArray(queryKey) || queryKey.length !== expected.length) return false
  return expected.every((value, index) => queryKey[index] === value)
}

export function getPersistedQueryData<T>(queries: PersistedQueryState[], expectedKey: readonly unknown[]): T | null {
  const match = queries.find((query) => isPersistedQueryKeyEqual(query.queryKey, expectedKey))
  return match?.data as T | null
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
      const client = await readPersistedQueryClient(scope)
      if (!client) return undefined

      const migratedClient = removePersistedCommunityQueries(client)
      if (migratedClient !== client) {
        try {
          await set(queryCacheKey, migratedClient)
        } catch {
          // The filtered client is still safe to restore when IndexedDB is unavailable.
        }
      }
      return migratedClient
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
