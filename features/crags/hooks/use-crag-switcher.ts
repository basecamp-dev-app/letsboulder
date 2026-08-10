'use client'

import { useEffect, useState } from 'react'
import type { CragSwitcherOption } from '@/features/crags/components/CragPageToolbar'
import type { CragPageCrag } from '@/features/crags/lib/crag-page-types'

interface UseCragSwitcherParams {
  initialCrag: CragPageCrag | null
}

export interface UseCragSwitcherResult {
  cragSwitcherOpen: boolean
  setCragSwitcherOpen: (open: boolean) => void
  cragSwitcherQuery: string
  setCragSwitcherQuery: (query: string) => void
  cragSwitcherOptions: CragSwitcherOption[]
}

export function useCragSwitcher({ initialCrag }: UseCragSwitcherParams): UseCragSwitcherResult {
  const [cragSwitcherOpen, setCragSwitcherOpen] = useState(false)
  const [cragSwitcherQuery, setCragSwitcherQuery] = useState('')
  const [cragSwitcherOptions, setCragSwitcherOptions] = useState<CragSwitcherOption[]>([])

  useEffect(() => {
    let ignore = false
    const controller = new AbortController()

    async function loadCragSwitcherOptions() {
      if (!initialCrag) return
      if (!cragSwitcherOpen && cragSwitcherQuery.trim().length < 2) return
      const sourceCrag = initialCrag
      const fallbackOption: CragSwitcherOption = {
        id: sourceCrag.id,
        name: sourceCrag.name,
        slug: sourceCrag.slug,
        regionName: sourceCrag.region_name || sourceCrag.climbing_areas?.name || null,
        subArea: sourceCrag.sub_area || null,
        countryCode: sourceCrag.country_code || null,
      }

      if (cragSwitcherQuery.trim().length >= 2) {
        try {
          const response = await fetch(`/api/crags/search?q=${encodeURIComponent(cragSwitcherQuery.trim())}`, {
            signal: controller.signal,
          })
          if (!response.ok) throw new Error('Crag search failed')
          const payload = await response.json() as Array<{ id: string; name: string; slug?: string | null; regionName?: string | null; subArea?: string | null; countryCode?: string | null }>
          if (ignore) return
          const next = payload.map((item) => ({
            id: item.id,
            name: item.name,
            slug: item.slug || null,
            regionName: item.regionName || null,
            subArea: item.subArea || null,
            countryCode: item.countryCode || null,
          }))
          if (!next.some((item) => item.id === fallbackOption.id)) {
            next.unshift(fallbackOption)
          }
          setCragSwitcherOptions(next)
          return
        } catch {
          if (ignore) return
        }
      }

      if (typeof sourceCrag.latitude === 'number' && typeof sourceCrag.longitude === 'number') {
        try {
          const response = await fetch(`/api/crags/nearby?lat=${sourceCrag.latitude}&lng=${sourceCrag.longitude}`, {
            signal: controller.signal,
          })
          if (!response.ok) throw new Error('Nearby crag lookup failed')
          const payload = await response.json() as Array<{ id: string; name: string; slug?: string | null; regionName?: string | null; subArea?: string | null; countryCode?: string | null }>
          if (ignore) return
          const next = payload.map((item) => ({
            id: item.id,
            name: item.name,
            slug: item.slug || null,
            regionName: item.regionName || null,
            subArea: item.subArea || null,
            countryCode: item.countryCode || null,
          }))
          if (!next.some((item) => item.id === fallbackOption.id)) {
            next.unshift(fallbackOption)
          }
          setCragSwitcherOptions(next)
          return
        } catch {
          if (ignore) return
        }
      }

      if (!ignore) {
        setCragSwitcherOptions([fallbackOption])
      }
    }

    const timeoutId = window.setTimeout(() => {
      void loadCragSwitcherOptions()
    }, cragSwitcherQuery.trim().length >= 2 ? 500 : 0)

    return () => {
      ignore = true
      controller.abort()
      window.clearTimeout(timeoutId)
    }
  }, [cragSwitcherOpen, cragSwitcherQuery, initialCrag])

  return {
    cragSwitcherOpen,
    setCragSwitcherOpen,
    cragSwitcherQuery,
    setCragSwitcherQuery,
    cragSwitcherOptions,
  }
}
