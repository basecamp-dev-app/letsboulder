'use client'

import { useQuery } from '@tanstack/react-query'
import type { ClimbStatusResponse } from '@/lib/verification-types'

export const climbStatusKeys = {
  all: ['climb-status'] as const,
  byId: (climbId: string) => [...climbStatusKeys.all, climbId] as const,
}

async function fetchClimbStatus(climbId: string): Promise<ClimbStatusResponse> {
  const response = await fetch(`/api/climbs/${climbId}/status`)
  if (!response.ok) {
    throw new Error(`Failed to fetch climb status: ${response.status}`)
  }
  return response.json()
}

export function useClimbStatus(climbId: string | null | undefined) {
  return useQuery({
    queryKey: climbStatusKeys.byId(climbId ?? ''),
    queryFn: () => fetchClimbStatus(climbId!),
    enabled: !!climbId,
    meta: { persist: true },
  })
}
