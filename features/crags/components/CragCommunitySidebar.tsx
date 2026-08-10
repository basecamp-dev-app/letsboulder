'use client'

import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import dynamic from 'next/dynamic'
import * as Tabs from '@radix-ui/react-tabs'
import { createClient } from '@/lib/supabase'

export interface CommunityPlaceInfo {
  slug: string
  type: 'crag' | 'gym'
}

const TopThisPlacePanel = dynamic(() => import('@/features/community/public').then((module) => module.TopThisPlacePanel))
const PlaceRankingsPanel = dynamic(() => import('@/features/community/public').then((module) => module.PlaceRankingsPanel))
const PlaceContributorsPanel = dynamic(() => import('@/features/community/public').then((module) => module.PlaceContributorsPanel))

interface CragCommunitySidebarProps {
  cragId: string
  communityPlace?: CommunityPlaceInfo | null
}

export default function CragCommunitySidebar({ cragId, communityPlace }: CragCommunitySidebarProps) {
  const [activeTab, setActiveTab] = useState<'recent' | 'rankings' | 'contributors'>('recent')
  const [expandedTab, setExpandedTab] = useState<'recent' | 'rankings' | 'contributors' | null>(null)
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
    enabled: !communityPlace,
  })

  if (!resolvedCommunityPlace) {
    return null
  }

  return (
    <section className="space-y-3">
      <Tabs.Root
        value={activeTab}
        onValueChange={(value) => {
          const nextTab = value === 'rankings' || value === 'contributors' ? value : 'recent'
          setActiveTab(nextTab)
          setExpandedTab(null)
        }}
        className="mt-0"
      >
        <Tabs.List className="flex rounded-2xl bg-stone-100/90 p-1 dark:bg-gray-800/90">
          <Tabs.Trigger
            value="recent"
            className="rounded-xl px-3 py-1.5 text-xs font-medium text-gray-600 transition data-[state=active]:bg-white data-[state=active]:text-gray-900 data-[state=active]:shadow-sm dark:text-gray-400 dark:data-[state=active]:bg-gray-700 dark:data-[state=active]:text-gray-100"
          >
            Recent
          </Tabs.Trigger>
          <Tabs.Trigger
            value="rankings"
            className="rounded-xl px-3 py-1.5 text-xs font-medium text-gray-600 transition data-[state=active]:bg-white data-[state=active]:text-gray-900 data-[state=active]:shadow-sm dark:text-gray-400 dark:data-[state=active]:bg-gray-700 dark:data-[state=active]:text-gray-100"
          >
            Rankings
          </Tabs.Trigger>
          <Tabs.Trigger
            value="contributors"
            className="rounded-xl px-3 py-1.5 text-xs font-medium text-gray-600 transition data-[state=active]:bg-white data-[state=active]:text-gray-900 data-[state=active]:shadow-sm dark:text-gray-400 dark:data-[state=active]:bg-gray-700 dark:data-[state=active]:text-gray-100"
          >
            Contributors
          </Tabs.Trigger>
        </Tabs.List>
        <Tabs.Content value="recent" className="mt-3">
          <TopThisPlacePanel
            slug={resolvedCommunityPlace.slug}
            placeType={resolvedCommunityPlace.type}
            embedded
            previewLimit={3}
            expanded={expandedTab === 'recent'}
            onToggleExpanded={() => setExpandedTab((current) => current === 'recent' ? null : 'recent')}
          />
        </Tabs.Content>
        <Tabs.Content value="rankings" className="mt-3">
          <PlaceRankingsPanel
            slug={resolvedCommunityPlace.slug}
            cragId={cragId}
            placeType={resolvedCommunityPlace.type}
            embedded
            previewLimit={3}
            expanded={expandedTab === 'rankings'}
            onToggleExpanded={() => setExpandedTab((current) => current === 'rankings' ? null : 'rankings')}
          />
        </Tabs.Content>
        <Tabs.Content value="contributors" className="mt-3">
          <PlaceContributorsPanel
            slug={resolvedCommunityPlace.slug}
            cragId={cragId}
            placeType={resolvedCommunityPlace.type}
            embedded
            previewLimit={3}
            expanded={expandedTab === 'contributors'}
            onToggleExpanded={() => setExpandedTab((current) => current === 'contributors' ? null : 'contributors')}
          />
        </Tabs.Content>
      </Tabs.Root>
    </section>
  )
}
