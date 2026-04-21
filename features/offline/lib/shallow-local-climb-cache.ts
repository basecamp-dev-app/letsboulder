'use client'

import {
  ANON_QUERY_CACHE_SCOPE,
  getPersistedQueries,
  getPersistedQueryData,
  readPersistedQueryClient,
} from '@/lib/query-persistence'
import { createClient } from '@/lib/supabase'

export interface CachedClimbSnapshot {
  title: string
  grade: string | null
  imageUrl: string | null
}

interface CachedClimbStatus {
  climbed: boolean
  want_to_try: boolean
}

async function getPreferredQueryScopes() {
  const scopes = new Set<string>([ANON_QUERY_CACHE_SCOPE])

  try {
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (user?.id) {
      scopes.add(user.id)
    }
  } catch {
    // Keep anon fallback only
  }

  return Array.from(scopes).reverse()
}

function isImageFirstPayload(value: unknown): value is {
  heroImage: { src: string }
  initialRoutes: Array<{ climbId: string; climbName: string; climbGrade: string | null }>
  initialClimbId: string | null
} {
  if (typeof value !== 'object' || value === null) return false
  const candidate = value as {
    heroImage?: { src?: unknown }
    initialRoutes?: unknown
    initialClimbId?: unknown
  }

  return (
    typeof candidate.heroImage?.src === 'string'
    && Array.isArray(candidate.initialRoutes)
    && (typeof candidate.initialClimbId === 'string' || candidate.initialClimbId === null)
  )
}

function isCachedClimbStatus(value: unknown): value is CachedClimbStatus {
  if (typeof value !== 'object' || value === null) return false
  const candidate = value as Partial<CachedClimbStatus>
  return typeof candidate.climbed === 'boolean' && typeof candidate.want_to_try === 'boolean'
}

export async function readShallowLocalClimbSnapshot(imageId: string, climbId?: string | null): Promise<CachedClimbSnapshot | null> {
  const scopes = await getPreferredQueryScopes()

  for (const scope of scopes) {
    const persistedClient = await readPersistedQueryClient(scope)
    const queries = getPersistedQueries(persistedClient)
    const imageQuery = getPersistedQueryData<unknown>(queries, ['image-first', imageId])

    if (isImageFirstPayload(imageQuery)) {
      const route = imageQuery.initialRoutes.find((entry) => entry.climbId === climbId) || imageQuery.initialRoutes[0]
      return {
        title: route?.climbName || 'Locally available climb',
        grade: route?.climbGrade || null,
        imageUrl: imageQuery.heroImage.src || null,
      }
    }

    if (climbId) {
      const climbStatus = getPersistedQueryData<unknown>(queries, ['climb-status', climbId])
      if (isCachedClimbStatus(climbStatus)) {
        return {
          title: climbStatus.climbed ? 'Previously climbed route' : climbStatus.want_to_try ? 'Saved want-to-try route' : 'Locally available climb',
          grade: null,
          imageUrl: null,
        }
      }
    }
  }

  return null
}
