'use client'

import dynamic from 'next/dynamic'
import * as Tabs from '@radix-ui/react-tabs'

export interface CommunityPlaceInfo {
  slug: string
  type: 'crag' | 'gym'
}

const TopThisPlacePanel = dynamic(() => import('@/features/community/components/TopThisPlacePanel'))
const PlaceRankingsPanel = dynamic(() => import('@/features/community/components/PlaceRankingsPanel'))

interface CragCommunitySidebarProps {
  communityPlace?: CommunityPlaceInfo | null
}

export default function CragCommunitySidebar({ communityPlace }: CragCommunitySidebarProps) {
  const placeLabel = communityPlace?.type === 'gym' ? 'Gym' : 'Crag'

  return (
    <section className="space-y-4">
      <div className="mb-6 space-y-4">
        {communityPlace ? (
          <div className="rounded-xl border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-gray-900">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h2 className="text-sm font-semibold text-gray-900 dark:text-gray-100">{placeLabel} community</h2>
                <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">Last 60 days</p>
              </div>
            </div>
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
                <TopThisPlacePanel slug={communityPlace.slug} placeType={communityPlace.type} embedded />
              </Tabs.Content>
              <Tabs.Content value="rankings" className="mt-4">
                <PlaceRankingsPanel slug={communityPlace.slug} placeType={communityPlace.type} embedded />
              </Tabs.Content>
            </Tabs.Root>
          </div>
        ) : (
          <div className="rounded-xl border border-dashed border-gray-300 p-5 text-sm text-gray-600 dark:border-gray-700 dark:text-gray-400">
            Rankings are not available for this crag yet.
          </div>
        )}
      </div>
    </section>
  )
}
