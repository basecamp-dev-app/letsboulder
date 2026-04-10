'use client'

import { useQuery } from '@tanstack/react-query'
import dynamic from 'next/dynamic'
import * as Tabs from '@radix-ui/react-tabs'
import { createClient } from '@/lib/supabase'

export interface CommunityPlaceInfo {
  slug: string
  type: 'crag' | 'gym'
}

const TopThisPlacePanel = dynamic(() => import('@/features/community/components/TopThisPlacePanel'))
const PlaceRankingsPanel = dynamic(() => import('@/features/community/components/PlaceRankingsPanel'))

interface CragCommunitySidebarProps {
  cragId: string
  communityPlace?: CommunityPlaceInfo | null
}

export default function CragCommunitySidebar({ cragId, communityPlace }: CragCommunitySidebarProps) {
  const { data: resolvedCommunityPlace } = useQuery({
    queryKey: ['crag-community-place', cragId],
    queryFn: async (): Promise<CommunityPlaceInfo | null> => {
      const supabase = createClient()
      const { data } = await supabase
        .from('places')
        .select('slug, type')
        .eq('id', cragId)
        .maybeSingle()

      const place = data as { slug: string | null; type: string | null } | null

      if (!place?.slug || (place.type !== 'crag' && place.type !== 'gym')) {
        return null
      }

      return {
        slug: place.slug,
        type: place.type,
      }
    },
    initialData: communityPlace,
    staleTime: 5 * 60 * 1000,
  })

  if (!resolvedCommunityPlace) {
    return null
  }

  return (
    <section className="space-y-4">
      <Tabs.Root defaultValue="recent" className="mt-4">
        <Tabs.List className="flex rounded-lg bg-gray-100 p-0.5 dark:bg-gray-800">
          <Tabs.Trigger
            value="recent"
            className="rounded-md px-3 py-1 text-xs font-medium text-gray-600 transition data-[state=active]:bg-white data-[state=active]:text-gray-900 data-[state=active]:shadow-sm dark:text-gray-400 dark:data-[state=active]:bg-gray-700 dark:data-[state=active]:text-gray-100"
          >
            Recent
          </Tabs.Trigger>
          <Tabs.Trigger
            value="rankings"
            className="rounded-md px-3 py-1 text-xs font-medium text-gray-600 transition data-[state=active]:bg-white data-[state=active]:text-gray-900 data-[state=active]:shadow-sm dark:text-gray-400 dark:data-[state=active]:bg-gray-700 dark:data-[state=active]:text-gray-100"
          >
            Rankings
          </Tabs.Trigger>
        </Tabs.List>
        <Tabs.Content value="recent" className="mt-4">
          <TopThisPlacePanel slug={resolvedCommunityPlace.slug} placeType={resolvedCommunityPlace.type} embedded />
        </Tabs.Content>
        <Tabs.Content value="rankings" className="mt-4">
          <PlaceRankingsPanel slug={resolvedCommunityPlace.slug} cragId={cragId} placeType={resolvedCommunityPlace.type} embedded />
        </Tabs.Content>
      </Tabs.Root>
    </section>
  )
}
